import type { SearchHit } from '@shared/sessions'
import { useFormat } from '../../lib/format'
import { useI18n } from '../../lib/i18n'

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
  const { t } = useI18n()
  const fmt = useFormat()
  if (isLoading) {
    return <div className="p-6 text-center text-[var(--fg-muted)]">{t('sessions.searching')}</div>
  }
  if (hits.length === 0) {
    return <div className="p-6 text-center text-[var(--fg-muted)]">{t('sessions.noMatches')}</div>
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
            <span>{fmt.projectShortName(h.projectPath)}</span>
            <span>{h.role === 'user' ? t('sessions.roleUser') : t('sessions.roleAssistant')}</span>
            <span>{fmt.formatRelative(h.ts)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

export default SearchResults
