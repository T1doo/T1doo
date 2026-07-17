import { BrowserWindow, Notification, app, clipboard, nativeTheme, shell } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'
import { homedir } from 'os'
import { APP_ID } from '../shared/constants'
import { IPC_EVENTS } from '../shared/ipc'
import type { LauncherState } from '../shared/launcher'
import { WindowManager } from './core/window-manager'
import { LauncherWindow } from './core/launcher-window'
import { LauncherShortcut } from './core/shortcut'
import { createTray, refreshTrayMenu } from './core/tray'
import { applyAutoLaunch } from './core/auto-launch'
import { SettingsService } from './services/settings'
import { UpdaterService } from './services/updater'
import { setAppLocale, t } from './services/i18n'
import { registerIpcHandlers } from './ipc'
import { registerSessionsIpc } from './ipc/sessions'
import { registerTerminalsIpc } from './ipc/terminals'
import { registerLauncherIpc } from './ipc/launcher'
import { registerAiIpc } from './ipc/ai'
import { registerUsageIpc } from './ipc/usage'
import { openDatabase } from './db'
import { SessionsDao } from './db/dao'
import { LauncherDao } from './db/launcher-dao'
import { AiDao } from './db/ai-dao'
import { UsageDao } from './db/usage-dao'
import { ClaudeDataService, defaultProjectsDir } from './services/claude/sync'
import { UsageService } from './services/usage/usage-service'
import { BackendProfilesService } from './services/backend/profiles'
import { GlobalSwitchService } from './services/backend/global-switch'
import { TerminalManager } from './services/terminal/manager'
import { ClaudeStatusTracker } from './services/status/tracker'
import { RetireNoticeStore } from './services/status/retire-notice'
import { retireHooks } from './services/claude/hooks-retire'
import { LauncherService } from './services/launcher/service'
import { RecentPromptsReader } from './services/launcher/prompts'
import { ChatService } from './services/ai/conversations'
import { AiApiConfigService } from './services/ai/api-config'
import { TaskQueue } from './services/ai/task-queue'
import scanWorkerPath from './services/claude/scan.worker?modulePath'

// 单实例锁：二次启动只聚焦已有窗口
// E2E 隔离：electron-store/DB 默认路径全部改走临时 userData，避免测试污染真实配置
if (process.env.T1DOO_USER_DATA) {
  app.setPath('userData', process.env.T1DOO_USER_DATA)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  const settings = new SettingsService()
  const windows = new WindowManager(() => settings.get().closeToTray)
  const launcherWin = new LauncherWindow()
  const shortcut = new LauncherShortcut()
  let dbRef: ReturnType<typeof openDatabase> | null = null
  let claudeData: ClaudeDataService | null = null
  let usage: UsageService | null = null
  let terminals: TerminalManager | null = null
  let statusTracker: ClaudeStatusTracker | null = null
  /** §7.9.4：本次启动是否真的清理掉了 v1.0 的 hooks 注册（用于一次性告知） */
  let hooksRetired = false
  const retireNotice = new RetireNoticeStore()
  let appScanTimer: NodeJS.Timeout | null = null
  let chat: ChatService | null = null
  let taskQueue: TaskQueue | null = null

  app.on('second-instance', () => {
    windows.showMainWindow()
  })

  app.on('before-quit', () => {
    windows.setQuitting(true)
    launcherWin.setQuitting(true)
  })

  app.on('will-quit', () => {
    terminals?.disposeAll() // 杀全部 pty 进程树，不留孤儿（验收⑤）
    chat?.disposeAll() // cli 引擎长连进程
    taskQueue?.disposeAll() // 运行中无头任务
    statusTracker?.dispose()
    shortcut.dispose()
    if (appScanTimer) clearInterval(appScanTimer)
    void claudeData?.dispose()
    void usage?.dispose()
    // 干净关库触发 WAL 关闭检查点：否则写入长期悬在 -wal 里，
    // 主文件停更且外部工具打不开（M8 实证）；有语句在飞则跳过（下次启动检查点兜底）
    try {
      dbRef?.close()
    } catch {
      // 忽略：openDatabase 启动时的 wal_checkpoint(TRUNCATE) 会兜底收拢
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)

    // 开发环境 F12 开 DevTools；生产屏蔽 Ctrl+R
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    nativeTheme.themeSource = settings.get().theme
    setAppLocale(settings.get().language)
    applyAutoLaunch(settings.get().autoLaunch)
    settings.onChange((s) => {
      nativeTheme.themeSource = s.theme
      setAppLocale(s.language)
      applyAutoLaunch(s.autoLaunch)
      windows.broadcast(IPC_EVENTS.SettingsUpdated, s)
    })

    // F1 数据层：SQLite + 会话同步服务
    // T1DOO_DB_PATH / T1DOO_PROJECTS_DIR 仅供开发与 E2E 测试注入隔离环境
    const db = openDatabase(process.env.T1DOO_DB_PATH ?? join(app.getPath('userData'), 't1doo.db'))
    dbRef = db
    const dao = new SessionsDao(db)
    claudeData = new ClaudeDataService({
      projectsDir: process.env.T1DOO_PROJECTS_DIR ?? defaultProjectsDir(homedir()),
      dao,
      workerPath: scanWorkerPath,
      emitProgress: (p) => windows.broadcast(IPC_EVENTS.IndexProgress, p),
      emitSessionsUpdated: (ids) => windows.broadcast(IPC_EVENTS.SessionsUpdated, ids),
      // F2 状态感知 v2（§7.9.2）：hooks 退役后这是状态的**唯一**来源
      emitStatusSignals: (e) =>
        statusTracker?.feed(e.sessionId, e.signals, { cwd: e.cwd, replace: e.replace }),
      log: (msg) => console.log('[claude-sync]', msg)
    })

    // F9 用量中心：独立采集管道（subagents/wf_* 全覆盖，§7.8.2）
    const usageDao = new UsageDao(db)
    usage = new UsageService({
      projectsDir: process.env.T1DOO_PROJECTS_DIR ?? defaultProjectsDir(homedir()),
      dao: usageDao,
      workerPath: scanWorkerPath,
      emitUpdated: () => windows.broadcast(IPC_EVENTS.UsageUpdated),
      log: (msg) => console.log('[usage]', msg)
    })

    // F2 终端层：后端档案 + PTY 托管 + JSONL 事件驱动状态感知（§7.9）
    const backends = new BackendProfilesService()
    // F8 模型中心：全局切换（写 settings.json env 键，§7.7.5；E2E 经 T1DOO_CLAUDE_SETTINGS 隔离）
    const globalSwitch = new GlobalSwitchService(
      backends,
      process.env.T1DOO_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json'),
      (msg) => console.log('[backend-switch]', msg)
    )
    terminals = new TerminalManager({
      backends,
      emit: (channel, ...args) => windows.broadcast(channel, ...args),
      events: {
        data: IPC_EVENTS.TermData,
        opened: IPC_EVENTS.TermOpened,
        exit: IPC_EVENTS.TermExit,
        closed: IPC_EVENTS.TermClosed,
        updated: IPC_EVENTS.TermUpdated
      },
      log: (msg) => console.log('[terminal]', msg)
    })
    statusTracker = new ClaudeStatusTracker({
      terminals,
      emitStatus: (e) => windows.broadcast(IPC_EVENTS.ClaudeStatus, e),
      notifyEnabled: () => settings.get().notifyWaiting,
      onNotificationClick: (terminalId) => {
        windows.showMainWindow()
        windows.broadcast(IPC_EVENTS.Navigate, {
          page: terminalId ? 'terminals' : 'sessions',
          terminalId: terminalId ?? undefined
        })
      }
    })
    // §7.9.4 升级清理：摘掉 v1.0 留在 settings.json 里的 hook 注册（其余键分毫不动）。
    // 解析失败即抛 → 只记日志不打断启动：读不懂的用户配置宁可不动。
    try {
      hooksRetired = retireHooks(
        process.env.T1DOO_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json'),
        (msg) => console.log('[hooks-retire]', msg)
      )
    } catch (err) {
      console.log('[hooks-retire] 跳过清理：', String(err))
    }
    if (hooksRetired) retireNotice.markPending()

    // F5 AI 能力：对话双引擎 + 任务队列（§7.5）
    const aiDao = new AiDao(db)
    aiDao.failStaleActiveTasks(Date.now()) // 上次异常退出残留的 running/queued → failed
    const apiConfig = new AiApiConfigService()
    chat = new ChatService({
      dao: aiDao,
      backends,
      apiConfig,
      emit: (e) => windows.broadcast(IPC_EVENTS.AiDelta, e),
      recordUsage: (row) => usage?.recordPanel(row),
      log: (msg) => console.log('[ai-chat]', msg)
    })
    taskQueue = new TaskQueue({
      dao: aiDao,
      backends,
      emit: (task) => windows.broadcast(IPC_EVENTS.TaskUpdate, task),
      notify: (task) => {
        if (!settings.get().notifyTaskDone || !Notification.isSupported()) return
        const notification = new Notification({
          title: task.status === 'done' ? t('notify.taskDone') : t('notify.taskFailed'),
          body: task.prompt.slice(0, 120),
          silent: false
        })
        notification.on('click', () => {
          windows.showMainWindow()
          windows.broadcast(IPC_EVENTS.Navigate, { page: 'tasks' })
        })
        notification.show()
      },
      log: (msg) => console.log('[ai-tasks]', msg)
    })

    // F3 启动器：服务 + 独立窗口 + 全局热键（§7.3）
    const launcherDao = new LauncherDao(db)
    const launcher = new LauncherService({
      sessionsDao: dao,
      launcherDao,
      terminals,
      chat,
      prompts: new RecentPromptsReader(
        process.env.T1DOO_CLAUDE_HISTORY ?? join(homedir(), '.claude', 'history.jsonl')
      ),
      getSearchUrl: () => settings.get().launcherSearchUrl,
      effects: {
        openExternal: (url) => void shell.openExternal(url),
        openPath: (path) => shell.openPath(path),
        copyText: (text) => clipboard.writeText(text),
        navigateMain: (req) => {
          launcherWin.hide()
          windows.showMainWindow()
          windows.broadcast(IPC_EVENTS.Navigate, req)
        },
        hideLauncher: () => launcherWin.hide(),
        quitApp: () => {
          windows.setQuitting(true)
          launcherWin.setQuitting(true)
          app.quit()
        },
        getIcon: async (path) => {
          const img = await app.getFileIcon(path, { size: 'normal' })
          return img.isEmpty() ? null : img.toDataURL()
        }
      },
      log: (msg) => console.log('[launcher]', msg)
    })
    launcher.lastScanAt = launcherDao.lastScanAt()

    const launcherState = (): LauncherState => ({
      hotkey: settings.get().launcherHotkey,
      hotkeyRegistered: shortcut.registered,
      appCount: launcher.appCount(),
      scanning: launcher.scanning,
      lastScanAt: launcher.lastScanAt
    })
    const emitLauncherState = (): void =>
      windows.broadcast(IPC_EVENTS.LauncherState, launcherState())

    const toggleLauncher = (): void => {
      if (!launcherWin.isVisible()) launcher.refresh() // 唤起时重建 frecency/提示词缓存
      launcherWin.toggle()
    }
    shortcut.apply(settings.get().launcherHotkey, toggleLauncher)
    let currentHotkey = settings.get().launcherHotkey
    settings.onChange((s) => {
      if (s.launcherHotkey !== currentHotkey) {
        currentHotkey = s.launcherHotkey
        shortcut.apply(s.launcherHotkey, toggleLauncher)
        emitLauncherState()
      }
    })

    // 自动更新（M6 §13）：打包版启动 30s 后静默检查，"提示后安装"不强更
    const updater = new UpdaterService({
      emit: (state) => windows.broadcast(IPC_EVENTS.UpdaterState, state),
      onBeforeInstall: () => {
        windows.setQuitting(true)
        launcherWin.setQuitting(true)
      },
      log: (msg) => console.log('[updater]', msg)
    })
    setTimeout(() => updater.check(), 30_000)

    registerIpcHandlers(settings, updater)
    registerSessionsIpc(dao, claudeData, terminals)
    registerUsageIpc(usageDao, usage)
    registerTerminalsIpc({
      terminals,
      backends,
      globalSwitch,
      retireNotice: { get: () => retireNotice.get(), dismiss: () => retireNotice.dismiss() }
    })
    registerAiIpc({ chat, tasks: taskQueue, aiDao, apiConfig })
    registerLauncherIpc({
      service: launcher,
      getState: launcherState,
      hide: () => launcherWin.hide(),
      emitState: emitLauncherState
    })

    const trayActions = {
      onShow: () => windows.showMainWindow(),
      onQuit: () => {
        windows.setQuitting(true)
        app.quit()
      }
    }
    const tray = createTray(trayActions)
    let currentLang = settings.get().language
    settings.onChange((s) => {
      if (s.language !== currentLang) {
        currentLang = s.language
        refreshTrayMenu(tray, trayActions)
      }
    })

    // 开机自启带 --hidden：静默启动到托盘
    const startHidden = process.argv.includes('--hidden')
    windows.createMainWindow(!startHidden)
    launcherWin.create() // 预创建隐藏窗，热键唤起零加载开销

    // 窗口先出，重同步随后跑（不阻塞首屏）；用量首扫与 F1 各持 worker 并行。
    // 状态感知无需单独启动：F1 的增量管道即其数据源（§7.9.2）
    void claudeData.start().catch((err) => console.error('[claude-sync] 启动失败', err))
    void usage.start().catch((err) => console.error('[usage] 启动失败', err))

    // 应用索引：启动 5s 后补扫（首启/超 24h），此后每 24h 刷新（§7.3 刷新策略）
    const SCAN_INTERVAL = 24 * 3_600_000
    const scanIfStale = (): void => {
      if (launcher.scanning) return
      if (launcher.lastScanAt && Date.now() - launcher.lastScanAt < SCAN_INTERVAL) return
      launcher
        .scanApps()
        .then(() => emitLauncherState())
        .catch((err) => console.error('[launcher] 应用扫描失败', err))
    }
    setTimeout(scanIfStale, 5_000)
    appScanTimer = setInterval(scanIfStale, SCAN_INTERVAL)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.showMainWindow()
    })
  })
}
