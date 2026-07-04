import { describe, expect, it } from 'vitest'
import { parseHistoryLines } from '../../src/main/services/launcher/prompts'

const row = (display: string, ts: number, extra: object = {}): string =>
  JSON.stringify({ display, pastedContents: {}, timestamp: ts, ...extra })

describe('最近提示词解析（~/.claude/history.jsonl 尾部）', () => {
  it('解析实测行格式并按时间倒序', () => {
    const out = parseHistoryLines(
      [
        row('第一个提示词内容', 100, { project: 'E:\\A', sessionId: 's1' }),
        row('第二个提示词内容', 200, { project: 'E:\\B', sessionId: 's2' })
      ].join('\n'),
      10
    )
    expect(out.map((p) => p.display)).toEqual(['第二个提示词内容', '第一个提示词内容'])
    expect(out[0]).toMatchObject({ project: 'E:\\B', sessionId: 's2', ts: 200 })
  })

  it('同文案去重保留最新；斜杠命令与超短输入剔除', () => {
    const out = parseHistoryLines(
      [
        row('重复的提示词', 100, { sessionId: 'old' }),
        row('重复的提示词', 300, { sessionId: 'new' }),
        row('/clear', 400),
        row('hi', 500)
      ].join('\n'),
      10
    )
    expect(out).toHaveLength(1)
    expect(out[0].sessionId).toBe('new')
  })

  it('坏行/半行静默跳过（与 F1 容错口径一致）', () => {
    const out = parseHistoryLines(
      ['{"broken', '', row('好的那一行内容', 100), '{"display": 42}'].join('\n'),
      10
    )
    expect(out).toHaveLength(1)
  })

  it('limit 截断', () => {
    const lines = Array.from({ length: 20 }, (_, i) => row(`提示词内容第 ${i} 条`, i)).join('\n')
    expect(parseHistoryLines(lines, 5)).toHaveLength(5)
  })
})
