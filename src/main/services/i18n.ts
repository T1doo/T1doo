import { translate } from '../../shared/i18n'
import type { I18nKey, I18nParams, Lang } from '../../shared/i18n'

/** 主进程当前语言（settings.language 同步）；boot 时设置、变更时更新 */
let currentLang: Lang = 'zh-CN'

export function setAppLocale(lang: Lang): void {
  currentLang = lang
}

export function getAppLocale(): Lang {
  return currentLang
}

/** 主进程侧翻译：托盘/通知/启动器条目/流向 UI 的错误提示 */
export function t(key: I18nKey, params?: I18nParams): string {
  return translate(currentLang, key, params)
}
