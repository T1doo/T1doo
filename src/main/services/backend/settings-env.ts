/**
 * ~/.claude/settings.json 的 env 键管理（§7.7.5 全局切换，纯函数 —— vitest 直测）。
 * 与 hooks 注册器（services/hooks/settings-file.ts）同一套原则：
 * 深合并只动自己的键、按记账名单精确增删、绝不静默覆盖用户配置。
 */
import type { ResolvedBackend } from './env'

/** claude 后端相关的核心 env 键（按终端覆盖时也用这份名单做中和，§7.7.5 实测 4） */
export const CORE_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL'
] as const

/** 由档案生成写入 settings.json 的 env 块（只含有值的键；token 为明文，Q8 已知悉） */
export function buildProfileEnvBlock(backend: ResolvedBackend): Record<string, string> {
  const block: Record<string, string> = {}
  if (backend.auth === 'subscription') return block // 订阅态 = 不写任何键（切换即移除管理键）
  if (backend.baseUrl) block.ANTHROPIC_BASE_URL = backend.baseUrl
  if (backend.token) block.ANTHROPIC_AUTH_TOKEN = backend.token
  if (backend.model) block.ANTHROPIC_MODEL = backend.model
  if (backend.smallFastModel) block.ANTHROPIC_DEFAULT_HAIKU_MODEL = backend.smallFastModel
  if (backend.defaultSonnetModel) block.ANTHROPIC_DEFAULT_SONNET_MODEL = backend.defaultSonnetModel
  if (backend.defaultOpusModel) block.ANTHROPIC_DEFAULT_OPUS_MODEL = backend.defaultOpusModel
  for (const [k, v] of Object.entries(backend.extraEnv)) {
    if (k) block[k] = v
  }
  return block
}

function envOf(settings: Record<string, unknown>): Record<string, unknown> {
  const env = settings.env
  return env && typeof env === 'object' && !Array.isArray(env)
    ? { ...(env as Record<string, unknown>) }
    : {}
}

/**
 * 应用管理键（幂等）：先按上次记账精确移除，再写入新块；其余 env 键与顶层键分毫不动。
 * 返回新 settings 与新记账名单。
 */
export function applyManagedEnv(
  settings: Record<string, unknown>,
  block: Record<string, string>,
  prevManagedKeys: string[]
): { settings: Record<string, unknown>; managedKeys: string[] } {
  const env = envOf(settings)
  for (const k of prevManagedKeys) delete env[k]
  for (const [k, v] of Object.entries(block)) env[k] = v
  const next = { ...settings }
  if (Object.keys(env).length > 0) next.env = env
  else delete next.env
  return { settings: next, managedKeys: Object.keys(block) }
}

/** 一键还原：按记账移除全部管理键；env 变空对象时连 env 键一并收干净 */
export function removeManagedEnv(
  settings: Record<string, unknown>,
  managedKeys: string[]
): Record<string, unknown> {
  return applyManagedEnv(settings, {}, managedKeys).settings
}

/**
 * 漂移检测（§7.7.5 冲突三选的输入）：live 中管理键的值 ≠ 期望值，或该键已被删除。
 * 只看管理键——用户自己加的其它 env 键与 T1doo 无关，不算漂移。
 */
export function detectDrift(
  settings: Record<string, unknown>,
  expected: Record<string, string>,
  managedKeys: string[]
): { key: string; expected: string; live: string }[] {
  const env = envOf(settings)
  const drifted: { key: string; expected: string; live: string }[] = []
  for (const key of managedKeys) {
    const want = expected[key]
    const live = env[key]
    const liveStr = typeof live === 'string' ? live : live === undefined ? '' : String(live)
    if ((want ?? '') !== liveStr) {
      drifted.push({
        key,
        expected: redactIfSecret(key, want ?? ''),
        live: redactIfSecret(key, liveStr)
      })
    }
  }
  return drifted
}

/** 从 live env 块提取可导入为档案的字段（冲突三选之"导入为新档案"） */
export function extractProfileFromEnv(settings: Record<string, unknown>): {
  baseUrl: string | null
  token: string | null
  model: string | null
  smallFastModel: string | null
  defaultSonnetModel: string | null
  defaultOpusModel: string | null
  extraEnv: Record<string, string>
} {
  const env = envOf(settings)
  const str = (k: string): string | null =>
    typeof env[k] === 'string' && env[k] ? (env[k] as string) : null
  const extraEnv: Record<string, string> = {}
  const known = new Set<string>(CORE_ENV_KEYS)
  for (const [k, v] of Object.entries(env)) {
    if (!known.has(k) && typeof v === 'string') extraEnv[k] = v
  }
  return {
    baseUrl: str('ANTHROPIC_BASE_URL'),
    token: str('ANTHROPIC_AUTH_TOKEN') ?? str('ANTHROPIC_API_KEY'),
    model: str('ANTHROPIC_MODEL'),
    smallFastModel: str('ANTHROPIC_DEFAULT_HAIKU_MODEL'),
    defaultSonnetModel: str('ANTHROPIC_DEFAULT_SONNET_MODEL'),
    defaultOpusModel: str('ANTHROPIC_DEFAULT_OPUS_MODEL'),
    extraEnv
  }
}

/** 冲突展示脱敏：token 类键只露尾 4 位（§11 明文不出主进程的展示口径） */
function redactIfSecret(key: string, value: string): string {
  if (!value) return value
  if (key === 'ANTHROPIC_AUTH_TOKEN' || key === 'ANTHROPIC_API_KEY') {
    return `…${value.slice(-4)}`
  }
  return value
}
