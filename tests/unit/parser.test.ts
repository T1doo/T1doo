import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parseLines,
  sanitizeTitleCandidate,
  lineToMessageView
} from '../../src/main/services/claude/parser'
import { desegmentCjk, segmentCjkForFts, toFtsQuery } from '../../src/main/db/dao'

const FIXTURES = join(__dirname, '..', 'fixtures', 'claude-jsonl')

function fixtureLines(name: string): string[] {
  return readFileSync(join(FIXTURES, name), 'utf8').split('\n')
}

describe('SessionFileParser', () => {
  it('正常会话：消息数 / 标题 / token / 元数据', () => {
    const r = parseLines(fixtureLines('normal.jsonl'))
    expect(r.badLines).toBe(0)
    expect(r.sessionId).toBe('11111111-1111-4111-8111-111111111111')
    expect(r.cwd).toBe('E:\\Demo\\ProjectA')
    expect(r.slug).toBe('E--Demo-ProjectA')
    expect(r.gitBranch).toBe('main')
    expect(r.ccVersion).toBe('2.1.196')
    expect(r.messages).toHaveLength(5) // 2 user + 3 assistant
    expect(r.titleAi).toBe('修复登录页空指针') // 取最新一条
    expect(r.titleCustom).toBeNull()
    expect(r.firstUserText).toBe('帮我修复登录页面的空指针问题')
    expect(r.lastModel).toBe('claude-opus-4-8')
    expect(r.inputTokens).toBe(1200 + 1500 + 1600)
    expect(r.outputTokens).toBe(45 + 80 + 60)
    expect(r.cacheReadTokens).toBe(800)
    // 白名单外类型被计数跳过
    expect(r.skipped['queue-operation']).toBe(1)
    expect(r.skipped['system']).toBe(1)
    expect(r.skipped['file-history-snapshot']).toBe(1)
    expect(r.skipped['last-prompt']).toBe(1)
  })

  it('tool_use 文件路径抽取 → session_files（F4 联动）', () => {
    const r = parseLines(fixtureLines('normal.jsonl'))
    expect(r.files).toEqual([
      expect.objectContaining({ op: 'read', path: 'E:\\Demo\\ProjectA\\src\\login.ts' }),
      expect.objectContaining({ op: 'edit', path: 'E:\\Demo\\ProjectA\\src\\login.ts' }),
      expect.objectContaining({ op: 'write', path: 'E:\\Demo\\ProjectA\\tests\\login.test.ts' })
    ])
  })

  it('坏行/未知类型/缺字段：零崩溃、正确计数', () => {
    const r = parseLines(fixtureLines('broken.jsonl'))
    // 非 JSON 行 + 缺 uuid 的 user 行 → badLines
    expect(r.badLines).toBe(2)
    expect(r.skipped['future-unknown-type']).toBe(1)
    // 正常行照常入库：user1 + assistant1 + API 错误 assistant（无 message 也保留计数）
    expect(r.messages).toHaveLength(3)
    expect(r.firstUserText).toBe('正常的第一条消息')
    // 含空格路径的 cwd
    expect(r.cwd).toBe('C:\\Users\\Some One\\proj')
  })

  it('标题优先级：custom > ai > 首条用户消息；meta/侧链不算首条', () => {
    const r = parseLines(fixtureLines('titles-and-sidechain.jsonl'))
    expect(r.titleCustom).toBe('仓库初始化分析')
    expect(r.titleAi).toBe('AI 起的标题（优先级低于 custom）')
    // isMeta 的 Caveat 行被跳过，XML 标签被剥离
    expect(r.firstUserText).toBe('/init 请分析这个仓库并生成 CLAUDE.md 文档')
    // 侧链消息保留标记
    expect(r.messages.filter((m) => m.isSidechain)).toHaveLength(2)
  })

  it('空输入与纯空白行', () => {
    const r = parseLines(['', '   ', '\t'])
    expect(r.messages).toHaveLength(0)
    expect(r.badLines).toBe(0)
  })
})

describe('lineToMessageView（详情回放）', () => {
  it('解析完整内容块（text/thinking/tool_use/tool_result）', () => {
    const lines = fixtureLines('normal.jsonl')
    const views = lines.map((l) => lineToMessageView(l)).filter((v) => v !== null && v !== 'bad')
    expect(views).toHaveLength(5)
    const first = views[1]! // 第一条 assistant
    expect(first.role).toBe('assistant')
    expect(first.blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool_use'])
    const toolResult = views[2]!.blocks[0]
    expect(toolResult.kind).toBe('tool_result')
  })

  it('坏行返回 bad，白名单外返回 null', () => {
    expect(lineToMessageView('not json')).toBe('bad')
    expect(lineToMessageView('{"type":"queue-operation"}')).toBeNull()
  })
})

describe('sanitizeTitleCandidate', () => {
  it('剥标签、并空白、截断 80 字符', () => {
    expect(sanitizeTitleCandidate('<tag>hello</tag>\n\n world')).toBe('hello world')
    expect(sanitizeTitleCandidate('长'.repeat(200))).toHaveLength(80)
  })
})

describe('toFtsQuery / CJK 一元切分', () => {
  it('中文词切分为短语，英文词保持整词，过滤引号注入', () => {
    expect(toFtsQuery('登录 bug')).toBe('"登 录" "bug"')
    expect(toFtsQuery('a"b OR c')).toBe('"ab" "OR" "c"')
    expect(toFtsQuery('修复bug')).toBe('"修 复 bug"')
    expect(toFtsQuery('  ')).toBe('')
  })

  it('segmentCjkForFts：CJK 逐字插空格，英文不动', () => {
    expect(segmentCjkForFts('性能优化')).toBe('性 能 优 化')
    expect(segmentCjkForFts('用electron做性能优化')).toBe('用 electron 做 性 能 优 化')
    expect(segmentCjkForFts('plain english')).toBe('plain english')
  })

  it('desegmentCjk：snippet 中的 CJK 空格拼回（含高亮标记）', () => {
    expect(desegmentCjk('性 能 优 化')).toBe('性能优化')
    expect(desegmentCjk('…做 ⟦性⟧ ⟦能⟧ 优 化 abc')).toBe('…做⟦性⟧⟦能⟧优化 abc')
    expect(desegmentCjk('plain english')).toBe('plain english')
  })
})
