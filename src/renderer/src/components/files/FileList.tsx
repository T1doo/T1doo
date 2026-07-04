import { useEffect, useState } from 'react'
import type { FileHit } from '@shared/files'
import { dirOf, formatBytes, formatRelative } from '../../lib/format'

export type FileAction =
  | 'open'
  | 'reveal'
  | 'copy-path'
  | 'open-terminal'
  | 'toggle-pin'
  | 'go-sessions'

const MENU_ITEMS: { action: FileAction; label: (h: FileHit) => string; disabled?: (h: FileHit) => boolean }[] = [
  { action: 'open', label: () => '打开' },
  { action: 'reveal', label: () => '在资源管理器中显示' },
  { action: 'copy-path', label: () => '复制路径' },
  { action: 'open-terminal', label: () => '在终端中打开' },
  { action: 'toggle-pin', label: (h) => (h.pinned ? '取消收藏' : '收藏') },
  {
    action: 'go-sessions',
    label: (h) => `跳到动过它的会话（${h.sessionCount}）`,
    disabled: (h) => h.sessionCount === 0
  }
]

interface MenuState {
  x: number
  y: number
  hit: FileHit
}

interface FileListProps {
  hits: FileHit[]
  selectedPath: string | null
  emptyText: string
  onSelect: (hit: FileHit) => void
  onAction: (action: FileAction, hit: FileHit) => void
}

function FileList({
  hits,
  selectedPath,
  emptyText,
  onSelect,
  onAction
}: FileListProps): React.JSX.Element {
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = (): void => setMenu(null)
    window.addEventListener('blur', close)
    return () => window.removeEventListener('blur', close)
  }, [menu])

  if (hits.length === 0) {
    return <div className="p-6 text-center text-[var(--fg-muted)]">{emptyText}</div>
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ul>
        {hits.map((h) => (
          <li key={`${h.source}:${h.path}`}>
            <button
              type="button"
              onClick={() => onSelect(h)}
              onDoubleClick={() => onAction('open', h)}
              onContextMenu={(e) => {
                e.preventDefault()
                onSelect(h)
                setMenu({ x: e.clientX, y: e.clientY, hit: h })
              }}
              className={`w-full border-b border-[var(--border)] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] ${
                selectedPath === h.path ? 'bg-[var(--bg-hover)]' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {h.pinned && <span className="shrink-0 text-xs text-[var(--accent)]">★</span>}
                <span className="truncate font-medium">{h.name}</span>
                {h.sessionCount > 0 && (
                  <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 text-xs text-[var(--accent)]">
                    {h.sessionCount} 会话
                  </span>
                )}
                {h.source === 'everything' && (
                  <span className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 text-xs text-[var(--fg-muted)]">
                    Everything
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span className="min-w-0 flex-1 truncate">{dirOf(h.path)}</span>
                {h.size != null && <span className="shrink-0">{formatBytes(h.size)}</span>}
                {h.mtime != null && <span className="shrink-0">{formatRelative(h.mtime)}</span>}
              </div>
              {h.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {h.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-[var(--bg-hover)] px-1.5 text-xs text-[var(--fg-muted)]"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div
            className="fixed z-50 min-w-44 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
            style={{
              left: Math.min(menu.x, window.innerWidth - 200),
              top: Math.min(menu.y, window.innerHeight - MENU_ITEMS.length * 32 - 16)
            }}
          >
            {MENU_ITEMS.map((item) => {
              const disabled = item.disabled?.(menu.hit) ?? false
              return (
                <button
                  key={item.action}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setMenu(null)
                    onAction(item.action, menu.hit)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {item.label(menu.hit)}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default FileList
