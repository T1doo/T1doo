/**
 * 用量行解析（§7.8.2）：只认 `type=="assistant"` 且带 message.id 的行，
 * 提取 usage 四元组 + stop_reason + timestamp——不建 FTS、不存正文。
 * 纯模块：worker 与单测共用。
 */

export interface UsageLineRow {
  /** assistant message.id（去重键）；同 id 多条快照由 DAO 按裁决规则 REPLACE */
  messageId: string
  model: string | null
  ts: number | null
  stopReason: string | null
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  /** 行内 sessionId（子代理转录也带主会话 id） */
  sessionId: string | null
  /** 行内 cwd → project_path */
  cwd: string | null
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

/**
 * 解析单行；非 assistant / 无 message.id / 全维度为 0 时返回 null。
 * ⚠️ 计入门槛 = 任一计费维度 > 0（不得按 stop_reason&&output 过滤——该口径
 * 系统性低估 ~4.1%，并行子代理常只留 message_start 快照，§7.8.2 第 3 条）。
 */
export function parseUsageLine(line: string): UsageLineRow | null {
  // 快速预筛：绝大多数行不是 assistant，免 JSON.parse 开销
  if (!line.includes('"assistant"')) return null
  let obj: unknown
  try {
    obj = JSON.parse(line)
  } catch {
    return null // 坏行静默跳过，与 F1 同一容错哲学
  }
  if (!obj || typeof obj !== 'object') return null
  const e = obj as Record<string, unknown>
  if (e.type !== 'assistant') return null
  const message = e.message as Record<string, unknown> | null | undefined
  if (!message || typeof message !== 'object') return null
  const messageId = str(message.id)
  if (!messageId) return null

  const usage = (message.usage ?? {}) as Record<string, unknown>
  const input = num(usage.input_tokens)
  const output = num(usage.output_tokens)
  const cacheRead = num(usage.cache_read_input_tokens)
  const cacheCreation = num(usage.cache_creation_input_tokens)
  if (input + output + cacheRead + cacheCreation === 0) return null

  let ts: number | null = null
  if (typeof e.timestamp === 'string') {
    const ms = Date.parse(e.timestamp)
    ts = Number.isNaN(ms) ? null : ms
  }

  return {
    messageId,
    model: str(message.model),
    ts,
    stopReason: str(message.stop_reason),
    input,
    output,
    cacheRead,
    cacheCreation,
    sessionId: str(e.sessionId),
    cwd: str(e.cwd)
  }
}
