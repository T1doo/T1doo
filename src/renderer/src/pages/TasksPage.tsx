import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TaskInfo, TaskStatus } from '@shared/ai'
import type { BackendProfileView } from '@shared/backend'
import type { PermissionMode } from '@shared/terminals'
import type { I18nKey } from '@shared/i18n'
import { useAppNav } from '../lib/app-nav'
import { formatTokens, useFormat } from '../lib/format'
import { useI18n } from '../lib/i18n'

const STATUS_META: Record<TaskStatus, { labelKey: I18nKey; cls: string }> = {
  queued: { labelKey: 'tasks.status.queued', cls: 'bg-[var(--bg-hover)] text-[var(--fg-muted)]' },
  running: { labelKey: 'tasks.status.running', cls: 'bg-blue-500/15 text-blue-400' },
  done: { labelKey: 'tasks.status.done', cls: 'bg-green-500/15 text-green-400' },
  failed: { labelKey: 'tasks.status.failed', cls: 'bg-red-500/15 text-red-400' },
  cancelled: {
    labelKey: 'tasks.status.cancelled',
    cls: 'bg-[var(--bg-hover)] text-[var(--fg-muted)]'
  }
}

const PERMISSION_MODES: { value: PermissionMode; labelKey: I18nKey }[] = [
  { value: 'default', labelKey: 'tasks.permission.default' },
  { value: 'acceptEdits', labelKey: 'tasks.permission.acceptEdits' },
  { value: 'plan', labelKey: 'tasks.permission.plan' },
  { value: 'dontAsk', labelKey: 'tasks.permission.dontAsk' },
  { value: 'auto', labelKey: 'tasks.permission.auto' },
  { value: 'bypassPermissions', labelKey: 'tasks.permission.bypassPermissions' }
]

function TasksPage(): React.JSX.Element {
  const { t } = useI18n()
  const fmt = useFormat()
  const queryClient = useQueryClient()
  const nav = useAppNav()
  const [prompt, setPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [model, setModel] = useState('')
  const [backendProfileId, setBackendProfileId] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const [maxBudget, setMaxBudget] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [outputFor, setOutputFor] = useState<string | null>(null)
  const [outputText, setOutputText] = useState('')

  const tasksQuery = useQuery({
    queryKey: ['ai-tasks'],
    queryFn: () => window.t1doo.tasks.list()
  })
  const backendsQuery = useQuery({
    queryKey: ['backend-profiles'],
    queryFn: () => window.t1doo.backend.list()
  })

  useEffect(() => {
    return window.t1doo.tasks.onUpdate(() => {
      void queryClient.invalidateQueries({ queryKey: ['ai-tasks'] })
    })
  }, [queryClient])

  // 查看中的输出跟随任务运行刷新（轻量轮询，仅打开输出面板时）
  useEffect(() => {
    if (!outputFor) return
    let stopped = false
    const load = (): void => {
      void window.t1doo.tasks.output(outputFor).then((text) => {
        if (!stopped) setOutputText(text)
      })
    }
    load()
    const timer = setInterval(load, 1500)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [outputFor])

  const pickCwd = async (): Promise<void> => {
    const dir = await window.t1doo.term.pickCwd(cwd || undefined)
    if (dir) setCwd(dir)
  }

  const submit = async (): Promise<void> => {
    setFormError(null)
    if (!prompt.trim()) {
      setFormError(t('tasks.errPromptRequired'))
      return
    }
    if (!cwd.trim()) {
      setFormError(t('tasks.errCwdRequired'))
      return
    }
    if (permissionMode === 'bypassPermissions') {
      // §7.5.2：bypassPermissions 双重确认
      if (!window.confirm(t('tasks.bypassConfirm'))) {
        return
      }
    }
    const budget = maxBudget.trim() ? Number(maxBudget) : undefined
    try {
      await window.t1doo.tasks.enqueue({
        prompt: prompt.trim(),
        cwd: cwd.trim(),
        model: model.trim() || undefined,
        backendProfileId: backendProfileId || undefined,
        permissionMode,
        maxBudgetUsd: budget && Number.isFinite(budget) && budget > 0 ? budget : undefined
      })
      setPrompt('')
      void queryClient.invalidateQueries({ queryKey: ['ai-tasks'] })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    }
  }

  const cancel = async (id: string): Promise<void> => {
    await window.t1doo.tasks.cancel(id)
    void queryClient.invalidateQueries({ queryKey: ['ai-tasks'] })
  }

  const tasks = tasksQuery.data ?? []

  return (
    <div className="flex h-full flex-col p-8">
      <h1 className="mb-4 text-xl font-semibold">{t('tasks.title')}</h1>

      {/* 提交表单（§7.5.2 最小闭环：提交 → 后台执行 → 通知 → 查看结果） */}
      <section className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('tasks.promptPlaceholder')}
          rows={3}
          data-testid="task-prompt"
          className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder={t('tasks.cwdPlaceholder')}
              data-testid="task-cwd"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            />
            <button
              type="button"
              onClick={() => void pickCwd()}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {t('tasks.browse')}
            </button>
          </div>
          <select
            value={backendProfileId}
            onChange={(e) => setBackendProfileId(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            <option value="">{t('tasks.defaultBackend')}</option>
            {(backendsQuery.data ?? []).map((b: BackendProfileView) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
            className={`rounded-md border bg-[var(--bg)] px-2 py-1 ${
              permissionMode === 'bypassPermissions'
                ? 'border-red-500/60 text-red-400'
                : 'border-[var(--border)]'
            }`}
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {t(m.labelKey)}
              </option>
            ))}
          </select>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('tasks.modelPlaceholder')}
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
          <input
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            placeholder={t('tasks.budgetPlaceholder')}
            title={t('tasks.budgetTitle')}
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
          <button
            type="button"
            data-testid="task-submit"
            onClick={() => void submit()}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-white"
          >
            {t('tasks.submit')}
          </button>
        </div>
        {formError && (
          <div data-testid="task-form-error" className="mt-2 text-sm text-red-400">
            {formError}
          </div>
        )}
      </section>

      {/* 任务列表 */}
      <div className="min-h-0 flex-1 overflow-auto" data-testid="task-list">
        {tasks.length === 0 ? (
          <div className="pt-8 text-center text-[var(--fg-muted)]">{t('tasks.empty')}</div>
        ) : (
          <ul className="space-y-3">
            {tasks.map((task: TaskInfo) => {
              const meta = STATUS_META[task.status]
              return (
                <li
                  key={task.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs ${meta.cls}`}>
                      {t(meta.labelKey)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words">{task.prompt}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--fg-muted)]">
                        <span>{task.cwd}</span>
                        <span>{fmt.formatDateTime(task.createdAt)}</span>
                        {task.model && <span>{t('tasks.modelInfo', { name: task.model })}</span>}
                        {task.permissionMode && task.permissionMode !== 'default' && (
                          <span>{t('tasks.permissionInfo', { mode: task.permissionMode })}</span>
                        )}
                        {task.numTurns != null && (
                          <span>{t('tasks.turns', { n: task.numTurns })}</span>
                        )}
                        {task.outputTokens != null && (
                          <span>
                            {formatTokens(task.inputTokens ?? 0)} in /{' '}
                            {formatTokens(task.outputTokens)} out
                          </span>
                        )}
                        {task.totalCostUsd != null && task.backendProfileId == null && (
                          <span title={t('tasks.costTitle')}>
                            ≈ ${task.totalCostUsd.toFixed(4)}
                          </span>
                        )}
                      </div>
                      {task.error && (
                        <div className="mt-1 text-xs break-words text-red-400">{task.error}</div>
                      )}
                      {task.status === 'done' && task.resultSummary && (
                        <div className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-[var(--fg-muted)]">
                          {task.resultSummary}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                      {(task.status === 'queued' || task.status === 'running') && (
                        <button
                          type="button"
                          onClick={() => void cancel(task.id)}
                          className="rounded-md border border-red-500/40 px-2 py-1 text-red-400 hover:bg-red-500/10"
                        >
                          {t('common.cancel')}
                        </button>
                      )}
                      {task.status !== 'queued' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOutputText('')
                            setOutputFor(outputFor === task.id ? null : task.id)
                          }}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        >
                          {outputFor === task.id ? t('tasks.hideOutput') : t('tasks.viewOutput')}
                        </button>
                      )}
                      {task.sessionId && task.status === 'done' && (
                        <button
                          type="button"
                          title={t('tasks.viewSessionTitle')}
                          onClick={() => nav.goSession(task.sessionId!)}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        >
                          {t('tasks.viewSession')}
                        </button>
                      )}
                    </div>
                  </div>
                  {outputFor === task.id && (
                    <pre
                      data-testid="task-output"
                      className="mt-3 max-h-72 overflow-auto rounded-md bg-[var(--bg)] p-3 text-xs whitespace-pre-wrap"
                    >
                      {outputText || t('tasks.noOutput')}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default TasksPage
