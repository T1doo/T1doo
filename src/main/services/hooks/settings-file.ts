/**
 * ~/.claude/settings.json 的 hooks 注册/还原（§7.2.4，纯函数 —— vitest 直测）。
 * 深合并写入：只动 hooks 下我们自己的条目，原样保留用户既有 hooks 与
 * permissions/enabledPlugins/env 等全部键；移除时精确过滤，不靠备份回滚。
 */

/** 注册的 hook 事件全集（Notification 官方文档已不收录，补充注册、收不到不报错） */
export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SessionStart',
  'SessionEnd'
] as const

export type HookEventName = (typeof HOOK_EVENTS)[number]

/** 识别标记：URL 路径含 /t1doo-hook 即视为我们注册的条目 */
const MARKER = '/t1doo-hook'

/**
 * hook 命令模板（Windows）：始终以 0 退出、2 秒超时、静默失败，绝不阻塞 Claude Code。
 * curl.exe 自 Win10 1809 起随系统预装。
 */
export function buildHookCommand(port: number, token: string): string {
  return (
    `cmd /c "curl.exe -s -m 2 -X POST http://127.0.0.1:${port}${MARKER}` +
    ` -H "Authorization: Bearer ${token}" --data-binary @- 2>NUL & exit /b 0"`
  )
}

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

/** 注册（幂等）：先清掉旧的 t1doo 条目再追加，端口/token 变化时重复调用即完成改写 */
export function mergeHooks(
  settings: Record<string, unknown>,
  command: string
): Record<string, unknown> {
  const cleaned = removeHooks(settings)
  const hooks = { ...((cleaned.hooks as Record<string, unknown>) ?? {}) }
  for (const event of HOOK_EVENTS) {
    const groups = asGroups(hooks[event])
    hooks[event] = [...groups, { hooks: [{ type: 'command', command }] }]
  }
  return { ...cleaned, hooks }
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

/** settings.json 中是否已含我们的注册（用于启动时状态自检） */
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
