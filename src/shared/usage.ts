/** F9 用量中心的共享视图模型（§7.8 / M8）：usage_log 聚合查询 + 价目表 */

export type UsageSource = 'session' | 'subagent' | 'workflow' | 'api-panel' | 'cli-panel'

/** 六档时间预设（§7.8.4 筛选栏） */
export type UsagePreset = 'today' | '7d' | '30d' | 'month' | 'year' | 'custom'

/** 毫秒时间戳半开区间 [from, to) */
export interface UsageRange {
  from: number
  to: number
}

/** 聚合查询筛选（null/缺省 = 不过滤） */
export interface UsageFilter {
  projectPath?: string | null
  model?: string | null
  source?: UsageSource | null
}

export type UsageBucket = 'hour' | 'day' | 'month'

export interface UsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  requests: number
}

export interface UsageSummary extends UsageTotals {
  /** cache_read ÷ (input + cache_creation + cache_read)；分母为 0 时 null */
  cacheHitRate: number | null
  /** 名义成本估算（美元 Decimal 字符串）；无任何可计价行时 null */
  costUsd: string | null
  /** true = 部分行的模型无价目匹配，costUsd 为不完整估算 */
  costIsPartial: boolean
}

export interface UsageTrendPoint {
  /** 桶键（hour: 'YYYY-MM-DD HH'，day: 'YYYY-MM-DD'，month: 'YYYY-MM'，本地时区） */
  key: string
  /** 桶起始时刻（本地时区，ms） */
  ts: number
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
}

export interface UsageTrend {
  bucket: UsageBucket
  points: UsageTrendPoint[]
}

export interface UsageByModelRow extends UsageTotals {
  model: string
  costUsd: string | null
}

export interface UsageByProjectRow extends UsageTotals {
  projectPath: string | null
}

export interface UsageBySourceRow extends UsageTotals {
  source: UsageSource
}

export type UsageQueryRequest =
  | { kind: 'summary'; range: UsageRange; filter?: UsageFilter }
  | { kind: 'trend'; range: UsageRange; filter?: UsageFilter }
  | { kind: 'byModel'; range: UsageRange; filter?: UsageFilter }
  | { kind: 'byProject'; range: UsageRange; filter?: UsageFilter }
  | { kind: 'bySource'; range: UsageRange; filter?: UsageFilter }
  /** 筛选下拉的数据源：范围内出现过的项目/模型列表 */
  | { kind: 'facets'; range: UsageRange }

export interface UsageFacets {
  projects: (string | null)[]
  models: string[]
}

export interface PricingRow {
  modelId: string
  displayName: string | null
  /** 每百万 token 美元单价，Decimal 字符串（如 '5'、'0.5'、'6.25'） */
  inputPerM: string
  outputPerM: string
  cacheReadPerM: string
  cacheWritePerM: string
  isBuiltin: boolean
}

export interface PricingSaveInput {
  modelId: string
  displayName?: string | null
  inputPerM: string
  outputPerM: string
  cacheReadPerM: string
  cacheWritePerM: string
}

/** 用量扫描器运行状态（perf-audit 与 UI 首扫提示用） */
export interface UsageScanState {
  scanning: boolean
  scannedFiles: number
  totalFiles: number
  /** 最近一次启动全量追平耗时（ms）；尚未完成过为 null */
  lastFullScanMs: number | null
  rowCount: number
}

// ---------- 时间预设 → [from, to) 区间（本地时区切日，纯函数可单测） ----------

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 'YYYY-MM-DD' → 本地时区当日零点 ms；非法输入返回 null */
export function parseDayLocal(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isNaN(ts) ? null : ts
}

/**
 * 六档预设解析（§7.8.4）。custom 需给出起止日（含端点日，'YYYY-MM-DD'）。
 * 一律返回半开区间 [from, to)。
 */
export function resolveUsageRange(
  preset: UsagePreset,
  now: Date,
  custom?: { fromDay: string; toDay: string }
): UsageRange {
  const today = startOfDay(now)
  const DAY = 86_400_000
  switch (preset) {
    case 'today':
      return { from: today, to: today + DAY }
    case '7d':
      return { from: today - 6 * DAY, to: today + DAY }
    case '30d':
      return { from: today - 29 * DAY, to: today + DAY }
    case 'month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
      }
    case 'year':
      return {
        from: new Date(now.getFullYear(), 0, 1).getTime(),
        to: new Date(now.getFullYear() + 1, 0, 1).getTime()
      }
    case 'custom': {
      const from = custom ? parseDayLocal(custom.fromDay) : null
      const toDay = custom ? parseDayLocal(custom.toDay) : null
      if (from === null || toDay === null) return { from: today, to: today + DAY }
      // 起止日互换容错；止日为含端点日 → 半开区间加一天
      return from <= toDay ? { from, to: toDay + DAY } : { from: toDay, to: from + DAY }
    }
  }
}

/** 分桶粒度自适应（§7.8.3）：≤48h 小时桶；≤92 天日桶；更长月桶 */
export function pickBucket(range: UsageRange): UsageBucket {
  const span = range.to - range.from
  if (span <= 48 * 3_600_000) return 'hour'
  if (span <= 92 * 86_400_000) return 'day'
  return 'month'
}
