import { describe, expect, it } from 'vitest'
import { matchScore } from '../../src/main/services/launcher/match'

describe('启动器匹配打分（前缀 > 词首 > 子串 > 首字母）', () => {
  it('不匹配返回 0', () => {
    expect(matchScore('xyz', ['Visual Studio Code'])).toBe(0)
    expect(matchScore('', ['anything'])).toBe(0)
    expect(matchScore('a', [])).toBe(0)
  })

  it('层级顺序：精确 > 前缀 > 词首 > 子串 > 首字母', () => {
    const exact = matchScore('code', ['code'])
    const prefix = matchScore('code', ['codeium'])
    const wordStart = matchScore('code', ['visual studio code'])
    const substring = matchScore('code', ['xcodebuild'])
    const initials = matchScore('vsc', ['visual studio code'])
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(wordStart)
    expect(wordStart).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(initials)
    expect(initials).toBeGreaterThan(0)
  })

  it('大小写不敏感', () => {
    expect(matchScore('T1DOO', ['t1doo'])).toBeGreaterThan(0)
  })

  it('多词项 AND：全部命中才算命中', () => {
    expect(matchScore('git t1doo', ['t1doo', 'E:\\Github\\T1doo'])).toBeGreaterThan(0)
    expect(matchScore('git missing', ['t1doo', 'E:\\Github\\T1doo'])).toBe(0)
  })

  it('多候选文本取最优命中', () => {
    // 标题不含词，但路径含 → 仍命中
    expect(matchScore('github', ['t1doo', 'E:\\Github\\T1doo'])).toBeGreaterThan(0)
  })

  it('CJK 子串匹配', () => {
    expect(matchScore('终端', ['新建终端'])).toBeGreaterThan(0)
    expect(matchScore('微信', ['腾讯 QQ'])).toBe(0)
  })

  it('同分时短文本靠前（长度加成）', () => {
    const short = matchScore('code', ['code app'])
    const long = matchScore('code', ['code application with a very long name here'])
    expect(short).toBeGreaterThan(long)
  })
})
