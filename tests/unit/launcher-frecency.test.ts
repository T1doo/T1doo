import { describe, expect, it } from 'vitest'
import { buildFrecencyMap, launchWeight } from '../../src/main/services/launcher/frecency'

const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('frecency 打分（§7.3，zoxide 式时间衰减）', () => {
  it('按距今时长衰减：小时 > 天 > 周 > 远期', () => {
    expect(launchWeight(HOUR / 2)).toBe(100)
    expect(launchWeight(HOUR * 5)).toBe(60)
    expect(launchWeight(DAY * 3)).toBe(30)
    expect(launchWeight(DAY * 30)).toBe(10)
  })

  it('未来时间戳视为脏数据计 0', () => {
    expect(launchWeight(-1000)).toBe(0)
  })

  it('聚合：同 key 权重累加，高频且新近的分高', () => {
    const now = Date.now()
    const map = buildFrecencyMap(
      [
        { key: 'app:a', ts: now - HOUR / 2 }, // 100
        { key: 'app:a', ts: now - DAY * 2 }, // 30
        { key: 'app:b', ts: now - DAY * 20 } // 10
      ],
      now
    )
    expect(map.get('app:a')).toBe(130)
    expect(map.get('app:b')).toBe(10)
    expect(map.get('app:c')).toBeUndefined()
  })
})
