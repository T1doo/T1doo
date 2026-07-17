import { useEffect, useState } from 'react'
import type { AppSettings, Language, ThemeSetting } from '@shared/types'
import type { I18nKey } from '@shared/i18n'
import { useI18n } from '../lib/i18n'
import AboutSection from '../components/settings/AboutSection'
import LauncherSection from '../components/settings/LauncherSection'
import { useAppNav } from '../lib/app-nav'

const THEME_OPTIONS: { value: ThemeSetting; labelKey: I18nKey }[] = [
  { value: 'dark', labelKey: 'settings.theme.dark' },
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'system', labelKey: 'settings.theme.system' }
]

// 语言名用各自语言原文呈现，不随界面语言翻译
const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' }
]

function SettingsPage(): React.JSX.Element {
  const { t } = useI18n()
  const nav = useAppNav()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    let mounted = true
    window.t1doo.settings.get().then((s) => {
      if (mounted) setSettings(s)
    })
    const unsubscribe = window.t1doo.settings.onUpdated((s) => setSettings(s))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  if (!settings) {
    return <div className="p-8 text-[var(--fg-muted)]">{t('common.loading')}</div>
  }

  const update = (patch: Partial<AppSettings>): void => {
    void window.t1doo.settings.set(patch).then(setSettings)
  }

  const pillClass = (active: boolean): string =>
    `rounded-md border px-3 py-1.5 transition-colors ${
      active
        ? 'border-[var(--accent)] text-[var(--accent)]'
        : 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
    }`

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">{t('settings.title')}</h1>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('settings.appearance')}</h2>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ theme: opt.value })}
                className={pillClass(settings.theme === opt.value)}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
          <h2 className="mt-5 mb-3 font-medium">{t('settings.language')}</h2>
          <div className="flex gap-2">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ language: opt.value })}
                className={pillClass(settings.language === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('settings.behavior')}</h2>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>
              {t('settings.autoLaunch')}
              <span className="ml-2 text-xs text-[var(--fg-muted)]">
                {t('settings.autoLaunch.hint')}
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoLaunch}
              onChange={(e) => update({ autoLaunch: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>{t('settings.closeToTray')}</span>
            <input
              type="checkbox"
              checked={settings.closeToTray}
              onChange={(e) => update({ closeToTray: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>
              {t('settings.notifyWaiting')}
              <span className="ml-2 text-xs text-[var(--fg-muted)]">
                {t('settings.notifyWaiting.hint')}
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.notifyWaiting}
              onChange={(e) => update({ notifyWaiting: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>{t('settings.notifyTaskDone')}</span>
            <input
              type="checkbox"
              checked={settings.notifyTaskDone}
              onChange={(e) => update({ notifyTaskDone: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
        </section>

        {/* M7（§7.7.1）：AI 引擎与后端档案区块迁至「模型」板块，此处留跳转 */}
        <section className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <span className="text-sm text-[var(--fg-muted)]">{t('models.movedFromSettings')}</span>
          <button
            type="button"
            data-testid="settings-goto-models"
            onClick={() => nav.goPage('models')}
            className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            {t('models.openModels')}
          </button>
        </section>

        <LauncherSection />
        {/* 「实时状态感知（hooks）」区块已随 M9 退役：状态感知改为零配置的 JSONL 推断，
            无开关可调；等待通知的开关仍在上方「通知」区（§7.9.4） */}
        <AboutSection />
      </div>
    </div>
  )
}

export default SettingsPage
