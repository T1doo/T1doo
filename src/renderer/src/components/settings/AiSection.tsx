import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODELS } from '@shared/ai'
import { useI18n } from '../../lib/i18n'

/** 设置页 · AI 对话区块：API 引擎 Key（DPAPI 加密落盘）/ baseUrl / 默认模型（§7.5.1） */
function AiSection(): React.JSX.Element {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [keyInput, setKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const configQuery = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => window.t1doo.ai.configGet()
  })
  const config = configQuery.data

  const apply = async (input: {
    apiKey?: string
    baseUrl?: string
    model?: string
  }): Promise<void> => {
    setMessage(null)
    try {
      await window.t1doo.ai.configSet(input)
      await queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      setMessage(t('settingsAi.saved'))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">{t('settingsAi.title')}</h2>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">{t('settingsAi.desc')}</p>

      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-[var(--fg-muted)]">
            API Key{' '}
            {config?.hasKey ? (
              <span data-testid="ai-key-state" className="text-green-400">
                {t('settingsAi.key.configured', { tail: config.keyTail ?? '' })}
              </span>
            ) : (
              <span data-testid="ai-key-state">{t('settingsAi.key.notConfigured')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-…"
              data-testid="ai-key-input"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              data-testid="ai-key-save"
              disabled={!keyInput.trim()}
              onClick={() => {
                void apply({ apiKey: keyInput.trim() }).then(() => setKeyInput(''))
              }}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white disabled:opacity-40"
            >
              {t('common.save')}
            </button>
            {config?.hasKey && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('settingsAi.key.clearConfirm'))) void apply({ apiKey: '' })
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('settingsAi.key.clear')}
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[var(--fg-muted)]">{t('settingsAi.baseUrl')}</div>
          <input
            value={baseUrlInput ?? config?.baseUrl ?? ''}
            onChange={(e) => setBaseUrlInput(e.target.value)}
            onBlur={() => {
              if (baseUrlInput !== null) void apply({ baseUrl: baseUrlInput.trim() })
            }}
            placeholder="https://api.anthropic.com"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[var(--fg-muted)]">{t('settingsAi.model')}</span>
          <select
            value={config?.model ?? API_MODELS[0].id}
            onChange={(e) => void apply({ model: e.target.value })}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            {API_MODELS.map((m) => (
              <option key={m.id} value={m.id} title={m.pricing}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {message && <div className="text-xs text-[var(--fg-muted)]">{message}</div>}
      </div>
    </section>
  )
}

export default AiSection
