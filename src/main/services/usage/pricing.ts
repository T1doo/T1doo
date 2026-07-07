import type { PricingRow, UsageTotals } from '../../../shared/usage'

/**
 * 价目与成本计算（§7.8.3）：单价一律 Decimal 字符串，成本走 BigInt 定点运算避免浮点误差。
 * 纯模块：不依赖 Electron/DB，vitest 直测。
 */

// 内置种子价目（2026-07 官方价表；cache 读 = 0.1×输入价，cache 写 5m = 1.25×输入价）。
// 启动时播种/刷新 is_builtin=1 的行；用户改过的行（is_builtin=0）不动。
export const BUILTIN_PRICING: Omit<PricingRow, 'isBuiltin'>[] = [
  p('claude-fable-5', 'Claude Fable 5', '10', '50', '1', '12.5'),
  p('claude-opus-4-8', 'Claude Opus 4.8', '5', '25', '0.5', '6.25'),
  p('claude-opus-4-7', 'Claude Opus 4.7', '5', '25', '0.5', '6.25'),
  p('claude-opus-4-6', 'Claude Opus 4.6', '5', '25', '0.5', '6.25'),
  p('claude-opus-4-5', 'Claude Opus 4.5', '5', '25', '0.5', '6.25'),
  p('claude-sonnet-5', 'Claude Sonnet 5', '3', '15', '0.3', '3.75'),
  p('claude-sonnet-4-6', 'Claude Sonnet 4.6', '3', '15', '0.3', '3.75'),
  p('claude-sonnet-4-5', 'Claude Sonnet 4.5', '3', '15', '0.3', '3.75'),
  p('claude-haiku-4-5', 'Claude Haiku 4.5', '1', '5', '0.1', '1.25')
]

function p(
  modelId: string,
  displayName: string,
  inputPerM: string,
  outputPerM: string,
  cacheReadPerM: string,
  cacheWritePerM: string
): Omit<PricingRow, 'isBuiltin'> {
  return { modelId, displayName, inputPerM, outputPerM, cacheReadPerM, cacheWritePerM }
}

// ---------- 模型名归一与匹配 ----------

/**
 * 归一化模型标识：剥 `anthropic/` 类前缀（取最后一个 `/` 之后）、小写、`.`→`-`。
 * 应对第三方网关的模型名变体（如 `anthropic/claude-sonnet-5`、`Claude-Opus-4.8`）。
 */
export function normalizeModelId(raw: string): string {
  const tail = raw.slice(raw.lastIndexOf('/') + 1)
  return tail.trim().toLowerCase().replace(/\./g, '-')
}

/**
 * 价目匹配：先精确，再前缀（价目 id 是归一名的前缀且后随 `-`，应对日期后缀
 * 如 claude-haiku-4-5-20251001）；多条前缀命中取最长。未命中返回 null。
 */
export function matchPricing(model: string, rows: PricingRow[]): PricingRow | null {
  const norm = normalizeModelId(model)
  let best: PricingRow | null = null
  for (const row of rows) {
    const id = normalizeModelId(row.modelId)
    if (id === norm) return row
    if (norm.startsWith(`${id}-`) && (!best || id.length > normalizeModelId(best.modelId).length)) {
      best = row
    }
  }
  return best
}

// ---------- Decimal 定点成本运算 ----------

/** '6.25' → { mantissa: 625n, scale: 2 }；非法/负数返回 null */
export function parseDecimal(s: string): { mantissa: bigint; scale: number } | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s.trim())
  if (!m) return null
  const frac = m[2] ?? ''
  try {
    return { mantissa: BigInt(m[1] + frac), scale: frac.length }
  } catch {
    return null
  }
}

/**
 * tokens × (perM 美元/百万token) → 微美元（µ$，1$ = 1e6 µ$）。
 * 恰好 1 token @ $X/M = X µ$，故 micro = tokens × mantissa / 10^scale（截断）。
 */
export function costMicroUsd(tokens: number, perM: string): bigint {
  if (!tokens) return 0n
  const d = parseDecimal(perM)
  if (!d) return 0n
  return (BigInt(Math.trunc(tokens)) * d.mantissa) / 10n ** BigInt(d.scale)
}

/** 一行用量的四维总成本（µ$） */
export function totalsCostMicro(t: UsageTotals, row: PricingRow): bigint {
  return (
    costMicroUsd(t.input, row.inputPerM) +
    costMicroUsd(t.output, row.outputPerM) +
    costMicroUsd(t.cacheRead, row.cacheReadPerM) +
    costMicroUsd(t.cacheCreation, row.cacheWritePerM)
  )
}

/** µ$ → 美元 Decimal 字符串（截断到 4 位小数，去尾零；'0' 保留） */
export function formatMicroUsd(micro: bigint): string {
  const cents4 = micro / 100n // 1e4 分之一美元
  const whole = cents4 / 10_000n
  const frac = (cents4 % 10_000n).toString().padStart(4, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}
