import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionSummary } from '@shared/sessions'
import { useFormat } from '../../lib/format'
import { useI18n } from '../../lib/i18n'

interface SessionListProps {
  sessions: SessionSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const ROW_HEIGHT = 64

function SessionList({ sessions, selectedId, onSelect }: SessionListProps): React.JSX.Element {
  const { t } = useI18n()
  const fmt = useFormat()
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  if (sessions.length === 0) {
    return <div className="p-6 text-center text-[var(--fg-muted)]">{t('sessions.noSessions')}</div>
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const s = sessions[vi.index]
          const selected = s.id === selectedId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`absolute top-0 left-0 block w-full border-b border-[var(--border)] px-3 py-2 text-left ${
                selected ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'
              }`}
              style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
            >
              <div className="flex items-center gap-1.5">
                {s.pinned && <span className="shrink-0 text-xs text-[var(--accent)]">★</span>}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={s.title}>
                  {s.title}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span className="max-w-[40%] truncate" title={s.projectPath ?? ''}>
                  {fmt.projectShortName(s.projectPath)}
                </span>
                <span>{fmt.formatRelative(s.updatedAt)}</span>
                <span>{t('sessions.messageCountShort', { n: s.messageCount })}</span>
                <span>↓{fmt.formatTokens(s.outputTokens)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SessionList
