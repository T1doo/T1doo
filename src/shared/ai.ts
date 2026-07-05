/** F5 AI 能力的共享视图模型（§7.5）：对话面板双引擎 + 后台任务队列 */

import type { PermissionMode } from './terminals'

export type AiEngine = 'cli' | 'api'

/** API 引擎模型选项（§7.5.1 表；Fable 5 处理成本高，v1 暂缓进 backlog） */
export const API_MODELS: { id: string; label: string; pricing: string }[] = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', pricing: '$5/$25 每百万 token' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', pricing: '$3/$15（限时 $2/$10）' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', pricing: '$1/$5' }
]

export const DEFAULT_API_MODEL = 'claude-opus-4-8'

export interface ConversationSummary {
  id: string
  title: string
  engine: AiEngine
  /** api=模型 id；cli=可选 --model 透传值 */
  model: string | null
  /** cli 引擎的后端档案（§7.2.6）；api 引擎为 null */
  backendProfileId: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ConvMessageView {
  id: number
  role: 'user' | 'assistant'
  content: string
  ts: number
  inputTokens: number | null
  outputTokens: number | null
  /** 该回合出错中断时的错误信息（content 为已流出的部分文本） */
  error: string | null
}

/** 对话消息 + 进行中回合的已累计文本（切页回来续上流） */
export interface ConvMessagesResult {
  messages: ConvMessageView[]
  pending: { turnId: string; text: string } | null
}

export interface ChatSendInput {
  /** null/缺省 = 新建对话；引擎参数仅在新建时生效，后续回合沿用对话既有配置 */
  convId?: string | null
  text: string
  engine: AiEngine
  model?: string
  backendProfileId?: string
}

export interface ChatSendResult {
  convId: string
  /** 本回合的流式 id（evt:ai:delta 以此为键） */
  turnId: string
}

/** 流式事件（主进程 → 渲染层广播）；delta.text 为累计全文（整包替换，幂等） */
export type AiDeltaEvent =
  | { convId: string; turnId: string; kind: 'delta'; text: string }
  | {
      convId: string
      turnId: string
      kind: 'done'
      messageId: number
      inputTokens: number | null
      outputTokens: number | null
    }
  | { convId: string; turnId: string; kind: 'error'; message: string; partialSaved: boolean }

export interface ChatSearchHit {
  convId: string
  convTitle: string
  messageId: number
  role: string
  ts: number
  snippet: string
}

/** API 引擎配置视图：Key 明文永不出主进程，只暴露尾 4 位 */
export interface AiApiConfig {
  hasKey: boolean
  keyTail: string | null
  baseUrl: string | null
  model: string
}

export interface AiApiConfigInput {
  /** undefined = 保持不变；'' = 清除 */
  apiKey?: string
  baseUrl?: string
  model?: string
}

// ---------- 后台任务队列（§7.5.2 最小闭环） ----------

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface TaskSpec {
  prompt: string
  cwd: string
  backendProfileId?: string
  model?: string
  /** 默认保守 default；bypassPermissions 须 UI 双重确认 */
  permissionMode?: PermissionMode
  /** --max-budget-usd 成本闸（API 计费后端适用，仅 -p 可用） */
  maxBudgetUsd?: number
}

export interface TaskInfo {
  id: string
  prompt: string
  cwd: string
  status: TaskStatus
  model: string | null
  backendProfileId: string | null
  permissionMode: string | null
  maxBudgetUsd: number | null
  /** 预生成 --session-id；任务产生的会话自动进入 F1 会话中心 */
  sessionId: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  /** result 事件的 result 文本（成功时的最终回答摘要） */
  resultSummary: string | null
  totalCostUsd: number | null
  inputTokens: number | null
  outputTokens: number | null
  numTurns: number | null
  durationMs: number | null
  error: string | null
}
