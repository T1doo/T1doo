import { useEffect, useState } from 'react'
import type { BackendProfileInput, BackendProfileView } from '@shared/backend'
import { useI18n } from '../../lib/i18n'

const EMPTY_FORM: BackendProfileInput = { name: '', auth: 'custom' }

/** §7.2.6 后端档案管理：token 走 safeStorage，界面只见「已配置」 */
function BackendProfilesSection(): React.JSX.Element {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<BackendProfileView[]>([])
  const [editing, setEditing] = useState<BackendProfileInput | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.t1doo.backend.list().then(setProfiles)
  }, [])

  const startEdit = (p: BackendProfileView): void => {
    setEditing({
      id: p.id,
      name: p.name,
      auth: p.auth,
      baseUrl: p.baseUrl ?? '',
      model: p.model ?? '',
      smallFastModel: p.smallFastModel ?? '',
      clearInheritedEnv: p.clearInheritedEnv
      // token 不回显：留空 = 保持不变
    })
  }

  const save = (): void => {
    if (!editing) return
    setError(null)
    window.t1doo.backend
      .save(editing)
      .then((list) => {
        setProfiles(list)
        setEditing(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  const remove = (id: string): void => {
    void window.t1doo.backend.delete(id).then(setProfiles)
  }

  const setDefault = (p: BackendProfileView): void => {
    void window.t1doo.backend
      .save({ id: p.id, name: p.name, auth: p.auth, isDefault: true })
      .then(setProfiles)
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">
          {t('settingsBackend.title')}
          <span className="ml-2 text-xs text-[var(--fg-muted)]">
            {t('settingsBackend.subtitle')}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY_FORM })}
          className="rounded-md border border-[var(--accent)] px-2.5 py-1 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)]"
        >
          {t('settingsBackend.add')}
        </button>
      </div>

      <ul className="space-y-1.5">
        {profiles.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{p.name}</span>
                {p.isDefault && (
                  <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-xs text-[var(--accent)]">
                    {t('settingsBackend.default')}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-[var(--fg-muted)]">
                {p.auth === 'subscription'
                  ? t('settingsBackend.subscriptionDesc')
                  : `${p.baseUrl ?? t('settingsBackend.noBaseUrl')} · token ${p.hasToken ? t('settingsBackend.token.configured') : t('settingsBackend.token.notConfigured')}${p.model ? ` · ${p.model}` : ''}`}
              </div>
            </div>
            {!p.isDefault && (
              <button
                type="button"
                onClick={() => setDefault(p)}
                className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('settingsBackend.setDefault')}
              </button>
            )}
            <button
              type="button"
              onClick={() => startEdit(p)}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {t('settingsBackend.edit')}
            </button>
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-red-500 hover:bg-[var(--bg-hover)]"
            >
              {t('common.delete')}
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="mt-3 space-y-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                {t('settingsBackend.form.name')}
              </label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder={t('settingsBackend.form.namePlaceholder')}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                {t('settingsBackend.form.auth')}
              </label>
              <select
                value={editing.auth}
                onChange={(e) =>
                  setEditing({ ...editing, auth: e.target.value as 'subscription' | 'custom' })
                }
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5 outline-none focus:border-[var(--accent)]"
              >
                <option value="custom">{t('settingsBackend.auth.custom')}</option>
                <option value="subscription">{t('settingsBackend.auth.subscription')}</option>
              </select>
            </div>
          </div>

          {editing.auth === 'custom' ? (
            <>
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                  {t('settingsBackend.form.baseUrl')}
                </label>
                <input
                  value={editing.baseUrl ?? ''}
                  onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/anthropic"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                  {t('settingsBackend.form.token')}
                </label>
                <input
                  type="password"
                  value={editing.token ?? ''}
                  onChange={(e) => setEditing({ ...editing, token: e.target.value || undefined })}
                  placeholder="sk-…"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                    {t('settingsBackend.form.model')}
                  </label>
                  <input
                    value={editing.model ?? ''}
                    onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    placeholder="ANTHROPIC_MODEL"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                    {t('settingsBackend.form.smallFastModel')}
                  </label>
                  <input
                    value={editing.smallFastModel ?? ''}
                    onChange={(e) => setEditing({ ...editing, smallFastModel: e.target.value })}
                    placeholder="ANTHROPIC_DEFAULT_HAIKU_MODEL"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.clearInheritedEnv === true}
                onChange={(e) => setEditing({ ...editing, clearInheritedEnv: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {t('settingsBackend.form.clearEnv')}
            </label>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={!editing.name.trim()}
              onClick={save}
              className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default BackendProfilesSection
