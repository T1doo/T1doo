import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PRICING,
  costMicroUsd,
  formatMicroUsd,
  matchPricing,
  normalizeModelId,
  parseDecimal,
  totalsCostMicro
} from '../../src/main/services/usage/pricing'
import type { PricingRow } from '../../src/shared/usage'

/** §7.8.3 定价归一匹配（前缀/日期后缀/`.`变体）+ Decimal 定点成本 */

const rows: PricingRow[] = BUILTIN_PRICING.map((r) => ({ ...r, isBuiltin: true }))

describe('normalizeModelId', () => {
  it('剥网关前缀（取最后一个 / 之后）', () => {
    expect(normalizeModelId('anthropic/claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(normalizeModelId('us.anthropic/claude-opus-4-8')).toBe('claude-opus-4-8')
  })
  it('`.`→`-` 与大小写归一', () => {
    expect(normalizeModelId('Claude-Opus-4.8')).toBe('claude-opus-4-8')
    expect(normalizeModelId('CLAUDE-HAIKU-4.5')).toBe('claude-haiku-4-5')
  })
})

describe('matchPricing', () => {
  it('精确匹配', () => {
    expect(matchPricing('claude-opus-4-8', rows)?.modelId).toBe('claude-opus-4-8')
  })
  it('日期后缀走前缀匹配', () => {
    expect(matchPricing('claude-haiku-4-5-20251001', rows)?.modelId).toBe('claude-haiku-4-5')
  })
  it('前缀 + 变体组合（网关前缀 + 点号 + 日期后缀）', () => {
    expect(matchPricing('anthropic/Claude-Sonnet-4.5-20250929', rows)?.modelId).toBe(
      'claude-sonnet-4-5'
    )
  })
  it('多前缀命中取最长（sonnet-4-5 优先于假想的 sonnet-4）', () => {
    const withShort: PricingRow[] = [
      ...rows,
      {
        modelId: 'claude-sonnet-4',
        displayName: null,
        inputPerM: '9',
        outputPerM: '9',
        cacheReadPerM: '9',
        cacheWritePerM: '9',
        isBuiltin: false
      }
    ]
    expect(matchPricing('claude-sonnet-4-5-20250929', withShort)?.modelId).toBe('claude-sonnet-4-5')
  })
  it('未命中 → null（不误配 gpt 类模型）', () => {
    expect(matchPricing('gpt-5.2-turbo', rows)).toBeNull()
    // 前缀必须后随 `-`：claude-opus-4-88 不得命中 claude-opus-4-8
    expect(matchPricing('claude-opus-4-88', rows)).toBeNull()
  })
})

describe('Decimal 定点成本', () => {
  it('parseDecimal：合法/非法输入', () => {
    expect(parseDecimal('6.25')).toEqual({ mantissa: 625n, scale: 2 })
    expect(parseDecimal('5')).toEqual({ mantissa: 5n, scale: 0 })
    expect(parseDecimal('0.1')).toEqual({ mantissa: 1n, scale: 1 })
    expect(parseDecimal('-1')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('1e3')).toBeNull()
  })

  it('1M tokens @ $6.25/M = 恰好 6.25 美元（无浮点误差）', () => {
    expect(costMicroUsd(1_000_000, '6.25')).toBe(6_250_000n)
  })

  it('0.1 单价不产生 0.30000000000000004 类误差', () => {
    // 3M tokens @ $0.1/M：浮点会得 0.30000000000000004，定点必须恰好 0.3
    expect(costMicroUsd(3_000_000, '0.1')).toBe(300_000n)
    expect(formatMicroUsd(300_000n)).toBe('0.3')
  })

  it('totalsCostMicro 四维合算', () => {
    const opus = rows.find((r) => r.modelId === 'claude-opus-4-8')!
    // input 1M*$5 + output 1M*$25 + read 1M*$0.5 + write 1M*$6.25 = $36.75
    const micro = totalsCostMicro(
      { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheCreation: 1_000_000, requests: 4 },
      opus
    )
    expect(formatMicroUsd(micro)).toBe('36.75')
  })

  it('formatMicroUsd：截断 4 位、去尾零、整数保留', () => {
    expect(formatMicroUsd(1_234_567n)).toBe('1.2345')
    expect(formatMicroUsd(5_000_000n)).toBe('5')
    expect(formatMicroUsd(0n)).toBe('0')
  })
})
