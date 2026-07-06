import { common } from './messages/common'
import { dashboard } from './messages/dashboard'
import { sessions } from './messages/sessions'
import { terminals } from './messages/terminals'
import { chat } from './messages/chat'
import { tasks } from './messages/tasks'
import { settings } from './messages/settings'
import { settingsSections } from './messages/settings-sections'
import { launcher } from './messages/launcher'
import { main } from './messages/main'
import { errors } from './messages/errors'
import type { Lang } from './types'

export type { Lang } from './types'

/** 全量文案表：key 冲突时后展开者覆盖（约定各命名空间前缀互斥，不应发生） */
export const MESSAGES = {
  ...common,
  ...dashboard,
  ...sessions,
  ...terminals,
  ...chat,
  ...tasks,
  ...settings,
  ...settingsSections,
  ...launcher,
  ...main,
  ...errors
} as const

export type I18nKey = keyof typeof MESSAGES

export type I18nParams = Record<string, string | number>

/** 纯函数翻译：`{name}` 占位插值；两侧（主进程单例 / 渲染层 hook）都基于它 */
export function translate(lang: Lang, key: I18nKey, params?: I18nParams): string {
  const entry = MESSAGES[key]
  let text: string = lang === 'en' ? entry.en : entry.zh
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}
