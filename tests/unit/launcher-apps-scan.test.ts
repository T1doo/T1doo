import { describe, expect, it } from 'vitest'
import { parseScanOutput } from '../../src/main/services/launcher/apps-scan'

const lnk = (name: string, target: string, exe: string | null): object => ({
  kind: 'win32',
  name,
  target,
  exe
})

describe('开始菜单扫描输出解析（§7.3）', () => {
  it('正常数组：win32 与 uwp 均解析', () => {
    const out = parseScanOutput(
      JSON.stringify([
        lnk('Visual Studio Code', 'C:\\SM\\Code.lnk', 'C:\\App\\Code.exe'),
        {
          kind: 'uwp',
          name: '计算器',
          target: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          exe: null
        }
      ])
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      kind: 'win32',
      name: 'Visual Studio Code',
      target: 'C:\\SM\\Code.lnk',
      exePath: 'C:\\App\\Code.exe'
    })
    expect(out[1].kind).toBe('uwp')
  })

  it('ConvertTo-Json 单元素退化为对象也能解析', () => {
    const out = parseScanOutput(JSON.stringify(lnk('Only', 'C:\\o.lnk', null)))
    expect(out).toHaveLength(1)
    expect(out[0].exePath).toBeNull()
  })

  it('过滤卸载器与文档类快捷方式', () => {
    const out = parseScanOutput(
      JSON.stringify([
        lnk('Uninstall Foo', 'C:\\SM\\u.lnk', 'C:\\Foo\\unins000.exe'),
        lnk('卸载 Bar', 'C:\\SM\\b.lnk', 'C:\\Bar\\bar.exe'),
        lnk('Readme', 'C:\\SM\\r.lnk', 'C:\\Baz\\readme.html'),
        lnk('Good App', 'C:\\SM\\g.lnk', 'C:\\Good\\good.exe')
      ])
    )
    expect(out.map((a) => a.name)).toEqual(['Good App'])
  })

  it('ProgramData 与 AppData 同名同 exe 的重复 .lnk 只留一个', () => {
    const out = parseScanOutput(
      JSON.stringify([
        lnk('App', 'C:\\ProgramData\\SM\\App.lnk', 'C:\\App\\app.exe'),
        lnk('App', 'C:\\Users\\x\\AppData\\SM\\App.lnk', 'C:\\App\\app.exe'),
        lnk('App', 'C:\\ProgramData\\SM\\App.lnk', 'C:\\App\\app.exe') // target 完全重复
      ])
    )
    expect(out).toHaveLength(1)
    expect(out[0].target).toBe('C:\\ProgramData\\SM\\App.lnk')
  })

  it('脏输入：非 JSON / 缺字段行 → 跳过不崩', () => {
    expect(parseScanOutput('not json')).toEqual([])
    const out = parseScanOutput(
      JSON.stringify([{ kind: 'win32' }, null, 42, lnk('OK', 'C:\\ok.lnk', null)])
    )
    expect(out.map((a) => a.name)).toEqual(['OK'])
  })
})
