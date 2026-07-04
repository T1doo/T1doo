import { describe, expect, it } from 'vitest'
import { escapeLike, rankHits } from '../../src/main/db/files-dao'
import { toFtsPrefixQuery } from '../../src/main/db/dao'
import type { FileHit } from '../../src/shared/files'

function hit(partial: Partial<FileHit> & { path: string; name: string }): FileHit {
  return {
    ext: null,
    size: null,
    mtime: null,
    pinned: false,
    tags: [],
    sessionCount: 0,
    source: 'index',
    ...partial
  }
}

describe('toFtsPrefixQuery', () => {
  it('ASCII 词加前缀通配，引号剔除', () => {
    expect(toFtsPrefixQuery('pty man"ager')).toBe('"pty"* "manager"*')
  })

  it('CJK 词一元切分成短语（R9 方案），不加通配', () => {
    expect(toFtsPrefixQuery('性能')).toBe('"性 能"')
  })

  it('混合输入各自处理', () => {
    expect(toFtsPrefixQuery('索引 index')).toBe('"索 引" "index"*')
  })

  it('空输入返回空串', () => {
    expect(toFtsPrefixQuery('   ')).toBe('')
  })
})

describe('escapeLike', () => {
  it('转义 LIKE 元字符', () => {
    expect(escapeLike('a_b%c\\d')).toBe('a\\_b\\%c\\\\d')
  })
})

describe('rankHits', () => {
  it('按 path 去重（不分大小写），保留先到的（FTS 优先）', () => {
    const merged = rankHits(
      [
        hit({ path: 'E:\\a\\readme.md', name: 'readme.md', mtime: 1 }),
        hit({ path: 'e:\\A\\README.md', name: 'README.md', mtime: 2 })
      ],
      'readme',
      10
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].mtime).toBe(1)
  })

  it('收藏 > 名称前缀 > 名称包含 > 仅路径命中；同分按 mtime 新在前', () => {
    const merged = rankHits(
      [
        hit({ path: 'E:\\x\\notes-manager.ts', name: 'notes-manager.ts', mtime: 100 }),
        hit({ path: 'E:\\man\\other.ts', name: 'other.ts', mtime: 999 }),
        hit({ path: 'E:\\x\\man.ts', name: 'man.ts', mtime: 50 }),
        hit({ path: 'E:\\x\\pinned-man.ts', name: 'pinned-man.ts', mtime: 1, pinned: true })
      ],
      'man',
      10
    )
    expect(merged.map((h) => h.name)).toEqual([
      'pinned-man.ts', // 收藏置顶
      'man.ts', // 名称前缀
      'notes-manager.ts', // 名称包含
      'other.ts' // 仅路径命中
    ])
  })

  it('limit 截断', () => {
    const hits = Array.from({ length: 5 }, (_, i) =>
      hit({ path: `E:\\f${i}.ts`, name: `f${i}.ts`, mtime: i })
    )
    expect(rankHits(hits, 'f', 3)).toHaveLength(3)
  })
})
