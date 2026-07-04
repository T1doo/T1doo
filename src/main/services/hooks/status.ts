import { Notification } from 'electron'
import type { ClaudeStatus, ClaudeStatusEvent } from '../../../shared/terminals'
import type { TerminalManager } from '../terminal/manager'
import type { HookPayload } from './server'

const IDLE_DECAY_MS = 10_000

interface SessionState {
  status: ClaudeStatus
  cwd: string | null
  ts: number
}

export interface StatusTrackerOptions {
  terminals: TerminalManager
  emitStatus: (e: ClaudeStatusEvent) => void
  /** waiting 通知开关（跟随设置实时读取） */
  notifyEnabled: () => boolean
  onNotificationClick: (terminalId: string | null, sessionId: string) => void
}

/**
 * 会话状态推断（§7.2.4）：hooks 事件 → working/waiting/idle；
 * hooks 关闭时由 JSONL 同步事件降级推断（最近有输出=working，静默 10s 回落 idle）。
 */
export class ClaudeStatusTracker {
  private sessions = new Map<string, SessionState>()
  private decayTimers = new Map<string, NodeJS.Timeout>()

  constructor(private readonly opts: StatusTrackerOptions) {}

  handleHook(payload: HookPayload): void {
    const sessionId = payload.session_id
    if (!sessionId) return
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : null

    switch (payload.hook_event_name) {
      case 'SessionStart':
        this.opts.terminals.adoptSession(sessionId, cwd)
        this.update(sessionId, 'idle', cwd)
        break
      case 'UserPromptSubmit':
        this.update(sessionId, 'working', cwd)
        break
      case 'PermissionRequest':
      case 'Notification':
        this.update(sessionId, 'waiting', cwd)
        this.notifyWaiting(sessionId, payload)
        break
      case 'Stop':
        this.update(sessionId, 'idle', cwd)
        break
      case 'SessionEnd':
        this.remove(sessionId, cwd)
        break
      default:
        break
    }
  }

  /** 降级路径：JSONL 有写入 → working，10s 无动静回落 idle（仅 hooks 未运行时调用） */
  touchFromSync(sessionIds: string[]): void {
    for (const id of sessionIds) {
      this.update(id, 'working', this.sessions.get(id)?.cwd ?? null)
      clearTimeout(this.decayTimers.get(id))
      this.decayTimers.set(
        id,
        setTimeout(() => {
          this.decayTimers.delete(id)
          if (this.sessions.get(id)?.status === 'working') this.update(id, 'idle', null)
        }, IDLE_DECAY_MS)
      )
    }
  }

  /** Dashboard：当前已知的活跃会话状态快照 */
  snapshot(): ClaudeStatusEvent[] {
    const now = Date.now()
    return [...this.sessions.entries()].map(([sessionId, s]) => ({
      sessionId,
      status: s.status,
      cwd: s.cwd,
      terminalId: this.opts.terminals.getBySession(sessionId)?.id ?? null,
      ts: now
    }))
  }

  dispose(): void {
    for (const t of this.decayTimers.values()) clearTimeout(t)
    this.decayTimers.clear()
  }

  private update(sessionId: string, status: ClaudeStatus, cwd: string | null): void {
    const prev = this.sessions.get(sessionId)
    const nextCwd = cwd ?? prev?.cwd ?? null
    this.sessions.set(sessionId, { status, cwd: nextCwd, ts: Date.now() })
    const terminal = this.opts.terminals.setStatusBySession(sessionId, status)
    this.opts.emitStatus({
      sessionId,
      status,
      cwd: nextCwd,
      terminalId: terminal?.id ?? null,
      ts: Date.now()
    })
  }

  private remove(sessionId: string, cwd: string | null): void {
    this.sessions.delete(sessionId)
    const terminal = this.opts.terminals.setStatusBySession(sessionId, 'idle')
    this.opts.emitStatus({
      sessionId,
      status: 'closed',
      cwd,
      terminalId: terminal?.id ?? null,
      ts: Date.now()
    })
  }

  private notifyWaiting(sessionId: string, payload: HookPayload): void {
    if (!this.opts.notifyEnabled() || !Notification.isSupported()) return
    const terminal = this.opts.terminals.getBySession(sessionId)
    const message = typeof payload.message === 'string' ? payload.message : null
    const notification = new Notification({
      title: '会话等待你的输入',
      body: message ?? terminal?.title ?? payload.cwd?.toString() ?? sessionId,
      silent: false
    })
    notification.on('click', () => {
      this.opts.onNotificationClick(terminal?.id ?? null, sessionId)
    })
    notification.show()
  }
}
