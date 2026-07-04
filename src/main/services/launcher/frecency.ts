/**
 * frecency 打分（§7.3，参考 zoxide）：score = Σ 时间衰减权重。
 * 纯函数、不依赖 DB/Electron，可直接单测。
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** 单次启动按距今时长衰减的权重 */
export function launchWeight(ageMs: number): number {
  if (ageMs < 0) return 0 // 未来时间戳视为脏数据
  if (ageMs < HOUR) return 100
  if (ageMs < DAY) return 60
  if (ageMs < WEEK) return 30
  return 10 // 90 天保留窗口内的远期记录
}

/** 流水聚合成 key → 分数表；启动器唤起时算一次，键入过程中复用 */
export function buildFrecencyMap(
  launches: { key: string; ts: number }[],
  now: number
): Map<string, number> {
  const map = new Map<string, number>()
  for (const { key, ts } of launches) {
    map.set(key, (map.get(key) ?? 0) + launchWeight(now - ts))
  }
  return map
}
