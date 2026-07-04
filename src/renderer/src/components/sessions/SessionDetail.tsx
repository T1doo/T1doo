import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MessageView, SessionSummary } from '@shared/sessions'
import MessageItem from './MessageItem'
import { formatDateTime, formatTokens, projectShortName } from '../../lib/format'

type DetailItem =
  { kind: 'msg'; message: MessageView } | { kind: 'sidechain'; messages: MessageView[] }

/** 连续的侧链消息（子代理轨迹）折叠为一个可展开块（§7.1） */
function groupMessages(messages: MessageView[]): DetailItem[] {
  const items: DetailItem[] = []
  let chain: MessageView[] = []
  for (const m of messages) {
    if (m.isSidechain) {
      chain.push(m)
    } else {
      if (chain.length) {
        items.push({ kind: 'sidechain', messages: chain })
        chain = []
      }
      items.push({ kind: 'msg', message: m })
    }
  }
  if (chain.length) items.push({ kind: 'sidechain', messages: chain })
  return items
}

function SidechainGroup({ messages }: { messages: MessageView[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="mx-4 my-1 rounded-md border border-dashed border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
      >
        {open ? '▾' : '▸'} 子代理轨迹 · {messages.length} 条
      </button>
      {open && (
        <div className="border-t border-dashed border-[var(--border)]">
          {messages.map((m) => (
            <MessageItem key={m.uuid} message={m} />
          ))}
        </div>
      )}
    </div>
  )
}

interface SessionDetailProps {
  sessionId: string
  /** 从搜索结果进入时定位到的消息 */
  targetUuid: string | null
}

function SessionDetail({ sessionId, targetUuid }: SessionDetailProps): React.JSX.Element {
  const detailQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => window.t1doo.sessions.get(sessionId)
  })
  const [pinned, setPinned] = useState<boolean | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const items = useMemo(
    () => (detailQuery.data ? groupMessages(detailQuery.data.messages) : []),
    [detailQuery.data]
  )

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 8
  })

  // 搜索跳转：定位目标消息
  useEffect(() => {
    if (!targetUuid || items.length === 0) return
    const idx = items.findIndex(
      (it) =>
        (it.kind === 'msg' && it.message.uuid === targetUuid) ||
        (it.kind === 'sidechain' && it.messages.some((m) => m.uuid === targetUuid))
    )
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' })
  }, [targetUuid, items, virtualizer])

  useEffect(() => {
    setPinned(null)
    setExportMsg(null)
  }, [sessionId])

  if (detailQuery.isLoading) {
    return <div className="p-8 text-[var(--fg-muted)]">解析会话全文中…</div>
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="p-8 text-[var(--fg-muted)]">
        无法加载会话：{String(detailQuery.error ?? '未知错误')}
      </div>
    )
  }

  const detail = detailQuery.data
  const s: SessionSummary = detail.summary
  const isPinned = pinned ?? s.pinned

  const togglePin = (): void => {
    const next = !isPinned
    setPinned(next)
    void window.t1doo.sessions.update(s.id, { pinned: next })
  }

  const doExport = (fmt: 'md' | 'json'): void => {
    void window.t1doo.sessions.export(s.id, fmt).then((path) => {
      if (path) {
        setExportMsg(`已导出：${path}`)
        setTimeout(() => setExportMsg(null), 6000)
      }
    })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg-panel)] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold" title={s.title}>
            {s.title}
          </h2>
          <button
            type="button"
            onClick={togglePin}
            title={isPinned ? '取消收藏' : '收藏'}
            className={`rounded-md border border-[var(--border)] px-2 py-1 text-sm ${
              isPinned ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)]'
            } hover:bg-[var(--bg-hover)]`}
          >
            {isPinned ? '★' : '☆'}
          </button>
          <button
            type="button"
            onClick={() => void window.t1doo.sessions.resume(s.id)}
            title="在 Windows Terminal 中恢复此会话"
            className="rounded-md border border-[var(--accent)] px-3 py-1 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            ▶ 恢复会话
          </button>
          <button
            type="button"
            onClick={() => doExport('md')}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          >
            导出 MD
          </button>
          <button
            type="button"
            onClick={() => doExport('json')}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          >
            导出 JSON
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--fg-muted)]">
          <span title={s.projectPath ?? ''}>📁 {projectShortName(s.projectPath)}</span>
          {s.gitBranch && <span>⎇ {s.gitBranch}</span>}
          {s.modelLast && <span>{s.modelLast}</span>}
          <span>{s.messageCount} 条消息</span>
          <span>
            tokens：↑{formatTokens(s.inputTokens)} ↓{formatTokens(s.outputTokens)}
            {s.cacheReadTokens > 0 && ` （缓存读 ${formatTokens(s.cacheReadTokens)}）`}
          </span>
          <span>{formatDateTime(s.updatedAt)}</span>
          {detail.badLineCount > 0 && <span>⚠ {detail.badLineCount} 行无法解析已跳过</span>}
        </div>
        {exportMsg && <div className="mt-1 text-xs text-[var(--accent)]">{exportMsg}</div>}
      </header>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index]
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                {item.kind === 'msg' ? (
                  <MessageItem message={item.message} />
                ) : (
                  <SidechainGroup messages={item.messages} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default SessionDetail
