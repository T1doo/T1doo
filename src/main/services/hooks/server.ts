import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import Store from 'electron-store'
import type { HooksState } from '../../../shared/terminals'
import { buildHookCommand, hasOurHooks, mergeHooks, removeHooks } from './settings-file'
import { t } from '../i18n'

/** hooks 上报的载荷（stdin JSON 原样转发，字段 2026-07-04 官方文档核实） */
export interface HookPayload {
  hook_event_name: string
  session_id?: string
  cwd?: string
  transcript_path?: string
  permission_mode?: string
  [k: string]: unknown
}

interface HooksConfig {
  enabled: boolean
  port: number | null
  token: string | null
}

const MAX_BODY = 1024 * 1024

/**
 * HookServer（§7.2.4）：127.0.0.1 随机端口 + Bearer token，经设置页显式开启后
 * 注册进 ~/.claude/settings.json（备份 + 深合并），一键移除精确还原。
 */
export class HooksService {
  private store = new Store<HooksConfig>({
    name: 'hooks',
    defaults: { enabled: false, port: null, token: null }
  })
  private server: Server | null = null
  private lastError: string | null = null

  constructor(
    private readonly onEvent: (payload: HookPayload) => void,
    private readonly settingsPath = join(homedir(), '.claude', 'settings.json'),
    private readonly log: (msg: string) => void = () => {}
  ) {}

  /** 应用启动时恢复：上次启用过则直接拉起服务（端口漂移时自动改写注册） */
  async init(): Promise<void> {
    if (this.store.get('enabled')) {
      try {
        await this.enable()
      } catch (err) {
        this.lastError = String(err instanceof Error ? err.message : err)
        this.log(`启动恢复失败：${this.lastError}`)
      }
    }
  }

  getState(): HooksState {
    return {
      enabled: this.store.get('enabled'),
      running: this.server !== null,
      port: this.store.get('port'),
      registered: this.isRegistered(),
      error: this.lastError
    }
  }

  async setEnabled(enabled: boolean): Promise<HooksState> {
    this.lastError = null
    try {
      if (enabled) await this.enable()
      else this.disable()
    } catch (err) {
      this.lastError = String(err instanceof Error ? err.message : err)
    }
    return this.getState()
  }

  dispose(): void {
    this.server?.close()
    this.server = null
  }

  private async enable(): Promise<void> {
    if (!this.server) {
      const preferred = this.store.get('port')
      const port = await this.listen(preferred ?? 0).catch(() => this.listen(0)) // 被占用 → 换新端口
      this.store.set('port', port)
    }
    if (!this.store.get('token')) {
      this.store.set('token', randomBytes(24).toString('hex'))
    }
    this.store.set('enabled', true)
    this.register()
  }

  private disable(): void {
    this.store.set('enabled', false)
    this.dispose()
    this.unregister()
  }

  private listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this.handle(req, res))
      server.once('error', (err) => reject(err))
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        const addr = server.address()
        resolve(typeof addr === 'object' && addr ? addr.port : port)
      })
    })
  }

  private handle(req: import('http').IncomingMessage, res: import('http').ServerResponse): void {
    if (req.method !== 'POST' || !req.url?.startsWith('/t1doo-hook')) {
      res.writeHead(404).end()
      return
    }
    const token = this.store.get('token')
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end()
      return
    }
    let body = ''
    let overflow = false
    req.on('data', (chunk: Buffer) => {
      if (body.length + chunk.length > MAX_BODY) overflow = true
      else body += chunk.toString('utf8')
    })
    req.on('end', () => {
      res.writeHead(200).end() // 先响应，绝不让 hook 等我们
      if (overflow) return
      try {
        const payload = JSON.parse(body) as HookPayload
        if (typeof payload?.hook_event_name === 'string') this.onEvent(payload)
      } catch {
        // 非 JSON 载荷忽略
      }
    })
  }

  // ---------- ~/.claude/settings.json 注册/还原 ----------

  private readSettings(): Record<string, unknown> {
    if (!existsSync(this.settingsPath)) return {}
    const raw = readFileSync(this.settingsPath, 'utf8')
    if (!raw.trim()) return {}
    const parsed: unknown = JSON.parse(raw) // 解析失败向上抛：绝不覆盖读不懂的用户配置
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(t('err.hooksSettingsMalformed'))
    }
    return parsed as Record<string, unknown>
  }

  private writeSettings(settings: Record<string, unknown>): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true })
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  }

  private register(): void {
    const port = this.store.get('port')
    const token = this.store.get('token')
    if (!port || !token) throw new Error(t('err.hooksNotInitialized'))
    const settings = this.readSettings()
    if (existsSync(this.settingsPath)) {
      copyFileSync(this.settingsPath, `${this.settingsPath}.bak-t1doo`)
    }
    this.writeSettings(mergeHooks(settings, buildHookCommand(port, token)))
    this.log(`hooks 已注册（port=${port}）`)
  }

  private unregister(): void {
    if (!existsSync(this.settingsPath)) return
    const settings = this.readSettings()
    this.writeSettings(removeHooks(settings))
    this.log('hooks 已移除还原')
  }

  private isRegistered(): boolean {
    try {
      return hasOurHooks(this.readSettings())
    } catch {
      return false
    }
  }
}
