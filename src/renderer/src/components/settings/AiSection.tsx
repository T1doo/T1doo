import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODELS } from '@shared/ai'

/** 设置页 · AI 对话区块：API 引擎 Key（DPAPI 加密落盘）/ baseUrl / 默认模型（§7.5.1） */
function AiSection(): React.JSX.Element {
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
      setMessage('已保存')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">AI 对话（API 引擎）</h2>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        CLI 引擎零配置（复用 Claude Code 登录态/后端档案）；API 引擎直连 Anthropic，Key 经
        Windows DPAPI 加密存储，明文不落盘。
      </p>

      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-[var(--fg-muted)]">
            API Key{' '}
            {config?.hasKey ? (
              <span data-testid="ai-key-state" className="text-green-400">
                已配置（尾号 …{config.keyTail}）
              </span>
            ) : (
              <span data-testid="ai-key-state">未配置</span>
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
              保存
            </button>
            {config?.hasKey && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('清除已保存的 API Key？')) void apply({ apiKey: '' })
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                清除
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[var(--fg-muted)]">
            自定义 baseUrl（可选，Anthropic 兼容网关）
          </div>
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
          <span className="text-[var(--fg-muted)]">默认模型</span>
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
