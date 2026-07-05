import Anthropic from '@anthropic-ai/sdk'

/**
 * Engine B：`api`（§7.5.1）。@anthropic-ai/sdk messages.stream() 直连；
 * v1 仅 Claude 模型（Q4 裁决），新模型不提供 temperature 等采样参数（传参 400），
 * thinking 用 adaptive（Haiku 4.5 不支持则省略）。
 */

export interface ApiHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ApiTurnOptions {
  model: string
  apiKey: string
  baseUrl?: string | null
  history: ApiHistoryMessage[]
}

export interface ApiTurnOutcome {
  text: string
  inputTokens: number | null
  outputTokens: number | null
}

/** SDK 错误 → 面向用户的明确提示（验收①：断网/无 Key 等异常有明确提示） */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'API Key 无效或已被吊销（401）：请在设置页检查 Key'
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return '该 API Key 无权访问此模型（403）'
  }
  if (err instanceof Anthropic.NotFoundError) {
    return '模型不存在或端点不可用（404）：请检查模型与 baseUrl'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return '触发限流（429）：请稍后重试'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return '网络连接失败：请检查网络、代理或自定义 baseUrl'
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API 错误（${err.status ?? '?'}）：${err.message}`
  }
  if (err instanceof Error && err.name === 'AbortError') return '已停止'
  return err instanceof Error ? err.message : String(err)
}

export class ApiChatEngine {
  private active = new Map<string, { abort: () => void }>()

  constructor(private readonly log?: (msg: string) => void) {}

  async send(
    convId: string,
    opts: ApiTurnOptions,
    onDelta: (text: string) => void
  ): Promise<ApiTurnOutcome> {
    if (this.active.has(convId)) throw new Error('该对话已有回合进行中')

    const client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseUrl || undefined
    })

    const isHaiku = opts.model.startsWith('claude-haiku')
    const stream = client.messages.stream({
      model: opts.model,
      max_tokens: isHaiku ? 32000 : 64000,
      // Haiku 4.5 不支持 adaptive thinking（传参 400），其余模型默认开启
      ...(isHaiku ? {} : { thinking: { type: 'adaptive' as const } }),
      messages: opts.history.map((m) => ({ role: m.role, content: m.content }))
    })
    this.active.set(convId, { abort: () => stream.abort() })
    this.log?.(`api 引擎回合 conv=${convId} model=${opts.model}`)

    try {
      stream.on('text', (delta) => onDelta(delta))
      const final = await stream.finalMessage()
      const text = final.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      if (final.stop_reason === 'refusal') {
        throw new Error('模型出于安全原因拒绝了本次请求')
      }
      return {
        text,
        inputTokens: final.usage.input_tokens ?? null,
        outputTokens: final.usage.output_tokens ?? null
      }
    } catch (err) {
      throw new Error(describeApiError(err))
    } finally {
      this.active.delete(convId)
    }
  }

  stop(convId: string): void {
    this.active.get(convId)?.abort()
  }

  disposeAll(): void {
    for (const [, a] of this.active) a.abort()
    this.active.clear()
  }
}
