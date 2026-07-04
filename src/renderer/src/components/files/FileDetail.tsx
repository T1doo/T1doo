import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FileHit } from '@shared/files'
import { dirOf, formatBytes, formatDateTime, formatRelative, projectShortName } from '../../lib/format'
import { useAppNav } from '../../lib/app-nav'
import type { FileAction } from './FileList'

interface FileDetailProps {
  hit: FileHit
  onAction: (action: FileAction, hit: FileHit) => void
}

const OP_LABEL: Record<string, string> = { edit: '编辑', write: '写入', read: '读取' }

/** 右侧详情：文件信息 + 操作 + 标签 + 「被哪些会话动过」反查（F4 验收①） */
function FileDetail({ hit, onAction }: FileDetailProps): React.JSX.Element {
  const nav = useAppNav()
  const queryClient = useQueryClient()
  const [tagDraft, setTagDraft] = useState('')
  // 标签走本地态（mutation 后 prop 里的 hit 还是旧值）；换文件时渲染期重置
  const [tagsFor, setTagsFor] = useState<{ path: string; tags: string[] }>({
    path: hit.path,
    tags: hit.tags
  })
  if (tagsFor.path !== hit.path) {
    setTagsFor({ path: hit.path, tags: hit.tags })
    setTagDraft('')
  }
  const tags = tagsFor.tags

  const sessionsQuery = useQuery({
    queryKey: ['file-sessions', hit.path],
    queryFn: () => window.t1doo.files.sessionsFor(hit.path)
  })

  const setTags = useMutation({
    mutationFn: (next: string[]) => window.t1doo.files.setMeta(hit.path, { tags: next }),
    onSuccess: (_data, next) => {
      setTagsFor({ path: hit.path, tags: next })
      void queryClient.invalidateQueries({ queryKey: ['files'] })
    }
  })

  const addTag = (): void => {
    const t = tagDraft.trim().replace(/^#/, '')
    if (!t || tags.includes(t)) {
      setTagDraft('')
      return
    }
    setTags.mutate([...tags, t])
    setTagDraft('')
  }

  const actionBtn =
    'rounded-md border border-[var(--border)] px-2.5 py-1 text-[13px] text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]'

  return (
    <div className="flex h-full flex-col overflow-auto p-5">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 break-all text-lg font-semibold">{hit.name}</h2>
        <button
          type="button"
          title={hit.pinned ? '取消收藏' : '收藏'}
          onClick={() => onAction('toggle-pin', hit)}
          className={`shrink-0 text-xl leading-7 ${hit.pinned ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
        >
          {hit.pinned ? '★' : '☆'}
        </button>
      </div>
      <div className="mt-1 break-all text-xs text-[var(--fg-muted)]">{dirOf(hit.path)}</div>
      <div className="mt-2 flex gap-4 text-xs text-[var(--fg-muted)]">
        {hit.size != null && <span>{formatBytes(hit.size)}</span>}
        {hit.mtime != null && <span title={formatDateTime(hit.mtime)}>修改于 {formatRelative(hit.mtime)}</span>}
        {hit.source === 'everything' && <span>来源：Everything 全盘</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={actionBtn} onClick={() => onAction('open', hit)}>
          打开
        </button>
        <button type="button" className={actionBtn} onClick={() => onAction('reveal', hit)}>
          资源管理器
        </button>
        <button type="button" className={actionBtn} onClick={() => onAction('copy-path', hit)}>
          复制路径
        </button>
        <button type="button" className={actionBtn} onClick={() => onAction('open-terminal', hit)}>
          在终端中打开
        </button>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-[var(--fg-muted)]">标签</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded bg-[var(--bg-hover)] px-2 py-0.5 text-xs"
            >
              #{t}
              <button
                type="button"
                className="text-[var(--fg-muted)] hover:text-[var(--fg)]"
                onClick={() => setTags.mutate(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag()
            }}
            placeholder="+ 标签，回车添加"
            className="w-32 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-xs outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="mt-6 min-h-0">
        <h3 className="mb-2 text-sm font-medium text-[var(--fg-muted)]">
          动过此文件的会话{sessionsQuery.data ? `（${sessionsQuery.data.length}）` : ''}
        </h3>
        {sessionsQuery.isLoading ? (
          <div className="text-sm text-[var(--fg-muted)]">加载中…</div>
        ) : !sessionsQuery.data?.length ? (
          <div className="text-sm text-[var(--fg-muted)]">没有会话动过这个文件</div>
        ) : (
          <ul className="space-y-2">
            {sessionsQuery.data.map((ref) => {
              const ops = [
                ref.editCount ? `${OP_LABEL.edit} ${ref.editCount}` : null,
                ref.writeCount ? `${OP_LABEL.write} ${ref.writeCount}` : null,
                ref.readCount ? `${OP_LABEL.read} ${ref.readCount}` : null
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li
                  key={ref.sessionId}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-3"
                >
                  <button
                    type="button"
                    onClick={() => nav.goSession(ref.sessionId)}
                    className="block w-full truncate text-left font-medium hover:text-[var(--accent)]"
                    title="打开会话详情"
                  >
                    {ref.title}
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--fg-muted)]">
                    <span className="truncate">
                      {projectShortName(ref.projectPath)} · {ops}
                    </span>
                    <span className="shrink-0">{formatRelative(ref.lastTs)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default FileDetail
