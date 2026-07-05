/**
 * `claude -p --output-format stream-json` 输出解析（§7.5，纯函数，vitest 直测）。
 * 行类型按白名单处理、未知类型静默跳过（与 F1 JSONL 解析同一容错哲学，R1/R10）。
 */

export interface StreamResult {
  subtype: string | null
  isError: boolean
  /** result 事件的最终文本（成功回合的回答全文/摘要） */
  resultText: string | null
  sessionId: string | null
  totalCostUsd: number | null
  inputTokens: number | null
  outputTokens: number | null
  numTurns: number | null
  durationMs: number | null
}

export interface StreamJsonHandlers {
  /** --include-partial-messages 的 token 级增量 */
  onDelta?(text: string): void
  /** assistant 事件的完整消息文本（无 partial 事件时的回退来源） */
  onAssistantText?(text: string): void
  /** system/init 事件（带 session_id） */
  onInit?(sessionId: string | null): void
  onResult?(r: StreamResult): void
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** 从 API 形态 message.content 抽取纯文本（text 块拼接；tool_use 等跳过） */
function extractText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('')
}

/** 解析单行事件；无法识别时安静返回 */
export function handleStreamJsonLine(line: string, handlers: StreamJsonHandlers): void {
  const trimmed = line.trim()
  if (!trimmed) return
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return // 半行/脏行：跳过（追加写场景由 LineSplitter 兜住，这里只防脏数据）
  }
  if (!obj || typeof obj !== 'object') return
  const e = obj as Record<string, unknown>

  switch (e.type) {
    case 'system': {
      if (e.subtype === 'init') handlers.onInit?.(str(e.session_id))
      return
    }
    case 'stream_event': {
      // { type:'stream_event', event:{ type:'content_block_delta', delta:{ type:'text_delta', text } } }
      const ev = e.event as Record<string, unknown> | undefined
      if (!ev || typeof ev !== 'object') return
      if (ev.type === 'content_block_delta') {
        const delta = ev.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          handlers.onDelta?.(delta.text)
        }
      }
      return
    }
    case 'assistant': {
      const text = extractText(e.message)
      if (text) handlers.onAssistantText?.(text)
      return
    }
    case 'result': {
      const usage = (e.usage ?? {}) as Record<string, unknown>
      handlers.onResult?.({
        subtype: str(e.subtype),
        isError: e.is_error === true,
        resultText: str(e.result),
        sessionId: str(e.session_id),
        totalCostUsd: num(e.total_cost_usd),
        inputTokens: num(usage.input_tokens),
        outputTokens: num(usage.output_tokens),
        numTurns: num(e.num_turns),
        durationMs: num(e.duration_ms)
      })
      return
    }
    default:
      return // 白名单外静默跳过
  }
}

/** 字节流 → 完整行：只消费到最后一个 \n，尾部残行留待下一 chunk 补齐（§6.3 同款半行处理） */
export class LineSplitter {
  private tail = ''

  feed(chunk: string, onLine: (line: string) => void): void {
    const data = this.tail + chunk
    const lines = data.split('\n')
    this.tail = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }

  /** 流结束时冲出残行（进程退出后调用） */
  flush(onLine: (line: string) => void): void {
    if (this.tail.trim()) onLine(this.tail)
    this.tail = ''
  }
}
