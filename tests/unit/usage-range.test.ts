import { describe, expect, it } from 'vitest'
import { parseDayLocal, pickBucket, resolveUsageRange } from '../../src/shared/usage'

/** §7.8.4 六档时间预设解析（本地时区切日）+ §7.8.3 分桶自适应边界 */

const DAY = 86_400_000
// 固定"现在"：2026-07-07 15:30 本地时间（周二）
const NOW = new Date(2026, 6, 7, 15, 30, 0)
const TODAY0 = new Date(2026, 6, 7).getTime()

describe('resolveUsageRange', () => {
  it('today：本地零点起 24h 半开区间', () => {
    expect(resolveUsageRange('today', NOW)).toEqual({ from: TODAY0, to: TODAY0 + DAY })
  })

  it('7d / 30d：含今天在内往前数（本地切日）', () => {
    expect(resolveUsageRange('7d', NOW)).toEqual({ from: TODAY0 - 6 * DAY, to: TODAY0 + DAY })
    expect(resolveUsageRange('30d', NOW)).toEqual({ from: TODAY0 - 29 * DAY, to: TODAY0 + DAY })
  })

  it('month：本月 1 日零点 → 下月 1 日零点（跨月边界正确）', () => {
    expect(resolveUsageRange('month', NOW)).toEqual({
      from: new Date(2026, 6, 1).getTime(),
      to: new Date(2026, 7, 1).getTime()
    })
    // 12 月 → 次年 1 月（跨年进位）
    expect(resolveUsageRange('month', new Date(2026, 11, 15))).toEqual({
      from: new Date(2026, 11, 1).getTime(),
      to: new Date(2027, 0, 1).getTime()
    })
  })

  it('year：今年 1 月 1 日 → 明年 1 月 1 日', () => {
    expect(resolveUsageRange('year', NOW)).toEqual({
      from: new Date(2026, 0, 1).getTime(),
      to: new Date(2027, 0, 1).getTime()
    })
  })

  it('custom：含端点日 → 半开区间加一天；起止互换容错', () => {
    const r = resolveUsageRange('custom', NOW, { fromDay: '2026-06-01', toDay: '2026-06-03' })
    expect(r).toEqual({
      from: new Date(2026, 5, 1).getTime(),
      to: new Date(2026, 5, 4).getTime()
    })
    expect(resolveUsageRange('custom', NOW, { fromDay: '2026-06-03', toDay: '2026-06-01' })).toEqual(r)
  })

  it('custom 非法输入回退为 today', () => {
    expect(resolveUsageRange('custom', NOW, { fromDay: 'bad', toDay: '2026-06-01' })).toEqual(
      resolveUsageRange('today', NOW)
    )
  })
})

describe('parseDayLocal', () => {
  it('解析为本地零点；非法返回 null', () => {
    expect(parseDayLocal('2026-07-07')).toBe(TODAY0)
    expect(parseDayLocal('2026/07/07')).toBeNull()
    expect(parseDayLocal('')).toBeNull()
  })
})

describe('pickBucket（≤48h 小时桶；≤92 天日桶；更长月桶）', () => {
  it('边界恰好 48h → hour；48h+1ms → day', () => {
    expect(pickBucket({ from: 0, to: 48 * 3_600_000 })).toBe('hour')
    expect(pickBucket({ from: 0, to: 48 * 3_600_000 + 1 })).toBe('day')
  })
  it('边界恰好 92 天 → day；92 天+1ms → month', () => {
    expect(pickBucket({ from: 0, to: 92 * DAY })).toBe('day')
    expect(pickBucket({ from: 0, to: 92 * DAY + 1 })).toBe('month')
  })
  it('典型预设：今天→hour，30 天→day，今年→month', () => {
    expect(pickBucket(resolveUsageRange('today', NOW))).toBe('hour')
    expect(pickBucket(resolveUsageRange('30d', NOW))).toBe('day')
    expect(pickBucket(resolveUsageRange('year', NOW))).toBe('month')
  })
})
