import { parentPort } from 'worker_threads'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { buildExcludeSet, extOf } from './scan-rules'
import type { ScannedFile } from '../../db/files-dao'

/**
 * F4 目录扫描 worker：递归遍历订阅目录产出文件条目，分批回传主线程落库（§5.1 原则 3）。
 * 请求按序处理；单个子目录/文件失败（权限等）跳过不中断整轮扫描。
 */

export type ScanRequest = { kind: 'scan'; reqId: number; root: string; excludeDirs: string[] }

export type ScanResponse =
  | { kind: 'batch'; reqId: number; entries: ScannedFile[] }
  | { kind: 'scanDone'; reqId: number; total: number }
  | { kind: 'error'; reqId: number; message: string }

const BATCH_SIZE = 500 // 单批即主线程单次事务的阻塞粒度，宁小勿大
const STAT_CONCURRENCY = 64

const port = parentPort
if (!port) throw new Error('fs-scan.worker 必须以 worker_threads 方式启动')

let chain: Promise<void> = Promise.resolve()

port.on('message', (req: ScanRequest) => {
  chain = chain.then(() => handle(req)).catch(() => undefined)
})

async function handle(req: ScanRequest): Promise<void> {
  try {
    const exclude = buildExcludeSet(req.excludeDirs)
    let batch: ScannedFile[] = []
    let total = 0
    const flush = (): void => {
      if (!batch.length) return
      port!.postMessage({ kind: 'batch', reqId: req.reqId, entries: batch } satisfies ScanResponse)
      batch = []
    }

    // 迭代 DFS：不递归调用，深目录不爆栈；符号链接目录跳过防环
    const stack: string[] = [req.root]
    while (stack.length) {
      const dir = stack.pop()!
      let dirents
      try {
        dirents = await readdir(dir, { withFileTypes: true })
      } catch {
        continue // 无权限/已删除的目录跳过
      }
      const files: { full: string; name: string }[] = []
      for (const d of dirents) {
        const full = join(dir, d.name)
        if (d.isDirectory()) {
          if (!exclude.has(d.name.toLowerCase())) stack.push(full)
        } else if (d.isFile()) {
          files.push({ full, name: d.name })
        }
        // 符号链接/junction：既不入索引也不深入
      }
      // stat 分块并发（吃满 libuv 线程池）：逐个 await 时 10 万文件要 40s+，是全量扫描的头号瓶颈
      for (let i = 0; i < files.length; i += STAT_CONCURRENCY) {
        const chunk = files.slice(i, i + STAT_CONCURRENCY)
        const stats = await Promise.all(
          chunk.map((f) => stat(f.full).catch(() => null)) // stat 失败（竞态删除等）跳过
        )
        for (let j = 0; j < chunk.length; j++) {
          const st = stats[j]
          if (!st) continue
          batch.push({
            path: chunk[j].full,
            name: chunk[j].name,
            ext: extOf(chunk[j].name),
            size: st.size,
            mtime: Math.floor(st.mtimeMs)
          })
          total++
          if (batch.length >= BATCH_SIZE) flush()
        }
      }
    }
    flush()
    port!.postMessage({ kind: 'scanDone', reqId: req.reqId, total } satisfies ScanResponse)
  } catch (err) {
    port!.postMessage({
      kind: 'error',
      reqId: req.reqId,
      message: err instanceof Error ? err.message : String(err)
    } satisfies ScanResponse)
  }
}
