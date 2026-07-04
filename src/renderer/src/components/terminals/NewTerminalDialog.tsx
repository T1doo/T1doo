import { useEffect, useMemo, useState } from 'react'
import type { BackendProfileView } from '@shared/backend'
import type { PermissionMode, TerminalKind, TerminalProfile } from '@shared/terminals'
import type { ProjectSummary } from '@shared/sessions'

const PERMISSION_MODES: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: 'default（逐项确认）' },
  { value: 'acceptEdits', label: 'acceptEdits（自动接受编辑）' },
  { value: 'plan', label: 'plan（规划模式）' },
  { value: 'dontAsk', label: 'dontAsk' },
  { value: 'auto', label: 'auto' },
  { value: 'bypassPermissions', label: 'bypassPermissions（跳过全部确认）' }
]

interface Props {
  onClose: () => void
  onCreate: (profile: TerminalProfile) => void
}

/** 新建终端对话框（§7.2.2 / §7.2.5）：会话档案 + 后端档案下拉 */
function NewTerminalDialog({ onClose, onCreate }: Props): React.JSX.Element {
  const [kind, setKind] = useState<TerminalKind>('claude')
  const [cwd, setCwd] = useState('')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [backends, setBackends] = useState<BackendProfileView[]>([])
  const [backendId, setBackendId] = useState('')
  const [model, setModel] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const [name, setName] = useState('')
  const [bypassConfirmed, setBypassConfirmed] = useState(false)

  useEffect(() => {
    void window.t1doo.sessions.projects().then((list) => {
      setProjects(list)
      // 默认取最近活跃项目目录
      if (list[0]) setCwd((prev) => prev || list[0].path)
    })
    void window.t1doo.backend.list().then((list) => {
      setBackends(list)
      const def = list.find((b) => b.isDefault) ?? list[0]
      if (def) setBackendId(def.id)
    })
  }, [])

  const isBypass = permissionMode === 'bypassPermissions'
  const canSubmit = useMemo(
    () => cwd.trim() !== '' && (!isBypass || bypassConfirmed),
    [cwd, isBypass, bypassConfirmed]
  )

  const submit = (): void => {
    if (!canSubmit) return
    const profile: TerminalProfile =
      kind === 'shell'
        ? { cwd: cwd.trim(), kind }
        : {
            cwd: cwd.trim(),
            kind,
            claude: {
              backendProfileId: backendId || undefined,
              model: model.trim() || undefined,
              permissionMode,
              name: name.trim() || undefined
            }
          }
    onCreate(profile)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className="w-[520px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">新建终端</h2>

        <div className="mb-4 flex gap-2">
          {(
            [
              { value: 'claude', label: 'Claude 会话' },
              { value: 'shell', label: 'PowerShell' }
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKind(opt.value)}
              className={`rounded-md border px-3 py-1.5 transition-colors ${
                kind === opt.value
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm text-[var(--fg-muted)]">工作目录</label>
        <div className="mb-4 flex gap-2">
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            list="t1doo-recent-projects"
            placeholder="E:\Github\MyProject"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
          />
          <datalist id="t1doo-recent-projects">
            {projects.map((p) => (
              <option key={p.id} value={p.path} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => {
              void window.t1doo.term.pickCwd(cwd || undefined).then((dir) => {
                if (dir) setCwd(dir)
              })
            }}
            className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            浏览…
          </button>
        </div>

        {kind === 'claude' && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">后端档案</label>
                <select
                  value={backendId}
                  onChange={(e) => setBackendId(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 outline-none focus:border-[var(--accent)]"
                >
                  {backends.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.auth === 'custom' ? '（自定义后端）' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                  模型 <span className="opacity-60">可选，覆盖档案默认</span>
                </label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="跟随档案 / CLI 默认"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">权限模式</label>
                <select
                  value={permissionMode}
                  onChange={(e) => {
                    setPermissionMode(e.target.value as PermissionMode)
                    setBypassConfirmed(false)
                  }}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 outline-none focus:border-[var(--accent)]"
                >
                  {PERMISSION_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--fg-muted)]">
                  会话名 <span className="opacity-60">可选，-n</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="标签名与之同步"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {isBypass && (
              <label className="mb-4 flex cursor-pointer items-start gap-2 rounded-md border border-red-500/60 bg-red-500/10 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={bypassConfirmed}
                  onChange={(e) => setBypassConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-500"
                />
                <span>
                  <b className="text-red-500">危险：</b>
                  bypassPermissions（--dangerously-skip-permissions）将跳过所有工具权限确认， Claude
                  可以直接执行任意命令与文件修改。我了解风险并确认在此目录启用。
                </span>
              </label>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-4 py-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-md border border-[var(--accent)] px-4 py-1.5 text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewTerminalDialog
