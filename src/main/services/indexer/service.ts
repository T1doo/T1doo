import { Worker } from 'worker_threads'
import { watch, type FSWatcher } from 'chokidar'
import { stat } from 'fs/promises'
import { basename, relative } from 'path'
import { buildExcludeSet, extOf, isExcludedRelPath } from './scan-rules'
import type { ScanRequest, ScanResponse } from './fs-scan.worker'
import type { FilesDao, ScannedFile } from '../../db/files-dao'
import type { FilesIndexProgress, WatchedDir } from '../../../shared/files'

export interface IndexerServiceOptions {
  dao: FilesDao
  /** 由入口注入（electron-vite ?modulePath） */
  workerPath: string
  getExcludeDirs: () => string[]
  emitProgress: (p: FilesIndexProgress) => void
  emitFilesUpdated: () => void
  log: (msg: string) => void
}

/** watcher 事件合并窗口：新建/改名 2s 内可搜的预算下留足落库余量（验收③） */
const FLUSH_MS = 400

interface PendingScan {
  onBatch: (entries: ScannedFile[]) => void
  resolve: (total: number) => void
  reject: (err: Error) => void
}

type PendingFsEvent = { op: 'upsert'; dirId: number; entry: ScannedFile } | { op: 'remove' }

/**
 * F4 · 订阅目录索引服务（§7.4 第一层）：
 * worker 扫描 + chokidar 增量，解析在 worker、写库全部在主线程（唯一写者）。
 */
export class IndexerService {
  scanning = false
  private worker: Worker | null = null
  private pending = new Map<number, PendingScan>()
  private reqSeq = 0
  private watchers = new Map<number, FSWatcher>()
  private pendingFs = new Map<string, PendingFsEvent>()
  private flushTimer: NodeJS.Timeout | null = null
  private scanChain: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(private opts: IndexerServiceOptions) {}

  /** 启动：全部启用目录先开监听（不漏事件），再排队全量重扫（追平离线变更） */
  start(): void {
    const dirs = this.opts.dao.listDirs().filter((d) => d.enabled)
    for (const d of dirs) this.watchDir(d.id, d.path)
    for (const d of dirs) this.enqueueScan(d.id, d.path)
  }

  listDirs(): WatchedDir[] {
    return this.opts.dao.listDirs()
  }

  addDir(path: string): void {
    const { id, created } = this.opts.dao.addDir(path, Date.now())
    if (!created) {
      this.opts.dao.setDirEnabled(id, true)
    }
    const dir = this.opts.dao.getDir(id)!
    this.watchDir(dir.id, dir.path)
    this.enqueueScan(dir.id, dir.path)
  }

  removeDir(id: number): void {
    this.unwatch(id)
    this.opts.dao.removeDir(id)
    this.opts.emitFilesUpdated()
  }

  setDirEnabled(id: number, enabled: boolean): void {
    this.opts.dao.setDirEnabled(id, enabled)
    const dir = this.opts.dao.getDir(id)
    if (!dir) return
    if (enabled) {
      this.watchDir(dir.id, dir.path)
      this.enqueueScan(dir.id, dir.path)
    } else {
      this.unwatch(id)
      this.opts.emitFilesUpdated() // 行保留但搜索按 enabled 过滤，视图需刷新
    }
  }

  /** 手动/排除规则变更后重扫；缺省全部启用目录 */
  rescan(dirId?: number): void {
    const dirs = this.opts.dao.listDirs().filter((d) => d.enabled && (!dirId || d.id === dirId))
    for (const d of dirs) this.enqueueScan(d.id, d.path)
  }

  /** 排除规则变更：重建监听（ignored 闭包持有旧规则）+ 重扫 */
  onExcludeDirsChanged(): void {
    for (const [id] of this.watchers) {
      const dir = this.opts.dao.getDir(id)
      this.unwatch(id)
      if (dir) this.watchDir(dir.id, dir.path)
    }
    this.rescan()
  }

  // ---------- 全量扫描（worker） ----------

  private enqueueScan(dirId: number, root: string): void {
    this.scanChain = this.scanChain
      .then(() => this.scanDir(dirId, root))
      .catch((err) => this.opts.log(`扫描失败（跳过）：${root} — ${String(err)}`))
  }

  private async scanDir(dirId: number, root: string): Promise<void> {
    if (this.disposed) return
    this.scanning = true
    const startedAt = Date.now()
    const seenAt = startedAt
    let scanned = 0
    let slowest = 0
    try {
      const total = await this.requestScan(
        { kind: 'scan', reqId: 0, root, excludeDirs: this.opts.getExcludeDirs() },
        (entries) => {
          // 每个 worker message 一个事务，事务间自然回到事件循环（IPC 插队公平性交给 loop），
          // 前台 UI 停顿上界=单批 500 行事务耗时（压测实测 ~60ms）。不做 setTimeout/setImmediate
          // 人工让位、也不做 worker ack 背压：进程被打入后台效率模式（EcoQoS）时消息泵唤醒
          // 是秒级的，任何依赖唤醒延迟的节流手段都会把 19s 扫描拖到分钟级（M4 压测实证）
          const t = Date.now()
          this.opts.dao.upsertFiles(dirId, entries, seenAt)
          slowest = Math.max(slowest, Date.now() - t)
          scanned += entries.length
          this.opts.emitProgress({ dirId, phase: 'scanning', scanned })
        }
      )
      const pruned = this.opts.dao.pruneDir(dirId, seenAt)
      this.opts.emitProgress({ dirId, phase: 'done', scanned: total })
      this.opts.emitFilesUpdated()
      this.opts.log(
        `扫描完成：${root} — ${total} 个文件（清理 ${pruned} 行），耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s，最慢单批落库 ${slowest}ms`
      )
    } finally {
      this.scanning = false
    }
  }

  private requestScan(
    req: ScanRequest,
    onBatch: (entries: ScannedFile[]) => void
  ): Promise<number> {
    this.ensureWorker()
    const reqId = ++this.reqSeq
    return new Promise<number>((resolve, reject) => {
      this.pending.set(reqId, { onBatch, resolve, reject })
      this.worker!.postMessage({ ...req, reqId })
    })
  }

  private ensureWorker(): void {
    if (this.worker) return
    const w = new Worker(this.opts.workerPath)
    w.on('message', (resp: ScanResponse) => {
      const p = this.pending.get(resp.reqId)
      if (!p) return
      if (resp.kind === 'batch') {
        p.onBatch(resp.entries)
        return
      }
      this.pending.delete(resp.reqId)
      if (resp.kind === 'scanDone') p.resolve(resp.total)
      else p.reject(new Error(resp.message))
    })
    w.on('error', (err) => {
      this.opts.log(`扫描 worker 崩溃：${String(err)}`)
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
      this.worker = null // 下次请求时重建
    })
    this.worker = w
  }

  // ---------- 增量监听（chokidar） ----------

  private watchDir(dirId: number, root: string): void {
    if (this.disposed || this.watchers.has(dirId)) return
    const exclude = buildExcludeSet(this.opts.getExcludeDirs())
    const watcher = watch(root, {
      ignoreInitial: true,
      ignored: (p) => isExcludedRelPath(relative(root, p), exclude)
    })
    const onUpsert = (filePath: string): void => {
      void stat(filePath)
        .then((st) => {
          if (!st.isFile()) return
          const name = basename(filePath)
          this.queueFsEvent(filePath, {
            op: 'upsert',
            dirId,
            entry: {
              path: filePath,
              name,
              ext: extOf(name),
              size: st.size,
              mtime: Math.floor(st.mtimeMs)
            }
          })
        })
        .catch(() => undefined) // 事件到达前已删除
    }
    watcher.on('add', onUpsert)
    watcher.on('change', onUpsert)
    watcher.on('unlink', (p) => this.queueFsEvent(p, { op: 'remove' }))
    watcher.on('error', (err) => this.opts.log(`监听错误：${root} — ${String(err)}`))
    this.watchers.set(dirId, watcher)
  }

  private unwatch(dirId: number): void {
    const w = this.watchers.get(dirId)
    if (!w) return
    this.watchers.delete(dirId)
    void w.close()
  }

  private queueFsEvent(path: string, evt: PendingFsEvent): void {
    this.pendingFs.set(path, evt)
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flushFsEvents()
    }, FLUSH_MS)
  }

  private flushFsEvents(): void {
    if (this.disposed || this.pendingFs.size === 0) return
    const events = [...this.pendingFs.entries()]
    this.pendingFs.clear()
    const removes = events.filter(([, e]) => e.op === 'remove').map(([p]) => p)
    const upserts = new Map<number, ScannedFile[]>()
    for (const [, e] of events) {
      if (e.op !== 'upsert') continue
      const list = upserts.get(e.dirId) ?? []
      list.push(e.entry)
      upserts.set(e.dirId, list)
    }
    const now = Date.now()
    for (const [dirId, entries] of upserts) this.opts.dao.upsertFiles(dirId, entries, now)
    if (removes.length) this.opts.dao.removeByPaths(removes)
    this.opts.emitFilesUpdated()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    await Promise.all([...this.watchers.values()].map((w) => w.close()))
    this.watchers.clear()
    await this.worker?.terminate()
    this.worker = null
  }
}
