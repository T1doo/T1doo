import { parentPort } from 'worker_threads'
import { streamCompleteLines } from './reader'
import { SessionFileParser, lineToMessageView } from './parser'
import type { ParsedFileResult } from './parser'
import { parseUsageLine, type UsageLineRow } from '../usage/usage-line'
import type { MessageView } from '../../../shared/sessions'

/**
 * 解析 worker：所有重解析都在这里做，主线程只写库（§5.1 原则 3）。
 * 请求按序处理（promise 链），保证响应顺序与请求一致。
 * F1 与用量扫描器各持一个本脚本实例（互不阻塞，首扫并行）。
 */

export type WorkerRequest =
  | { kind: 'parseFile'; reqId: number; path: string; fromOffset: number }
  | { kind: 'parseDetail'; reqId: number; path: string }
  /** 用量轻量扫描（§7.8.2）：只提取 assistant 行的 usage 四元组，不建 FTS、不存正文 */
  | { kind: 'parseUsage'; reqId: number; path: string; fromOffset: number }

export type WorkerResponse =
  | {
      kind: 'fileParsed'
      reqId: number
      result: ParsedFileResult
      newOffset: number
      size: number
    }
  | { kind: 'detailParsed'; reqId: number; messages: MessageView[]; badLines: number }
  | { kind: 'usageParsed'; reqId: number; rows: UsageLineRow[]; newOffset: number; size: number }
  | { kind: 'error'; reqId: number; message: string }

const port = parentPort
if (!port) throw new Error('scan.worker 必须以 worker_threads 方式启动')

let chain: Promise<void> = Promise.resolve()

port.on('message', (req: WorkerRequest) => {
  chain = chain.then(() => handle(req)).catch(() => undefined)
})

async function handle(req: WorkerRequest): Promise<void> {
  try {
    if (req.kind === 'parseFile') {
      const parser = new SessionFileParser()
      const { newOffset, size } = await streamCompleteLines(req.path, req.fromOffset, (line) =>
        parser.feedLine(line)
      )
      const resp: WorkerResponse = {
        kind: 'fileParsed',
        reqId: req.reqId,
        result: parser.result(),
        newOffset,
        size
      }
      port!.postMessage(resp)
    } else if (req.kind === 'parseDetail') {
      const messages: MessageView[] = []
      let badLines = 0
      await streamCompleteLines(req.path, 0, (line) => {
        const view = lineToMessageView(line)
        if (view === 'bad') badLines++
        else if (view) messages.push(view)
      })
      const resp: WorkerResponse = { kind: 'detailParsed', reqId: req.reqId, messages, badLines }
      port!.postMessage(resp)
    } else if (req.kind === 'parseUsage') {
      const rows: UsageLineRow[] = []
      const { newOffset, size } = await streamCompleteLines(req.path, req.fromOffset, (line) => {
        const row = parseUsageLine(line)
        if (row) rows.push(row)
      })
      const resp: WorkerResponse = { kind: 'usageParsed', reqId: req.reqId, rows, newOffset, size }
      port!.postMessage(resp)
    }
  } catch (err) {
    const resp: WorkerResponse = {
      kind: 'error',
      reqId: req.reqId,
      message: err instanceof Error ? err.message : String(err)
    }
    port!.postMessage(resp)
  }
}
