import type { SearchHit } from '@shared/sessions'
import { formatRelative, projectShortName } from '../../lib/format'

/** dao.SNIPPET_OPEN/CLOSE 标记 → <mark> */
function renderSnippet(snippet: string): React.ReactNode[] {
  const parts = snippet.split(/[⟦⟧]/)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-[var(--accent)]/25 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

interface SearchResultsProps {
  hits: SearchHit[]
  isLoading: boolean
  onSelect: (sessionId: string, messageUuid: string) => void
}

function SearchResults({ hits, isLoading, onSelect }: SearchResultsProps): React.JSX.Element {
  if (isLoading) {
    return <div className="p-6 text-center text-[var(--fg-muted)]">搜索中…</div>
  }
  if (hits.length === 0) {
    return <div className="p-6 text-center text-[var(--fg-muted)]">没有匹配的消息</div>
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {hits.map((h) => (
        <button
          key={`${h.sessionId}:${h.messageUuid}`}
          type="button"
          onClick={() => onSelect(h.sessionId, h.messageUuid)}
          className="block w-full border-b border-[var(--border)] px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
        >
          <div className="truncate text-[13px] font-medium">{h.sessionTitle}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-[var(--fg-muted)]">
            {renderSnippet(h.snippet)}
          </div>
          <div className="mt-0.5 flex gap-2 text-xs text-[var(--fg-muted)]">
            <span>{projectShortName(h.projectPath)}</span>
            <span>{h.role === 'user' ? '用户' : '助手'}</span>
            <span>{formatRelative(h.ts)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

export default SearchResults
