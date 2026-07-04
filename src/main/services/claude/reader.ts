import { createReadStream } from 'fs'
import { stat } from 'fs/promises'

export interface StreamLinesResult {
  /** 只推进到最后一个完整 \n 之后（§6.3：尾部残行不消费，留待下次） */
  newOffset: number
  /** 本次观察到的文件字节长 */
  size: number
}

const NL = 0x0a

/**
 * 从 fromOffset 起流式读取完整行。按字节切分后再解码，避免多字节字符跨 chunk 被读坏。
 */
export async function streamCompleteLines(
  filePath: string,
  fromOffset: number,
  onLine: (line: string) => void,
  chunkSize?: number
): Promise<StreamLinesResult> {
  const st = await stat(filePath)
  if (st.size <= fromOffset) return { newOffset: fromOffset, size: st.size }

  let consumed = fromOffset // 已消费到的绝对偏移（最后一个 \n 之后）
  let remainder: Buffer = Buffer.alloc(0)
  let first = fromOffset === 0

  const stream = createReadStream(filePath, {
    start: fromOffset,
    ...(chunkSize ? { highWaterMark: chunkSize } : {})
  })
  for await (const chunk of stream) {
    const buf = remainder.length ? Buffer.concat([remainder, chunk as Buffer]) : (chunk as Buffer)
    // 残余段里必无 \n（上一轮已切走），从其末尾开始找即可
    let nlIndex = buf.indexOf(NL, remainder.length)
    let lineStart = 0
    while (nlIndex !== -1) {
      let line = buf.toString('utf8', lineStart, nlIndex)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (first) {
        if (line.charCodeAt(0) === 0xfeff) line = line.slice(1) // BOM
        first = false
      }
      onLine(line)
      consumed += nlIndex - lineStart + 1
      lineStart = nlIndex + 1
      nlIndex = buf.indexOf(NL, lineStart)
    }
    remainder = buf.subarray(lineStart) // 残行不推进游标，留待下次补齐
  }

  return { newOffset: consumed, size: st.size }
}
