import { useEffect, useState } from 'react'
import type { AppSettings, ThemeSetting } from '@shared/types'
import BackendProfilesSection from '../components/settings/BackendProfilesSection'
import FilesSection from '../components/settings/FilesSection'
import HooksSection from '../components/settings/HooksSection'
import LauncherSection from '../components/settings/LauncherSection'

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'dark', label: '暗色' },
  { value: 'light', label: '亮色' },
  { value: 'system', label: '跟随系统' }
]

function SettingsPage(): React.JSX.Element {
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
    return <div className="p-8 text-[var(--fg-muted)]">加载中…</div>
  }

  const update = (patch: Partial<AppSettings>): void => {
    void window.t1doo.settings.set(patch).then(setSettings)
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold">设置</h1>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">外观</h2>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ theme: opt.value })}
                className={`rounded-md border px-3 py-1.5 transition-colors ${
                  settings.theme === opt.value
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">行为</h2>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>
              开机自启
              <span className="ml-2 text-xs text-[var(--fg-muted)]">仅安装版生效</span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoLaunch}
              onChange={(e) => update({ autoLaunch: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>关闭窗口时最小化到托盘</span>
            <input
              type="checkbox"
              checked={settings.closeToTray}
              onChange={(e) => update({ closeToTray: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between py-1.5">
            <span>
              会话等待输入时系统通知
              <span className="ml-2 text-xs text-[var(--fg-muted)]">需开启 hooks 状态感知</span>
            </span>
            <input
              type="checkbox"
              checked={settings.notifyWaiting}
              onChange={(e) => update({ notifyWaiting: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
        </section>

        <LauncherSection />
        <FilesSection settings={settings} onUpdate={update} />
        <HooksSection />
        <BackendProfilesSection />
      </div>
    </div>
  )
}

export default SettingsPage
