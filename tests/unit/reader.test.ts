import { describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { streamCompleteLines } from '../../src/main/services/claude/reader'

function tmpFile(content: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 't1doo-reader-'))
  const p = join(dir, 'sample.jsonl')
  writeFileSync(p, content)
  return p
}

async function collect(
  path: string,
  fromOffset: number,
  chunkSize?: number
): Promise<{ lines: string[]; newOffset: number; size: number }> {
  const lines: string[] = []
  const r = await streamCompleteLines(path, fromOffset, (l) => lines.push(l), chunkSize)
  return { lines, ...r }
}

describe('streamCompleteLines（§6.3 半行处理）', () => {
  it('尾部残行不消费：游标只推进到最后一个完整 \\n', async () => {
    const complete = '{"a":1}\n{"b":2}\n'
    const partial = '{"c":3' // 写到一半
    const p = tmpFile(complete + partial)

    const r1 = await collect(p, 0)
    expect(r1.lines).toEqual(['{"a":1}', '{"b":2}'])
    expect(r1.newOffset).toBe(Buffer.byteLength(complete))

    // 追加补齐残行 + 新行 → 从游标续读，半行完整拼出
    appendFileSync(p, '}\n{"d":4}\n')
    const r2 = await collect(p, r1.newOffset)
    expect(r2.lines).toEqual(['{"c":3}', '{"d":4}'])
    expect(r2.newOffset).toBe(r2.size)
  })

  it('CRLF 行尾与 BOM 剥离', async () => {
    const p = tmpFile('﻿{"a":1}\r\n{"b":2}\r\n')
    const r = await collect(p, 0)
    expect(r.lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('多字节 UTF-8 字符跨 chunk 边界不读坏', async () => {
    const line = `{"text":"${'中文测试🎯'.repeat(50)}"}`
    const p = tmpFile(`${line}\n${line}\n`)
    // 用 7 字节的 chunk 强制在多字节字符中间切开
    const r = await collect(p, 0, 7)
    expect(r.lines).toEqual([line, line])
  })

  it('offset 等于文件长度 → 无事发生', async () => {
    const content = '{"a":1}\n'
    const p = tmpFile(content)
    const r = await collect(p, Buffer.byteLength(content))
    expect(r.lines).toEqual([])
    expect(r.newOffset).toBe(Buffer.byteLength(content))
  })
})
