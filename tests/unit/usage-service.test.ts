import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  classifyUsageFile,
  discoverUsageFiles
} from '../../src/main/services/usage/usage-service'

/** §7.8.2 第 1 条扫描范围：顶层主会话 + subagents/wf_* 全覆盖；memory 等目录不误入 */

const SESS = '5e3d5de6-4fec-4257-aef8-1c6720b9303d'
const P = (dir: string, ...parts: string[]): string => join(dir, ...parts)

describe('classifyUsageFile', () => {
  const root = 'C:\\home\\.claude\\projects'
  it('顶层 <uuid>.jsonl → session', () => {
    expect(classifyUsageFile(root, P(root, 'slug-a', `${SESS}.jsonl`))).toEqual({
      source: 'session',
      sessionId: SESS
    })
  })
  it('会话子目录 subagents/agent-*.jsonl → subagent（sessionId=目录名）', () => {
    expect(
      classifyUsageFile(root, P(root, 'slug-a', SESS, 'subagents', 'agent-a0c8.jsonl'))
    ).toEqual({ source: 'subagent', sessionId: SESS })
  })
  it('subagents/workflows/wf_*/agent-*.jsonl → workflow', () => {
    expect(
      classifyUsageFile(
        root,
        P(root, 'slug-a', SESS, 'subagents', 'workflows', 'wf_049b', 'agent-ac41.jsonl')
      )
    ).toEqual({ source: 'workflow', sessionId: SESS })
  })
  it('journal.jsonl 在 wf_ 目录下也归 workflow（行级过滤自然产出 0 行）', () => {
    expect(
      classifyUsageFile(
        root,
        P(root, 'slug-a', SESS, 'subagents', 'workflows', 'wf_049b', 'journal.jsonl')
      )?.source
    ).toBe('workflow')
  })
  it('非 uuid 顶层文件 / memory 目录 / 非 jsonl / 树外路径 → null', () => {
    expect(classifyUsageFile(root, P(root, 'slug-a', 'history.jsonl'))).toBeNull()
    expect(classifyUsageFile(root, P(root, 'slug-a', 'memory', 'notes.jsonl'))).toBeNull()
    expect(classifyUsageFile(root, P(root, 'slug-a', SESS, 'subagents', 'x.meta.json'))).toBeNull()
    expect(classifyUsageFile(root, 'C:\\elsewhere\\a.jsonl')).toBeNull()
  })
})

describe('discoverUsageFiles（真实目录布局仿真）', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 't1doo-usage-'))
    const slug = P(dir, 'C--Users-x-proj')
    mkdirSync(P(slug, SESS, 'subagents', 'workflows', 'wf_049b69f1-279'), { recursive: true })
    mkdirSync(P(slug, 'memory'), { recursive: true })
    writeFileSync(P(slug, `${SESS}.jsonl`), '{}\n')
    writeFileSync(P(slug, 'not-a-session.jsonl'), '{}\n') // 非 uuid 命名不进发现
    writeFileSync(P(slug, SESS, 'subagents', 'agent-a1.jsonl'), '{}\n')
    writeFileSync(P(slug, SESS, 'subagents', 'agent-a1.meta.json'), '{}')
    writeFileSync(P(slug, SESS, 'subagents', 'workflows', 'wf_049b69f1-279', 'agent-b1.jsonl'), '{}\n')
    writeFileSync(P(slug, SESS, 'subagents', 'workflows', 'wf_049b69f1-279', 'journal.jsonl'), '{}\n')
    writeFileSync(P(slug, 'memory', 'MEMORY.md'), '#')
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('发现顶层会话 + 子代理 + 工作流（含 journal），排除 meta.json 与非 uuid 文件', async () => {
    const files = await discoverUsageFiles(dir)
    const bySource = new Map<string, number>()
    for (const f of files) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1)
    expect(bySource.get('session')).toBe(1)
    expect(bySource.get('subagent')).toBe(1)
    expect(bySource.get('workflow')).toBe(2) // agent-b1 + journal
    expect(files.every((f) => f.sessionId === SESS)).toBe(true)
    expect(files.every((f) => typeof f.size === 'number')).toBe(true)
  })

  it('目录不存在 → 空结果不报错', async () => {
    expect(await discoverUsageFiles(P(dir, 'nope'))).toEqual([])
  })
})
