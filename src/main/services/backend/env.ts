/**
 * 后端档案 env 注入（§7.2.6 / §7.7.5 按终端覆盖，纯函数，不依赖 Electron —— vitest 直测）。
 * 注入仅作用于 spawn 出的 `claude` 子进程环境，不经 shell 字符串拼接。
 *
 * 与全局切换（settings.json env 块）的优先级关系（2026-07-07 本机 2.1.196 实测，§7.7.5）：
 * 子进程环境变量 > settings.json env；空字符串环境变量可"中和"settings.json 里的同名键
 * （claude 视其为未设置，回落登录态）。因此：
 * - backend=null（跟随全局）：原样透传，settings.json env 块自然生效；
 * - 显式选档案（override）：先把全部核心键置空中和全局块，再按档案填值——
 *   订阅态档案由此获得"强制登录态"，custom 档案不会混入全局块的残留映射。
 */
import { CORE_ENV_KEYS } from './settings-env'

/** 解密后的档案注入视图（token 已是明文，仅在主进程内存中短暂存在） */
export interface ResolvedBackend {
  auth: 'subscription' | 'custom'
  baseUrl: string | null
  token: string | null
  model: string | null
  smallFastModel: string | null
  defaultSonnetModel: string | null
  defaultOpusModel: string | null
  extraEnv: Record<string, string>
  clearInheritedEnv: boolean
}

const ANTHROPIC_PREFIX = 'ANTHROPIC_'

/**
 * 构造 claude 子进程环境。
 * - null（跟随全局）：原样透传（settings.json env 块由 claude 自行读取）。
 * - subscription（显式覆盖）：剥除继承的 ANTHROPIC_* + 核心键置空中和全局块 → 强制登录态。
 * - custom（显式覆盖）：核心键先置空再填档案值 + extraEnv；
 *   ANTHROPIC_API_KEY 恒置空——与 AUTH_TOKEN 同设会冲突（附录 A.4 已核实）。
 */
export function buildClaudeEnv(
  base: Record<string, string | undefined>,
  backend: ResolvedBackend | null
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) env[k] = v
  }
  if (!backend) return env

  // 显式覆盖：剥除继承的 ANTHROPIC_*（避免外层 shell 残留干扰），核心键置空中和全局块
  for (const k of Object.keys(env)) {
    if (k.toUpperCase().startsWith(ANTHROPIC_PREFIX)) delete env[k]
  }
  for (const k of CORE_ENV_KEYS) env[k] = ''

  if (backend.auth === 'subscription') return env

  if (backend.baseUrl) env.ANTHROPIC_BASE_URL = backend.baseUrl
  if (backend.token) env.ANTHROPIC_AUTH_TOKEN = backend.token
  if (backend.model) env.ANTHROPIC_MODEL = backend.model
  if (backend.smallFastModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = backend.smallFastModel
  if (backend.defaultSonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = backend.defaultSonnetModel
  if (backend.defaultOpusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = backend.defaultOpusModel
  for (const [k, v] of Object.entries(backend.extraEnv)) {
    if (k) env[k] = v
  }
  return env
}

/** 日志/导出脱敏：凡值等于已知 token 的一律替换（§7.2.6 不落明文） */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('***')
  }
  return out
}
