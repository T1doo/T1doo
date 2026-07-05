import type { Database } from 'better-sqlite3'
import type {
  AiEngine,
  ChatSearchHit,
  ConvMessageView,
  ConversationSummary,
  TaskInfo,
  TaskSpec,
  TaskStatus
} from '../../shared/ai'
import { SNIPPET_OPEN, SNIPPET_CLOSE, desegmentCjk, segmentCjkForFts, toFtsQuery } from './dao'

interface ConvRow {
  id: string
  title: string
  engine: string
  model: string | null
  backend_profile_id: string | null
  created_at: number
  updated_at: number
  message_count: number
}

interface ConvMessageRow {
  id: number
  role: string
  content: string
  input_tokens: number | null
  output_tokens: number | null
  ts: number
  error: string | null
}

interface TaskRow {
  id: string
  prompt: string
  cwd: string
  status: string
  model: string | null
  backend_profile_id: string | null
  permission_mode: string | null
  max_budget_usd: number | null
  session_id: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
  result_summary: string | null
  total_cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  num_turns: number | null
  duration_ms: number | null
  error: string | null
}

function toTaskInfo(r: TaskRow): TaskInfo {
  return {
    id: r.id,
    prompt: r.prompt,
    cwd: r.cwd,
    status: r.status as TaskStatus,
    model: r.model,
    backendProfileId: r.backend_profile_id,
    permissionMode: r.permission_mode,
    maxBudgetUsd: r.max_budget_usd,
    sessionId: r.session_id,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    resultSummary: r.result_summary,
    totalCostUsd: r.total_cost_usd,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    numTurns: r.num_turns,
    durationMs: r.duration_ms,
    error: r.error
  }
}

/** F5 数据访问：conversations / conv_messages / conv_fts / tasks（§7.5） */
export class AiDao {
  constructor(private db: Database) {}

  // ---------- 对话 ----------

  createConversation(c: {
    id: string
    title: string
    engine: AiEngine
    model: string | null
    backendProfileId: string | null
    ts: number
  }): void {
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, engine, model, backend_profile_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(c.id, c.title, c.engine, c.model, c.backendProfileId, c.ts, c.ts)
  }

  getConversation(id: string): ConversationSummary | null {
    const r = this.db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM conv_messages m WHERE m.conv_id = c.id) AS message_count
         FROM conversations c WHERE c.id = ?`
      )
      .get(id) as ConvRow | undefined
    return r ? this.toSummary(r) : null
  }

  listConversations(): ConversationSummary[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM conv_messages m WHERE m.conv_id = c.id) AS message_count
         FROM conversations c ORDER BY c.updated_at DESC LIMIT 500`
      )
      .all() as ConvRow[]
    return rows.map((r) => this.toSummary(r))
  }

  /** 追加一条消息（入 FTS），并推进对话 updated_at；返回消息 id */
  appendMessage(m: {
    convId: string
    role: 'user' | 'assistant'
    content: string
    inputTokens?: number | null
    outputTokens?: number | null
    ts: number
    error?: string | null
  }): number {
    return this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO conv_messages (conv_id, role, content, input_tokens, output_tokens, ts, error)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          m.convId,
          m.role,
          m.content,
          m.inputTokens ?? null,
          m.outputTokens ?? null,
          m.ts,
          m.error ?? null
        )
      const id = Number(info.lastInsertRowid)
      const seg = segmentCjkForFts(m.content)
      if (seg) {
        this.db.prepare('INSERT INTO conv_fts (rowid, content_text) VALUES (?, ?)').run(id, seg)
      }
      this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(m.ts, m.convId)
      return id
    })()
  }

  listMessages(convId: string): ConvMessageView[] {
    const rows = this.db
      .prepare(
        `SELECT id, role, content, input_tokens, output_tokens, ts, error
         FROM conv_messages WHERE conv_id = ? ORDER BY id`
      )
      .all(convId) as ConvMessageRow[]
    return rows.map((r) => ({
      id: r.id,
      role: r.role === 'user' ? 'user' : 'assistant',
      content: r.content,
      ts: r.ts,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      error: r.error
    }))
  }

  /** 删除对话：先按 rowid 清 FTS（FK 级联不会帮忙），再删主表 */
  deleteConversation(id: string): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'DELETE FROM conv_fts WHERE rowid IN (SELECT id FROM conv_messages WHERE conv_id = ?)'
        )
        .run(id)
      this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    })()
  }

  search(q: string): ChatSearchHit[] {
    const ftsQuery = toFtsQuery(q)
    if (!ftsQuery) return []
    const rows = this.db
      .prepare(
        `SELECT m.id AS messageId, m.conv_id AS convId, m.role, m.ts,
                snippet(conv_fts, 0, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', '…', 14) AS snippet,
                c.title AS convTitle
         FROM conv_fts
         JOIN conv_messages m ON m.id = conv_fts.rowid
         JOIN conversations c ON c.id = m.conv_id
         WHERE conv_fts MATCH @q
         ORDER BY rank
         LIMIT 50`
      )
      .all({ q: ftsQuery }) as ChatSearchHit[]
    for (const r of rows) r.snippet = desegmentCjk(r.snippet)
    return rows
  }

  // ---------- 任务 ----------

  insertTask(t: {
    id: string
    spec: TaskSpec
    sessionId: string
    ts: number
  }): TaskInfo {
    this.db
      .prepare(
        `INSERT INTO tasks (id, prompt, cwd, status, model, backend_profile_id, permission_mode,
                            max_budget_usd, session_id, created_at)
         VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        t.id,
        t.spec.prompt,
        t.spec.cwd,
        t.spec.model ?? null,
        t.spec.backendProfileId ?? null,
        t.spec.permissionMode ?? 'default',
        t.spec.maxBudgetUsd ?? null,
        t.sessionId,
        t.ts
      )
    return this.getTask(t.id)!
  }

  getTask(id: string): TaskInfo | null {
    const r = this.db
      .prepare(
        `SELECT id, prompt, cwd, status, model, backend_profile_id, permission_mode, max_budget_usd,
                session_id, created_at, started_at, finished_at, result_summary, total_cost_usd,
                input_tokens, output_tokens, num_turns, duration_ms, error
         FROM tasks WHERE id = ?`
      )
      .get(id) as TaskRow | undefined
    return r ? toTaskInfo(r) : null
  }

  listTasks(limit = 200): TaskInfo[] {
    const rows = this.db
      .prepare(
        `SELECT id, prompt, cwd, status, model, backend_profile_id, permission_mode, max_budget_usd,
                session_id, created_at, started_at, finished_at, result_summary, total_cost_usd,
                input_tokens, output_tokens, num_turns, duration_ms, error
         FROM tasks ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit) as TaskRow[]
    return rows.map(toTaskInfo)
  }

  updateTask(
    id: string,
    patch: Partial<{
      status: TaskStatus
      sessionId: string | null
      startedAt: number
      finishedAt: number
      resultSummary: string | null
      totalCostUsd: number | null
      inputTokens: number | null
      outputTokens: number | null
      numTurns: number | null
      durationMs: number | null
      error: string | null
      output: string | null
    }>
  ): TaskInfo | null {
    const cols: string[] = []
    const vals: unknown[] = []
    const map: Record<string, string> = {
      status: 'status',
      sessionId: 'session_id',
      startedAt: 'started_at',
      finishedAt: 'finished_at',
      resultSummary: 'result_summary',
      totalCostUsd: 'total_cost_usd',
      inputTokens: 'input_tokens',
      outputTokens: 'output_tokens',
      numTurns: 'num_turns',
      durationMs: 'duration_ms',
      error: 'error',
      output: 'output'
    }
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) {
        cols.push(`${col} = ?`)
        vals.push((patch as Record<string, unknown>)[k])
      }
    }
    if (cols.length > 0) {
      this.db.prepare(`UPDATE tasks SET ${cols.join(', ')} WHERE id = ?`).run(...vals, id)
    }
    return this.getTask(id)
  }

  taskOutput(id: string): string {
    const r = this.db.prepare('SELECT output FROM tasks WHERE id = ?').get(id) as
      { output: string | null } | undefined
    return r?.output ?? ''
  }

  /** 应用上次异常退出时可能残留的 running/queued 任务 → 启动时标记失败 */
  failStaleActiveTasks(ts: number): void {
    this.db
      .prepare(
        `UPDATE tasks SET status = 'failed', finished_at = ?, error = '应用退出导致任务中断'
         WHERE status IN ('queued', 'running')`
      )
      .run(ts)
  }

  private toSummary(r: ConvRow): ConversationSummary {
    return {
      id: r.id,
      title: r.title,
      engine: r.engine === 'api' ? 'api' : 'cli',
      model: r.model,
      backendProfileId: r.backend_profile_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      messageCount: r.message_count
    }
  }
}
