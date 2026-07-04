import type { Database } from 'better-sqlite3'
import { toFtsPrefixQuery } from './dao'
import type {
  FileHit,
  FileMetaPatch,
  FileSearchOptions,
  FileSessionRef,
  SessionFileActivity,
  WatchedDir
} from '../../shared/files'

/** 扫描/监听产出的索引条目（worker 与 watcher 共用） */
export interface ScannedFile {
  path: string
  name: string
  ext: string | null
  size: number
  mtime: number
}

interface FileRow {
  path: string
  name: string
  ext: string | null
  size: number | null
  mtime: number | null
  pinned: number | null
  tags: string | null
  sessionCount: number
}

const SEARCH_LIMIT_DEFAULT = 100

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

function toHit(r: FileRow): FileHit {
  return {
    path: r.path,
    name: r.name,
    ext: r.ext,
    size: r.size,
    mtime: r.mtime,
    pinned: (r.pinned ?? 0) !== 0,
    tags: parseTags(r.tags),
    sessionCount: r.sessionCount,
    source: 'index'
  }
}

/**
 * 搜索合并排序（纯函数，FTS 与 LIKE 两路结果去重后统一打分）：
 * 收藏 > 文件名前缀命中 > 文件名包含 > 仅路径命中；同分按 mtime 新在前。
 */
export function rankHits(hits: FileHit[], q: string, limit: number): FileHit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const unique: { hit: FileHit; score: number }[] = []
  for (const hit of hits) {
    const key = hit.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const name = hit.name.toLowerCase()
    let score = hit.pinned ? 1000 : 0
    for (const t of terms) {
      if (name.startsWith(t)) score += 100
      else if (name.includes(t)) score += 50
      else score += 10 // 仅路径命中（进结果集即至少路径匹配）
    }
    unique.push({ hit, score })
  }
  unique.sort((a, b) => b.score - a.score || (b.hit.mtime ?? 0) - (a.hit.mtime ?? 0))
  return unique.slice(0, limit).map((u) => u.hit)
}

/** LIKE 模式转义：\ % _ */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// 每行附带的元数据与联动列（file_meta 精确 join；session_files 反查不分大小写）
const HIT_COLUMNS = `
  f.path, f.name, f.ext, f.size, f.mtime, m.pinned, m.tags,
  (SELECT COUNT(DISTINCT sf.session_id) FROM session_files sf
   WHERE sf.path = f.path COLLATE NOCASE) AS sessionCount`

export class FilesDao {
  constructor(private db: Database) {}

  // ---------- 订阅目录 ----------

  listDirs(): WatchedDir[] {
    const rows = this.db
      .prepare(
        `SELECT w.id, w.path, w.enabled, COUNT(f.id) AS fileCount
         FROM watched_dirs w LEFT JOIN files f ON f.dir_id = w.id
         GROUP BY w.id ORDER BY w.added_at`
      )
      .all() as { id: number; path: string; enabled: number; fileCount: number }[]
    return rows.map((r) => ({ ...r, enabled: r.enabled !== 0 }))
  }

  /** 已存在（含大小写不同）则返回既有行 */
  addDir(path: string, now: number): { id: number; path: string; created: boolean } {
    const normalized = path.replace(/[\\/]+$/, '')
    const existing = this.db
      .prepare('SELECT id, path FROM watched_dirs WHERE path = ? COLLATE NOCASE')
      .get(normalized) as { id: number; path: string } | undefined
    if (existing) return { ...existing, created: false }
    const row = this.db
      .prepare('INSERT INTO watched_dirs (path, enabled, added_at) VALUES (?, 1, ?) RETURNING id')
      .get(normalized, now) as { id: number }
    return { id: row.id, path: normalized, created: true }
  }

  getDir(id: number): { id: number; path: string; enabled: boolean } | null {
    const row = this.db
      .prepare('SELECT id, path, enabled FROM watched_dirs WHERE id = ?')
      .get(id) as { id: number; path: string; enabled: number } | undefined
    return row ? { ...row, enabled: row.enabled !== 0 } : null
  }

  removeDir(id: number): void {
    this.db.transaction(() => {
      // 先显式删 files：FK 级联删除不触发 FTS 触发器（与 messages 同坑）
      this.db.prepare('DELETE FROM files WHERE dir_id = ?').run(id)
      this.db.prepare('DELETE FROM watched_dirs WHERE id = ?').run(id)
    })()
  }

  setDirEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE watched_dirs SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }

  // ---------- 索引写入（主线程独占写库，§5.1 原则 3） ----------

  upsertFiles(dirId: number, batch: ScannedFile[], seenAt: number): void {
    const stmt = this.db.prepare(
      `INSERT INTO files (dir_id, path, name, ext, size, mtime, seen_at)
       VALUES (@dirId, @path, @name, @ext, @size, @mtime, @seenAt)
       ON CONFLICT(path) DO UPDATE SET
         dir_id = excluded.dir_id,
         size = excluded.size,
         mtime = excluded.mtime,
         seen_at = excluded.seen_at`
    )
    this.db.transaction(() => {
      for (const f of batch) stmt.run({ dirId, seenAt, ...f })
    })()
  }

  /** 全量重扫后清掉本轮未见到的行（文件已被删除/移出） */
  pruneDir(dirId: number, seenAt: number): number {
    return this.db
      .prepare('DELETE FROM files WHERE dir_id = ? AND seen_at < ?')
      .run(dirId, seenAt).changes
  }

  removeByPaths(paths: string[]): void {
    const stmt = this.db.prepare('DELETE FROM files WHERE path = ?')
    this.db.transaction(() => {
      for (const p of paths) stmt.run(p)
    })()
  }

  countFiles(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n
  }

  // ---------- 查询 ----------

  search(q: string, opts?: FileSearchOptions): FileHit[] {
    const limit = opts?.limit ?? SEARCH_LIMIT_DEFAULT
    const filters: string[] = []
    const params: Record<string, unknown> = { limit }
    if (opts?.exts?.length) {
      const names = opts.exts.map((e, i) => {
        params[`ext${i}`] = e.toLowerCase()
        return `@ext${i}`
      })
      filters.push(`f.ext IN (${names.join(',')})`)
    }
    if (opts?.mtimeAfter) {
      filters.push('f.mtime >= @mtimeAfter')
      params.mtimeAfter = opts.mtimeAfter
    }
    const extra = filters.length ? `AND ${filters.join(' AND ')}` : ''

    // 两路召回：FTS（词/前缀/CJK 短语，ranked）+ LIKE（词中缀兜底，如 anag 命中 manager）
    const ftsQuery = toFtsPrefixQuery(q)
    const ftsRows = ftsQuery
      ? (this.db
          .prepare(
            `SELECT ${HIT_COLUMNS}
             FROM files_fts
             JOIN files f ON f.id = files_fts.rowid
             JOIN watched_dirs w ON w.id = f.dir_id AND w.enabled = 1
             LEFT JOIN file_meta m ON m.path = f.path
             WHERE files_fts MATCH @fts ${extra}
             ORDER BY rank LIMIT @limit`
          )
          .all({ ...params, fts: ftsQuery }) as FileRow[])
      : []

    const terms = q.split(/\s+/).filter(Boolean)
    let likeRows: FileRow[] = []
    if (terms.length) {
      const conds = terms.map((t, i) => {
        params[`t${i}`] = `%${escapeLike(t)}%`
        return `(f.name LIKE @t${i} ESCAPE '\\' OR f.path LIKE @t${i} ESCAPE '\\')`
      })
      likeRows = this.db
        .prepare(
          `SELECT ${HIT_COLUMNS}
           FROM files f
           JOIN watched_dirs w ON w.id = f.dir_id AND w.enabled = 1
           LEFT JOIN file_meta m ON m.path = f.path
           WHERE ${conds.join(' AND ')} ${extra}
           ORDER BY f.mtime DESC LIMIT @limit`
        )
        .all(params) as FileRow[]
    }

    return rankHits([...ftsRows, ...likeRows].map(toHit), q, limit)
  }

  /** 最近被会话修改的文件流（op ∈ edit/write，按最后动刀时间倒序） */
  activity(limit: number): SessionFileActivity[] {
    const rows = this.db
      .prepare(
        `SELECT g.path, g.lastTs, g.opCount, g.sessionCount,
                last.op AS lastOp, last.session_id AS lastSessionId,
                s.title AS lastSessionTitle, m.pinned, m.tags
         FROM (
           SELECT path, MAX(ts) AS lastTs, COUNT(*) AS opCount,
                  COUNT(DISTINCT session_id) AS sessionCount
           FROM session_files WHERE op IN ('edit', 'write')
           GROUP BY path
         ) g
         JOIN session_files last
           ON last.path = g.path AND last.ts = g.lastTs AND last.op IN ('edit', 'write')
         JOIN sessions s ON s.id = last.session_id
         LEFT JOIN file_meta m ON m.path = g.path
         GROUP BY g.path
         ORDER BY g.lastTs DESC LIMIT ?`
      )
      .all(limit) as {
      path: string
      lastTs: number | null
      opCount: number
      sessionCount: number
      lastOp: string
      lastSessionId: string
      lastSessionTitle: string | null
      pinned: number | null
      tags: string | null
    }[]
    return rows.map((r) => ({
      path: r.path,
      name: basename(r.path),
      lastOp: r.lastOp,
      lastTs: r.lastTs,
      opCount: r.opCount,
      sessionCount: r.sessionCount,
      lastSessionId: r.lastSessionId,
      lastSessionTitle: r.lastSessionTitle,
      pinned: (r.pinned ?? 0) !== 0,
      tags: parseTags(r.tags)
    }))
  }

  /** 反查：这个文件被哪些会话动过（F4 验收①） */
  sessionsForFile(path: string): FileSessionRef[] {
    return this.db
      .prepare(
        `SELECT sf.session_id AS sessionId,
                COALESCE(s.title, '(未命名会话)') AS title,
                p.path AS projectPath,
                SUM(sf.op = 'edit') AS editCount,
                SUM(sf.op = 'write') AS writeCount,
                SUM(sf.op = 'read') AS readCount,
                MIN(sf.ts) AS firstTs, MAX(sf.ts) AS lastTs
         FROM session_files sf
         JOIN sessions s ON s.id = sf.session_id
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE sf.path = ? COLLATE NOCASE
         GROUP BY sf.session_id
         ORDER BY lastTs DESC`
      )
      .all(path) as FileSessionRef[]
  }

  pinnedFiles(): FileHit[] {
    const rows = this.db
      .prepare(
        `SELECT m.path, COALESCE(f.name, '') AS name, f.ext, f.size, f.mtime,
                m.pinned, m.tags,
                (SELECT COUNT(DISTINCT sf.session_id) FROM session_files sf
                 WHERE sf.path = m.path COLLATE NOCASE) AS sessionCount
         FROM file_meta m LEFT JOIN files f ON f.path = m.path
         WHERE m.pinned = 1
         ORDER BY COALESCE(f.mtime, m.last_opened_at) DESC`
      )
      .all() as FileRow[]
    return rows.map((r) => toHit({ ...r, name: r.name || basename(r.path) }))
  }

  recentOpened(limit: number): FileHit[] {
    const rows = this.db
      .prepare(
        `SELECT m.path, COALESCE(f.name, '') AS name, f.ext, f.size, f.mtime,
                m.pinned, m.tags,
                (SELECT COUNT(DISTINCT sf.session_id) FROM session_files sf
                 WHERE sf.path = m.path COLLATE NOCASE) AS sessionCount
         FROM file_meta m LEFT JOIN files f ON f.path = m.path
         WHERE m.last_opened_at IS NOT NULL
         ORDER BY m.last_opened_at DESC LIMIT ?`
      )
      .all(limit) as FileRow[]
    return rows.map((r) => toHit({ ...r, name: r.name || basename(r.path) }))
  }

  /** Everything 等索引外结果的装饰：补 pinned/tags/sessionCount */
  decorate(paths: string[]): Map<string, { pinned: boolean; tags: string[]; sessionCount: number }> {
    const meta = this.db.prepare('SELECT pinned, tags FROM file_meta WHERE path = ?')
    const count = this.db.prepare(
      'SELECT COUNT(DISTINCT session_id) AS n FROM session_files WHERE path = ? COLLATE NOCASE'
    )
    const out = new Map<string, { pinned: boolean; tags: string[]; sessionCount: number }>()
    for (const p of paths) {
      const m = meta.get(p) as { pinned: number; tags: string } | undefined
      const n = (count.get(p) as { n: number }).n
      out.set(p, { pinned: (m?.pinned ?? 0) !== 0, tags: parseTags(m?.tags ?? null), sessionCount: n })
    }
    return out
  }

  // ---------- 收藏 / 标签 / 打开记录 ----------

  setMeta(path: string, patch: FileMetaPatch): void {
    this.db
      .prepare(
        `INSERT INTO file_meta (path, pinned, tags) VALUES (@path, @pinned, @tags)
         ON CONFLICT(path) DO UPDATE SET
           pinned = COALESCE(@pinnedUpd, pinned),
           tags = COALESCE(@tagsUpd, tags)`
      )
      .run({
        path,
        pinned: patch.pinned ? 1 : 0,
        tags: JSON.stringify(patch.tags ?? []),
        pinnedUpd: patch.pinned === undefined ? null : patch.pinned ? 1 : 0,
        tagsUpd: patch.tags === undefined ? null : JSON.stringify(patch.tags)
      })
  }

  recordOpen(path: string, ts: number): void {
    this.db
      .prepare(
        `INSERT INTO file_meta (path, open_count, last_opened_at) VALUES (?, 1, ?)
         ON CONFLICT(path) DO UPDATE SET
           open_count = open_count + 1, last_opened_at = excluded.last_opened_at`
      )
      .run(path, ts)
  }
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i >= 0 ? path.slice(i + 1) : path
}
