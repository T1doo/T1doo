import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODELS } from '@shared/ai'
import { useI18n } from '../../lib/i18n'

/**
 * §7.7.6 API 直连通道（对话面板 api 引擎）：Key（DPAPI 加密落盘）/ baseUrl /
 * 模型组合框——预设 + 网关拉取 + 自由输入任意模型 id（M7 起从设置页迁入模型板块）
 */
function ApiSection(): React.JSX.Element {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [keyInput, setKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState<string | null>(null)
  const [modelInput, setModelInput] = useState<string | null>(null)
  const [fetched, setFetched] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
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

  const fetchModels = async (): Promise<void> => {
    setFetching(true)
    setMessage(null)
    try {
      const r = await window.t1doo.ai.models()
      if (r.models.length > 0) {
        setFetched(r.models)
        setMessage(t('models.fetchModels.ok', { count: r.models.length }))
      } else {
        setMessage(r.error ?? t('models.fetchModels.empty'))
      }
    } finally {
      setFetching(false)
    }
  }

  const modelValue = modelInput ?? config?.model ?? ''
  const commitModel = (): void => {
    if (modelInput !== null && modelInput.trim() && modelInput.trim() !== config?.model) {
      void apply({ model: modelInput.trim() })
    }
    setModelInput(null)
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">{t('models.api.title')}</h2>
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

        <div>
          <div className="mb-1 text-[var(--fg-muted)]">{t('models.api.modelFree')}</div>
          <div className="flex gap-2">
            <input
              data-testid="api-model-input"
              value={modelValue}
              onChange={(e) => setModelInput(e.target.value)}
              onBlur={commitModel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitModel()
              }}
              list="t1doo-api-models"
              placeholder={t('models.api.modelPlaceholder')}
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              data-testid="api-model-fetch"
              disabled={fetching}
              onClick={() => void fetchModels()}
              className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-40"
            >
              {fetching ? t('models.testing') : t('models.fetchModels')}
            </button>
          </div>
          <datalist id="t1doo-api-models">
            {API_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}（{m.pricing}）
              </option>
            ))}
            {fetched
              .filter((id) => !API_MODELS.some((m) => m.id === id))
              .map((id) => (
                <option key={id} value={id} />
              ))}
          </datalist>
        </div>

        {message && (
          <div data-testid="api-message" className="text-xs text-[var(--fg-muted)]">
            {message}
          </div>
        )}
      </div>
    </section>
  )
}

export default ApiSection
