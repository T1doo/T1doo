import type { Database } from 'better-sqlite3'
import type {
  PricingRow,
  PricingSaveInput,
  UsageBucket,
  UsageByModelRow,
  UsageByProjectRow,
  UsageBySourceRow,
  UsageFacets,
  UsageFilter,
  UsageRange,
  UsageSource,
  UsageSummary,
  UsageTrend,
  UsageTrendPoint
} from '../../shared/usage'
import { pickBucket } from '../../shared/usage'
import {
  BUILTIN_PRICING,
  formatMicroUsd,
  matchPricing,
  parseDecimal,
  totalsCostMicro
} from '../services/usage/pricing'

/** usage_log 写入行（采集管道与面板来源共用） */
export interface UsageInsertRow {
  messageId: string
  sessionId: string | null
  projectPath: string | null
  model: string | null
  ts: number | null
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  stopReason: string | null
  source: UsageSource
  backendProfileId?: string | null
}

export interface UsageSyncCursor {
  filePath: string
  mtimeMs: number
  byteOffset: number
}

interface AggRow {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  requests: number
}

const AGG_SELECT = `
  SUM(input_tokens) AS input, SUM(output_tokens) AS output,
  SUM(cache_read_tokens) AS cacheRead, SUM(cache_creation_tokens) AS cacheCreation,
  COUNT(*) AS requests`

/** 范围 + 筛选的公共 WHERE（ts IS NULL 的行天然被范围比较排除） */
const RANGE_WHERE = `
  ts >= @from AND ts < @to
  AND (@project IS NULL OR project_path = @project)
  AND (@model IS NULL OR model = @model)
  AND (@source IS NULL OR source = @source)`

function bindRange(range: UsageRange, filter?: UsageFilter): Record<string, unknown> {
  return {
    from: range.from,
    to: range.to,
    project: filter?.projectPath ?? null,
    model: filter?.model ?? null,
    source: filter?.source ?? null
  }
}

/** SQLite strftime 与 JS 侧补零桶必须产出完全一致的键（都是本地时区） */
const BUCKET_FMT: Record<UsageBucket, string> = {
  hour: '%Y-%m-%d %H',
  day: '%Y-%m-%d',
  month: '%Y-%m'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function bucketKey(d: Date, bucket: UsageBucket): string {
  const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  if (bucket === 'month') return ym
  const ymd = `${ym}-${pad(d.getDate())}`
  return bucket === 'day' ? ymd : `${ymd} ${pad(d.getHours())}`
}

/** 桶起点对齐 + 下一桶（Date 构造做进位，跨月/DST 安全） */
function alignBucket(ts: number, bucket: UsageBucket): Date {
  const d = new Date(ts)
  if (bucket === 'month') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (bucket === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
}

function nextBucket(d: Date, bucket: UsageBucket): Date {
  if (bucket === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1)
  if (bucket === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1)
}

export class UsageDao {
  constructor(private db: Database) {}

  // ---------- 写入（message.id 去重，§7.8.2 第 2 条） ----------

  /**
   * 单事务批量 REPLACE：同 id 冲突时优先保留 stop_reason 非空者，
   * 同级取 output_tokens 更大者；等值不动（重放幂等）。
   */
  insertRows(rows: UsageInsertRow[]): void {
    if (rows.length === 0) return
    const stmt = this.db.prepare(
      `INSERT INTO usage_log (
         message_id, session_id, project_path, model, ts,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         stop_reason, source, backend_profile_id
       ) VALUES (
         @messageId, @sessionId, @projectPath, @model, @ts,
         @input, @output, @cacheRead, @cacheCreation,
         @stopReason, @source, @backendProfileId
       )
       ON CONFLICT(message_id) DO UPDATE SET
         session_id = excluded.session_id,
         project_path = excluded.project_path,
         model = excluded.model,
         ts = excluded.ts,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         cache_creation_tokens = excluded.cache_creation_tokens,
         stop_reason = excluded.stop_reason,
         source = excluded.source,
         backend_profile_id = excluded.backend_profile_id
       WHERE (excluded.stop_reason IS NOT NULL AND usage_log.stop_reason IS NULL)
          OR ((excluded.stop_reason IS NOT NULL) = (usage_log.stop_reason IS NOT NULL)
              AND excluded.output_tokens > usage_log.output_tokens)`
    )
    this.db.transaction(() => {
      for (const r of rows) stmt.run({ backendProfileId: null, ...r })
    })()
  }

  rowCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM usage_log').get() as { n: number }).n
  }

  // ---------- 增量游标（usage_sync，§7.8.2 第 5 条） ----------

  getSyncCursors(): UsageSyncCursor[] {
    return this.db
      .prepare('SELECT file_path AS filePath, mtime_ms AS mtimeMs, byte_offset AS byteOffset FROM usage_sync')
      .all() as UsageSyncCursor[]
  }

  setSyncCursor(filePath: string, mtimeMs: number, byteOffset: number): void {
    this.db
      .prepare(
        `INSERT INTO usage_sync (file_path, mtime_ms, byte_offset) VALUES (?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET mtime_ms = excluded.mtime_ms, byte_offset = excluded.byte_offset`
      )
      .run(filePath, mtimeMs, byteOffset)
  }

  // ---------- 聚合查询（单发 SQL GROUP BY，§7.8.3） ----------

  summary(range: UsageRange, filter?: UsageFilter): UsageSummary {
    // 按模型分组后在 JS 侧计价（归一匹配无法下推 SQL），µ$ 精确累加
    const perModel = this.byModelRaw(range, filter)
    const pricing = this.listPricing()
    const t = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, requests: 0 }
    let micro = 0n
    let priced = false
    let unpriced = false
    for (const m of perModel) {
      t.input += m.input
      t.output += m.output
      t.cacheRead += m.cacheRead
      t.cacheCreation += m.cacheCreation
      t.requests += m.requests
      const match = m.model ? matchPricing(m.model, pricing) : null
      if (match) {
        micro += totalsCostMicro(m, match)
        priced = true
      } else {
        unpriced = true
      }
    }
    const denom = t.input + t.cacheCreation + t.cacheRead
    return {
      ...t,
      cacheHitRate: denom > 0 ? t.cacheRead / denom : null,
      costUsd: priced ? formatMicroUsd(micro) : null,
      costIsPartial: priced && unpriced
    }
  }

  trend(range: UsageRange, filter?: UsageFilter): UsageTrend {
    const bucket = pickBucket(range)
    const rows = this.db
      .prepare(
        `SELECT strftime(@fmt, ts / 1000, 'unixepoch', 'localtime') AS k, ${AGG_SELECT}
         FROM usage_log WHERE ${RANGE_WHERE} GROUP BY k`
      )
      .all({ ...bindRange(range, filter), fmt: BUCKET_FMT[bucket] }) as (AggRow & { k: string })[]
    const byKey = new Map(rows.map((r) => [r.k, r]))

    // 补零桶：range 内所有桶都出点（图表连续），键与 SQL strftime 完全一致
    const points: UsageTrendPoint[] = []
    for (
      let d = alignBucket(range.from, bucket);
      d.getTime() < range.to;
      d = nextBucket(d, bucket)
    ) {
      const key = bucketKey(d, bucket)
      const r = byKey.get(key)
      points.push({
        key,
        ts: d.getTime(),
        input: r?.input ?? 0,
        output: r?.output ?? 0,
        cacheRead: r?.cacheRead ?? 0,
        cacheCreation: r?.cacheCreation ?? 0
      })
    }
    return { bucket, points }
  }

  private byModelRaw(range: UsageRange, filter?: UsageFilter): (AggRow & { model: string })[] {
    return this.db
      .prepare(
        `SELECT COALESCE(model, '') AS model, ${AGG_SELECT}
         FROM usage_log WHERE ${RANGE_WHERE}
         GROUP BY model
         ORDER BY (SUM(input_tokens) + SUM(output_tokens) + SUM(cache_read_tokens) + SUM(cache_creation_tokens)) DESC`
      )
      .all(bindRange(range, filter)) as (AggRow & { model: string })[]
  }

  byModel(range: UsageRange, filter?: UsageFilter): UsageByModelRow[] {
    const pricing = this.listPricing()
    return this.byModelRaw(range, filter).map((r) => {
      const match = r.model ? matchPricing(r.model, pricing) : null
      return { ...r, costUsd: match ? formatMicroUsd(totalsCostMicro(r, match)) : null }
    })
  }

  byProject(range: UsageRange, filter?: UsageFilter): UsageByProjectRow[] {
    return this.db
      .prepare(
        `SELECT project_path AS projectPath, ${AGG_SELECT}
         FROM usage_log WHERE ${RANGE_WHERE}
         GROUP BY project_path
         ORDER BY (SUM(input_tokens) + SUM(output_tokens) + SUM(cache_read_tokens) + SUM(cache_creation_tokens)) DESC`
      )
      .all(bindRange(range, filter)) as UsageByProjectRow[]
  }

  bySource(range: UsageRange, filter?: UsageFilter): UsageBySourceRow[] {
    return this.db
      .prepare(
        `SELECT source, ${AGG_SELECT}
         FROM usage_log WHERE ${RANGE_WHERE}
         GROUP BY source ORDER BY requests DESC`
      )
      .all(bindRange(range, filter)) as UsageBySourceRow[]
  }

  facets(range: UsageRange): UsageFacets {
    const bind = bindRange(range)
    const projects = (
      this.db
        .prepare(
          `SELECT DISTINCT project_path AS p FROM usage_log WHERE ${RANGE_WHERE} ORDER BY p`
        )
        .all(bind) as { p: string | null }[]
    ).map((r) => r.p)
    const models = (
      this.db
        .prepare(
          `SELECT DISTINCT model AS m FROM usage_log WHERE ${RANGE_WHERE} AND model IS NOT NULL ORDER BY m`
        )
        .all(bind) as { m: string }[]
    ).map((r) => r.m)
    return { projects, models }
  }

  // ---------- 价目表（§7.8.3） ----------

  /** 启动播种/升级刷新：只覆写仍为内置态的行，用户改过的行分毫不动 */
  ensureBuiltinPricing(): void {
    const stmt = this.db.prepare(
      `INSERT INTO model_pricing (model_id, display_name, input_per_m, output_per_m, cache_read_per_m, cache_write_per_m, is_builtin)
       VALUES (@modelId, @displayName, @inputPerM, @outputPerM, @cacheReadPerM, @cacheWritePerM, 1)
       ON CONFLICT(model_id) DO UPDATE SET
         display_name = excluded.display_name,
         input_per_m = excluded.input_per_m,
         output_per_m = excluded.output_per_m,
         cache_read_per_m = excluded.cache_read_per_m,
         cache_write_per_m = excluded.cache_write_per_m
       WHERE model_pricing.is_builtin = 1`
    )
    this.db.transaction(() => {
      for (const row of BUILTIN_PRICING) stmt.run(row)
    })()
  }

  listPricing(): PricingRow[] {
    return (
      this.db
        .prepare(
          `SELECT model_id AS modelId, display_name AS displayName,
                  input_per_m AS inputPerM, output_per_m AS outputPerM,
                  cache_read_per_m AS cacheReadPerM, cache_write_per_m AS cacheWritePerM,
                  is_builtin AS isBuiltin
           FROM model_pricing ORDER BY is_builtin DESC, model_id`
        )
        .all() as (Omit<PricingRow, 'isBuiltin'> & { isBuiltin: number })[]
    ).map((r) => ({ ...r, isBuiltin: r.isBuiltin !== 0 }))
  }

  /** 保存（改内置项即转为用户项，is_builtin=0）；单价必须是合法 Decimal 字符串 */
  savePricing(input: PricingSaveInput): PricingRow[] {
    const modelId = input.modelId.trim()
    if (!modelId) throw new Error('modelId 不能为空')
    for (const v of [input.inputPerM, input.outputPerM, input.cacheReadPerM, input.cacheWritePerM]) {
      if (!parseDecimal(v)) throw new Error(`非法单价：${v}（须为非负十进制数字符串）`)
    }
    this.db
      .prepare(
        `INSERT INTO model_pricing (model_id, display_name, input_per_m, output_per_m, cache_read_per_m, cache_write_per_m, is_builtin)
         VALUES (@modelId, @displayName, @inputPerM, @outputPerM, @cacheReadPerM, @cacheWritePerM, 0)
         ON CONFLICT(model_id) DO UPDATE SET
           display_name = excluded.display_name,
           input_per_m = excluded.input_per_m,
           output_per_m = excluded.output_per_m,
           cache_read_per_m = excluded.cache_read_per_m,
           cache_write_per_m = excluded.cache_write_per_m,
           is_builtin = 0`
      )
      .run({ displayName: null, ...input, modelId })
    return this.listPricing()
  }

  /** 重置/删除：内置模型恢复种子价并回归内置态；用户自建模型直接删行 */
  resetPricing(modelId: string): PricingRow[] {
    const builtin = BUILTIN_PRICING.find((b) => b.modelId === modelId)
    if (builtin) {
      this.db
        .prepare(
          `UPDATE model_pricing SET display_name = @displayName, input_per_m = @inputPerM,
             output_per_m = @outputPerM, cache_read_per_m = @cacheReadPerM,
             cache_write_per_m = @cacheWritePerM, is_builtin = 1
           WHERE model_id = @modelId`
        )
        .run(builtin)
    } else {
      this.db.prepare('DELETE FROM model_pricing WHERE model_id = ?').run(modelId)
    }
    return this.listPricing()
  }
}
