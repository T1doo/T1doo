import { useState } from 'react'
import type { BackendProfileInput } from '@shared/backend'
import { useI18n } from '../../lib/i18n'

interface Props {
  initial: BackendProfileInput
  /** 已保存档案才有 id，才能拉取模型列表（backend:models 按 id 工作） */
  modelCache: string[]
  onSave: (input: BackendProfileInput) => Promise<void>
  onClose: () => void
}

const inputClass =
  'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]'

/** §7.7.2 供应商档案编辑器：预设只做预填，全部字段自由修改 */
function ProviderEditor({ initial, modelCache, onSave, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [form, setForm] = useState<BackendProfileInput>(initial)
  const [models, setModels] = useState<string[]>(modelCache)
  const [fetching, setFetching] = useState(false)
  const [fetchMsg, setFetchMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<BackendProfileInput>): void => setForm((f) => ({ ...f, ...p }))

  const fetchModels = async (): Promise<void> => {
    if (!form.id) return
    setFetching(true)
    setFetchMsg(null)
    try {
      const r = await window.t1doo.backend.models(form.id)
      if (r.models.length > 0) {
        setModels(r.models)
        setFetchMsg(t('models.fetchModels.ok', { count: r.models.length }))
      } else {
        setFetchMsg(r.error ?? t('models.fetchModels.empty'))
      }
    } finally {
      setFetching(false)
    }
  }

  const save = (): void => {
    setError(null)
    setSaving(true)
    onSave(form)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false))
  }

  const modelField = (
    labelKey: 'settingsBackend.form.model' | 'settingsBackend.form.smallFastModel',
    key: 'model' | 'smallFastModel',
    placeholder: string
  ): React.JSX.Element => (
    <div>
      <label className="mb-1 block text-sm text-[var(--fg-muted)]">{t(labelKey)}</label>
      <input
        value={form[key] ?? ''}
        onChange={(e) => patch({ [key]: e.target.value })}
        list="t1doo-provider-models"
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        data-testid="provider-editor"
        className="max-h-[85vh] w-[560px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">
          {form.id ? t('settingsBackend.edit') : t('models.addProfile')}
        </h2>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                {t('settingsBackend.form.name')}
              </label>
              <input
                data-testid="provider-name"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={t('settingsBackend.form.namePlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                {t('settingsBackend.form.auth')}
              </label>
              <select
                value={form.auth}
                onChange={(e) => patch({ auth: e.target.value as 'subscription' | 'custom' })}
                className={inputClass}
              >
                <option value="custom">{t('settingsBackend.auth.custom')}</option>
                <option value="subscription">{t('settingsBackend.auth.subscription')}</option>
              </select>
            </div>
          </div>

          {form.auth === 'custom' ? (
            <>
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                  {t('settingsBackend.form.baseUrl')}
                </label>
                <input
                  data-testid="provider-baseurl"
                  value={form.baseUrl ?? ''}
                  onChange={(e) => patch({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/anthropic"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                  {t('settingsBackend.form.token')}
                </label>
                <input
                  data-testid="provider-token"
                  type="password"
                  value={form.token ?? ''}
                  onChange={(e) => patch({ token: e.target.value || undefined })}
                  placeholder="sk-…"
                  className={inputClass}
                />
              </div>

              <div className="flex items-end justify-between gap-3">
                <span className="text-sm text-[var(--fg-muted)]">
                  {fetchMsg ??
                    (models.length > 0 ? t('models.fetchModels.ok', { count: models.length }) : '')}
                </span>
                <button
                  type="button"
                  disabled={!form.id || fetching}
                  onClick={() => void fetchModels()}
                  title={form.id ? '' : t('common.save')}
                  className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-40"
                >
                  {fetching ? t('models.testing') : t('models.fetchModels')}
                </button>
              </div>
              <datalist id="t1doo-provider-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>

              <div className="grid grid-cols-2 gap-3">
                {modelField('settingsBackend.form.model', 'model', 'ANTHROPIC_MODEL')}
                {modelField(
                  'settingsBackend.form.smallFastModel',
                  'smallFastModel',
                  'ANTHROPIC_DEFAULT_HAIKU_MODEL'
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                    {t('models.form.defaultSonnet')}
                  </label>
                  <input
                    value={form.defaultSonnetModel ?? ''}
                    onChange={(e) => patch({ defaultSonnetModel: e.target.value })}
                    list="t1doo-provider-models"
                    placeholder="ANTHROPIC_DEFAULT_SONNET_MODEL"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                    {t('models.form.defaultOpus')}
                  </label>
                  <input
                    value={form.defaultOpusModel ?? ''}
                    onChange={(e) => patch({ defaultOpusModel: e.target.value })}
                    list="t1doo-provider-models"
                    placeholder="ANTHROPIC_DEFAULT_OPUS_MODEL"
                    className={inputClass}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--fg-muted)]">
              {t('models.preset.note.subscription')}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                {t('models.form.websiteUrl')}
              </label>
              <input
                value={form.websiteUrl ?? ''}
                onChange={(e) => patch({ websiteUrl: e.target.value })}
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                {t('models.form.notes')}
              </label>
              <input
                value={form.notes ?? ''}
                onChange={(e) => patch({ notes: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-testid="provider-save"
              disabled={!form.name.trim() || saving}
              onClick={save}
              className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProviderEditor
