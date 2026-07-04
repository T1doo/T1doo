import { BrowserWindow, app, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join } from 'path'
import { homedir } from 'os'
import { APP_ID } from '../shared/constants'
import { IPC_EVENTS } from '../shared/ipc'
import { WindowManager } from './core/window-manager'
import { createTray } from './core/tray'
import { applyAutoLaunch } from './core/auto-launch'
import { SettingsService } from './services/settings'
import { registerIpcHandlers } from './ipc'
import { registerSessionsIpc } from './ipc/sessions'
import { openDatabase } from './db'
import { SessionsDao } from './db/dao'
import { ClaudeDataService, defaultProjectsDir } from './services/claude/sync'
import scanWorkerPath from './services/claude/scan.worker?modulePath'

// 单实例锁：二次启动只聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  const settings = new SettingsService()
  const windows = new WindowManager(() => settings.get().closeToTray)
  let claudeData: ClaudeDataService | null = null

  app.on('second-instance', () => {
    windows.showMainWindow()
  })

  app.on('before-quit', () => {
    windows.setQuitting(true)
  })

  app.on('will-quit', () => {
    void claudeData?.dispose()
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
    applyAutoLaunch(settings.get().autoLaunch)
    settings.onChange((s) => {
      nativeTheme.themeSource = s.theme
      applyAutoLaunch(s.autoLaunch)
      windows.broadcast(IPC_EVENTS.SettingsUpdated, s)
    })

    // F1 数据层：SQLite + 会话同步服务
    // T1DOO_DB_PATH / T1DOO_PROJECTS_DIR 仅供开发与 E2E 测试注入隔离环境
    const db = openDatabase(process.env.T1DOO_DB_PATH ?? join(app.getPath('userData'), 't1doo.db'))
    const dao = new SessionsDao(db)
    claudeData = new ClaudeDataService({
      projectsDir: process.env.T1DOO_PROJECTS_DIR ?? defaultProjectsDir(homedir()),
      dao,
      workerPath: scanWorkerPath,
      emitProgress: (p) => windows.broadcast(IPC_EVENTS.IndexProgress, p),
      emitSessionsUpdated: (ids) => windows.broadcast(IPC_EVENTS.SessionsUpdated, ids),
      log: (msg) => console.log('[claude-sync]', msg)
    })

    registerIpcHandlers(settings)
    registerSessionsIpc(dao, claudeData)

    createTray({
      onShow: () => windows.showMainWindow(),
      onQuit: () => {
        windows.setQuitting(true)
        app.quit()
      }
    })

    // 开机自启带 --hidden：静默启动到托盘
    const startHidden = process.argv.includes('--hidden')
    windows.createMainWindow(!startHidden)

    // 窗口先出，重同步随后跑（不阻塞首屏）
    void claudeData.start().catch((err) => console.error('[claude-sync] 启动失败', err))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.showMainWindow()
    })
  })
}
