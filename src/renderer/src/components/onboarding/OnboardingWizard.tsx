import { useCallback, useEffect, useState } from 'react'
import type { ClaudeProbeResult, Language } from '@shared/types'
import type { SyncProgress } from '@shared/sessions'
import { useI18n } from '../../lib/i18n'

const TOTAL_STEPS = 4

interface Props {
  hotkey: string
  onDone: (goSettings: boolean) => void
}

// 语言名用各自语言原文呈现（与设置页同款）
const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' }
]

/** 首启引导四步向导（M6 §8）：语言 → 检测+索引 → 状态感知说明 → 后端档案/完成 */
function OnboardingWizard({ hotkey, onDone }: Props): React.JSX.Element {
  const { t, lang } = useI18n()
  const [step, setStep] = useState(0)

  // ② claude 探测 + 索引进度
  const [probe, setProbe] = useState<ClaudeProbeResult | null>(null)
  const [probing, setProbing] = useState(true)
  const [progress, setProgress] = useState<SyncProgress | null>(null)

  // 初始态即 probing=true：effect 内不同步 setState（react-hooks 规则）
  const runProbe = useCallback(() => {
    void window.t1doo.app.probeClaude().then((r) => {
      setProbe(r)
      setProbing(false)
    })
  }, [])

  const retryProbe = (): void => {
    setProbing(true)
    runProbe()
  }

  useEffect(() => {
    runProbe()
    const unsubscribe = window.t1doo.sessions.onProgress(setProgress)
    return unsubscribe
  }, [runProbe])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]/95">
      <div className="flex max-h-[85vh] w-[560px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs text-[var(--fg-muted)]">
            {t('onboarding.stepOf', { n: step + 1, total: TOTAL_STEPS })}
          </span>
          <button
            type="button"
            onClick={() => onDone(false)}
            className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            {t('onboarding.skip')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {step === 0 && (
            <>
              <h1 className="mb-3 text-2xl font-semibold text-[var(--accent)]">
                {t('onboarding.welcome.title')}
              </h1>
              <p className="mb-6 leading-relaxed text-[var(--fg-muted)]">
                {t('onboarding.welcome.desc')}
              </p>
              <div className="mb-2 font-medium">{t('onboarding.welcome.language')}</div>
              <div className="flex gap-2">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => void window.t1doo.settings.set({ language: opt.value })}
                    className={`rounded-md border px-4 py-2 transition-colors ${
                      lang === opt.value
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="mb-3 text-2xl font-semibold">{t('onboarding.detect.title')}</h1>
              {probing && (
                <p className="text-[var(--fg-muted)]">{t('onboarding.detect.probing')}</p>
              )}
              {!probing && probe?.found && (
                <p className="mb-4 text-[var(--ok,#4ade80)]">
                  ✓ {t('onboarding.detect.found', { version: probe.version ?? 'claude' })}
                </p>
              )}
              {!probing && probe && !probe.found && (
                <div className="mb-4">
                  <p className="mb-3 leading-relaxed text-[var(--warn,#facc15)]">
                    ⚠ {t('onboarding.detect.notFound')}
                  </p>
                  <button
                    type="button"
                    onClick={retryProbe}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:text-[var(--accent)]"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              )}
              {probe?.found && progress && progress.phase !== 'done' && (
                <div>
                  <p className="mb-2 text-sm text-[var(--fg-muted)]">
                    {t('onboarding.detect.indexing', {
                      done: progress.done,
                      total: progress.total
                    })}
                  </p>
                  <div className="h-2 overflow-hidden rounded bg-[var(--bg-hover)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
                      style={{
                        width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}
              {probe?.found && progress?.phase === 'done' && (
                <p className="text-sm text-[var(--fg-muted)]">
                  ✓ {t('onboarding.detect.indexDone')}
                </p>
              )}
            </>
          )}

          {/* ③ 状态感知：v1.1 起纯说明，无授权动作、不写任何配置（§7.9.4） */}
          {step === 2 && (
            <>
              <h1 className="mb-3 text-2xl font-semibold">{t('onboarding.status.title')}</h1>
              <p className="mb-4 text-sm leading-relaxed text-[var(--fg-muted)]">
                {t('onboarding.status.desc')}
              </p>
              <p className="mb-4 text-sm text-[var(--ok,#4ade80)]">
                ✓ {t('onboarding.status.readonly')}
              </p>
              <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
                {t('onboarding.status.limit')}
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="mb-3 text-2xl font-semibold">{t('onboarding.backend.title')}</h1>
              <p className="mb-5 text-sm leading-relaxed text-[var(--fg-muted)]">
                {t('onboarding.backend.desc')}
              </p>
              <p className="rounded-md border border-[var(--border)] bg-[var(--bg-hover)] p-3 text-sm leading-relaxed">
                💡 {t('onboarding.backend.hotkeyHint', { hotkey })}
              </p>
            </>
          )}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className={`rounded-md border border-[var(--border)] px-4 py-2 text-[var(--fg-muted)] hover:text-[var(--fg)] ${
              step === 0 ? 'invisible' : ''
            }`}
          >
            {t('onboarding.back')}
          </button>
          <div className="flex gap-2">
            {step === TOTAL_STEPS - 1 && (
              <button
                type="button"
                onClick={() => onDone(true)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('onboarding.backend.goSettings')}
              </button>
            )}
            <button
              type="button"
              onClick={() => (step === TOTAL_STEPS - 1 ? onDone(false) : setStep((s) => s + 1))}
              className="rounded-md bg-[var(--accent)] px-5 py-2 font-medium text-[var(--bg)] transition-opacity hover:opacity-90"
            >
              {step === TOTAL_STEPS - 1 ? t('onboarding.finish') : t('onboarding.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnboardingWizard
