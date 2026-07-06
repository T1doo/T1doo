import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translate } from '@shared/i18n'
import type { I18nKey, I18nParams, Lang } from '@shared/i18n'

export type TFunc = (key: I18nKey, params?: I18nParams) => string

interface I18nValue {
  lang: Lang
  t: TFunc
}

const I18nContext = createContext<I18nValue>({
  lang: 'zh-CN',
  t: (key, params) => translate('zh-CN', key, params)
})

/** 主窗与启动器窗共用：读 settings.language 并订阅变更，切换即时生效 */
export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [lang, setLang] = useState<Lang>('zh-CN')

  useEffect(() => {
    let mounted = true
    void window.t1doo.settings.get().then((s) => {
      if (mounted) setLang(s.language)
    })
    const unsubscribe = window.t1doo.settings.onUpdated((s) => setLang(s.language))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const value = useMemo<I18nValue>(
    () => ({ lang, t: (key, params) => translate(lang, key, params) }),
    [lang]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider 与 hook 同源一个文件，语言热更由 context 驱动，不依赖 Fast Refresh
export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
