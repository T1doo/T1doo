import type { StatusSignals } from '../claude/parser'
import type { ClaudeStatus } from '../../../shared/terminals'

/**
 * F2 状态感知 v2 的纯状态机（§7.9.2）——不依赖 Electron/fs/计时器，vitest 直测。
 * 输入：F1 增量解析出的行级信号 + 注入的墙钟；输出：状态迁移。
 *
 * waiting 为**推断值**，分三层（阈值与分层依据＝本机 4688 次 tool_use→tool_result 实测，§14.2）：
 *  ① 确定层：AskUserQuestion / ExitPlanMode 悬挂 —— 语义即等待用户，实测 P(>2s)=100%、
 *     中位 51s，无需阈值、不受 permissionMode 影响；
 *  ② 启发层：该工具在当前 permissionMode 下会弹确认，且悬挂超阈值。文件类工具执行中位
 *     0.03s（Edit 超 2s 仅 0.7%），故 2s 阈值在此层误报极低；
 *  ③ 排除层：Agent/WebSearch/WebFetch 等既不弹确认、执行又本就漫长（Agent 中位 69s、
 *     最长 998s），永不据此推 waiting —— 这层是「一刀切 2s 会有 24% 误报」的根因。
 * 取舍：宁可漏报不误报（U4 只保证「等待你的输入」这类通知不打扰）。
 */

/** 悬挂 tool_use 判 waiting 的静默阈值（§7.9.2 默认 2s） */
export const WAITING_THRESHOLD_MS = 2_000
/**
 * 回合结束的落定延迟：CC 把一条 assistant 消息按内容块拆成多行写
 * （同一 message.id 的 text 行与 tool_use 行相邻），无此延迟会在两行之间闪出假 idle。
 */
export const IDLE_SETTLE_MS = 1_500
/** 末行是 user（CC 正在调 API / 跑工具）时的兜底：超时即认定进程已死 → idle */
export const STALE_MS = 5 * 60_000
/** 判活窗口：最后一行早于此即历史会话，不建状态 —— 冷启动全量同步不误报、不发通知 */
export const LIVE_WINDOW_MS = 5 * 60_000
/** idle 且长期无动静 → 移出内存 */
export const PRUNE_AFTER_MS = 30 * 60_000

/** 确定层：语义即「等用户回答/批准」，悬挂即 waiting */
const ALWAYS_WAITING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

/** 排除层：不弹确认 + 执行本就漫长，悬挂无信息量 */
const NEVER_WAITING_TOOLS = new Set([
  'Agent',
  'Task',
  'WebSearch',
  'WebFetch',
  'Skill',
  'Workflow',
  'Monitor',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'ToolSearch'
])

/** acceptEdits 模式下自动放行的文件写入类工具 */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/**
 * 该工具在当前 permissionMode 下是否会弹确认框。
 * 实测值域：auto / bypassPermissions / default / plan（本机 80 文件全覆盖）。
 * permissionMode 未知时按 default 处理——实测 90.2% 的用户提示行携带该字段，
 * 且首次得知恒发生在第 1 个提示，未知窗口极短。
 */
function mayPrompt(tool: string, mode: string | null): boolean {
  if (NEVER_WAITING_TOOLS.has(tool)) return false
  switch (mode) {
    case 'bypassPermissions':
    case 'dontAsk':
    case 'auto':
      return false
    case 'plan':
      // 计划模式不执行变更类工具；真正的等待走 ExitPlanMode（确定层）
      return false
    case 'acceptEdits':
      return !EDIT_TOOLS.has(tool)
    default:
      return true
  }
}

export interface StatusTransition {
  sessionId: string
  status: ClaudeStatus
  cwd: string | null
  /** true=确定层判定（实心角标）；false=启发式推断（空心角标，§7.9.2 如实展示局限） */
  certain: boolean
  /** 本次迁移是否应发系统通知（仅首次进入 waiting） */
  notify: boolean
  ts: number
}

export interface StatusMachineOptions {
  waitingThresholdMs?: number
  idleSettleMs?: number
  staleMs?: number
  liveWindowMs?: number
  pruneAfterMs?: number
}

interface SessionState {
  status: ClaudeStatus
  certain: boolean
  cwd: string | null
  permissionMode: string | null
  /** 已开启未闭合的 tool_use：id → 工具名 */
  pending: Map<string, string>
  /** 观测到最后一行的墙钟（阈值一律基于墙钟，不受行内时间戳/时钟漂移影响） */
  lastFeedAt: number
  lastRole: 'user' | 'assistant' | null
  /** 当前 waiting episode 是否已通知过（离开 waiting 时清零，防重复打扰） */
  notified: boolean
}

export class StatusMachine {
  private sessions = new Map<string, SessionState>()
  private readonly waitingThresholdMs: number
  private readonly idleSettleMs: number
  private readonly staleMs: number
  private readonly liveWindowMs: number
  private readonly pruneAfterMs: number

  constructor(opts: StatusMachineOptions = {}) {
    this.waitingThresholdMs = opts.waitingThresholdMs ?? WAITING_THRESHOLD_MS
    this.idleSettleMs = opts.idleSettleMs ?? IDLE_SETTLE_MS
    this.staleMs = opts.staleMs ?? STALE_MS
    this.liveWindowMs = opts.liveWindowMs ?? LIVE_WINDOW_MS
    this.pruneAfterMs = opts.pruneAfterMs ?? PRUNE_AFTER_MS
  }

  /**
   * 喂入一次增量解析结果。
   * `replace=true`（游标重建/截断）时先清空该会话的悬挂集，避免用历史 tool_use 污染。
   */
  feed(
    sessionId: string,
    signals: StatusSignals,
    ctx: { cwd?: string | null; now: number; replace?: boolean }
  ): StatusTransition[] {
    const { now } = ctx
    let s = this.sessions.get(sessionId)

    // 判活：历史会话不建状态（冷启动追平 271 个文件时不产生任何状态与通知）
    if (!s) {
      const fresh = signals.lastTs !== null && now - signals.lastTs <= this.liveWindowMs
      if (!fresh) return []
      s = {
        status: 'idle',
        certain: false,
        cwd: ctx.cwd ?? null,
        permissionMode: null,
        pending: new Map(),
        lastFeedAt: now,
        lastRole: null,
        notified: false
      }
      this.sessions.set(sessionId, s)
    }

    if (ctx.replace) s.pending.clear()
    if (ctx.cwd) s.cwd = ctx.cwd
    if (signals.permissionMode) s.permissionMode = signals.permissionMode

    // 只有真的出现了主链对话行才推进墙钟与末行角色
    // （纯 permission-mode 行不含 ts 也不含角色，只改模式、不代表有活动）
    if (signals.lastRole) {
      s.lastFeedAt = now
      s.lastRole = signals.lastRole
    }

    for (const tu of signals.toolUseOpened) s.pending.set(tu.id, tu.name)
    // tool_result 到达＝确认已给出 / 工具已完成 → 悬挂解除
    for (const id of signals.toolResultClosed) s.pending.delete(id)

    return this.evaluate(sessionId, s, now)
  }

  /** 由宿主按 nextDeadlineAt 精确驱动：结算超时类迁移（waiting / idle） */
  tick(now: number): StatusTransition[] {
    const out: StatusTransition[] = []
    for (const [id, s] of [...this.sessions]) {
      if (s.status === 'idle' && now - s.lastFeedAt >= this.pruneAfterMs) {
        this.sessions.delete(id)
        continue
      }
      out.push(...this.evaluate(id, s, now))
    }
    return out
  }

  /**
   * 下一个需要重新求值的时刻；无待决迁移时返回 null。
   * 宿主据此 setTimeout 精确唤醒，避免常驻轮询（§10.3 空闲 CPU 预算）。
   */
  nextDeadlineAt(now: number): number | null {
    let min: number | null = null
    const bump = (at: number): void => {
      if (min === null || at < min) min = at
    }
    for (const s of this.sessions.values()) {
      if (s.pending.size > 0) {
        if (s.status !== 'waiting' && this.hasEligiblePending(s)) {
          bump(s.lastFeedAt + this.waitingThresholdMs)
        }
      } else if (s.lastRole === 'assistant') {
        if (s.status !== 'idle') bump(s.lastFeedAt + this.idleSettleMs)
      } else if (s.lastRole === 'user') {
        if (s.status !== 'idle') bump(s.lastFeedAt + this.staleMs)
      }
      if (s.status === 'idle') bump(s.lastFeedAt + this.pruneAfterMs)
    }
    if (min === null) return null
    return Math.max(min, now)
  }

  /** 会话结束（绑定进程退出 / 文件消失）：移出状态 */
  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }

  snapshot(now: number): StatusTransition[] {
    return [...this.sessions.entries()].map(([sessionId, s]) => ({
      sessionId,
      status: s.status,
      cwd: s.cwd,
      certain: s.certain,
      notify: false,
      ts: now
    }))
  }

  /** 供单测与诊断：当前推断依据 */
  inspect(sessionId: string): { permissionMode: string | null; pending: string[] } | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    return { permissionMode: s.permissionMode, pending: [...s.pending.values()] }
  }

  private hasEligiblePending(s: SessionState): boolean {
    for (const name of s.pending.values()) {
      if (mayPrompt(name, s.permissionMode)) return true
    }
    return false
  }

  /** 求值当前应处状态；仅在与既有状态不同时产出迁移 */
  private evaluate(sessionId: string, s: SessionState, now: number): StatusTransition[] {
    const next = this.infer(s, now)
    if (next.status === s.status && next.certain === s.certain) return []

    const leavingWaiting = s.status === 'waiting' && next.status !== 'waiting'
    if (leavingWaiting) s.notified = false

    const notify = next.status === 'waiting' && !s.notified
    if (notify) s.notified = true

    s.status = next.status
    s.certain = next.certain
    return [
      {
        sessionId,
        status: next.status,
        cwd: s.cwd,
        certain: next.certain,
        notify,
        ts: now
      }
    ]
  }

  private infer(s: SessionState, now: number): { status: ClaudeStatus; certain: boolean } {
    const silentFor = now - s.lastFeedAt

    if (s.pending.size > 0) {
      // ① 确定层
      for (const name of s.pending.values()) {
        if (ALWAYS_WAITING_TOOLS.has(name)) return { status: 'waiting', certain: true }
      }
      // ② 启发层
      if (this.hasEligiblePending(s) && silentFor >= this.waitingThresholdMs) {
        return { status: 'waiting', certain: false }
      }
      // ③ 排除层的工具在跑 / 未到阈值 → 工作中
      return { status: 'working', certain: false }
    }

    // 无悬挂：末行角色决定「回合结束」还是「CC 正在思考」
    if (s.lastRole === 'assistant') {
      return silentFor >= this.idleSettleMs
        ? { status: 'idle', certain: false }
        : { status: 'working', certain: false }
    }
    if (s.lastRole === 'user') {
      // 用户刚提交 / tool_result 刚回填 → CC 在调 API 或跑工具，绝不能凭静默判 idle
      return silentFor >= this.staleMs
        ? { status: 'idle', certain: false }
        : { status: 'working', certain: false }
    }
    return { status: s.status, certain: s.certain }
  }
}
