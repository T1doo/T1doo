import { Worker } from 'worker_threads'
import { watch, type FSWatcher } from 'chokidar'
import { readdir, stat } from 'fs/promises'
import { basename, join, relative, sep } from 'path'
import type { WorkerRequest, WorkerResponse } from '../claude/scan.worker'
import type { UsageDao, UsageInsertRow } from '../../db/usage-dao'
import type { UsageScanState, UsageSource } from '../../../shared/usage'

/**
 * F9 用量采集管道（§7.8.2）：独立轻量扫描器，覆盖顶层主会话 + subagents/wf_* 全部 JSONL。
 * 与 F1 完全解耦——自持 worker（首扫与 F1 初始同步并行）、自持 usage_sync 游标、
 * 自持 chokidar（depth 放宽到会话子目录）；不建 FTS、不进 messages 表，
 * 不动「subagents 不入索引」裁决（§6.3-0）。usage_log 按 message.id REPLACE，重放幂等。
 */

const DEBOUNCE_MS = 300
const EMIT_DEBOUNCE_MS = 300
/** 首扫期间每处理 N 个文件推一次 evt:usage:updated（UI 数字渐进刷新） */
const SCAN_EMIT_EVERY = 25

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_JSONL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i

export interface DiscoveredUsageFile {
  path: string
  size: number
  mtimeMs: number
  source: UsageSource
  sessionId: string
}

/**
 * 路径 → 来源分类（纯函数，单测直测）：
 * projects/<slug>/<uuid>.jsonl                          → session
 * projects/<slug>/<uuid>/subagents/**（含 workflows 段） → workflow
 * projects/<slug>/<uuid>/**（其余子目录文件）            → subagent
 * 其余（memory/ 等非 uuid 目录、非 .jsonl）              → null
 */
export function classifyUsageFile(
  projectsDir: string,
  filePath: string
): { source: UsageSource; sessionId: string } | null {
  const rel = relative(projectsDir, filePath)
  if (rel.startsWith('..')) return null
  const parts = rel.split(sep)
  const name = parts[parts.length - 1]
  if (!name.toLowerCase().endsWith('.jsonl')) return null
  if (parts.length === 2) {
    if (!SESSION_JSONL_RE.test(name)) return null
    return { source: 'session', sessionId: name.slice(0, -'.jsonl'.length).toLowerCase() }
  }
  if (parts.length < 3 || !UUID_RE.test(parts[1])) return null
  const source: UsageSource = parts.includes('workflows') ? 'workflow' : 'subagent'
  return { source, sessionId: parts[1].toLowerCase() }
}

/** 全量发现：顶层 <uuid>.jsonl + <uuid>/ 会话子目录递归 *.jsonl */
export async function discoverUsageFiles(projectsDir: string): Promise<DiscoveredUsageFile[]> {
  const out: DiscoveredUsageFile[] = []
  let slugs: string[]
  try {
    slugs = (await readdir(projectsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return out // 目录不存在（未装 Claude Code）→ 空结果
  }

  const pushFile = async (filePath: string): Promise<void> => {
    const cls = classifyUsageFile(projectsDir, filePath)
    if (!cls) return
    try {
      const st = await stat(filePath)
      out.push({ path: filePath, size: st.size, mtimeMs: st.mtimeMs, ...cls })
    } catch {
      // stat 竞态（文件刚被移走）→ 跳过
    }
  }

  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile() && e.name.toLowerCase().endsWith('.jsonl')) await pushFile(p)
    }
  }

  for (const slug of slugs) {
    const dir = join(projectsDir, slug)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isFile() && SESSION_JSONL_RE.test(e.name)) {
        await pushFile(join(dir, e.name))
      } else if (e.isDirectory() && UUID_RE.test(e.name)) {
        await walk(join(dir, e.name))
      }
    }
  }
  return out
}

export interface UsageServiceOptions {
  /** ~/.claude/projects */
  projectsDir: string
  dao: UsageDao
  /** 与 F1 同一 worker 脚本（electron-vite ?modulePath），但独立实例 */
  workerPath: string
  emitUpdated: () => void
  log: (msg: string) => void
}

interface PendingRequest {
  resolve: (resp: WorkerResponse) => void
  reject: (err: Error) => void
}

export class UsageService {
  private worker: Worker | null = null
  private pending = new Map<number, PendingRequest>()
  private reqSeq = 0
  private watcher: FSWatcher | null = null
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private emitTimer: NodeJS.Timeout | null = null
  private cursors = new Map<string, { mtimeMs: number; byteOffset: number }>()
  private processing = new Set<string>()
  private dirty = new Set<string>()
  private disposed = false

  private scanning = false
  private scannedFiles = 0
  private totalFiles = 0
  private lastFullScanMs: number | null = null

  constructor(private opts: UsageServiceOptions) {}

  /** 启动：播种价目 → 追平磁盘（新文件/追加/截断）→ 开监听。全程后台，不阻塞首屏。 */
  async start(): Promise<void> {
    this.opts.dao.ensureBuiltinPricing()
    this.ensureWorker()
    for (const c of this.opts.dao.getSyncCursors()) {
      this.cursors.set(c.filePath, { mtimeMs: c.mtimeMs, byteOffset: c.byteOffset })
    }

    const startedAt = Date.now()
    const files = await discoverUsageFiles(this.opts.projectsDir)
    const work = files.filter((f) => f.size !== this.cursors.get(f.path)?.byteOffset)
    this.scanning = true
    this.scannedFiles = 0
    this.totalFiles = work.length
    this.opts.log(`用量扫描：发现 ${files.length} 个 JSONL，需同步 ${work.length} 个`)

    for (const f of work) {
      if (this.disposed) return
      try {
        await this.syncFile(f.path)
      } catch (err) {
        this.opts.log(`用量同步失败（跳过）：${f.path} — ${String(err)}`)
      }
      this.scannedFiles++
      if (this.scannedFiles % SCAN_EMIT_EVERY === 0) this.opts.emitUpdated()
    }
    this.scanning = false
    this.lastFullScanMs = Date.now() - startedAt
    if (work.length > 0) {
      this.opts.log(`用量扫描完成：${work.length} 个文件，耗时 ${(this.lastFullScanMs / 1000).toFixed(1)}s`)
    }
    this.opts.emitUpdated()
    this.startWatcher()
  }

  scanState(): UsageScanState {
    return {
      scanning: this.scanning,
      scannedFiles: this.scannedFiles,
      totalFiles: this.totalFiles,
      lastFullScanMs: this.lastFullScanMs,
      rowCount: this.opts.dao.rowCount()
    }
  }

  /** 面板来源实时写入（api:<messageId> / cli:<sessionId>:<turn>，§7.8.2 第 4 条） */
  recordPanel(row: UsageInsertRow): void {
    this.opts.dao.insertRows([row])
    this.scheduleEmit()
  }

  // ---------- 单文件同步 ----------

  private async syncFile(filePath: string): Promise<void> {
    if (this.processing.has(filePath)) {
      this.dirty.add(filePath)
      return
    }
    this.processing.add(filePath)
    try {
      const cls = classifyUsageFile(this.opts.projectsDir, filePath)
      if (!cls) return
      let st
      try {
        st = await stat(filePath)
      } catch {
        return // 文件已被移走
      }
      const cur = this.cursors.get(filePath)
      let fromOffset = cur?.byteOffset ?? 0
      if (st.size < fromOffset) fromOffset = 0 // 截断 → 重读（REPLACE 幂等）
      if (st.size === fromOffset) return

      const resp = await this.request({ kind: 'parseUsage', reqId: 0, path: filePath, fromOffset })
      if (resp.kind !== 'usageParsed') {
        throw new Error(resp.kind === 'error' ? resp.message : `意外响应 ${resp.kind}`)
      }
      this.opts.dao.insertRows(
        resp.rows.map(
          (r): UsageInsertRow => ({
            messageId: r.messageId,
            sessionId: r.sessionId ?? cls.sessionId,
            projectPath: r.cwd,
            model: r.model,
            ts: r.ts,
            input: r.input,
            output: r.output,
            cacheRead: r.cacheRead,
            cacheCreation: r.cacheCreation,
            stopReason: r.stopReason,
            source: cls.source
          })
        )
      )
      this.opts.dao.setSyncCursor(filePath, st.mtimeMs, resp.newOffset)
      this.cursors.set(filePath, { mtimeMs: st.mtimeMs, byteOffset: resp.newOffset })
    } finally {
      this.processing.delete(filePath)
      if (this.dirty.delete(filePath) && !this.disposed) this.scheduleIncremental(filePath)
    }
  }

  // ---------- 监听（放宽到会话子目录；仅本服务消费该 depth，F1 仍只看顶层） ----------

  private startWatcher(): void {
    if (this.disposed) return
    this.watcher = watch(this.opts.projectsDir, {
      depth: 6, // projects/<slug>/<uuid>/subagents/workflows/wf_*/agent-*.jsonl
      ignoreInitial: true,
      awaitWriteFinish: false
    })
    const onFsEvent = (filePath: string): void => {
      if (!basename(filePath).toLowerCase().endsWith('.jsonl')) return
      if (!classifyUsageFile(this.opts.projectsDir, filePath)) return
      this.scheduleIncremental(filePath)
    }
    this.watcher.on('add', onFsEvent)
    this.watcher.on('change', onFsEvent)
    this.opts.log('用量增量监听已启动')
  }

  private scheduleIncremental(filePath: string): void {
    const prev = this.debounceTimers.get(filePath)
    if (prev) clearTimeout(prev)
    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath)
        void this.syncFile(filePath)
          .then(() => this.scheduleEmit())
          .catch((err) => this.opts.log(`用量增量失败：${filePath} — ${String(err)}`))
      }, DEBOUNCE_MS)
    )
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.opts.emitUpdated()
    }, EMIT_DEBOUNCE_MS)
  }

  // ---------- worker 通道（与 F1 同款，独立实例） ----------

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
      this.opts.log(`用量解析 worker 崩溃：${String(err)}`)
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
    if (this.emitTimer) clearTimeout(this.emitTimer)
    await this.watcher?.close()
    await this.worker?.terminate()
    this.worker = null
  }
}
