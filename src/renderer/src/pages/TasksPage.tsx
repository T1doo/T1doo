import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { TaskInfo, TaskStatus } from '@shared/ai'
import type { BackendProfileView } from '@shared/backend'
import type { PermissionMode } from '@shared/terminals'
import { useAppNav } from '../lib/app-nav'
import { formatDateTime, formatTokens } from '../lib/format'

const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  queued: { label: '排队中', cls: 'bg-[var(--bg-hover)] text-[var(--fg-muted)]' },
  running: { label: '执行中', cls: 'bg-blue-500/15 text-blue-400' },
  done: { label: '完成', cls: 'bg-green-500/15 text-green-400' },
  failed: { label: '失败', cls: 'bg-red-500/15 text-red-400' },
  cancelled: { label: '已取消', cls: 'bg-[var(--bg-hover)] text-[var(--fg-muted)]' }
}

const PERMISSION_MODES: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: 'default（保守，默认）' },
  { value: 'acceptEdits', label: 'acceptEdits（自动接受编辑）' },
  { value: 'plan', label: 'plan（只做计划）' },
  { value: 'dontAsk', label: 'dontAsk' },
  { value: 'auto', label: 'auto' },
  { value: 'bypassPermissions', label: 'bypassPermissions（危险）' }
]

function TasksPage(): React.JSX.Element {
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
      setFormError('任务描述不能为空')
      return
    }
    if (!cwd.trim()) {
      setFormError('请选择工作目录')
      return
    }
    if (permissionMode === 'bypassPermissions') {
      // §7.5.2：bypassPermissions 双重确认
      if (!window.confirm('bypassPermissions 会跳过全部权限确认，Claude 可无限制修改文件与执行命令。确定继续？')) {
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
      <h1 className="mb-4 text-xl font-semibold">任务队列</h1>

      {/* 提交表单（§7.5.2 最小闭环：提交 → 后台执行 → 通知 → 查看结果） */}
      <section className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="任务描述（将派发给无头 Claude Code 在后台执行）…"
          rows={3}
          data-testid="task-prompt"
          className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="工作目录"
              data-testid="task-cwd"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            />
            <button
              type="button"
              onClick={() => void pickCwd()}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              浏览…
            </button>
          </div>
          <select
            value={backendProfileId}
            onChange={(e) => setBackendProfileId(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            <option value="">默认后端档案</option>
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
                {m.label}
              </option>
            ))}
          </select>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="模型（可选）"
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
          <input
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            placeholder="预算 $（可选）"
            title="--max-budget-usd 成本闸（API 计费后端适用）"
            className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
          <button
            type="button"
            data-testid="task-submit"
            onClick={() => void submit()}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-white"
          >
            提交任务
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
          <div className="pt-8 text-center text-[var(--fg-muted)]">
            暂无任务。提交一个任务描述，T1doo 会派发给无头 Claude Code 后台执行，完成后通知你。
          </div>
        ) : (
          <ul className="space-y-3">
            {tasks.map((t: TaskInfo) => {
              const meta = STATUS_META[t.status]
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words">{t.prompt}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--fg-muted)]">
                        <span>{t.cwd}</span>
                        <span>{formatDateTime(t.createdAt)}</span>
                        {t.model && <span>模型 {t.model}</span>}
                        {t.permissionMode && t.permissionMode !== 'default' && (
                          <span>权限 {t.permissionMode}</span>
                        )}
                        {t.numTurns != null && <span>{t.numTurns} 回合</span>}
                        {t.outputTokens != null && (
                          <span>
                            {formatTokens(t.inputTokens ?? 0)} in / {formatTokens(t.outputTokens)}{' '}
                            out
                          </span>
                        )}
                        {t.totalCostUsd != null && t.backendProfileId == null && (
                          <span title="claude result 事件回报的名义成本；订阅态仅供参考（§7.6）">
                            ≈ ${t.totalCostUsd.toFixed(4)}
                          </span>
                        )}
                      </div>
                      {t.error && (
                        <div className="mt-1 text-xs break-words text-red-400">{t.error}</div>
                      )}
                      {t.status === 'done' && t.resultSummary && (
                        <div className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-[var(--fg-muted)]">
                          {t.resultSummary}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                      {(t.status === 'queued' || t.status === 'running') && (
                        <button
                          type="button"
                          onClick={() => void cancel(t.id)}
                          className="rounded-md border border-red-500/40 px-2 py-1 text-red-400 hover:bg-red-500/10"
                        >
                          取消
                        </button>
                      )}
                      {t.status !== 'queued' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOutputText('')
                            setOutputFor(outputFor === t.id ? null : t.id)
                          }}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        >
                          {outputFor === t.id ? '收起输出' : '查看输出'}
                        </button>
                      )}
                      {t.sessionId && t.status === 'done' && (
                        <button
                          type="button"
                          title="任务产生的会话已进入会话中心"
                          onClick={() => nav.goSession(t.sessionId!)}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        >
                          查看会话
                        </button>
                      )}
                    </div>
                  </div>
                  {outputFor === t.id && (
                    <pre
                      data-testid="task-output"
                      className="mt-3 max-h-72 overflow-auto rounded-md bg-[var(--bg)] p-3 text-xs whitespace-pre-wrap"
                    >
                      {outputText || '（暂无输出）'}
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
