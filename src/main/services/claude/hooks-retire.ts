import { existsSync } from 'fs'
import { readClaudeSettings, writeClaudeSettings } from './settings-io'

/**
 * v1.0 hooks 的退役清理（§7.9.4）。
 *
 * v1.0 曾（经用户显式授权）向 `~/.claude/settings.json` 注册 6 个事件的 hook 命令；
 * v1.1 整体退役该机制（§7.9），故首次启动时精确摘除自己留下的条目，其余键分毫不动。
 *
 * 识别靠**内容标记**而非备份回滚：命令串含 `/t1doo-hook`（我们的回调 URL 路径）即是我们的。
 * 用户自己的 hook、以及同一事件下的其他条目一律原样保留。
 * 注册侧（buildHookCommand/mergeHooks/HookServer）已随退役删除，仅保留移除路径。
 */

/** 识别标记：URL 路径含 /t1doo-hook 即视为我们注册的条目 */
const MARKER = '/t1doo-hook'

interface HookEntry {
  type: string
  command?: string
  [k: string]: unknown
}

interface HookGroup {
  matcher?: string
  hooks?: HookEntry[]
  [k: string]: unknown
}

function isOurs(entry: HookEntry): boolean {
  return typeof entry.command === 'string' && entry.command.includes(MARKER)
}

function asGroups(value: unknown): HookGroup[] {
  return Array.isArray(value) ? (value as HookGroup[]) : []
}

/** 精确移除全部 t1doo 条目；空组/空事件/空 hooks 键一并收干净 */
export function removeHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const rawHooks = settings.hooks
  if (!rawHooks || typeof rawHooks !== 'object') return { ...settings }

  const hooks: Record<string, unknown> = {}
  for (const [event, value] of Object.entries(rawHooks as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      hooks[event] = value
      continue
    }
    const groups: HookGroup[] = []
    for (const group of asGroups(value)) {
      if (!Array.isArray(group.hooks)) {
        groups.push(group)
        continue
      }
      const kept = group.hooks.filter((h) => !isOurs(h))
      if (kept.length > 0) groups.push({ ...group, hooks: kept })
      // 组内全是我们的条目 → 整组移除
    }
    if (groups.length > 0) hooks[event] = groups
  }

  const next = { ...settings }
  if (Object.keys(hooks).length > 0) {
    next.hooks = hooks
  } else {
    delete next.hooks
  }
  return next
}

/** settings.json 中是否还留着我们的注册 */
export function hasOurHooks(settings: Record<string, unknown>): boolean {
  const rawHooks = settings.hooks
  if (!rawHooks || typeof rawHooks !== 'object') return false
  for (const value of Object.values(rawHooks as Record<string, unknown>)) {
    for (const group of asGroups(value)) {
      if (Array.isArray(group.hooks) && group.hooks.some((h) => isOurs(h))) return true
    }
  }
  return false
}

/**
 * 升级清理入口：检测到 v1.0 注册即精确摘除并落盘（备份 + 原子写）。
 * @returns true=确实清理了（宿主据此一次性告知用户）；false=无需清理
 * @throws settings.json 结构异常时向上抛，绝不覆盖读不懂的用户配置
 */
export function retireHooks(settingsPath: string, log: (msg: string) => void = () => {}): boolean {
  if (!existsSync(settingsPath)) return false
  const settings = readClaudeSettings(settingsPath)
  if (!hasOurHooks(settings)) return false
  writeClaudeSettings(settingsPath, removeHooks(settings))
  log('已清理 v1.0 遗留的 hooks 注册（settings.json 其余键未改动）')
  return true
}
