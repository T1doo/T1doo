import { useEffect, useState } from 'react'
import type { HooksState } from '@shared/terminals'
import { useI18n } from '../../lib/i18n'

/** §7.2.4 hooks 状态感知开关：显式开启才写 ~/.claude/settings.json，可一键还原 */
function HooksSection(): React.JSX.Element {
  const { t } = useI18n()
  const [state, setState] = useState<HooksState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.t1doo.hooks.getState().then(setState)
  }, [])

  const toggle = (enabled: boolean): void => {
    setBusy(true)
    void window.t1doo.hooks
      .setEnabled(enabled)
      .then(setState)
      .finally(() => setBusy(false))
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">{t('settingsHooks.title')}</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--fg-muted)]">
        {t('settingsHooks.desc.before')}
        <code>~/.claude/settings.json</code>
        {t('settingsHooks.desc.after')}
      </p>

      {state && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--fg-muted)]">
            {state.enabled ? (
              <>
                <span className={state.running ? 'text-emerald-600' : 'text-red-500'}>
                  {state.running
                    ? t('settingsHooks.status.running')
                    : t('settingsHooks.status.notRunning')}
                </span>
                {state.port && <span className="ml-2">127.0.0.1:{state.port}</span>}
                <span className="ml-2">
                  {state.registered
                    ? t('settingsHooks.status.registered')
                    : t('settingsHooks.status.notRegistered')}
                </span>
              </>
            ) : (
              <span>{t('settingsHooks.status.off')}</span>
            )}
            {state.error && <div className="mt-1 text-red-500">{state.error}</div>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => toggle(!state.enabled)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
              state.enabled
                ? 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
                : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {state.enabled ? t('settingsHooks.disable') : t('settingsHooks.enable')}
          </button>
        </div>
      )}
    </section>
  )
}

export default HooksSection
