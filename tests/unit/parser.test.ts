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

describe('状态机信号提取（§7.9.2，F1 与状态机的接缝）', () => {
  it('真实形状夹具：模式/悬挂/闭合/末行角色全部按主链提取', () => {
    const r = parseLines(fixtureLines('status-signals.jsonl'))
    const s = r.status

    // permission-mode 行（会话中途 shift+tab 改模式）是权威来源，后写覆盖 user 行上的值
    expect(s.permissionMode).toBe('bypassPermissions')

    // 主链的 tool_use 全部记录；侧链里的 Grep 不得混入
    expect(s.toolUseOpened).toEqual([
      { id: 'toolu_edit_01', name: 'Edit' },
      { id: 'toolu_agent_01', name: 'Agent' }
    ])
    expect(s.toolResultClosed).toEqual(['toolu_edit_01'])

    // 有真实用户提示（第一行 user 不载 tool_result）
    expect(s.userPrompt).toBe(true)

    // 末行角色只认主链：文件末尾的侧链 assistant 与 permission-mode 行都不改它。
    // 主链最后一条是 Agent 的 assistant 行
    expect(s.lastRole).toBe('assistant')
    expect(s.lastTs).toBe(Date.parse('2026-07-17T10:00:11.000Z'))
  })

  it('tool_result 回填的 user 行不算「真实用户提示」', () => {
    const onlyToolResult = [
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        sessionId: 's',
        timestamp: '2026-07-17T10:00:00.000Z',
        isSidechain: false,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }]
        }
      })
    ]
    const s = parseLines(onlyToolResult).status
    expect(s.userPrompt).toBe(false)
    expect(s.lastRole).toBe('user')
    expect(s.toolResultClosed).toEqual(['x'])
  })

  it('侧链会话（子代理内部往返）完全不产生主状态信号', () => {
    const r = parseLines(fixtureLines('titles-and-sidechain.jsonl'))
    // 该夹具的侧链行不应贡献 tool_use；主链行仍照常
    expect(r.status.toolUseOpened.every((t) => t.name !== '(sidechain-only)')).toBe(true)
  })

  it('permission-mode 行不计入 badLines / skipped（已从未知类型转为白名单）', () => {
    const r = parseLines([
      JSON.stringify({ type: 'permission-mode', permissionMode: 'plan', sessionId: 's' })
    ])
    expect(r.badLines).toBe(0)
    expect(r.skipped['permission-mode']).toBeUndefined()
    expect(r.status.permissionMode).toBe('plan')
    // 无对话行 → 不推进判活信息
    expect(r.status.lastRole).toBeNull()
    expect(r.status.lastTs).toBeNull()
  })
})
