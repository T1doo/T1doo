import { describe, expect, it } from 'vitest'
import { buildEsArgs, parseExportedPaths } from '../../src/main/services/indexer/everything'

describe('parseExportedPaths', () => {
  it('剥 BOM、按行拆分、去空行', () => {
    const text = '﻿C:\\a\\b.txt\r\nE:\\仓库\\笔记.md\r\n\r\n'
    expect(parseExportedPaths(text)).toEqual(['C:\\a\\b.txt', 'E:\\仓库\\笔记.md'])
  })

  it('目录行（尾分隔符）滤掉', () => {
    const text = 'C:\\dir\\\r\nC:\\dir\\file.txt\r\nD:/x/\r\n'
    expect(parseExportedPaths(text)).toEqual(['C:\\dir\\file.txt'])
  })

  it('空内容返回空数组', () => {
    expect(parseExportedPaths('')).toEqual([])
    expect(parseExportedPaths('﻿')).toEqual([])
  })
})

describe('buildEsArgs', () => {
  it('files-only + 按修改时间倒序 + UTF-8 导出，查询词逐个成参（不经 shell 拼接）', () => {
    expect(buildEsArgs('plan 笔记', 50, 'C:\\tmp\\out.txt')).toEqual([
      '-n', '50',
      '-sort', 'date-modified-descending',
      '-export-txt', 'C:\\tmp\\out.txt',
      '-utf8-bom',
      'file:',
      'plan',
      '笔记'
    ])
  })

  it('多余空白不产生空参数', () => {
    const args = buildEsArgs('  a   b  ', 10, 'o.txt')
    expect(args.filter((a) => a === '')).toHaveLength(0)
  })
})
