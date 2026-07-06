/** 时间与数字展示工具：locale 感知，组件内用 useFormat() 取当前语言绑定版 */

import { useMemo } from 'react'
import { translate } from '@shared/i18n'
import type { Lang } from '@shared/i18n'
import { useI18n } from './i18n'

export interface Formatters {
  formatRelative: (ts: number | null) => string
  formatDateTime: (ts: number | null) => string
  formatTokens: (n: number) => string
  projectShortName: (path: string | null) => string
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function createFormatters(lang: Lang): Formatters {
  return {
    formatRelative(ts) {
      if (ts == null) return ''
      const diff = Date.now() - ts
      const min = Math.floor(diff / 60_000)
      if (min < 1) return translate(lang, 'time.justNow')
      if (min < 60) return translate(lang, 'time.minutesAgo', { n: min })
      const hours = Math.floor(min / 60)
      if (hours < 24) return translate(lang, 'time.hoursAgo', { n: hours })
      const days = Math.floor(hours / 24)
      if (days < 30) return translate(lang, 'time.daysAgo', { n: days })
      return new Date(ts).toLocaleDateString(lang)
    },
    formatDateTime(ts) {
      if (ts == null) return ''
      return new Date(ts).toLocaleString(lang, { hour12: false })
    },
    formatTokens,
    projectShortName(path) {
      if (!path) return translate(lang, 'common.unknownProject')
      const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
      return parts[parts.length - 1] || path
    }
  }
}

/** 组件内使用：随 settings.language 切换即时更新 */
export function useFormat(): Formatters {
  const { lang } = useI18n()
  return useMemo(() => createFormatters(lang), [lang])
}
