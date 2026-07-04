import { describe, expect, it } from 'vitest'
import { parseInput } from '../../src/main/services/launcher/router'

describe('启动器意图路由（§7.3 路由表）', () => {
  it('> 前缀 → 内部命令', () => {
    expect(parseInput('> 新建终端')).toEqual({ intent: 'command', query: '新建终端' })
    expect(parseInput('>settings')).toEqual({ intent: 'command', query: 'settings' })
    expect(parseInput('>')).toEqual({ intent: 'command', query: '' })
  })

  it('@ 前缀 → AI 提问', () => {
    expect(parseInput('@ 今天天气如何')).toEqual({ intent: 'ai', query: '今天天气如何' })
  })

  it('? 前缀（含全角）→ 搜索引擎', () => {
    expect(parseInput('? electron ipc')).toEqual({ intent: 'search', query: 'electron ipc' })
    expect(parseInput('？中文搜索')).toEqual({ intent: 'search', query: '中文搜索' })
  })

  it('http(s):// → URL', () => {
    expect(parseInput('https://github.com/foo')).toEqual({
      intent: 'url',
      url: 'https://github.com/foo'
    })
    expect(parseInput('http://localhost:3000/x')).toEqual({
      intent: 'url',
      url: 'http://localhost:3000/x'
    })
  })

  it('裸域名形态（TLD 白名单）→ 补 https 打开', () => {
    expect(parseInput('github.com')).toEqual({ intent: 'url', url: 'https://github.com' })
    expect(parseInput('www.example.foo')).toEqual({ intent: 'url', url: 'https://www.example.foo' })
    expect(parseInput('bilibili.com/video/BV1')).toEqual({
      intent: 'url',
      url: 'https://bilibili.com/video/BV1'
    })
  })

  it('文件名后缀不误判成域名（dao.ts / index.md）', () => {
    expect(parseInput('dao.ts')).toEqual({ intent: 'mixed', query: 'dao.ts' })
    expect(parseInput('index.md')).toEqual({ intent: 'mixed', query: 'index.md' })
  })

  it('绝对路径（盘符 / UNC）→ path', () => {
    expect(parseInput('E:\\Github\\T1doo')).toEqual({ intent: 'path', path: 'E:\\Github\\T1doo' })
    expect(parseInput('c:/Users/foo')).toEqual({ intent: 'path', path: 'c:/Users/foo' })
    expect(parseInput('\\\\server\\share')).toEqual({ intent: 'path', path: '\\\\server\\share' })
  })

  it('普通词 → 混排', () => {
    expect(parseInput('t1doo')).toEqual({ intent: 'mixed', query: 't1doo' })
    expect(parseInput('  终端  ')).toEqual({ intent: 'mixed', query: '终端' })
    expect(parseInput('')).toEqual({ intent: 'mixed', query: '' })
  })
})
