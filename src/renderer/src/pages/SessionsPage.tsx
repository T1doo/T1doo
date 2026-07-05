import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SyncProgress } from '@shared/sessions'
import SessionList from '../components/sessions/SessionList'
import SearchResults from '../components/sessions/SearchResults'
import SessionDetail from '../components/sessions/SessionDetail'
import { projectShortName } from '../lib/format'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

interface SessionsPageProps {
  /** 外部要求展开某会话（任务卡片"查看会话"等）；seq 递增触发 */
  focusRequest?: { sessionId: string; seq: number } | null
}

function SessionsPage({ focusRequest }: SessionsPageProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q.trim(), 250)
  const [projectId, setProjectId] = useState<number | undefined>(undefined)
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targetUuid, setTargetUuid] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)

  // render 期对比 seq 调整选中（react-hooks v7：不在 effect 内同步 setState）
  const [prevFocusSeq, setPrevFocusSeq] = useState<number | null>(null)
  if (focusRequest && focusRequest.seq !== prevFocusSeq) {
    setPrevFocusSeq(focusRequest.seq)
    setSelectedId(focusRequest.sessionId)
    setTargetUuid(null)
  }

  const sessionsQuery = useQuery({
    queryKey: ['sessions', projectId ?? null, pinnedOnly],
    queryFn: () => window.t1doo.sessions.list({ projectId, pinnedOnly })
  })
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => window.t1doo.sessions.projects()
  })
  const searching = debouncedQ.length > 0
  const searchQuery = useQuery({
    queryKey: ['search', debouncedQ, projectId ?? null],
    queryFn: () => window.t1doo.sessions.search(debouncedQ, projectId),
    enabled: searching
  })

  // 主进程增量事件 → 失效相关查询
  useEffect(() => {
    const offUpdated = window.t1doo.sessions.onUpdated((ids) => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
      for (const id of ids) {
        void queryClient.invalidateQueries({ queryKey: ['session', id] })
      }
    })
    const offProgress = window.t1doo.sessions.onProgress((p) => {
      setProgress(p.phase === 'done' ? null : p)
    })
    return () => {
      offUpdated()
      offProgress()
    }
  }, [queryClient])

  const select = (id: string, uuid: string | null = null): void => {
    setSelectedId(id)
    setTargetUuid(uuid)
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="space-y-2 border-b border-[var(--border)] p-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="全文搜索所有会话…"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
          />
          <div className="flex items-center gap-2">
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[13px]"
            >
              <option value="">全部项目（{projectsQuery.data?.length ?? 0}）</option>
              {projectsQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {projectShortName(p.path)}（{p.sessionCount}）
                </option>
              ))}
            </select>
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[13px] text-[var(--fg-muted)]">
              <input
                type="checkbox"
                checked={pinnedOnly}
                onChange={(e) => setPinnedOnly(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              仅收藏
            </label>
          </div>
        </div>

        {progress && (
          <div className="border-b border-[var(--border)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
            正在索引会话… {progress.done}/{progress.total}
            <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--bg-hover)]">
              <div
                className="h-full bg-[var(--accent)] transition-all"
                style={{
                  width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%'
                }}
              />
            </div>
          </div>
        )}

        {searching ? (
          <SearchResults
            hits={searchQuery.data ?? []}
            isLoading={searchQuery.isLoading}
            onSelect={(sid, uuid) => select(sid, uuid)}
          />
        ) : sessionsQuery.isLoading ? (
          <div className="p-6 text-center text-[var(--fg-muted)]">加载中…</div>
        ) : (
          <SessionList
            sessions={sessionsQuery.data ?? []}
            selectedId={selectedId}
            onSelect={(id) => select(id)}
          />
        )}
      </aside>

      <section className="min-w-0 flex-1">
        {selectedId ? (
          <SessionDetail sessionId={selectedId} targetUuid={targetUuid} />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--fg-muted)]">
            选择一个会话查看回放
          </div>
        )}
      </section>
    </div>
  )
}

export default SessionsPage
