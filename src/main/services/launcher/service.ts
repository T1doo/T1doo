import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { basename } from 'path'
import type {
  LauncherExecuteResult,
  LauncherItem,
  LauncherQueryResult
} from '../../../shared/launcher'
import type { NavigateRequest } from '../../../shared/api'
import type { I18nKey } from '../../../shared/i18n'
import { t } from '../i18n'
import type { SessionsDao } from '../../db/dao'
import type { LauncherDao } from '../../db/launcher-dao'
import { HISTORY_RETENTION_MS, type AppRecord } from '../../db/launcher-dao'
import type { TerminalManager } from '../terminal/manager'
import { buildFrecencyMap } from './frecency'
import { matchScore } from './match'
import { parseInput } from './router'
import type { RecentPromptsReader } from './prompts'
import { scanStartMenuApps } from './apps-scan'

/** Electron 能力经 AppCore 注入（架构原则 #2：services 不 import Electron API） */
export interface LauncherEffects {
  openExternal(url: string): void
  /** shell.openPath 语义：返回 '' 成功，非空为错误信息 */
  openPath(path: string): Promise<string>
  copyText(text: string): void
  /** 显示主窗并跳页（聚焦终端标签等） */
  navigateMain(req: NavigateRequest): void
  hideLauncher(): void
  quitApp(): void
  /** app.getFileIcon → data:image/png URL；失败返回 null */
  getIcon(path: string): Promise<string | null>
}

export interface LauncherServiceOptions {
  sessionsDao: SessionsDao
  launcherDao: LauncherDao
  terminals: TerminalManager
  prompts: RecentPromptsReader
  /** F5 对话服务：@ 提问直接发起回合（M5 接通，§7.3 路由表） */
  chat?: {
    send(input: { text: string; engine: 'cli' | 'api' }): { convId: string; turnId: string }
  }
  getSearchUrl: () => string
  effects: LauncherEffects
  log?: (msg: string) => void
}

interface InternalCommand {
  id: string
  /** 展示文案存 key，query/execute 时经 t() 解析，跟随当前语言 */
  titleKey: I18nKey
  subtitleKey: I18nKey
  keywords: string[]
  run: () => Promise<LauncherExecuteResult> | LauncherExecuteResult
}

/** CC 对象优先带（§7.3）：0 = 项目/会话/终端/提示词，1 = 应用/内部命令 */
const KIND_BAND: Record<string, number> = {
  project: 0,
  session: 0,
  terminal: 0,
  prompt: 0,
  command: 1,
  app: 1
}
/** 同分时的稳定顺序：路由表"项目 → 会话 → 终端 → 提示词"（§7.3） */
const KIND_ORDER: Record<string, number> = {
  project: 0,
  session: 1,
  terminal: 2,
  prompt: 3,
  command: 4,
  app: 5
}

const MAX_RESULTS = 20
/** frecency 计入排序前先封顶，避免高频项淹没文本匹配度 */
const FRECENCY_CAP = 400

interface Scored {
  item: LauncherItem
  band: number
  score: number
  recency: number
}

function normalizePath(p: string): string {
  return p
    .replace(/[\\/]+$/, '')
    .replace(/\//g, '\\')
    .toLowerCase()
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

export class LauncherService {
  private frecency = new Map<string, number>()
  private apps: AppRecord[] = []
  private commands: InternalCommand[]
  scanning = false
  lastScanAt: number | null = null

  constructor(private readonly opts: LauncherServiceOptions) {
    this.apps = opts.launcherDao.listApps()
    this.commands = this.buildCommands()
    this.refresh()
  }

  /** 启动器唤起时调用：重建 frecency 表、刷新提示词缓存（mtime 命中则零开销） */
  refresh(): void {
    const now = Date.now()
    this.frecency = buildFrecencyMap(
      this.opts.launcherDao.listLaunches(now - HISTORY_RETENTION_MS),
      now
    )
    this.opts.prompts.read()
  }

  appCount(): number {
    return this.apps.length
  }

  query(raw: string): LauncherQueryResult {
    const parsed = parseInput(raw)
    switch (parsed.intent) {
      case 'command':
        return { intent: 'command', items: this.queryCommands(parsed.query) }
      case 'ai': {
        if (!parsed.query) {
          return {
            intent: 'ai',
            items: [
              {
                key: 'hint:ai',
                kind: 'hint',
                title: t('launcher.ai.hintTitle'),
                subtitle: t('launcher.ai.hintSubtitle'),
                icon: null,
                target: ''
              }
            ]
          }
        }
        return {
          intent: 'ai',
          items: [
            {
              key: 'ai:ask',
              kind: 'ai',
              title: t('launcher.ai.askTitle', { query: truncate(parsed.query, 60) }),
              subtitle: t('launcher.ai.askSubtitle'),
              icon: null,
              target: parsed.query
            }
          ]
        }
      }
      case 'search': {
        if (!parsed.query) return { intent: 'search', items: [] }
        let host = t('launcher.search.engine')
        try {
          host = new URL(this.opts.getSearchUrl().replace('{query}', '')).hostname
        } catch {
          // 模板非法时仅影响副标题展示
        }
        return {
          intent: 'search',
          items: [
            {
              key: `search:${parsed.query}`,
              kind: 'search',
              title: t('launcher.search.title', { query: parsed.query }),
              subtitle: host,
              icon: null,
              target: parsed.query
            }
          ]
        }
      }
      case 'url':
        return {
          intent: 'url',
          items: [
            {
              key: `url:${parsed.url}`,
              kind: 'url',
              title: t('launcher.url.title', { url: truncate(parsed.url, 60) }),
              subtitle: t('launcher.url.subtitle'),
              icon: null,
              target: parsed.url
            }
          ]
        }
      case 'path': {
        const exists = existsSync(parsed.path)
        return {
          intent: 'path',
          items: [
            {
              key: `path:${parsed.path}`,
              kind: 'path',
              title: truncate(parsed.path, 70),
              subtitle: exists ? t('launcher.path.open') : t('launcher.path.notFound'),
              icon: null,
              target: parsed.path
            }
          ]
        }
      }
      case 'mixed':
        return { intent: 'mixed', items: this.queryMixed(parsed.query) }
    }
  }

  async execute(item: LauncherItem): Promise<LauncherExecuteResult> {
    if (KIND_BAND[item.kind] !== undefined) {
      this.opts.launcherDao.recordLaunch(item.key, Date.now())
    }
    this.opts.log?.(`execute ${item.key}`)
    switch (item.kind) {
      case 'project':
        return this.execProject(item.target)
      case 'session':
        return this.execSession(item.target)
      case 'terminal':
        this.opts.effects.navigateMain({ page: 'terminals', terminalId: item.target })
        return { ok: true, message: null }
      case 'prompt':
        return this.execPrompt(item)
      case 'app':
        return this.execApp(item)
      case 'command': {
        const cmd = this.commands.find((c) => c.id === item.target)
        if (!cmd) return { ok: false, message: t('launcher.cmd.unknown', { id: item.target }) }
        return cmd.run()
      }
      case 'url':
        this.opts.effects.openExternal(item.target)
        return { ok: true, message: null }
      case 'path': {
        const err = await this.opts.effects.openPath(item.target)
        return err ? { ok: false, message: err } : { ok: true, message: null }
      }
      case 'search': {
        const url = this.opts.getSearchUrl().replace('{query}', encodeURIComponent(item.target))
        this.opts.effects.openExternal(url)
        return { ok: true, message: null }
      }
      case 'ai': {
        if (!this.opts.chat) return { ok: false, message: t('launcher.ai.notReady') }
        try {
          // 默认 cli 引擎（订阅态零配置，Q2 裁决）；回车即提交，主窗跳到对话页看流式回答
          const { convId } = this.opts.chat.send({ text: item.target, engine: 'cli' })
          this.opts.effects.navigateMain({ page: 'chat', convId })
          return { ok: true, message: null }
        } catch (err) {
          return { ok: false, message: err instanceof Error ? err.message : String(err) }
        }
      }
      case 'hint':
        return { ok: false, message: null }
    }
  }

  /** 手动/定时重扫开始菜单；返回应用数（图标提取带缓存，只补新增） */
  async scanApps(): Promise<number> {
    if (this.scanning) return this.apps.length
    this.scanning = true
    try {
      const scanned = await scanStartMenuApps()
      const iconCache = this.opts.launcherDao.iconCache()
      const records: AppRecord[] = []
      for (const s of scanned) {
        let icon: string | null = null
        const iconSource = s.exePath ?? (s.kind === 'win32' ? s.target : null)
        if (iconSource) {
          icon =
            iconCache.get(iconSource) ??
            (await this.opts.effects.getIcon(iconSource).catch(() => null))
        }
        records.push({ ...s, exePath: iconSource, icon })
      }
      this.lastScanAt = Date.now()
      this.opts.launcherDao.replaceApps(records, this.lastScanAt)
      this.apps = this.opts.launcherDao.listApps()
      this.opts.log?.(`应用扫描完成：${this.apps.length} 项`)
      return this.apps.length
    } finally {
      this.scanning = false
    }
  }

  // ---------- 查询各源 ----------

  private queryMixed(query: string): LauncherItem[] {
    const scored: Scored[] = []
    const push = (item: LauncherItem, match: number, recency: number): void => {
      const fre = Math.min(this.frecency.get(item.key) ?? 0, FRECENCY_CAP)
      scored.push({ item, band: KIND_BAND[item.kind] ?? 1, score: match * 10 + fre, recency })
    }
    const empty = query.length === 0

    // 运行中终端
    for (const t of this.opts.terminals.list()) {
      if (t.exit) continue
      const m = empty ? 1 : matchScore(query, [t.title, basename(t.cwd), t.cwd])
      if (m > 0) push(this.terminalItem(t.id, t.title, t.cwd, t.kind), m, t.createdAt)
    }

    // 项目（按 basename 与全路径匹配）
    for (const p of this.opts.sessionsDao.listProjects().slice(0, empty ? 6 : 200)) {
      const name = basename(p.path)
      const m = empty ? 1 : matchScore(query, [name, p.path])
      if (m > 0) {
        push(
          {
            key: `project:${normalizePath(p.path)}`,
            kind: 'project',
            title: name,
            subtitle: p.path,
            icon: null,
            target: p.path
          },
          m,
          p.lastActiveAt ?? 0
        )
      }
    }

    // 会话（标题匹配；空查询只出最近 3 条，避免刷屏）
    const sessions = this.opts.sessionsDao.listSessions()
    for (const s of empty ? sessions.slice(0, 3) : sessions) {
      const m = empty ? 1 : matchScore(query, [s.title])
      if (m > 0) {
        const project = s.projectPath ? basename(s.projectPath) : null
        push(
          {
            key: `session:${s.id}`,
            kind: 'session',
            title: truncate(s.title, 60),
            subtitle: [project, t('launcher.session.messages', { n: s.messageCount })]
              .filter(Boolean)
              .join(' · '),
            icon: null,
            target: s.id,
            meta: { projectPath: s.projectPath ?? undefined }
          },
          m,
          s.updatedAt ?? 0
        )
      }
    }

    // 最近提示词
    const prompts = this.opts.prompts.read()
    for (const pr of empty ? prompts.slice(0, 4) : prompts) {
      const m = empty ? 1 : matchScore(query, [pr.display])
      if (m > 0) {
        push(
          {
            key: `prompt:${pr.sessionId ?? ''}:${truncate(pr.display, 40)}`,
            kind: 'prompt',
            title: truncate(pr.display, 70),
            subtitle: pr.project
              ? t('launcher.prompt.withProject', { project: basename(pr.project) })
              : t('launcher.kind.prompt'),
            icon: null,
            target: pr.display,
            meta: { sessionId: pr.sessionId ?? undefined, projectPath: pr.project ?? undefined }
          },
          m,
          pr.ts
        )
      }
    }

    // 应用（空查询只出有使用记录的高频项）
    for (const a of this.apps) {
      const key = `app:${a.target.toLowerCase()}`
      if (empty && !this.frecency.has(key)) continue
      const m = empty ? 1 : matchScore(query, [a.name])
      if (m > 0) {
        push(
          {
            key,
            kind: 'app',
            title: a.name,
            subtitle:
              a.kind === 'uwp' ? t('launcher.kind.app') : (a.exePath ?? t('launcher.kind.app')),
            icon: a.icon,
            target: a.target,
            meta: { appKind: a.kind }
          },
          m,
          0
        )
      }
    }

    // 内部命令也参与普通词匹配（如输入"设置"）
    if (!empty) {
      for (const c of this.commands) {
        const m = matchScore(query, [t(c.titleKey), ...c.keywords])
        if (m > 0) push(this.commandItem(c), m, 0)
      }
    }

    scored.sort(
      (x, y) =>
        x.band - y.band ||
        y.score - x.score ||
        (KIND_ORDER[x.item.kind] ?? 9) - (KIND_ORDER[y.item.kind] ?? 9) ||
        y.recency - x.recency
    )
    return scored.slice(0, MAX_RESULTS).map((s) => s.item)
  }

  private queryCommands(query: string): LauncherItem[] {
    const list = query
      ? this.commands
          .map((c) => ({ c, m: matchScore(query, [t(c.titleKey), ...c.keywords]) }))
          .filter((x) => x.m > 0)
          .sort((a, b) => b.m - a.m)
          .map((x) => x.c)
      : this.commands
    return list.map((c) => this.commandItem(c))
  }

  private terminalItem(id: string, title: string, cwd: string, kind: string): LauncherItem {
    return {
      key: `terminal:${id}`,
      kind: 'terminal',
      title,
      subtitle: t('launcher.terminal.subtitle', {
        kind: kind === 'claude' ? 'Claude' : 'Shell',
        cwd
      }),
      icon: null,
      target: id
    }
  }

  private commandItem(c: InternalCommand): LauncherItem {
    return {
      key: `command:${c.id}`,
      kind: 'command',
      title: t(c.titleKey),
      subtitle: t(c.subtitleKey),
      icon: null,
      target: c.id
    }
  }

  // ---------- 执行动作 ----------

  private execProject(cwd: string): LauncherExecuteResult {
    const norm = normalizePath(cwd)
    const existing = this.opts.terminals
      .list()
      .find((t) => !t.exit && t.kind === 'claude' && normalizePath(t.cwd) === norm)
    if (existing) {
      this.opts.effects.navigateMain({ page: 'terminals', terminalId: existing.id })
      return { ok: true, message: null }
    }
    const info = this.opts.terminals.create({ cwd, kind: 'claude', claude: {} })
    this.opts.effects.navigateMain({ page: 'terminals', terminalId: info.id })
    return { ok: true, message: null }
  }

  private execSession(sessionId: string): LauncherExecuteResult {
    // 与 sessions:resume 同一路径：已绑定终端直接聚焦，否则内置终端恢复（§7.2.3）
    const bound = this.opts.terminals.getBySession(sessionId)
    if (bound && !bound.exit) {
      this.opts.effects.navigateMain({ page: 'terminals', terminalId: bound.id })
      return { ok: true, message: null }
    }
    const paths = this.opts.sessionsDao.getSessionPath(sessionId)
    const info = this.opts.terminals.create({
      cwd: paths?.projectPath ?? '',
      kind: 'claude',
      claude: { resumeSessionId: sessionId }
    })
    this.opts.effects.navigateMain({ page: 'terminals', terminalId: info.id })
    return { ok: true, message: null }
  }

  private execPrompt(item: LauncherItem): LauncherExecuteResult {
    const text = item.target
    const sessionId = item.meta?.sessionId
    const projectPath = item.meta?.projectPath

    // 有在跑的目标终端：直接把提示词写进输入框（括号粘贴模式防多行误提交）
    let term = sessionId ? this.opts.terminals.getBySession(sessionId) : null
    if (term?.exit) term = null
    if (!term && projectPath) {
      const norm = normalizePath(projectPath)
      term =
        this.opts.terminals
          .list()
          .find((t) => !t.exit && t.kind === 'claude' && normalizePath(t.cwd) === norm) ?? null
    }
    if (term) {
      this.opts.terminals.write(term.id, `\x1b[200~${text}\x1b[201~`)
      this.opts.effects.navigateMain({ page: 'terminals', terminalId: term.id })
      return { ok: true, message: null }
    }

    // 无在跑终端：恢复原会话（或在原项目新建），提示词进剪贴板等待粘贴
    this.opts.effects.copyText(text)
    if (sessionId && this.opts.sessionsDao.getSessionPath(sessionId)) {
      return { ...this.execSession(sessionId), message: t('launcher.prompt.copiedResumed') }
    }
    if (projectPath && existsSync(projectPath)) {
      return {
        ...this.execProject(projectPath),
        message: t('launcher.prompt.copiedProject')
      }
    }
    return { ok: true, message: t('launcher.prompt.copied') }
  }

  private async execApp(item: LauncherItem): Promise<LauncherExecuteResult> {
    if (item.meta?.appKind === 'uwp') {
      // AppUserModelID 经参数数组传递，不过 shell 字符串拼接（§11 命令执行面）
      execFile('explorer.exe', [`shell:AppsFolder\\${item.target}`], () => {})
      return { ok: true, message: null }
    }
    const err = await this.opts.effects.openPath(item.target)
    return err
      ? { ok: false, message: t('launcher.app.launchFailed', { error: err }) }
      : { ok: true, message: null }
  }

  private buildCommands(): InternalCommand[] {
    const nav = (page: NavigateRequest['page']): LauncherExecuteResult => {
      this.opts.effects.navigateMain({ page })
      return { ok: true, message: null }
    }
    return [
      {
        id: 'new-terminal',
        titleKey: 'launcher.cmd.newTerminal',
        subtitleKey: 'launcher.cmd.newTerminal.subtitle',
        keywords: ['new', 'terminal', '终端', 'xin jian'],
        run: () => nav('terminals')
      },
      {
        id: 'open-dashboard',
        titleKey: 'launcher.cmd.openDashboard',
        subtitleKey: 'launcher.cmd.openDashboard.subtitle',
        keywords: ['dashboard', 'home', '指挥台', '首页'],
        run: () => nav('dashboard')
      },
      {
        id: 'open-sessions',
        titleKey: 'launcher.cmd.openSessions',
        subtitleKey: 'launcher.cmd.openSessions.subtitle',
        keywords: ['sessions', 'history', '会话', '历史'],
        run: () => nav('sessions')
      },
      {
        id: 'open-terminals',
        titleKey: 'launcher.cmd.openTerminals',
        subtitleKey: 'launcher.cmd.openTerminals.subtitle',
        keywords: ['terminals', '终端'],
        run: () => nav('terminals')
      },
      {
        id: 'open-settings',
        titleKey: 'launcher.cmd.openSettings',
        subtitleKey: 'launcher.cmd.openSettings.subtitle',
        keywords: ['settings', 'options', 'preferences', '设置'],
        run: () => nav('settings')
      },
      {
        id: 'rescan-apps',
        titleKey: 'launcher.cmd.rescanApps',
        subtitleKey: 'launcher.cmd.rescanApps.subtitle',
        keywords: ['rescan', 'refresh', 'apps', '扫描', '应用'],
        run: async () => ({
          ok: true,
          message: t('launcher.cmd.rescanApps.done', { n: await this.scanApps() })
        })
      },
      {
        id: 'quit',
        titleKey: 'launcher.cmd.quit',
        subtitleKey: 'launcher.cmd.quit.subtitle',
        keywords: ['quit', 'exit', '退出'],
        run: () => {
          this.opts.effects.quitApp()
          return { ok: true, message: null }
        }
      }
    ]
  }
}
