import { describe, expect, it } from 'vitest'
import {
  LineSplitter,
  handleStreamJsonLine,
  type StreamResult
} from '../../src/main/services/ai/stream-json'

describe('stream-json 行解析（§7.5 白名单容错）', () => {
  it('stream_event 的 text_delta → onDelta', () => {
    const deltas: string[] = []
    handleStreamJsonLine(
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } }
      }),
      { onDelta: (t) => deltas.push(t) }
    )
    expect(deltas).toEqual(['你好'])
  })

  it('thinking_delta 不当作文本增量', () => {
    const deltas: string[] = []
    handleStreamJsonLine(
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' } }
      }),
      { onDelta: (t) => deltas.push(t) }
    )
    expect(deltas).toEqual([])
  })

  it('assistant 事件抽取 text 块拼接（tool_use 跳过）', () => {
    let text = ''
    handleStreamJsonLine(
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '第一段。' },
            { type: 'tool_use', id: 'x', name: 'Bash', input: {} },
            { type: 'text', text: '第二段。' }
          ]
        }
      }),
      { onAssistantText: (t) => (text = t) }
    )
    expect(text).toBe('第一段。第二段。')
  })

  it('result 事件采集成本与用量字段（附录 A.6 实测字段）', () => {
    let result: StreamResult | null = null
    handleStreamJsonLine(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '最终回答',
        session_id: 'abc-123',
        total_cost_usd: 0.0123,
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 },
        num_turns: 2,
        duration_ms: 4200
      }),
      { onResult: (r) => (result = r) }
    )
    expect(result).toEqual({
      subtype: 'success',
      isError: false,
      resultText: '最终回答',
      sessionId: 'abc-123',
      totalCostUsd: 0.0123,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: null,
      numTurns: 2,
      durationMs: 4200
    })
  })

  it('assistant 事件 → onAssistantModel 带模型名（M8 用量溯源）', () => {
    let model: string | null = null
    handleStreamJsonLine(
      JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-opus-4-8', content: [{ type: 'text', text: 'hi' }] }
      }),
      { onAssistantModel: (m) => (model = m) }
    )
    expect(model).toBe('claude-opus-4-8')
  })

  it('system/init → onInit 带 session_id', () => {
    let sid: string | null = null
    handleStreamJsonLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }), {
      onInit: (id) => (sid = id)
    })
    expect(sid).toBe('s1')
  })

  it('坏行 / 未知类型 / 空行：静默跳过不抛错', () => {
    const noop = {}
    expect(() => handleStreamJsonLine('{"type":"assistant",', noop)).not.toThrow()
    expect(() => handleStreamJsonLine('{"type":"future-unknown","x":1}', noop)).not.toThrow()
    expect(() => handleStreamJsonLine('', noop)).not.toThrow()
    expect(() => handleStreamJsonLine('null', noop)).not.toThrow()
  })
})

describe('LineSplitter 半行处理（§6.3 同款）', () => {
  it('只消费到最后一个 \\n，残行留待补齐', () => {
    const splitter = new LineSplitter()
    const lines: string[] = []
    splitter.feed('{"a":1}\n{"b"', (l) => lines.push(l))
    expect(lines).toEqual(['{"a":1}'])
    splitter.feed(':2}\n', (l) => lines.push(l))
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('flush 冲出残行', () => {
    const splitter = new LineSplitter()
    const lines: string[] = []
    splitter.feed('tail-no-newline', (l) => lines.push(l))
    expect(lines).toEqual([])
    splitter.flush((l) => lines.push(l))
    expect(lines).toEqual(['tail-no-newline'])
  })
})
