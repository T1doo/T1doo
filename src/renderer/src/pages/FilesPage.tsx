import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FILE_CATEGORIES } from '@shared/files'
import type { FileHit, FilesIndexProgress, SessionFileActivity } from '@shared/files'
import FileList, { type FileAction } from '../components/files/FileList'
import FileDetail from '../components/files/FileDetail'
import { formatRelative } from '../lib/format'
import { useAppNav } from '../lib/app-nav'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

const TIME_RANGES: { value: string; label: string; ms: number }[] = [
  { value: '', label: '全部时间', ms: 0 },
  { value: '1d', label: '24 小时内', ms: 86_400_000 },
  { value: '7d', label: '7 天内', ms: 7 * 86_400_000 },
  { value: '30d', label: '30 天内', ms: 30 * 86_400_000 }
]

const CATEGORY_LABELS: { value: string; label: string }[] = [
  { value: '', label: '全部类型' },
  { value: 'code', label: '代码' },
  { value: 'doc', label: '文档' },
  { value: 'image', label: '图片' },
  { value: 'media', label: '音视频' }
]

type ViewTab = 'activity' | 'opened' | 'pinned'

const TABS: { id: ViewTab; label: string }[] = [
  { id: 'activity', label: '会话动过' },
  { id: 'opened', label: '最近打开' },
  { id: 'pinned', label: '收藏' }
]

const OP_LABEL: Record<string, string> = { edit: '编辑', write: '写入' }

/** 会话流条目 → 文件条目视图（详情面板与右键菜单共用 FileHit 形态） */
function activityToHit(a: SessionFileActivity): FileHit {
  return {
    path: a.path,
    name: a.name,
    ext: null,
    size: null,
    mtime: a.lastTs,
    pinned: a.pinned,
    tags: a.tags,
    sessionCount: a.sessionCount,
    source: 'index'
  }
}

function FilesPage(): React.JSX.Element {
  const nav = useAppNav()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q.trim(), 250)
  const [category, setCategory] = useState('')
  const [timeRange, setTimeRange] = useState('')
  const [useEverything, setUseEverything] = useState(false)
  const [tab, setTab] = useState<ViewTab>('activity')
  const [selected, setSelected] = useState<FileHit | null>(null)
  const [progress, setProgress] = useState<FilesIndexProgress | null>(null)

  const stateQuery = useQuery({
    queryKey: ['files', 'state'],
    queryFn: () => window.t1doo.files.getState()
  })

  const searching = debouncedQ.length > 0
  const searchQuery = useQuery({
    queryKey: ['files', 'search', debouncedQ, category, timeRange, useEverything],
    queryFn: () => {
      const range = TIME_RANGES.find((r) => r.value === timeRange)
      return window.t1doo.files.search(debouncedQ, {
        exts: category ? FILE_CATEGORIES[category] : undefined,
        mtimeAfter: range?.ms ? Date.now() - range.ms : undefined,
        everything: useEverything,
        limit: 100
      })
    },
    enabled: searching
  })

  const activityQuery = useQuery({
    queryKey: ['files', 'activity'],
    queryFn: () => window.t1doo.files.activity(100),
    enabled: !searching && tab === 'activity'
  })
  const openedQuery = useQuery({
    queryKey: ['files', 'opened'],
    queryFn: () => window.t1doo.files.recentOpened(50),
    enabled: !searching && tab === 'opened'
  })
  const pinnedQuery = useQuery({
    queryKey: ['files', 'pinned'],
    queryFn: () => window.t1doo.files.pinned(),
    enabled: !searching && tab === 'pinned'
  })

  // 索引增量/扫描完成 → 失效所有文件查询；会话同步会新增 session_files，一并吃 sessions 更新事件
  useEffect(() => {
    const offUpdated = window.t1doo.files.onUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      void queryClient.invalidateQueries({ queryKey: ['file-sessions'] })
    })
    const offSessions = window.t1doo.sessions.onUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['files', 'activity'] })
      void queryClient.invalidateQueries({ queryKey: ['file-sessions'] })
    })
    const offProgress = window.t1doo.files.onIndexProgress((p) => {
      setProgress(p.phase === 'done' ? null : p)
      if (p.phase === 'done') {
        void queryClient.invalidateQueries({ queryKey: ['files', 'state'] })
      }
    })
    return () => {
      offUpdated()
      offSessions()
      offProgress()
    }
  }, [queryClient])

  const onAction = (action: FileAction, hit: FileHit): void => {
    switch (action) {
      case 'open':
        void window.t1doo.files.open(hit.path)
        break
      case 'reveal':
        void window.t1doo.files.reveal(hit.path)
        break
      case 'copy-path':
        void window.t1doo.files.copyPath(hit.path)
        break
      case 'open-terminal':
        void window.t1doo.files.openTerminal(hit.path).then((info) => nav.goTerminal(info.id))
        break
      case 'toggle-pin':
        void window.t1doo.files
          .setMeta(hit.path, { pinned: !hit.pinned })
          .then(() => queryClient.invalidateQueries({ queryKey: ['files'] }))
        if (selected?.path === hit.path) setSelected({ ...selected, pinned: !hit.pinned })
        break
      case 'go-sessions':
        setSelected(hit) // 详情面板即会话反查视图
        break
    }
  }

  const state = stateQuery.data
  const noDirs = state != null && state.dirs.length === 0

  return (
    <div className="flex h-full">
      <aside className="flex w-[420px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="space-y-2 border-b border-[var(--border)] p-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按文件名搜索订阅目录…"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-[var(--accent)]"
          />
          <div className="flex items-center gap-2 text-[13px]">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            >
              {CATEGORY_LABELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
            >
              {TIME_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <label
              className={`flex shrink-0 items-center gap-1 ${
                state?.everything.available
                  ? 'cursor-pointer text-[var(--fg-muted)]'
                  : 'cursor-not-allowed opacity-50'
              }`}
              title={state?.everything.available ? 'Everything 全盘搜索' : (state?.everything.reason ?? '')}
            >
              <input
                type="checkbox"
                checked={useEverything && !!state?.everything.available}
                disabled={!state?.everything.available}
                onChange={(e) => setUseEverything(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              全盘
            </label>
          </div>
        </div>

        {progress && (
          <div className="border-b border-[var(--border)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
            正在索引文件… 已扫描 {progress.scanned.toLocaleString()} 个
          </div>
        )}

        {noDirs && !searching && (
          <div className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--fg-muted)]">
            还没有订阅目录——「会话动过」照常可用；要按文件名搜索，请先在
            <button
              type="button"
              className="mx-1 text-[var(--accent)] hover:underline"
              onClick={() => nav.goPage('settings')}
            >
              设置
            </button>
            里添加订阅目录
          </div>
        )}

        {searching ? (
          searchQuery.isLoading ? (
            <div className="p-6 text-center text-[var(--fg-muted)]">搜索中…</div>
          ) : (
            <FileList
              hits={searchQuery.data ?? []}
              selectedPath={selected?.path ?? null}
              emptyText="没有匹配的文件"
              onSelect={setSelected}
              onAction={onAction}
            />
          )
        ) : (
          <>
            <div className="flex border-b border-[var(--border)]">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 px-3 py-2 text-[13px] transition-colors ${
                    tab === t.id
                      ? 'border-b-2 border-[var(--accent)] font-medium text-[var(--fg)]'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'activity' &&
              (activityQuery.isLoading ? (
                <div className="p-6 text-center text-[var(--fg-muted)]">加载中…</div>
              ) : !activityQuery.data?.length ? (
                <div className="p-6 text-center text-[var(--fg-muted)]">
                  还没有会话修改过文件的记录
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <ul>
                    {activityQuery.data.map((a) => (
                      <li key={a.path}>
                        <button
                          type="button"
                          onClick={() => setSelected(activityToHit(a))}
                          className={`w-full border-b border-[var(--border)] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] ${
                            selected?.path === a.path ? 'bg-[var(--bg-hover)]' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {a.pinned && (
                              <span className="shrink-0 text-xs text-[var(--accent)]">★</span>
                            )}
                            <span className="truncate font-medium">{a.name}</span>
                            <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 text-xs text-[var(--fg-muted)]">
                              {OP_LABEL[a.lastOp] ?? a.lastOp}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-[var(--fg-muted)]">
                            <span className="min-w-0 truncate">
                              {a.lastSessionTitle ?? a.lastSessionId}
                              {a.sessionCount > 1 ? ` 等 ${a.sessionCount} 个会话` : ''}
                            </span>
                            <span className="shrink-0">{formatRelative(a.lastTs)}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {tab === 'opened' &&
              (openedQuery.isLoading ? (
                <div className="p-6 text-center text-[var(--fg-muted)]">加载中…</div>
              ) : (
                <FileList
                  hits={openedQuery.data ?? []}
                  selectedPath={selected?.path ?? null}
                  emptyText="还没有打开记录（从这里或启动器打开文件后出现）"
                  onSelect={setSelected}
                  onAction={onAction}
                />
              ))}
            {tab === 'pinned' &&
              (pinnedQuery.isLoading ? (
                <div className="p-6 text-center text-[var(--fg-muted)]">加载中…</div>
              ) : (
                <FileList
                  hits={pinnedQuery.data ?? []}
                  selectedPath={selected?.path ?? null}
                  emptyText="右键文件或点详情里的 ☆ 即可收藏"
                  onSelect={setSelected}
                  onAction={onAction}
                />
              ))}
          </>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        {selected ? (
          <FileDetail hit={selected} onAction={onAction} />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--fg-muted)]">
            选择一个文件查看详情与关联会话
          </div>
        )}
      </section>
    </div>
  )
}

export default FilesPage
