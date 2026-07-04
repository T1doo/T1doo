import { parentPort } from 'worker_threads'
import { streamCompleteLines } from './reader'
import { SessionFileParser, lineToMessageView } from './parser'
import type { ParsedFileResult } from './parser'
import type { MessageView } from '../../../shared/sessions'

/**
 * 解析 worker：所有重解析都在这里做，主线程只写库（§5.1 原则 3）。
 * 请求按序处理（promise 链），保证响应顺序与请求一致。
 */

export type WorkerRequest =
  | { kind: 'parseFile'; reqId: number; path: string; fromOffset: number }
  | { kind: 'parseDetail'; reqId: number; path: string }

export type WorkerResponse =
  | {
      kind: 'fileParsed'
      reqId: number
      result: ParsedFileResult
      newOffset: number
      size: number
    }
  | { kind: 'detailParsed'; reqId: number; messages: MessageView[]; badLines: number }
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
