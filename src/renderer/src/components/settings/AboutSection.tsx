import { useEffect, useState } from 'react'
import type { AppInfo, UpdaterState } from '@shared/types'
import { useI18n } from '../../lib/i18n'

/** 关于与更新（M6 §13）：版本信息 + 检查更新/重启安装（提示后安装，不强更） */
function AboutSection(): React.JSX.Element {
  const { t } = useI18n()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [state, setState] = useState<UpdaterState | null>(null)

  useEffect(() => {
    let mounted = true
    void window.t1doo.app.info().then((i) => {
      if (mounted) setInfo(i)
    })
    void window.t1doo.updater.getState().then((s) => {
      if (mounted) setState(s)
    })
    const unsubscribe = window.t1doo.updater.onState(setState)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const statusText = (): string | null => {
    if (!state) return null
    switch (state.status) {
      case 'disabled':
        return t('settings.update.disabled')
      case 'checking':
        return t('settings.update.checking')
      case 'none':
        return t('settings.update.none')
      case 'downloading':
        return t('settings.update.downloading', {
          version: state.version ?? '',
          percent: state.percent ?? 0
        })
      case 'downloaded':
        return t('settings.update.downloaded', { version: state.version ?? '' })
      case 'error':
        return t('settings.update.error', { error: state.error ?? t('common.unknownError') })
      default:
        return null
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-3 font-medium">{t('settings.about')}</h2>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm">
            {info ? t('settings.about.version', { version: info.version }) : '…'}
          </div>
          {statusText() && (
            <div className="mt-1 text-xs text-[var(--fg-muted)]">{statusText()}</div>
          )}
        </div>
        <div className="flex gap-2">
          {state?.status === 'downloaded' ? (
            <button
              type="button"
              onClick={() => void window.t1doo.updater.install()}
              className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-[var(--accent)] hover:bg-[var(--bg-hover)]"
            >
              {t('settings.update.install')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void window.t1doo.updater.check().then(setState)}
              disabled={state?.status === 'disabled' || state?.status === 'checking'}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-50"
            >
              {t('settings.update.check')}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export default AboutSection
