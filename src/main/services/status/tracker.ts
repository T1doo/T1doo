import { Notification } from 'electron'
import { t } from '../i18n'
import { StatusMachine, type StatusMachineOptions, type StatusTransition } from './machine'
import type { StatusSignals } from '../claude/parser'
import type { ClaudeStatusEvent } from '../../../shared/terminals'
import type { TerminalManager } from '../terminal/manager'

export interface StatusTrackerOptions {
  terminals: TerminalManager
  emitStatus: (e: ClaudeStatusEvent) => void
  /** waiting 通知开关（跟随设置实时读取） */
  notifyEnabled: () => boolean
  onNotificationClick: (terminalId: string | null, sessionId: string) => void
  /** 阈值注入（E2E 压缩等待，单测直接用 machine） */
  machine?: StatusMachineOptions
}

/**
 * 状态感知 v2 的宿主层（§7.9.2）：把 F1 增量解析出的行级信号喂给纯状态机，
 * 再把迁移落到终端标签、渲染层广播与系统通知。
 *
 * 与 v1.0 hooks 方案的差异：零新增 I/O、零配置、内置终端与外部手开会话一视同仁
 * （同一数据源）。hooks 的 SessionStart 权威校正随之退役，绑定改为 JSONL 首见按 cwd 关联。
 */
export class ClaudeStatusTracker {
  private readonly machine: StatusMachine
  private timer: NodeJS.Timeout | null = null
  private disposed = false

  constructor(private readonly opts: StatusTrackerOptions) {
    this.machine = new StatusMachine(opts.machine)
  }

  /** F1 增量同步出口：一次解析块的状态信号 */
  feed(
    sessionId: string,
    signals: StatusSignals,
    ctx: { cwd?: string | null; replace?: boolean } = {}
  ): void {
    if (this.disposed || !sessionId) return
    const now = Date.now()
    const knownBefore = this.machine.inspect(sessionId) !== null
    const transitions = this.machine.feed(sessionId, signals, { ...ctx, now })

    // 首见的活跃会话 → 按 cwd 关联尚未绑定的终端（替代 hooks SessionStart 校正，§7.9.4）；
    // 必须先于 apply，否则本轮迁移找不到终端、角标漏更新。
    if (!knownBefore && this.machine.inspect(sessionId)) {
      this.opts.terminals.adoptSession(sessionId, ctx.cwd ?? null)
    }

    this.apply(transitions)
    this.schedule()
  }

  /** 会话文件消失 / 绑定进程退出 */
  remove(sessionId: string): void {
    if (!this.machine.remove(sessionId)) return
    const terminal = this.opts.terminals.setStatusBySession(sessionId, 'idle')
    this.opts.emitStatus({
      sessionId,
      status: 'closed',
      cwd: null,
      terminalId: terminal?.id ?? null,
      certain: false,
      ts: Date.now()
    })
    this.schedule()
  }

  /** Dashboard：当前活跃会话状态快照 */
  snapshot(): ClaudeStatusEvent[] {
    return this.machine.snapshot(Date.now()).map((tr) => this.toEvent(tr))
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private apply(transitions: StatusTransition[]): void {
    for (const tr of transitions) {
      const terminal = this.opts.terminals.setStatusBySession(tr.sessionId, tr.status, tr.certain)
      this.opts.emitStatus({ ...this.toEvent(tr), terminalId: terminal?.id ?? null })
      if (tr.notify) this.notifyWaiting(tr, terminal?.id ?? null)
    }
  }

  private toEvent(tr: StatusTransition): ClaudeStatusEvent {
    return {
      sessionId: tr.sessionId,
      status: tr.status,
      cwd: tr.cwd,
      terminalId: this.opts.terminals.getBySession(tr.sessionId)?.id ?? null,
      certain: tr.certain,
      ts: tr.ts
    }
  }

  /**
   * 按状态机的下一个截止点精确唤醒（无待决迁移时不留计时器）。
   * 不用固定间隔轮询：§10.3 空闲 CPU 预算 + Win11 EcoQoS 下定时器本就会退化到秒级，
   * 轮询既费电又不准；截止点调度最坏只迟到一个唤醒周期，仍在 U4 的 3s 内。
   */
  private schedule(): void {
    if (this.disposed) return
    if (this.timer) clearTimeout(this.timer)
    const now = Date.now()
    const at = this.machine.nextDeadlineAt(now)
    if (at === null) {
      this.timer = null
      return
    }
    this.timer = setTimeout(
      () => {
        this.timer = null
        if (this.disposed) return
        this.apply(this.machine.tick(Date.now()))
        this.schedule()
      },
      Math.max(50, at - now)
    )
  }

  private notifyWaiting(tr: StatusTransition, terminalId: string | null): void {
    if (!this.opts.notifyEnabled() || !Notification.isSupported()) return
    const terminal = this.opts.terminals.getBySession(tr.sessionId)
    const notification = new Notification({
      title: t('notify.sessionWaiting'),
      body: terminal?.title ?? tr.cwd ?? tr.sessionId,
      silent: false
    })
    notification.on('click', () => {
      this.opts.onNotificationClick(terminalId ?? terminal?.id ?? null, tr.sessionId)
    })
    notification.show()
  }
}
