import type { Language } from '../types'

/** 单条文案：zh 为源语言（zh-CN），en 为翻译；两者都必填，缺失即编译错误 */
export interface I18nEntry {
  zh: string
  en: string
}

/** 命名空间字典：key 约定为 `<ns>.<path>`，与文件名对应 */
export type NsDict = Record<string, I18nEntry>

export type Lang = Language
