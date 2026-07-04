import { describe, expect, it } from 'vitest'
import {
  buildExcludeSet,
  extOf,
  isExcludedRelPath
} from '../../src/main/services/indexer/scan-rules'

describe('buildExcludeSet', () => {
  it('小写归一并丢弃空白项', () => {
    const set = buildExcludeSet(['Node_Modules', ' .git ', '', '  '])
    expect(set.has('node_modules')).toBe(true)
    expect(set.has('.git')).toBe(true)
    expect(set.size).toBe(2)
  })
})

describe('isExcludedRelPath', () => {
  const set = buildExcludeSet(['node_modules', '.git', 'dist', 'System Volume Information'])

  it('任一路径段命中即排除（不分大小写、两种分隔符）', () => {
    expect(isExcludedRelPath('node_modules', set)).toBe(true)
    expect(isExcludedRelPath('src\\NODE_MODULES\\pkg\\index.js', set)).toBe(true)
    expect(isExcludedRelPath('a/b/.git/HEAD', set)).toBe(true)
    expect(isExcludedRelPath('System Volume Information\\x', set)).toBe(true)
  })

  it('部分匹配不算：目录名必须整段相等', () => {
    expect(isExcludedRelPath('src\\node_modules_backup\\a.ts', set)).toBe(false)
    expect(isExcludedRelPath('distribution\\a.ts', set)).toBe(false)
    expect(isExcludedRelPath('src\\main\\index.ts', set)).toBe(false)
  })

  it('根本身（空相对路径）不排除', () => {
    expect(isExcludedRelPath('', set)).toBe(false)
  })
})

describe('extOf', () => {
  it('常规扩展名小写化', () => {
    expect(extOf('Report.PDF')).toBe('pdf')
    expect(extOf('a.test.ts')).toBe('ts')
  })

  it('无扩展名 / 点开头 / 点结尾返回 null', () => {
    expect(extOf('Makefile')).toBeNull()
    expect(extOf('.gitignore')).toBeNull()
    expect(extOf('weird.')).toBeNull()
  })

  it('超长"扩展名"视为无扩展名', () => {
    expect(extOf('file.' + 'x'.repeat(13))).toBeNull()
  })
})
