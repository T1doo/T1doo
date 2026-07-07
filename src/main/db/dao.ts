import type { Database } from 'better-sqlite3'
import type {
  ProjectSummary,
  SearchHit,
  SessionFilter,
  SessionSummary
} from '../../shared/sessions'
import type { ParsedFileResult } from '../services/claude/parser'

/** FTS snippet 高亮标记（渲染层转 <mark>） */
export const SNIPPET_OPEN = '⟦'
export const SNIPPET_CLOSE = '⟧'

const TITLE_PRIORITY: Record<string, number> = { custom: 3, ai: 2, 'first-user': 1 }

export interface SyncCursor {
  id: string
  jsonlPath: string | null
  jsonlOffset: number
  jsonlSize: number
}

export interface ApplyOptions {
  mode: 'replace' | 'append'
  jsonlPath: string
  newOffset: number
  fileSize: number
}

interface SessionRow {
  id: string
  project_id: number | null
  project_path: string | null
  title: string | null
  title_source: string | null
  created_at: number | null
  updated_at: number | null
  message_count: number
  model_last: string | null
  git_branch: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  pinned: number
  note: string | null
  cc_version: string | null
}

function toSummary(r: SessionRow): SessionSummary {
  return {
    id: r.id,
    projectId: r.project_id,
    projectPath: r.project_path,
    title: r.title ?? '(未命名会话)',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
    modelLast: r.model_last,
    gitBranch: r.git_branch,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    pinned: r.pinned !== 0,
    note: r.note,
    ccVersion: r.cc_version
  }
}

const SUMMARY_SELECT = `
  SELECT s.id, s.project_id, p.path AS project_path, s.title, s.title_source,
         s.created_at, s.updated_at, s.message_count, s.model_last, s.git_branch,
         s.input_tokens, s.output_tokens, s.cache_read_tokens, s.pinned, s.note, s.cc_version
  FROM sessions s LEFT JOIN projects p ON p.id = s.project_id`

export class SessionsDao {
  constructor(private db: Database) {}

  getCursors(): SyncCursor[] {
    return (
      this.db.prepare('SELECT id, jsonl_path, jsonl_offset, jsonl_size FROM sessions').all() as {
        id: string
        jsonl_path: string | null
        jsonl_offset: number
        jsonl_size: number
      }[]
    ).map((r) => ({
      id: r.id,
      jsonlPath: r.jsonl_path,
      jsonlOffset: r.jsonl_offset,
      jsonlSize: r.jsonl_size
    }))
  }

  /** 把一次文件解析结果落库（全量 replace / 增量 append），单事务 */
  applyFileParse(sessionId: string, result: ParsedFileResult, opts: ApplyOptions): void {
    this.db.transaction(() => {
      if (opts.mode === 'replace') {
        // 先显式删 messages：FK 级联删除不触发 FTS 触发器，会留下悬空索引行
        this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
        this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
      }

      let projectId: number | null = null
      if (result.cwd) {
        projectId = this.upsertProject(result.cwd, result.slug, result.lastTs)
      }

      const existing = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
        (SessionRow & { title_source: string | null }) | undefined

      // 标题按来源优先级合并：custom > ai > first-user；同级取最新
      let title: string | null
      let titleSource: string | null
      const incoming: [string, string | null][] = [
        ['custom', result.titleCustom],
        ['ai', result.titleAi],
        ['first-user', result.firstUserText]
      ]
      title = existing?.title ?? null
      titleSource = existing?.title_source ?? null
      for (const [source, value] of incoming) {
        if (value && TITLE_PRIORITY[source] >= (titleSource ? TITLE_PRIORITY[titleSource] : 0)) {
          title = value
          titleSource = source
          break // incoming 已按优先级排列，取最高的一个
        }
      }

      const createdAt =
        existing?.created_at != null
          ? Math.min(existing.created_at, result.firstTs ?? existing.created_at)
          : result.firstTs
      const updatedAt = Math.max(existing?.updated_at ?? 0, result.lastTs ?? 0) || null

      this.db
        .prepare(
          `INSERT INTO sessions (
             id, project_id, title, title_source, created_at, updated_at, message_count,
             model_last, git_branch, input_tokens, output_tokens, cache_read_tokens,
             jsonl_path, jsonl_size, jsonl_offset, cc_version
           ) VALUES (
             @id, @projectId, @title, @titleSource, @createdAt, @updatedAt, @messageCount,
             @modelLast, @gitBranch, @inputTokens, @outputTokens, @cacheReadTokens,
             @jsonlPath, @jsonlSize, @jsonlOffset, @ccVersion
           )
           ON CONFLICT(id) DO UPDATE SET
             project_id = COALESCE(excluded.project_id, project_id),
             title = excluded.title,
             title_source = excluded.title_source,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             message_count = message_count + excluded.message_count,
             model_last = COALESCE(excluded.model_last, model_last),
             git_branch = COALESCE(excluded.git_branch, git_branch),
             input_tokens = input_tokens + excluded.input_tokens,
             output_tokens = output_tokens + excluded.output_tokens,
             cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
             jsonl_path = excluded.jsonl_path,
             jsonl_size = excluded.jsonl_size,
             jsonl_offset = excluded.jsonl_offset,
             cc_version = COALESCE(excluded.cc_version, cc_version)`
        )
        .run({
          id: sessionId,
          projectId,
          title,
          titleSource,
          createdAt,
          updatedAt,
          messageCount: result.messages.length,
          modelLast: result.lastModel,
          gitBranch: result.gitBranch,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cacheReadTokens: result.cacheReadTokens,
          jsonlPath: opts.jsonlPath,
          jsonlSize: opts.fileSize,
          jsonlOffset: opts.newOffset,
          ccVersion: result.ccVersion
        })

      const insertMsg = this.db.prepare(
        `INSERT OR IGNORE INTO messages
           (uuid, session_id, parent_uuid, role, type, ts, content_text, model,
            input_tokens, output_tokens, is_sidechain)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const m of result.messages) {
        insertMsg.run(
          m.uuid,
          sessionId,
          m.parentUuid,
          m.role,
          m.type,
          m.ts,
          // content_text 仅服务 FTS，存 CJK 一元切分后的形态（详情回放另行解析 JSONL）
          segmentCjkForFts(m.contentText),
          m.model,
          m.inputTokens,
          m.outputTokens,
          m.isSidechain ? 1 : 0
        )
      }

      const insertFile = this.db.prepare(
        `INSERT INTO session_files (session_id, path, op, message_uuid, ts)
         VALUES (?, ?, ?, ?, ?)`
      )
      for (const f of result.files) {
        insertFile.run(sessionId, f.path, f.op, f.messageUuid, f.ts)
      }
    })()
  }

  private upsertProject(path: string, slug: string | null, lastActiveAt: number | null): number {
    const row = this.db
      .prepare(
        `INSERT INTO projects (path, slug, last_active_at) VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           slug = COALESCE(excluded.slug, slug),
           last_active_at = MAX(COALESCE(last_active_at, 0), COALESCE(excluded.last_active_at, 0))
         RETURNING id`
      )
      .get(path, slug, lastActiveAt) as { id: number }
    return row.id
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  listSessions(filter?: SessionFilter): SessionSummary[] {
    const rows = this.db
      .prepare(
        `${SUMMARY_SELECT}
         WHERE (@projectId IS NULL OR s.project_id = @projectId)
           AND (@pinnedOnly = 0 OR s.pinned = 1)
         ORDER BY s.pinned DESC, s.updated_at DESC`
      )
      .all({
        projectId: filter?.projectId ?? null,
        pinnedOnly: filter?.pinnedOnly ? 1 : 0
      }) as SessionRow[]
    return rows.map(toSummary)
  }

  getSessionSummary(id: string): SessionSummary | null {
    const row = this.db.prepare(`${SUMMARY_SELECT} WHERE s.id = ?`).get(id) as
      SessionRow | undefined
    return row ? toSummary(row) : null
  }

  getSessionPath(id: string): { jsonlPath: string | null; projectPath: string | null } | null {
    const row = this.db
      .prepare(
        `SELECT s.jsonl_path AS jsonlPath, p.path AS projectPath
         FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`
      )
      .get(id) as { jsonlPath: string | null; projectPath: string | null } | undefined
    return row ?? null
  }

  listProjects(): ProjectSummary[] {
    return this.db
      .prepare(
        `SELECT p.id, p.path, p.slug, p.last_active_at AS lastActiveAt,
                COUNT(s.id) AS sessionCount
         FROM projects p LEFT JOIN sessions s ON s.project_id = p.id
         GROUP BY p.id HAVING COUNT(s.id) > 0
         ORDER BY p.last_active_at DESC`
      )
      .all() as ProjectSummary[]
  }

  updateSessionMeta(id: string, patch: { pinned?: boolean; note?: string }): void {
    if (patch.pinned !== undefined) {
      this.db.prepare('UPDATE sessions SET pinned = ? WHERE id = ?').run(patch.pinned ? 1 : 0, id)
    }
    if (patch.note !== undefined) {
      this.db.prepare('UPDATE sessions SET note = ? WHERE id = ?').run(patch.note, id)
    }
  }

  search(q: string, projectId?: number): SearchHit[] {
    const ftsQuery = toFtsQuery(q)
    if (!ftsQuery) return []
    const rows = this.db
      .prepare(
        `SELECT m.uuid AS messageUuid, m.session_id AS sessionId, m.role, m.ts,
                snippet(messages_fts, 0, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', '…', 14) AS snippet,
                s.title AS sessionTitle, p.path AS projectPath
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         JOIN sessions s ON s.id = m.session_id
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE messages_fts MATCH @q
           AND (@projectId IS NULL OR s.project_id = @projectId)
         ORDER BY rank
         LIMIT 100`
      )
      .all({ q: ftsQuery, projectId: projectId ?? null }) as SearchHit[]
    for (const r of rows) r.snippet = desegmentCjk(r.snippet)
    return rows
  }

  countMessages(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }
    return row.n
  }

  // usageDaily 已随 M8 退役：Dashboard 用量改由 usage_log 全量口径出数（UsageDao，§7.8）
}

/*
 * 中文检索方案（R9 落地，2026-07-04 实测裁决）：
 * unicode61 把连续 CJK 当作单一 token（"性能" 只有被标点隔开才可检索），实测命中率仅为
 * LIKE 基线的 ~1/5。故入索引前对 CJK 按字插空格（一元切分），查询侧同样切分并整体加引号
 * 成短语查询（相邻字组合精确匹配）；snippet 输出再把 CJK 间空格拼回。
 * `simple` 分词器（原生 DLL）留作 backlog，此方案零额外依赖。
 */
const CJK_CLASS = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'
const CJK_CHAR_RE = new RegExp(`[${CJK_CLASS}]`, 'g')
const CJK_TEST_RE = new RegExp(`[${CJK_CLASS}]`)
const CJK_JOIN_RE = new RegExp(
  `([${CJK_CLASS}${SNIPPET_OPEN}${SNIPPET_CLOSE}…]) (?=[${CJK_CLASS}${SNIPPET_OPEN}${SNIPPET_CLOSE}…])`,
  'g'
)

/** 入索引前的 CJK 一元切分（并顺带压缩空白） */
export function segmentCjkForFts(text: string): string {
  return text.replace(CJK_CHAR_RE, ' $& ').replace(/\s+/g, ' ').trim()
}

/** snippet 输出 → 拼回 CJK 之间被切分注入的空格 */
export function desegmentCjk(text: string): string {
  return text.replace(CJK_JOIN_RE, '$1')
}

/** 用户输入 → FTS5 安全查询：过滤引号；含 CJK 的词切分后整体作短语 */
export function toFtsQuery(input: string): string {
  const terms = input
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter(Boolean)
  if (terms.length === 0) return ''
  return terms.map((t) => (CJK_TEST_RE.test(t) ? `"${segmentCjkForFts(t)}"` : `"${t}"`)).join(' ')
}
