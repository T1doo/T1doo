import { Worker } from 'worker_threads'
import { watch, type FSWatcher } from 'chokidar'
import { stat } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { discoverSessionFiles, SESSION_FILE_RE } from './discovery'
import type { WorkerRequest, WorkerResponse } from './scan.worker'
import type { SessionsDao, SyncCursor } from '../../db/dao'
import type { SessionDetail, SyncProgress } from '../../../shared/sessions'

export interface ClaudeDataServiceOptions {
  /** ~/.claude/projects */
  projectsDir: string
  dao: SessionsDao
  /** 由入口注入（electron-vite ?modulePath），服务本身不依赖构建产物布局 */
  workerPath: string
  emitProgress: (p: SyncProgress) => void
  emitSessionsUpdated: (sessionIds: string[]) => void
  log: (msg: string) => void
}

const DEBOUNCE_MS = 300

interface PendingRequest {
  resolve: (resp: WorkerResponse) => void
  reject: (err: Error) => void
}

/**
 * F1 心脏：会话发现 + 全量/增量同步（§6.3）。
 * 解析在 worker，写库在主线程（唯一写者）；chokidar 监听追加写，游标只推进到完整行。
 */
export class ClaudeDataService {
  private worker: Worker | null = null
  private pending = new Map<number, PendingRequest>()
  private reqSeq = 0
  private watcher: FSWatcher | null = null
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private cursors = new Map<string, SyncCursor>()
  private processing = new Set<string>()
  /** 处理期间又到达变更 → 记脏，处理完立即补一轮 */
  private dirty = new Map<string, string>()
  private disposed = false

  constructor(private opts: ClaudeDataServiceOptions) {}

  /** 启动：追平磁盘状态（新文件/追加/截断），再开监听 */
  async start(): Promise<void> {
    this.ensureWorker()
    for (const c of this.opts.dao.getCursors()) this.cursors.set(c.id, c)

    const files = await discoverSessionFiles(this.opts.projectsDir)
    const work = files.filter((f) => {
      const cur = this.cursors.get(f.sessionId)
      return !cur || f.size !== cur.jsonlOffset
    })

    this.opts.log(
      `发现 ${files.length} 个主会话文件，需同步 ${work.length} 个（目录：${this.opts.projectsDir}）`
    )
    const startedAt = Date.now()
    const total = work.length
    let done = 0
    this.opts.emitProgress({ phase: total > 0 ? 'syncing' : 'done', done, total })

    const updatedIds: string[] = []
    for (const f of work) {
      if (this.disposed) return
      try {
        await this.syncFile(f.path, f.sessionId)
        updatedIds.push(f.sessionId)
      } catch (err) {
        this.opts.log(`同步失败（跳过）：${f.path} — ${String(err)}`)
      }
      done++
      if (done % 10 === 0 || done === total) {
        this.opts.emitProgress({ phase: 'syncing', done, total, currentFile: basename(f.path) })
        if (updatedIds.length) this.opts.emitSessionsUpdated(updatedIds.splice(0))
      }
    }
    if (updatedIds.length) this.opts.emitSessionsUpdated(updatedIds.splice(0))
    this.opts.emitProgress({ phase: 'done', done, total })
    if (total > 0) {
      this.opts.log(
        `同步完成：${total} 个文件，耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
      )
    }

    this.startWatcher()
  }

  /** 单文件同步：依据游标决定 append / 全量重建（截断即重建） */
  private async syncFile(filePath: string, sessionId: string): Promise<void> {
    if (this.processing.has(sessionId)) {
      this.dirty.set(sessionId, filePath)
      return
    }
    this.processing.add(sessionId)
    try {
      const cur = this.cursors.get(sessionId)
      let fromOffset = cur?.jsonlOffset ?? 0
      let mode: 'replace' | 'append' = cur ? 'append' : 'replace'

      const st = await stat(filePath)
      if (cur && cur.jsonlPath !== filePath) {
        // 同一 sessionId 出现在不同路径（跨 cwd 恢复/文件迁移）→ 以新文件全量重建
        this.opts.log(`会话 ${sessionId} 路径变更，全量重建`)
        fromOffset = 0
        mode = 'replace'
      } else if (cur && st.size < cur.jsonlOffset) {
        // 文件被重写/截断（罕见）→ 回退全量重解析（§6.3 第 3 条）
        this.opts.log(`检测到截断，重建会话 ${sessionId}`)
        fromOffset = 0
        mode = 'replace'
      }
      if (st.size === fromOffset) return

      const resp = await this.request({ kind: 'parseFile', reqId: 0, path: filePath, fromOffset })
      if (resp.kind !== 'fileParsed') {
        throw new Error(resp.kind === 'error' ? resp.message : `意外响应 ${resp.kind}`)
      }
      this.opts.dao.applyFileParse(sessionId, resp.result, {
        mode,
        jsonlPath: filePath,
        newOffset: resp.newOffset,
        fileSize: resp.size
      })
      this.cursors.set(sessionId, {
        id: sessionId,
        jsonlPath: filePath,
        jsonlOffset: resp.newOffset,
        jsonlSize: resp.size
      })
      if (resp.result.badLines > 0) {
        this.opts.log(`会话 ${sessionId}：跳过 ${resp.result.badLines} 行无法解析的数据`)
      }
    } finally {
      this.processing.delete(sessionId)
      const dirtyPath = this.dirty.get(sessionId)
      if (dirtyPath && !this.disposed) {
        this.dirty.delete(sessionId)
        this.scheduleIncremental(dirtyPath, sessionId)
      }
    }
  }

  /** 详情按需解析（worker 内流式全文解析） */
  async getDetail(sessionId: string): Promise<SessionDetail> {
    const summary = this.opts.dao.getSessionSummary(sessionId)
    if (!summary) throw new Error(`会话不存在：${sessionId}`)
    const paths = this.opts.dao.getSessionPath(sessionId)
    if (!paths?.jsonlPath) throw new Error(`会话缺少 JSONL 路径：${sessionId}`)
    const resp = await this.request({
      kind: 'parseDetail',
      reqId: 0,
      path: paths.jsonlPath
    })
    if (resp.kind !== 'detailParsed') {
      throw new Error(resp.kind === 'error' ? resp.message : `意外响应 ${resp.kind}`)
    }
    return { summary, messages: resp.messages, badLineCount: resp.badLines }
  }

  private startWatcher(): void {
    if (this.disposed) return
    // depth:1 → 只到 projects/<slug>/<file>；会话子目录（subagents/wf_*）不进入
    this.watcher = watch(this.opts.projectsDir, {
      depth: 1,
      ignoreInitial: true,
      awaitWriteFinish: false
    })
    const onFsEvent = (filePath: string): void => {
      const name = basename(filePath)
      if (!SESSION_FILE_RE.test(name)) return
      // 双保险：必须正好是 projects/<slug>/<file> 一层
      if (dirname(dirname(filePath)) !== this.opts.projectsDir) return
      this.scheduleIncremental(filePath, name.slice(0, -'.jsonl'.length).toLowerCase())
    }
    this.watcher.on('add', onFsEvent)
    this.watcher.on('change', onFsEvent)
    this.opts.log('增量监听已启动')
  }

  /** 300ms 防抖合并（§6.3 第 3 条） */
  private scheduleIncremental(filePath: string, sessionId: string): void {
    const prev = this.debounceTimers.get(filePath)
    if (prev) clearTimeout(prev)
    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath)
        void this.syncFile(filePath, sessionId)
          .then(() => this.opts.emitSessionsUpdated([sessionId]))
          .catch((err) => this.opts.log(`增量同步失败：${filePath} — ${String(err)}`))
      }, DEBOUNCE_MS)
    )
  }

  // ---------- worker 通道 ----------

  private ensureWorker(): void {
    if (this.worker) return
    const w = new Worker(this.opts.workerPath)
    w.on('message', (resp: WorkerResponse) => {
      const p = this.pending.get(resp.reqId)
      if (!p) return
      this.pending.delete(resp.reqId)
      p.resolve(resp)
    })
    w.on('error', (err) => {
      this.opts.log(`解析 worker 崩溃：${String(err)}`)
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
      this.worker = null // 下次请求时重建
    })
    this.worker = w
  }

  private request(req: WorkerRequest): Promise<WorkerResponse> {
    this.ensureWorker()
    const reqId = ++this.reqSeq
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject })
      this.worker!.postMessage({ ...req, reqId })
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const t of this.debounceTimers.values()) clearTimeout(t)
    this.debounceTimers.clear()
    await this.watcher?.close()
    await this.worker?.terminate()
    this.worker = null
  }
}

export function defaultProjectsDir(homeDir: string): string {
  return join(homeDir, '.claude', 'projects')
}
