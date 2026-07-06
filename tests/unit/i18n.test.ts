import { describe, expect, it } from 'vitest'
import { MESSAGES, translate } from '../../src/shared/i18n'
import { common } from '../../src/shared/i18n/messages/common'
import { dashboard } from '../../src/shared/i18n/messages/dashboard'
import { sessions } from '../../src/shared/i18n/messages/sessions'
import { terminals } from '../../src/shared/i18n/messages/terminals'
import { chat } from '../../src/shared/i18n/messages/chat'
import { tasks } from '../../src/shared/i18n/messages/tasks'
import { settings } from '../../src/shared/i18n/messages/settings'
import { settingsSections } from '../../src/shared/i18n/messages/settings-sections'
import { launcher } from '../../src/shared/i18n/messages/launcher'
import { main } from '../../src/shared/i18n/messages/main'
import { errors } from '../../src/shared/i18n/messages/errors'

/** 提取 `{name}` 占位符集合 */
function params(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

describe('i18n 字典完整性', () => {
  it('每个 key 的 zh 与 en 均非空', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      expect(entry.zh.length, `${key}.zh 为空`).toBeGreaterThan(0)
      expect(entry.en.length, `${key}.en 为空`).toBeGreaterThan(0)
    }
  })

  it('zh 与 en 的插值占位符一一对应', () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      expect(params(entry.en), `${key} 占位符不一致`).toEqual(params(entry.zh))
    }
  })

  it('命名空间之间无 key 冲突（spread 合并不吞条目）', () => {
    const parts = [
      common,
      dashboard,
      sessions,
      terminals,
      chat,
      tasks,
      settings,
      settingsSections,
      launcher,
      main,
      errors
    ]
    const sum = parts.reduce((n, dict) => n + Object.keys(dict).length, 0)
    expect(Object.keys(MESSAGES).length).toBe(sum)
  })

  it('translate 插值与语言选择正确', () => {
    expect(translate('zh-CN', 'tray.quit', { app: 'T1doo' })).toBe('退出 T1doo')
    expect(translate('en', 'tray.quit', { app: 'T1doo' })).toBe('Quit T1doo')
    expect(translate('en', 'time.minutesAgo', { n: 5 })).toBe('5 min ago')
  })
})
