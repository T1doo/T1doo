import { z } from 'zod'
import type { ContentBlockView, MessageView } from '../../../shared/sessions'

/**
 * Claude Code 会话 JSONL 容错解析器（§6.1/§6.3，本机 2.1.196 实测格式）。
 * 纯模块：不依赖 Electron/fs，输入完整行、输出结构化结果，可直接被 Vitest 单测。
 * 原则：类型白名单处理，未知类型静默跳过；单行解析失败绝不中断整个文件。
 */

// ---------- zod 宽松校验（只声明用到的字段，其余透传忽略） ----------

const UsageSchema = z
  .looseObject({
    input_tokens: z.number().nullish(),
    output_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish()
  })
  .nullish()

const ChatLineSchema = z.looseObject({
  type: z.enum(['user', 'assistant']),
  uuid: z.string(),
  parentUuid: z.string().nullish(),
  timestamp: z.string().nullish(),
  isSidechain: z.boolean().nullish(),
  isMeta: z.boolean().nullish(),
  cwd: z.string().nullish(),
  gitBranch: z.string().nullish(),
  version: z.string().nullish(),
  slug: z.string().nullish(),
  sessionId: z.string().nullish(),
  message: z
    .looseObject({
      role: z.string().nullish(),
      model: z.string().nullish(),
      content: z.unknown().nullish(),
      usage: UsageSchema
    })
    .nullish()
})

const AiTitleSchema = z.looseObject({ aiTitle: z.string() })
const CustomTitleSchema = z.looseObject({ customTitle: z.string() })

// ---------- 输出模型 ----------

export interface ParsedMessage {
  uuid: string
  parentUuid: string | null
  role: 'user' | 'assistant'
  type: string
  ts: number | null
  contentText: string
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  isSidechain: boolean
}

export type FileOp = 'edit' | 'write' | 'read'

export interface ParsedFileOp {
  path: string
  op: FileOp
  messageUuid: string
  ts: number | null
}

export interface ParsedFileResult {
  sessionId: string | null
  cwd: string | null
  slug: string | null
  gitBranch: string | null
  ccVersion: string | null
  titleCustom: string | null
  titleAi: string | null
  firstUserText: string | null
  lastModel: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  firstTs: number | null
  lastTs: number | null
  messages: ParsedMessage[]
  files: ParsedFileOp[]
  badLines: number
  skipped: Record<string, number>
}

const FILE_TOOL_OPS: Record<string, FileOp> = {
  Edit: 'edit',
  MultiEdit: 'edit',
  NotebookEdit: 'edit',
  Write: 'write',
  Read: 'read'
}

function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

interface RawBlock {
  type?: unknown
  text?: unknown
  thinking?: unknown
  id?: unknown
  name?: unknown
  input?: unknown
  tool_use_id?: unknown
  content?: unknown
  is_error?: unknown
}

/** message.content（string 或块数组）→ 纯文本（供 FTS）+ tool_use 块 */
function extractContent(content: unknown): {
  text: string
  toolUses: { id: string; name: string; input: unknown }[]
} {
  if (typeof content === 'string') return { text: content, toolUses: [] }
  if (!Array.isArray(content)) return { text: '', toolUses: [] }
  const texts: string[] = []
  const toolUses: { id: string; name: string; input: unknown }[] = []
  for (const raw of content as RawBlock[]) {
    if (!raw || typeof raw !== 'object') continue
    if (raw.type === 'text' && typeof raw.text === 'string') texts.push(raw.text)
    else if (raw.type === 'tool_use' && typeof raw.name === 'string') {
      toolUses.push({
        id: typeof raw.id === 'string' ? raw.id : '',
        name: raw.name,
        input: raw.input
      })
    }
  }
  return { text: texts.join('\n'), toolUses }
}

/** 首条用户消息 → 标题候选：去标签、并行空白、截断 */
export function sanitizeTitleCandidate(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

// ---------- 会话文件累积解析器 ----------

export class SessionFileParser {
  private r: ParsedFileResult = {
    sessionId: null,
    cwd: null,
    slug: null,
    gitBranch: null,
    ccVersion: null,
    titleCustom: null,
    titleAi: null,
    firstUserText: null,
    lastModel: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    firstTs: null,
    lastTs: null,
    messages: [],
    files: [],
    badLines: 0,
    skipped: {}
  }

  feedLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let obj: unknown
    try {
      obj = JSON.parse(trimmed)
    } catch {
      this.r.badLines++
      return
    }
    if (
      typeof obj !== 'object' ||
      obj === null ||
      typeof (obj as { type?: unknown }).type !== 'string'
    ) {
      this.r.badLines++
      return
    }
    const type = (obj as { type: string }).type

    switch (type) {
      case 'user':
      case 'assistant':
        this.feedChatLine(obj)
        return
      case 'ai-title': {
        const parsed = AiTitleSchema.safeParse(obj)
        // 取最新一条（后写覆盖先写）
        if (parsed.success) this.r.titleAi = parsed.data.aiTitle
        else this.r.badLines++
        return
      }
      case 'custom-title': {
        const parsed = CustomTitleSchema.safeParse(obj)
        if (parsed.success) this.r.titleCustom = parsed.data.customTitle
        else this.r.badLines++
        return
      }
      default:
        // 白名单外：静默跳过，仅计数（system/attachment/queue-operation/mode/…）
        this.r.skipped[type] = (this.r.skipped[type] ?? 0) + 1
        return
    }
  }

  private feedChatLine(obj: unknown): void {
    const parsed = ChatLineSchema.safeParse(obj)
    if (!parsed.success) {
      this.r.badLines++
      return
    }
    const d = parsed.data
    const ts = parseTs(d.timestamp)
    const { text, toolUses } = extractContent(d.message?.content)

    // 会话级元数据：cwd/slug 取首个出现（权威来源），version/gitBranch/model 取最新
    if (this.r.sessionId === null && d.sessionId) this.r.sessionId = d.sessionId
    if (this.r.cwd === null && d.cwd) this.r.cwd = d.cwd
    if (this.r.slug === null && d.slug) this.r.slug = d.slug
    if (d.gitBranch) this.r.gitBranch = d.gitBranch
    if (d.version) this.r.ccVersion = d.version
    if (d.type === 'assistant' && d.message?.model) this.r.lastModel = d.message.model

    if (ts !== null) {
      if (this.r.firstTs === null || ts < this.r.firstTs) this.r.firstTs = ts
      if (this.r.lastTs === null || ts > this.r.lastTs) this.r.lastTs = ts
    }

    const usage = d.type === 'assistant' ? d.message?.usage : null
    const inputTokens = usage?.input_tokens ?? null
    const outputTokens = usage?.output_tokens ?? null
    if (inputTokens) this.r.inputTokens += inputTokens
    if (outputTokens) this.r.outputTokens += outputTokens
    if (usage?.cache_read_input_tokens) this.r.cacheReadTokens += usage.cache_read_input_tokens

    // 标题兜底：首条"真实"用户消息（非侧链、非 meta、有文本）
    if (
      this.r.firstUserText === null &&
      d.type === 'user' &&
      !d.isSidechain &&
      !d.isMeta &&
      text.trim()
    ) {
      const candidate = sanitizeTitleCandidate(text)
      if (candidate) this.r.firstUserText = candidate
    }

    // tool_use → session_files（F4 联动数据，M1 采集）
    for (const tu of toolUses) {
      const op = FILE_TOOL_OPS[tu.name]
      if (!op) continue
      const input = tu.input as { file_path?: unknown; notebook_path?: unknown } | null
      const filePath =
        input && typeof input === 'object'
          ? typeof input.file_path === 'string'
            ? input.file_path
            : typeof input.notebook_path === 'string'
              ? input.notebook_path
              : null
          : null
      if (filePath) this.r.files.push({ path: filePath, op, messageUuid: d.uuid, ts })
    }

    this.r.messages.push({
      uuid: d.uuid,
      parentUuid: d.parentUuid ?? null,
      role: d.type,
      type: d.type,
      ts,
      contentText: text,
      model: d.type === 'assistant' ? (d.message?.model ?? null) : null,
      inputTokens,
      outputTokens,
      isSidechain: d.isSidechain === true
    })
  }

  result(): ParsedFileResult {
    return this.r
  }
}

export function parseLines(lines: Iterable<string>): ParsedFileResult {
  const p = new SessionFileParser()
  for (const line of lines) p.feedLine(line)
  return p.result()
}

// ---------- 详情回放：单行 → MessageView（含完整内容块） ----------

function toBlockViews(content: unknown): ContentBlockView[] {
  if (typeof content === 'string') {
    return content.trim() ? [{ kind: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) return []
  const blocks: ContentBlockView[] = []
  for (const raw of content as RawBlock[]) {
    if (!raw || typeof raw !== 'object') continue
    switch (raw.type) {
      case 'text':
        if (typeof raw.text === 'string' && raw.text.trim()) {
          blocks.push({ kind: 'text', text: raw.text })
        }
        break
      case 'thinking':
        if (typeof raw.thinking === 'string' && raw.thinking.trim()) {
          blocks.push({ kind: 'thinking', text: raw.thinking })
        }
        break
      case 'tool_use':
        blocks.push({
          kind: 'tool_use',
          id: typeof raw.id === 'string' ? raw.id : '',
          name: typeof raw.name === 'string' ? raw.name : '(unknown)',
          input: raw.input
        })
        break
      case 'tool_result': {
        let text = ''
        if (typeof raw.content === 'string') text = raw.content
        else if (Array.isArray(raw.content)) {
          text = (raw.content as RawBlock[])
            .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text as string)
            .join('\n')
        }
        blocks.push({
          kind: 'tool_result',
          toolUseId: typeof raw.tool_use_id === 'string' ? raw.tool_use_id : null,
          text,
          isError: raw.is_error === true
        })
        break
      }
    }
  }
  return blocks
}

/** 详情回放解析：user/assistant 行 → MessageView，其余返回 null */
export function lineToMessageView(line: string): MessageView | null | 'bad' {
  const trimmed = line.trim()
  if (!trimmed) return null
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return 'bad'
  }
  const type = (obj as { type?: unknown } | null)?.type
  if (type !== 'user' && type !== 'assistant') return null
  const parsed = ChatLineSchema.safeParse(obj)
  if (!parsed.success) return 'bad'
  const d = parsed.data
  return {
    uuid: d.uuid,
    parentUuid: d.parentUuid ?? null,
    role: d.type,
    ts: parseTs(d.timestamp),
    model: d.type === 'assistant' ? (d.message?.model ?? null) : null,
    isSidechain: d.isSidechain === true,
    blocks: toBlockViews(d.message?.content)
  }
}
