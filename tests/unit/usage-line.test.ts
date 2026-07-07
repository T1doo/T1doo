import { describe, expect, it } from 'vitest'
import { parseUsageLine } from '../../src/main/services/usage/usage-line'

/** §7.8.2 采集规则单测：assistant 行提取、「任一 token>0 计入」口径、容错 */

function assistantLine(overrides: {
  id?: string | null
  usage?: Record<string, unknown> | null
  stopReason?: string | null
  model?: string
  ts?: string
}): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: 'row-uuid-1',
    sessionId: '5e3d5de6-4fec-4257-aef8-1c6720b9303d',
    cwd: 'C:\\Users\\u\\proj',
    timestamp: overrides.ts ?? '2026-06-06T06:17:44.865Z',
    isSidechain: true,
    message: {
      id: overrides.id === undefined ? 'msg_01ABC' : overrides.id,
      type: 'message',
      role: 'assistant',
      model: overrides.model ?? 'claude-haiku-4-5-20251001',
      stop_reason: overrides.stopReason ?? null,
      content: [{ type: 'text', text: 'x' }],
      usage:
        overrides.usage === undefined
          ? { input_tokens: 3, output_tokens: 1, cache_read_input_tokens: 9573, cache_creation_input_tokens: 4858 }
          : overrides.usage
    }
  })
}

describe('parseUsageLine', () => {
  it('提取 message.id / model / usage 四元组 / stop_reason / ts / sessionId / cwd', () => {
    const row = parseUsageLine(assistantLine({ stopReason: 'end_turn' }))
    expect(row).toEqual({
      messageId: 'msg_01ABC',
      model: 'claude-haiku-4-5-20251001',
      ts: Date.parse('2026-06-06T06:17:44.865Z'),
      stopReason: 'end_turn',
      input: 3,
      output: 1,
      cacheRead: 9573,
      cacheCreation: 4858,
      sessionId: '5e3d5de6-4fec-4257-aef8-1c6720b9303d',
      cwd: 'C:\\Users\\u\\proj'
    })
  })

  it('message_start 快照（stop_reason=null、output=1）也计入——不得按 stop_reason&&output 过滤', () => {
    const row = parseUsageLine(
      assistantLine({ usage: { input_tokens: 3, output_tokens: 1 }, stopReason: null })
    )
    expect(row).not.toBeNull()
    expect(row!.stopReason).toBeNull()
    expect(row!.cacheRead).toBe(0)
    expect(row!.cacheCreation).toBe(0)
  })

  it('计入门槛：全部计费维度为 0/缺失 → null', () => {
    expect(parseUsageLine(assistantLine({ usage: {} }))).toBeNull()
    expect(
      parseUsageLine(assistantLine({ usage: { input_tokens: 0, output_tokens: 0 } }))
    ).toBeNull()
    expect(parseUsageLine(assistantLine({ usage: null }))).toBeNull()
  })

  it('任一维度 > 0 即计入（仅 cache_creation 也算）', () => {
    const row = parseUsageLine(assistantLine({ usage: { cache_creation_input_tokens: 7 } }))
    expect(row).not.toBeNull()
    expect(row!.cacheCreation).toBe(7)
    expect(row!.input + row!.output + row!.cacheRead).toBe(0)
  })

  it('无 message.id → null（行 uuid 不可作去重键）', () => {
    expect(parseUsageLine(assistantLine({ id: null }))).toBeNull()
  })

  it('非 assistant 行 / 坏 JSON / 空行 → null 不抛错', () => {
    expect(parseUsageLine(JSON.stringify({ type: 'user', message: { id: 'msg_x' } }))).toBeNull()
    expect(parseUsageLine('{"type":"assistant", broken')).toBeNull()
    expect(parseUsageLine('')).toBeNull()
    // journal.jsonl 一类的行（无 "assistant" 关键字）走快速预筛
    expect(parseUsageLine(JSON.stringify({ event: 'agent_done', result: 'ok' }))).toBeNull()
  })

  it('非法 timestamp → ts null，行仍计入', () => {
    const row = parseUsageLine(assistantLine({ ts: 'not-a-date' }))
    expect(row).not.toBeNull()
    expect(row!.ts).toBeNull()
  })
})
