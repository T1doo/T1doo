import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from 'better-sqlite3'
import { openDatabase } from '../../src/main/db'
import { UsageDao, type UsageInsertRow } from '../../src/main/db/usage-dao'

/**
 * §7.8 验收②③⑥：message.id 去重裁决、六档范围聚合正确性
 * （本地时区切日、跨月、小时/日/月分桶边界）、定价归一成本、价目表编辑语义。
 * 内存库跑完整迁移（001-004），SQL 原样执行。
 */

let db: Database
let dao: UsageDao

beforeEach(() => {
  db = openDatabase(':memory:')
  dao = new UsageDao(db)
})

afterEach(() => {
  db.close()
})

let seq = 0
function row(overrides: Partial<UsageInsertRow> = {}): UsageInsertRow {
  seq++
  return {
    messageId: `msg_${seq}`,
    sessionId: 'sess-1',
    projectPath: 'C:\\proj\\a',
    model: 'claude-opus-4-8',
    ts: new Date(2026, 6, 7, 12, 0, 0).getTime(),
    input: 100,
    output: 50,
    cacheRead: 0,
    cacheCreation: 0,
    stopReason: 'end_turn',
    source: 'session',
    ...overrides
  }
}

/** 直接读行做断言 */
function rawRow(messageId: string): Record<string, unknown> {
  return db.prepare('SELECT * FROM usage_log WHERE message_id = ?').get(messageId) as Record<
    string,
    unknown
  >
}

const JULY = { from: new Date(2026, 6, 1).getTime(), to: new Date(2026, 7, 1).getTime() }

describe('message.id 去重（stop_reason 优先 / output 最大，§7.8.2 第 2 条）', () => {
  it('流式快照 → 终态：stop_reason 非空者胜出', () => {
    dao.insertRows([row({ messageId: 'm', stopReason: null, output: 1 })])
    dao.insertRows([row({ messageId: 'm', stopReason: 'end_turn', output: 240 })])
    expect(rawRow('m').output_tokens).toBe(240)
    expect(rawRow('m').stop_reason).toBe('end_turn')
    expect(dao.rowCount()).toBe(1)
  })

  it('已有终态快照不被后来的 message_start（stop_reason=null）覆盖', () => {
    dao.insertRows([row({ messageId: 'm', stopReason: 'end_turn', output: 240 })])
    dao.insertRows([row({ messageId: 'm', stopReason: null, output: 999 })])
    expect(rawRow('m').output_tokens).toBe(240)
  })

  it('同级（都无 stop_reason）取 output 更大者', () => {
    dao.insertRows([row({ messageId: 'm', stopReason: null, output: 10 })])
    dao.insertRows([row({ messageId: 'm', stopReason: null, output: 80 })])
    expect(rawRow('m').output_tokens).toBe(80)
    dao.insertRows([row({ messageId: 'm', stopReason: null, output: 5 })])
    expect(rawRow('m').output_tokens).toBe(80)
  })

  it('重放幂等：完全相同的行重插不改变结果', () => {
    const r = row({ messageId: 'm', stopReason: 'end_turn', output: 42 })
    dao.insertRows([r])
    dao.insertRows([r])
    expect(dao.rowCount()).toBe(1)
    expect(rawRow('m').output_tokens).toBe(42)
  })
})

describe('聚合：summary / 缓存命中率 / 成本', () => {
  it('四维合计 + 请求数 + 缓存命中率 = read ÷ (input+creation+read)', () => {
    dao.insertRows([
      row({ input: 100, output: 50, cacheRead: 700, cacheCreation: 200 }),
      row({ input: 100, output: 50, cacheRead: 0, cacheCreation: 0 })
    ])
    const s = dao.summary(JULY)
    expect(s.input).toBe(200)
    expect(s.output).toBe(100)
    expect(s.cacheRead).toBe(700)
    expect(s.cacheCreation).toBe(200)
    expect(s.requests).toBe(2)
    // 700 / (200 + 200 + 700)
    expect(s.cacheHitRate).toBeCloseTo(700 / 1100, 10)
  })

  it('成本按内置价目 + 归一匹配（日期后缀模型也计价）；未知模型标记 partial', () => {
    dao.ensureBuiltinPricing()
    dao.insertRows([
      // 1M input @ $1/M (haiku，日期后缀经前缀匹配)
      row({ model: 'claude-haiku-4-5-20251001', input: 1_000_000, output: 0 }),
      row({ model: 'totally-unknown-model', input: 500, output: 500 })
    ])
    const s = dao.summary(JULY)
    expect(s.costUsd).toBe('1')
    expect(s.costIsPartial).toBe(true)

    const byModel = dao.byModel(JULY)
    const haiku = byModel.find((m) => m.model.startsWith('claude-haiku'))!
    const unknown = byModel.find((m) => m.model === 'totally-unknown-model')!
    expect(haiku.costUsd).toBe('1')
    expect(unknown.costUsd).toBeNull()
  })

  it('空范围：requests=0、cacheHitRate=null、costUsd=null', () => {
    const s = dao.summary({ from: 0, to: 1 })
    expect(s.requests).toBe(0)
    expect(s.cacheHitRate).toBeNull()
    expect(s.costUsd).toBeNull()
    expect(s.costIsPartial).toBe(false)
  })
})

describe('趋势分桶（本地时区切日、跨月、边界，§7.8.3）', () => {
  it('日桶：本地 23:59:59.999 与次日 00:00 切进不同的桶；范围补零连续', () => {
    dao.insertRows([
      row({ ts: new Date(2026, 6, 2, 23, 59, 59, 999).getTime(), input: 11, output: 0 }),
      row({ ts: new Date(2026, 6, 3, 0, 0, 0, 0).getTime(), input: 22, output: 0 })
    ])
    const t = dao.trend({
      from: new Date(2026, 6, 1).getTime(),
      to: new Date(2026, 6, 8).getTime()
    })
    expect(t.bucket).toBe('day')
    expect(t.points).toHaveLength(7) // 补零：7 天全出点
    expect(t.points.map((p) => p.key)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07'
    ])
    expect(t.points[1].input).toBe(11)
    expect(t.points[2].input).toBe(22)
  })

  it('日桶跨月：6 月 30 日与 7 月 1 日各归各桶', () => {
    dao.insertRows([
      row({ ts: new Date(2026, 5, 30, 12).getTime(), input: 1 }),
      row({ ts: new Date(2026, 6, 1, 12).getTime(), input: 2 })
    ])
    const t = dao.trend({
      from: new Date(2026, 5, 29).getTime(),
      to: new Date(2026, 6, 3).getTime()
    })
    const jun30 = t.points.find((p) => p.key === '2026-06-30')!
    const jul01 = t.points.find((p) => p.key === '2026-07-01')!
    expect(jun30.input).toBe(1)
    expect(jul01.input).toBe(2)
  })

  it('小时桶：≤48h 范围；14:59 与 15:00 分桶', () => {
    dao.insertRows([
      row({ ts: new Date(2026, 6, 7, 14, 59, 59).getTime(), output: 7 }),
      row({ ts: new Date(2026, 6, 7, 15, 0, 0).getTime(), output: 9 })
    ])
    const t = dao.trend({
      from: new Date(2026, 6, 7).getTime(),
      to: new Date(2026, 6, 8).getTime()
    })
    expect(t.bucket).toBe('hour')
    expect(t.points).toHaveLength(24)
    expect(t.points[14].output).toBe(7)
    expect(t.points[15].output).toBe(9)
  })

  it('月桶：全年范围 12 个桶，1 月与 12 月各归各', () => {
    dao.insertRows([
      row({ ts: new Date(2026, 0, 15).getTime(), cacheCreation: 3 }),
      row({ ts: new Date(2026, 11, 15).getTime(), cacheCreation: 4 })
    ])
    const t = dao.trend({
      from: new Date(2026, 0, 1).getTime(),
      to: new Date(2027, 0, 1).getTime()
    })
    expect(t.bucket).toBe('month')
    expect(t.points).toHaveLength(12)
    expect(t.points[0]).toMatchObject({ key: '2026-01', cacheCreation: 3 })
    expect(t.points[11]).toMatchObject({ key: '2026-12', cacheCreation: 4 })
  })

  it('ts 为 null 的行不进趋势（也不进范围聚合）', () => {
    dao.insertRows([row({ ts: null, input: 999 })])
    const t = dao.trend(JULY)
    expect(t.points.every((p) => p.input === 0)).toBe(true)
    expect(dao.summary(JULY).requests).toBe(0)
  })
})

describe('筛选与分布', () => {
  beforeEach(() => {
    dao.insertRows([
      // output 归零：本组用例只以 input 区分各行
      row({ projectPath: 'C:\\proj\\a', model: 'claude-opus-4-8', source: 'session', input: 1, output: 0 }),
      row({ projectPath: 'C:\\proj\\b', model: 'claude-sonnet-5', source: 'subagent', input: 2, output: 0 }),
      row({ projectPath: 'C:\\proj\\b', model: 'claude-sonnet-5', source: 'workflow', input: 4, output: 0 }),
      row({ projectPath: null, model: 'claude-opus-4-8', source: 'api-panel', input: 8, output: 0 })
    ])
  })

  it('project / model / source 单项过滤', () => {
    expect(dao.summary(JULY, { projectPath: 'C:\\proj\\b' }).input).toBe(6)
    expect(dao.summary(JULY, { model: 'claude-opus-4-8' }).input).toBe(9)
    expect(dao.summary(JULY, { source: 'workflow' }).input).toBe(4)
  })

  it('bySource 分组、byProject 按总量降序', () => {
    const sources = dao.bySource(JULY)
    expect(new Set(sources.map((s) => s.source))).toEqual(
      new Set(['session', 'subagent', 'workflow', 'api-panel'])
    )
    const projects = dao.byProject(JULY)
    expect(projects[0].projectPath).toBeNull() // input 8 最大
    expect(projects[1].projectPath).toBe('C:\\proj\\b')
  })

  it('facets 返回范围内的项目与模型清单', () => {
    const f = dao.facets(JULY)
    expect(f.projects).toContain('C:\\proj\\a')
    expect(f.projects).toContain(null)
    expect(f.models).toEqual(['claude-opus-4-8', 'claude-sonnet-5'])
  })
})

describe('价目表（改内置即转用户项；重置恢复种子价，§7.8.3）', () => {
  it('播种幂等 + 用户修改后不被升级刷新覆盖', () => {
    dao.ensureBuiltinPricing()
    const before = dao.listPricing()
    expect(before.length).toBeGreaterThanOrEqual(9)
    expect(before.every((r) => r.isBuiltin)).toBe(true)

    dao.savePricing({
      modelId: 'claude-opus-4-8',
      inputPerM: '4',
      outputPerM: '20',
      cacheReadPerM: '0.4',
      cacheWritePerM: '5'
    })
    let opus = dao.listPricing().find((r) => r.modelId === 'claude-opus-4-8')!
    expect(opus.isBuiltin).toBe(false)
    expect(opus.inputPerM).toBe('4')

    dao.ensureBuiltinPricing() // 模拟升级重启：用户项分毫不动
    opus = dao.listPricing().find((r) => r.modelId === 'claude-opus-4-8')!
    expect(opus.inputPerM).toBe('4')

    dao.resetPricing('claude-opus-4-8') // 重置回种子价与内置态
    opus = dao.listPricing().find((r) => r.modelId === 'claude-opus-4-8')!
    expect(opus.isBuiltin).toBe(true)
    expect(opus.inputPerM).toBe('5')
  })

  it('用户自建模型：保存可计价，重置即删行', () => {
    dao.ensureBuiltinPricing()
    dao.savePricing({
      modelId: 'my-gateway-model',
      inputPerM: '2',
      outputPerM: '10',
      cacheReadPerM: '0.2',
      cacheWritePerM: '2.5'
    })
    dao.insertRows([row({ model: 'my-gateway-model', input: 1_000_000, output: 0 })])
    expect(dao.summary(JULY).costUsd).toBe('2')

    dao.resetPricing('my-gateway-model')
    expect(dao.listPricing().find((r) => r.modelId === 'my-gateway-model')).toBeUndefined()
  })

  it('非法单价拒绝保存', () => {
    expect(() =>
      dao.savePricing({
        modelId: 'x',
        inputPerM: '-1',
        outputPerM: '0',
        cacheReadPerM: '0',
        cacheWritePerM: '0'
      })
    ).toThrow()
  })
})

describe('usage_sync 游标', () => {
  it('写入/更新/读回', () => {
    dao.setSyncCursor('C:\\p\\a.jsonl', 111, 2048)
    dao.setSyncCursor('C:\\p\\a.jsonl', 222, 4096)
    expect(dao.getSyncCursors()).toEqual([
      { filePath: 'C:\\p\\a.jsonl', mtimeMs: 222, byteOffset: 4096 }
    ])
  })
})
