/** F1 会话中心的共享视图模型（§5.2 / §6.2） */

export interface ProjectSummary {
  id: number
  path: string
  slug: string | null
  sessionCount: number
  lastActiveAt: number | null
}

export interface SessionSummary {
  id: string
  projectId: number | null
  projectPath: string | null
  title: string
  createdAt: number | null
  updatedAt: number | null
  messageCount: number
  modelLast: string | null
  gitBranch: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  pinned: boolean
  note: string | null
  ccVersion: string | null
}

export interface SessionFilter {
  projectId?: number
  pinnedOnly?: boolean
}

export interface SearchHit {
  sessionId: string
  sessionTitle: string
  projectPath: string | null
  messageUuid: string
  role: string
  ts: number | null
  /** FTS snippet，命中词以 … 包裹（渲染层转 <mark>） */
  snippet: string
}

/** 详情回放的内容块（按需解析 JSONL 得到） */
export type ContentBlockView =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string | null; text: string; isError: boolean }

export interface MessageView {
  uuid: string
  parentUuid: string | null
  role: 'user' | 'assistant'
  ts: number | null
  model: string | null
  isSidechain: boolean
  blocks: ContentBlockView[]
}

export interface SessionDetail {
  summary: SessionSummary
  messages: MessageView[]
  badLineCount: number
}

export interface SyncProgress {
  phase: 'scanning' | 'syncing' | 'done'
  done: number
  total: number
  currentFile?: string
}

export type ExportFormat = 'md' | 'json'
