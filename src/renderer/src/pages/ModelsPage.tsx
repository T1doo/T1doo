import { useCallback, useEffect, useState } from 'react'
import type {
  BackendProfileInput,
  BackendProfileView,
  BackendTestResult,
  GlobalSwitchState,
  SwitchConflict
} from '@shared/backend'
import type { BackendPreset } from '@shared/backend-presets'
import { useI18n } from '../lib/i18n'
import ProviderEditor from '../components/models/ProviderEditor'
import PresetPicker from '../components/models/PresetPicker'
import { categoryLabelKey } from '../components/models/category'
import ApiSection from '../components/models/ApiSection'

/** F8 模型中心（§7.7）：供应商卡片墙 + 全局切换 + API 直连通道 */
function ModelsPage(): React.JSX.Element {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<BackendProfileView[]>([])
  const [globalState, setGlobalState] = useState<GlobalSwitchState | null>(null)
  const [editing, setEditing] = useState<BackendProfileInput | null>(null)
  const [editingCache, setEditingCache] = useState<string[]>([])
  const [presetOpen, setPresetOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [authorizePending, setAuthorizePending] = useState<string | null>(null)
  const [conflict, setConflict] = useState<{ profileId: string; detail: SwitchConflict } | null>(
    null
  )
  const [testState, setTestState] = useState<
    Record<string, { busy: boolean; result: BackendTestResult | null }>
  >({})
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [list, state] = await Promise.all([
      window.t1doo.backend.list(),
      window.t1doo.backend.globalState()
    ])
    setProfiles(list)
    setGlobalState(state)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  /** 一键切换主流程：未授权 → 授权弹窗；漂移 → 冲突三选；成功 → 刷新 + toast（§7.7.5） */
  const doSwitch = useCallback(
    async (profileId: string, opts: { authorize?: boolean; force?: boolean } = {}) => {
      setError(null)
      setSwitching(profileId)
      try {
        const outcome = await window.t1doo.backend.switch(profileId, opts)
        if (outcome.ok) {
          setAuthorizePending(null)
          setConflict(null)
          await refresh()
          const name = profiles.find((p) => p.id === profileId)?.name ?? profileId
          showToast(t('models.switched', { name }))
        } else if (outcome.conflict) {
          setConflict({ profileId, detail: outcome.conflict })
        } else if (!outcome.state.authorized) {
          setAuthorizePending(profileId)
        } else {
          setError(outcome.error)
        }
      } finally {
        setSwitching(null)
      }
    },
    [profiles, refresh, t]
  )

  const doRestore = async (): Promise<void> => {
    setError(null)
    const outcome = await window.t1doo.backend.restore()
    if (outcome.ok) {
      await refresh()
      showToast(t('models.restored'))
    } else {
      setError(outcome.error)
    }
  }

  const doTest = async (id: string): Promise<void> => {
    setTestState((s) => ({ ...s, [id]: { busy: true, result: null } }))
    try {
      const result = await window.t1doo.backend.test(id)
      setTestState((s) => ({ ...s, [id]: { busy: false, result } }))
    } catch (err) {
      setTestState((s) => ({
        ...s,
        [id]: {
          busy: false,
          result: {
            ok: false,
            latencyMs: null,
            modelCount: null,
            error: err instanceof Error ? err.message : String(err)
          }
        }
      }))
    }
  }

  const startEdit = (p: BackendProfileView): void => {
    setEditingCache(p.modelCache)
    setEditing({
      id: p.id,
      name: p.name,
      auth: p.auth,
      baseUrl: p.baseUrl ?? '',
      model: p.model ?? '',
      smallFastModel: p.smallFastModel ?? '',
      defaultSonnetModel: p.defaultSonnetModel ?? '',
      defaultOpusModel: p.defaultOpusModel ?? '',
      websiteUrl: p.websiteUrl ?? '',
      notes: p.notes ?? '',
      presetId: p.presetId ?? undefined,
      category: p.category
      // token 不回显：留空 = 保持不变
    })
  }

  const startFromPreset = (preset: BackendPreset): void => {
    setPresetOpen(false)
    setEditingCache([])
    setEditing({
      name: preset.name,
      auth: preset.auth,
      baseUrl: preset.baseUrl ?? '',
      model: preset.model ?? '',
      smallFastModel: preset.smallFastModel ?? '',
      defaultSonnetModel: preset.defaultSonnetModel ?? '',
      defaultOpusModel: preset.defaultOpusModel ?? '',
      websiteUrl: preset.apiKeyUrl ?? preset.websiteUrl ?? '',
      presetId: preset.id,
      category: preset.category
    })
  }

  const saveProfile = async (input: BackendProfileInput): Promise<void> => {
    const list = await window.t1doo.backend.save(input)
    setProfiles(list)
    setEditing(null)
    await refresh()
  }

  const removeProfile = (p: BackendProfileView): void => {
    if (!window.confirm(t('models.deleteConfirm', { name: p.name }))) return
    window.t1doo.backend
      .delete(p.id)
      .then((list) => setProfiles(list))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  const appliedId = globalState?.appliedProfileId ?? null
  const conflictProfileName = conflict
    ? (profiles.find((p) => p.id === conflict.profileId)?.name ?? '')
    : ''

  return (
    <div className="p-8" data-testid="models-page">
      <h1 className="mb-1 text-xl font-semibold">{t('models.title')}</h1>
      <p className="mb-6 text-sm text-[var(--fg-muted)]">{t('models.subtitle')}</p>

      <div className="max-w-4xl space-y-6">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="font-medium">{t('models.providers.title')}</h2>
            <div className="flex gap-2">
              {(globalState?.managedKeys.length ?? 0) > 0 && (
                <button
                  type="button"
                  data-testid="models-restore"
                  onClick={() => void doRestore()}
                  className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
                >
                  {t('models.restore')}
                </button>
              )}
              <button
                type="button"
                data-testid="models-from-preset"
                onClick={() => setPresetOpen(true)}
                className="rounded-md border border-[var(--accent)] px-2.5 py-1 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)]"
              >
                {t('models.fromPreset')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingCache([])
                  setEditing({ name: '', auth: 'custom' })
                }}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('models.addProfile')}
              </button>
            </div>
          </div>
          <p className="mb-4 text-xs text-[var(--fg-muted)]">{t('models.providers.desc')}</p>

          <div className="grid grid-cols-2 gap-3">
            {profiles.map((p) => {
              const test = testState[p.id]
              const isCurrent = p.isDefault
              return (
                <div
                  key={p.id}
                  data-testid="provider-card"
                  data-profile-name={p.name}
                  className={`rounded-lg border p-4 transition-colors ${
                    isCurrent ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                      {t(categoryLabelKey(p.category))}
                    </span>
                    {isCurrent && (
                      <span
                        data-testid="current-badge"
                        className="shrink-0 rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs text-white"
                      >
                        {t('models.current')}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 truncate text-xs text-[var(--fg-muted)]">
                    {p.auth === 'subscription'
                      ? t('settingsBackend.subscriptionDesc')
                      : `${p.baseUrl ?? t('settingsBackend.noBaseUrl')} · token ${
                          p.hasToken
                            ? t('settingsBackend.token.configured')
                            : t('settingsBackend.token.notConfigured')
                        }`}
                  </div>
                  {p.model && (
                    <div className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">{p.model}</div>
                  )}
                  {p.notes && (
                    <div className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">{p.notes}</div>
                  )}
                  {p.websiteUrl && (
                    // 外链经 windowOpenHandler 拦截交给 shell.openExternal（与 Markdown.tsx 同口径）
                    <a
                      href={p.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline"
                    >
                      {t('models.getKey')} ↗
                    </a>
                  )}

                  {test?.result && (
                    <div
                      data-testid="test-result"
                      className={`mt-2 text-xs ${test.result.ok ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {test.result.ok
                        ? test.result.modelCount
                          ? t('models.test.ok', {
                              latency: test.result.latencyMs ?? 0,
                              count: test.result.modelCount
                            })
                          : t('models.test.okNoList', { latency: test.result.latencyMs ?? 0 })
                        : test.result.error}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {!isCurrent && (
                      <button
                        type="button"
                        data-testid="switch-btn"
                        disabled={switching !== null}
                        onClick={() => void doSwitch(p.id)}
                        className="rounded-md border border-[var(--accent)] px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                      >
                        {switching === p.id ? t('models.switching') : t('models.switchTo')}
                      </button>
                    )}
                    {p.auth === 'custom' && (
                      <button
                        type="button"
                        data-testid="test-btn"
                        disabled={test?.busy}
                        onClick={() => void doTest(p.id)}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-40"
                      >
                        {test?.busy ? t('models.testing') : t('models.test')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    >
                      {t('settingsBackend.edit')}
                    </button>
                    <button
                      type="button"
                      disabled={p.id === appliedId}
                      title={p.id === appliedId ? t('models.deleteAppliedBlocked') : ''}
                      onClick={() => removeProfile(p)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-red-500 hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-3 text-xs text-[var(--fg-muted)]">{t('models.reopenHint')}</p>
          {toast && (
            <p data-testid="models-toast" className="mt-2 text-sm text-green-400">
              {toast}
            </p>
          )}
          {error && (
            <p data-testid="models-error" className="mt-2 text-sm text-red-500">
              {error}
            </p>
          )}
        </section>

        <ApiSection />
      </div>

      {presetOpen && <PresetPicker onPick={startFromPreset} onClose={() => setPresetOpen(false)} />}
      {editing && (
        <ProviderEditor
          initial={editing}
          modelCache={editingCache}
          onSave={saveProfile}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 首次授权（§7.7.5：一次性授权，此后切换不再打扰） */}
      {authorizePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            data-testid="authorize-dialog"
            className="w-[520px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-xl"
          >
            <h2 className="mb-3 text-lg font-semibold">{t('models.authorize.title')}</h2>
            <p className="mb-4 text-sm leading-relaxed text-[var(--fg-muted)]">
              {t('models.authorize.body')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAuthorizePending(null)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="authorize-confirm"
                onClick={() => void doSwitch(authorizePending, { authorize: true })}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
              >
                {t('models.authorize.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 冲突三选（§7.7.5：覆盖 / 导入为新档案 / 取消，不静默覆盖） */}
      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            data-testid="conflict-dialog"
            className="w-[560px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-xl"
          >
            <h2 className="mb-3 text-lg font-semibold">{t('models.conflict.title')}</h2>
            <p className="mb-3 text-sm text-[var(--fg-muted)]">{t('models.conflict.body')}</p>
            <ul className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs">
              {conflict.detail.drifted.map((d) => (
                <li key={d.key}>
                  <span className="text-[var(--fg)]">{d.key}</span>
                  <span className="text-[var(--fg-muted)]">
                    {' '}
                    · T1doo: {d.expected || '∅'} · live: {d.live || '∅'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConflict(null)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="conflict-import"
                onClick={() => {
                  const target = conflict.profileId
                  void window.t1doo.backend.importLive().then((list) => {
                    setProfiles(list)
                    showToast(t('models.conflict.imported', { name: t('models.importedName') }))
                    void doSwitch(target, { force: true })
                  })
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                {t('models.conflict.import')}
              </button>
              <button
                type="button"
                data-testid="conflict-overwrite"
                onClick={() => void doSwitch(conflict.profileId, { force: true })}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
              >
                {t('models.conflict.overwrite')}
              </button>
            </div>
            <p className="mt-2 text-right text-xs text-[var(--fg-muted)]">{conflictProfileName}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ModelsPage
