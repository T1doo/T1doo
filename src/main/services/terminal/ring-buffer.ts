/**
 * 终端输出环形缓冲（§7.2.1）：按字节上限截断头部，用于标签切换/attach 回放。
 * 以 chunk 为粒度丢弃（不精确到字节），实现简单且误差 ≤ 单 chunk。
 */
export class RingBuffer {
  private chunks: string[] = []
  private bytes = 0

  constructor(private readonly maxBytes = 5 * 1024 * 1024) {}

  append(data: string): void {
    this.chunks.push(data)
    this.bytes += Buffer.byteLength(data, 'utf8')
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!
      this.bytes -= Buffer.byteLength(dropped, 'utf8')
    }
  }

  snapshot(): string {
    return this.chunks.join('')
  }

  get size(): number {
    return this.bytes
  }
}
