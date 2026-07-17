import { describe, expect, it } from 'vitest'
import { StatusMachine } from '../../src/main/services/status/machine'
import type { StatusSignals } from '../../src/main/services/claude/parser'

/**
 * F2 状态感知 v2 状态机（§7.9.2）。
 * 墙钟由 `now` 注入，无计时器、无 fake timers —— 阈值边界可精确断言。
 */

const T0 = Date.parse('2026-07-17T10:00:00.000Z')

function signals(patch: Partial<StatusSignals> = {}): StatusSignals {
  return {
    permissionMode: null,
    toolUseOpened: [],
    toolResultClosed: [],
    userPrompt: false,
    lastRole: null,
    lastTs: T0,
    ...patch
  }
}

/** 真实用户提示行 */
const prompt = (patch: Partial<StatusSignals> = {}): StatusSignals =>
  signals({ userPrompt: true, lastRole: 'user', ...patch })
/** assistant 行（起工具时传 toolUseOpened；纯文本行则不传） */
const assistant = (patch: Partial<StatusSignals> = {}): StatusSignals =>
  signals({ lastRole: 'assistant', ...patch })
/** user 行回填 tool_result */
const toolResult = (ids: string[], patch: Partial<StatusSignals> = {}): StatusSignals =>
  signals({ toolResultClosed: ids, lastRole: 'user', ...patch })

describe('StatusMachine 全流转', () => {
  it('用户提示 → working', () => {
    const m = new StatusMachine()
    const out = m.feed('s1', prompt(), { now: T0, cwd: 'E:\\P' })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ status: 'working', certain: false, notify: false, cwd: 'E:\\P' })
  })

  it('用户提示后 CC 长时间思考（无新行）仍是 working —— 不得凭静默判 idle', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt(), { now: T0 })
    // 末行是 user：CC 正在调 API / 跑工具，30s 无写入也不能回落 idle
    expect(m.tick(T0 + 30_000)).toEqual([])
    expect(m.snapshot(T0 + 30_000)[0]).toMatchObject({ status: 'working' })
  })

  it('回合收尾（末行 assistant 纯文本、无悬挂）→ 落定后 idle', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt(), { now: T0 })
    m.feed('s1', assistant({ toolUseOpened: [{ id: 't1', name: 'Read' }] }), { now: T0 + 100 })
    m.feed('s1', toolResult(['t1']), { now: T0 + 200 })
    // 收尾的 assistant 文本行：除了角色与时间戳，不产生任何其他信号
    m.feed('s1', assistant({ lastTs: T0 + 300 }), { now: T0 + 300 })

    expect(m.tick(T0 + 300 + 1_499)).toEqual([]) // 落定前不迁移
    const out = m.tick(T0 + 300 + 1_500)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ status: 'idle' })
  })

  it('assistant 消息被按内容块拆行写：text 行与随后的 tool_use 行之间不得闪出假 idle', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt(), { now: T0 })
    // 同一条 assistant 消息的 text 块先落盘（CC 实测行为：一条消息拆多行）
    m.feed('s1', assistant({ lastTs: T0 + 100 }), { now: T0 + 100 })
    // 落定延迟内 tool_use 块随即到达 → 全程 working，无 idle 迁移
    expect(m.tick(T0 + 100 + 1_400)).toEqual([])
    m.feed('s1', assistant({ toolUseOpened: [{ id: 't1', name: 'Bash' }], lastTs: T0 + 1_500 }), {
      now: T0 + 1_500
    })
    expect(m.snapshot(T0 + 1_500)[0]).toMatchObject({ status: 'working' })
  })
})

describe('waiting 判定 · ① 确定层', () => {
  it('AskUserQuestion 悬挂 → 立即 waiting + certain + 通知（无需阈值）', () => {
    const m = new StatusMachine()
    const out = m.feed(
      's1',
      assistant({ toolUseOpened: [{ id: 't1', name: 'AskUserQuestion' }] }),
      {
        now: T0
      }
    )
    expect(out[0]).toMatchObject({ status: 'waiting', certain: true, notify: true })
  })

  it('ExitPlanMode 悬挂 → 确定 waiting，且不受 bypassPermissions 抑制', () => {
    const m = new StatusMachine()
    const out = m.feed(
      's1',
      assistant({
        permissionMode: 'bypassPermissions',
        toolUseOpened: [{ id: 't1', name: 'ExitPlanMode' }]
      }),
      { now: T0 }
    )
    expect(out[0]).toMatchObject({ status: 'waiting', certain: true })
  })

  it('确定层的 tool_result 在同一块内到达（用户秒答）→ 不产生 waiting', () => {
    const m = new StatusMachine()
    const out = m.feed(
      's1',
      toolResult(['t1'], {
        userPrompt: false,
        toolUseOpened: [{ id: 't1', name: 'AskUserQuestion' }]
      }),
      { now: T0 }
    )
    expect(out[0]?.status).toBe('working')
  })
})

describe('waiting 判定 · ② 启发层阈值边界', () => {
  it('Edit 悬挂未到 2s → 仍 working；跨过 2s → waiting（推断值，certain=false）', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt({ permissionMode: 'default' }), { now: T0 })
    m.feed('s1', assistant({ toolUseOpened: [{ id: 't1', name: 'Edit' }] }), { now: T0 + 10 })
    expect(m.snapshot(T0 + 10)[0]).toMatchObject({ status: 'working' })

    expect(m.tick(T0 + 10 + 1_999)).toEqual([]) // 阈值前一刻：不迁移
    const fired = m.tick(T0 + 10 + 2_000) // 恰好到阈值
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ status: 'waiting', certain: false, notify: true })
  })

  it('waiting 期间 tool_result 到达（用户点了同意）→ 回到 working', () => {
    const m = new StatusMachine()
    m.feed(
      's1',
      assistant({ permissionMode: 'default', toolUseOpened: [{ id: 't1', name: 'Edit' }] }),
      {
        now: T0
      }
    )
    expect(m.tick(T0 + 2_000)[0]).toMatchObject({ status: 'waiting' })
    const resumed = m.feed('s1', toolResult(['t1']), { now: T0 + 5_000 })
    expect(resumed[0]).toMatchObject({ status: 'working' })
  })

  it('同一 waiting 期只通知一次；离开后再次进入才再通知', () => {
    const m = new StatusMachine()
    m.feed(
      's1',
      assistant({ permissionMode: 'default', toolUseOpened: [{ id: 't1', name: 'Edit' }] }),
      {
        now: T0
      }
    )
    expect(m.tick(T0 + 2_000)[0]?.notify).toBe(true)
    expect(m.tick(T0 + 3_000)).toEqual([]) // 状态未变 → 不再产出、不再通知

    m.feed('s1', toolResult(['t1']), { now: T0 + 4_000 })
    m.feed('s1', assistant({ toolUseOpened: [{ id: 't2', name: 'Edit' }] }), { now: T0 + 4_100 })
    expect(m.tick(T0 + 6_200)[0]).toMatchObject({ status: 'waiting', notify: true })
  })

  it('并行工具：只要有一个够格的悬挂就推 waiting，全部闭合才解除', () => {
    const m = new StatusMachine()
    m.feed(
      's1',
      assistant({
        permissionMode: 'default',
        toolUseOpened: [
          { id: 't1', name: 'Agent' }, // 排除层
          { id: 't2', name: 'Write' } // 启发层
        ]
      }),
      { now: T0 }
    )
    expect(m.tick(T0 + 2_000)[0]).toMatchObject({ status: 'waiting' })
    m.feed('s1', toolResult(['t2']), { now: T0 + 3_000 })
    // Agent 还挂着，但它不够格推 waiting → 回到 working
    expect(m.snapshot(T0 + 3_000)[0]).toMatchObject({ status: 'working' })
    expect(m.inspect('s1')?.pending).toEqual(['Agent'])
  })
})

describe('waiting 判定 · ③ 排除层与 permissionMode 抑制', () => {
  it('Agent 悬挂再久也不推 waiting（实测中位 69s、最长 998s，是慢不是等）', () => {
    const m = new StatusMachine()
    m.feed(
      's1',
      assistant({ permissionMode: 'default', toolUseOpened: [{ id: 't1', name: 'Agent' }] }),
      {
        now: T0
      }
    )
    expect(m.tick(T0 + 120_000)).toEqual([])
    expect(m.snapshot(T0 + 120_000)[0]).toMatchObject({ status: 'working' })
  })

  it.each(['bypassPermissions', 'auto', 'dontAsk', 'plan'])(
    'permissionMode=%s → 启发层全抑制（这些模式不弹确认框）',
    (mode) => {
      const m = new StatusMachine()
      m.feed(
        's1',
        assistant({ permissionMode: mode, toolUseOpened: [{ id: 't1', name: 'Bash' }] }),
        {
          now: T0
        }
      )
      expect(m.tick(T0 + 10_000)).toEqual([])
      expect(m.snapshot(T0 + 10_000)[0]).toMatchObject({ status: 'working' })
    }
  )

  it('acceptEdits：Edit 被抑制，Bash 仍推 waiting', () => {
    const m = new StatusMachine()
    m.feed(
      's1',
      assistant({ permissionMode: 'acceptEdits', toolUseOpened: [{ id: 't1', name: 'Edit' }] }),
      {
        now: T0
      }
    )
    expect(m.tick(T0 + 5_000)).toEqual([])

    const m2 = new StatusMachine()
    m2.feed(
      's2',
      assistant({ permissionMode: 'acceptEdits', toolUseOpened: [{ id: 't1', name: 'Bash' }] }),
      { now: T0 }
    )
    expect(m2.tick(T0 + 5_000)[0]).toMatchObject({ status: 'waiting' })
  })

  it('permissionMode 未知 → 按 default 处理（实测首个提示即可得知，未知窗口极短）', () => {
    const m = new StatusMachine()
    m.feed('s1', assistant({ toolUseOpened: [{ id: 't1', name: 'Write' }] }), { now: T0 })
    expect(m.tick(T0 + 2_000)[0]).toMatchObject({ status: 'waiting' })
  })

  it('permissionMode 中途改变（type:permission-mode 行）即刻生效', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt({ permissionMode: 'default' }), { now: T0 })
    // 用户按 shift+tab 切到 bypassPermissions：该行只有 {type,permissionMode,sessionId}，
    // 既无 timestamp 也无角色 —— 不推进墙钟，只改模式
    m.feed('s1', signals({ permissionMode: 'bypassPermissions', lastTs: null }), { now: T0 + 10 })
    expect(m.inspect('s1')?.permissionMode).toBe('bypassPermissions')
    m.feed('s1', assistant({ toolUseOpened: [{ id: 't1', name: 'Bash' }] }), { now: T0 + 20 })
    expect(m.tick(T0 + 10_000)).toEqual([])
  })
})

describe('判活与侧链（冷启动不误报）', () => {
  it('历史会话（最后一行早于判活窗口）→ 不建状态、不产出迁移', () => {
    const m = new StatusMachine()
    const old = T0 - 3 * 24 * 3_600_000
    const out = m.feed('old', prompt({ lastTs: old }), { now: T0 })
    expect(out).toEqual([])
    expect(m.inspect('old')).toBeNull()
    expect(m.snapshot(T0)).toEqual([])
  })

  it('冷启动追平 200 个历史文件：零状态、零通知', () => {
    const m = new StatusMachine()
    const old = T0 - 7 * 24 * 3_600_000
    for (let i = 0; i < 200; i++) {
      const out = m.feed(
        `hist-${i}`,
        assistant({ toolUseOpened: [{ id: 't', name: 'Edit' }], lastTs: old }),
        { now: T0 }
      )
      expect(out).toEqual([])
    }
    expect(m.tick(T0 + 10_000)).toEqual([])
  })

  it('lastTs 为 null 的孤立行不建状态（无从判活）', () => {
    const m = new StatusMachine()
    expect(m.feed('s1', signals({ permissionMode: 'auto', lastTs: null }), { now: T0 })).toEqual([])
    expect(m.inspect('s1')).toBeNull()
  })

  it('replace（游标重建/截断）清空悬挂集，历史 tool_use 不污染', () => {
    const m = new StatusMachine()
    m.feed('s1', assistant({ toolUseOpened: [{ id: 'stale', name: 'Edit' }] }), { now: T0 })
    expect(m.inspect('s1')?.pending).toEqual(['Edit'])
    m.feed('s1', prompt({ lastTs: T0 + 10 }), { now: T0 + 10, replace: true })
    expect(m.inspect('s1')?.pending).toEqual([])
  })
})

describe('生命周期', () => {
  it('末行是 user 且超过兜底静默（进程已死）→ idle', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt(), { now: T0 })
    expect(m.tick(T0 + 5 * 60_000)[0]).toMatchObject({ status: 'idle' })
  })

  it('idle 长期无动静 → 移出内存（有界）', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt(), { now: T0 })
    m.tick(T0 + 5 * 60_000) // → idle
    m.tick(T0 + 5 * 60_000 + 30 * 60_000)
    expect(m.inspect('s1')).toBeNull()
  })

  it('nextDeadlineAt：无待决迁移时为 null，有悬挂时等于阈值时刻', () => {
    const m = new StatusMachine()
    expect(m.nextDeadlineAt(T0)).toBeNull()
    m.feed(
      's1',
      assistant({ permissionMode: 'default', toolUseOpened: [{ id: 't1', name: 'Edit' }] }),
      {
        now: T0
      }
    )
    expect(m.nextDeadlineAt(T0)).toBe(T0 + 2_000)
  })

  it('remove 后快照清空', () => {
    const m = new StatusMachine()
    m.feed('s1', prompt(), { now: T0 })
    expect(m.remove('s1')).toBe(true)
    expect(m.snapshot(T0)).toEqual([])
  })
})
