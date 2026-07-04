import { describe, expect, it } from 'vitest'
import { RingBuffer } from '../../src/main/services/terminal/ring-buffer'

describe('RingBuffer（§7.2.1 终端回放缓冲）', () => {
  it('未超限：snapshot 完整拼接', () => {
    const buf = new RingBuffer(1024)
    buf.append('hello ')
    buf.append('world')
    expect(buf.snapshot()).toBe('hello world')
  })

  it('超限：从头部按 chunk 丢弃，保留最近输出', () => {
    const buf = new RingBuffer(10)
    buf.append('aaaa') // 4
    buf.append('bbbb') // 8
    buf.append('cccc') // 12 → 丢 aaaa
    expect(buf.snapshot()).toBe('bbbbcccc')
    expect(buf.size).toBe(8)
  })

  it('单 chunk 即超限：至少保留最新一个 chunk', () => {
    const buf = new RingBuffer(4)
    buf.append('xxxxxxxxxx')
    expect(buf.snapshot()).toBe('xxxxxxxxxx')
  })

  it('多字节字符按 utf8 字节计数', () => {
    const buf = new RingBuffer(7) // 一个汉字 3 字节
    buf.append('中中') // 6
    buf.append('文') // 9 → 丢头
    expect(buf.snapshot()).toBe('文')
  })
})
