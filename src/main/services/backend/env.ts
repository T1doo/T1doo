/**
 * 后端档案 env 注入（§7.2.6，纯函数，不依赖 Electron —— vitest 直测）。
 * 注入仅作用于 spawn 出的 `claude` 子进程环境，不经 shell 字符串拼接。
 */

/** 解密后的档案注入视图（token 已是明文，仅在主进程内存中短暂存在） */
export interface ResolvedBackend {
  auth: 'subscription' | 'custom'
  baseUrl: string | null
  token: string | null
  model: string | null
  smallFastModel: string | null
  extraEnv: Record<string, string>
  clearInheritedEnv: boolean
}

const ANTHROPIC_PREFIX = 'ANTHROPIC_'

/**
 * 构造 claude 子进程环境。
 * - subscription：默认原样透传；clearInheritedEnv 时剥除全部 ANTHROPIC_*（强制登录态）。
 * - custom：注入 BASE_URL + AUTH_TOKEN + MODEL(+DEFAULT_HAIKU_MODEL) + extraEnv；
 *   同时删除继承的 ANTHROPIC_API_KEY——与 AUTH_TOKEN 同设会冲突（附录 A.4 已核实）。
 */
export function buildClaudeEnv(
  base: Record<string, string | undefined>,
  backend: ResolvedBackend | null
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) env[k] = v
  }

  if (!backend || backend.auth === 'subscription') {
    if (backend?.clearInheritedEnv) {
      for (const k of Object.keys(env)) {
        if (k.toUpperCase().startsWith(ANTHROPIC_PREFIX)) delete env[k]
      }
    }
    return env
  }

  delete env.ANTHROPIC_API_KEY
  if (backend.baseUrl) env.ANTHROPIC_BASE_URL = backend.baseUrl
  if (backend.token) env.ANTHROPIC_AUTH_TOKEN = backend.token
  if (backend.model) env.ANTHROPIC_MODEL = backend.model
  if (backend.smallFastModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = backend.smallFastModel
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
