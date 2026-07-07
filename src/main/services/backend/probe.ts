/**
 * §7.7.4 连通性测试与模型列表拉取：GET {baseUrl}/v1/models（404 回退 /models），
 * 5s 超时，不发计费请求。响应解析为纯函数（vitest 直测双形态）。
 */

export type ProbeFailKind = 'auth' | 'notfound' | 'timeout' | 'network' | 'http'

export type ProbeResult =
  | { ok: true; models: string[]; latencyMs: number }
  | { ok: false; kind: ProbeFailKind; status: number | null }

const TIMEOUT_MS = 5_000

/** OpenAI 形态 {data:[{id}]} 与 Anthropic 形态 {data:[{id,display_name}]} 兼容解析 */
export function parseModelsResponse(body: unknown): string[] {
  if (!body || typeof body !== 'object') return []
  const data = (body as Record<string, unknown>).data
  if (!Array.isArray(data)) return []
  const models: string[] = []
  for (const item of data) {
    if (item && typeof item === 'object') {
      const id = (item as Record<string, unknown>).id
      if (typeof id === 'string' && id) models.push(id)
    }
  }
  return models
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path
}

async function getOnce(
  url: string,
  token: string | null,
  timeoutMs: number
): Promise<{ status: number; body: unknown } | { timeout: true } | { network: true }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = { 'anthropic-version': '2023-06-01' }
    if (token) {
      // 兼容两种网关鉴权风格：Anthropic 用 x-api-key，OpenAI 兼容网关用 Bearer
      headers.authorization = `Bearer ${token}`
      headers['x-api-key'] = token
    }
    const res = await fetch(url, { headers, signal: controller.signal })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // 非 JSON 响应体：状态码已足够判定
    }
    return { status: res.status, body }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { timeout: true }
    return { network: true }
  } finally {
    clearTimeout(timer)
  }
}

/** 探测模型列表端点：/v1/models → 404 时回退 /models */
export async function probeModels(
  baseUrl: string,
  token: string | null,
  timeoutMs = TIMEOUT_MS
): Promise<ProbeResult> {
  const started = Date.now()
  let last: Awaited<ReturnType<typeof getOnce>> | null = null
  for (const path of ['/v1/models', '/models']) {
    const r = await getOnce(joinUrl(baseUrl, path), token, timeoutMs)
    last = r
    if ('timeout' in r) return { ok: false, kind: 'timeout', status: null }
    if ('network' in r) return { ok: false, kind: 'network', status: null }
    if (r.status === 404) continue // 回退下一个候选路径
    if (r.status === 200) {
      return { ok: true, models: parseModelsResponse(r.body), latencyMs: Date.now() - started }
    }
    if (r.status === 401 || r.status === 403) return { ok: false, kind: 'auth', status: r.status }
    return { ok: false, kind: 'http', status: r.status }
  }
  void last
  return { ok: false, kind: 'notfound', status: 404 }
}
