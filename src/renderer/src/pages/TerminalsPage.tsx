import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeStatus, TerminalInfo, TerminalProfile } from '@shared/terminals'
import XtermView, { type XtermViewHandle } from '../components/terminals/XtermView'
import NewTerminalDialog from '../components/terminals/NewTerminalDialog'
import { useI18n } from '../lib/i18n'

interface Props {
  visible: boolean
  /** 外部要求聚焦某终端（恢复会话/通知点击）；seq 递增触发 */
  focusRequest: { terminalId: string; seq: number } | null
}

function statusDotClass(status: ClaudeStatus | null, exited: boolean): string {
  if (exited) return 'bg-red-500'
  switch (status) {
    case 'working':
      return 'bg-sky-500 t1-pulse'
    case 'waiting':
      return 'bg-amber-500 t1-blink'
    case 'idle':
      return 'bg-emerald-600'
    default:
      return 'bg-[var(--fg-muted)] opacity-40' // shell：无状态
  }
}

/** F2 终端页（§7.2.5）：多标签 + 左右分屏（最多 2 列）+ Ctrl+T/W/F */
function TerminalsPage({ visible, focusRequest }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [terms, setTerms] = useState<TerminalInfo[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const dragId = useRef<string | null>(null)
  const viewRefs = useRef(new Map<string, XtermViewHandle>())

  const byId = useCallback((id: string | null) => terms.find((t) => t.id === id) ?? null, [terms])

  // ---------- 主进程状态同步 ----------
  useEffect(() => {
    void window.t1doo.term.list().then((list) => {
      setTerms(list)
      setOrder(list.map((t) => t.id))
      setActiveId((prev) => prev ?? list[list.length - 1]?.id ?? null)
    })
    const offOpened = window.t1doo.term.onOpened((info) => {
      setTerms((prev) => (prev.some((t) => t.id === info.id) ? prev : [...prev, info]))
      setOrder((prev) => (prev.includes(info.id) ? prev : [...prev, info.id]))
      setActiveId(info.id)
    })
    const offUpdated = window.t1doo.term.onUpdated((info) => {
      setTerms((prev) => prev.map((t) => (t.id === info.id ? info : t)))
    })
    const offExit = window.t1doo.term.onExit(({ id, exitCode }) => {
      setTerms((prev) => prev.map((t) => (t.id === id ? { ...t, exit: { code: exitCode } } : t)))
    })
    const offClosed = window.t1doo.term.onClosed((id) => {
      setTerms((prev) => prev.filter((t) => t.id !== id))
      setOrder((prev) => prev.filter((x) => x !== id))
      setRightId((prev) => (prev === id ? null : prev))
      setActiveId((prev) => (prev === id ? null : prev))
      viewRefs.current.delete(id)
    })
    return () => {
      offOpened()
      offUpdated()
      offExit()
      offClosed()
    }
  }, [])

  // 外部聚焦请求（恢复会话 / 通知点击）：render 期调整状态，避免 effect 级联渲染
  const [appliedSeq, setAppliedSeq] = useState(0)
  if (focusRequest && focusRequest.seq !== appliedSeq) {
    setAppliedSeq(focusRequest.seq)
    setActiveId(focusRequest.terminalId)
  }

  // activeId 失效（标签被关）时回落到最后一个标签——派生而非 effect
  const activeTab =
    activeId !== null && order.includes(activeId) ? activeId : (order[order.length - 1] ?? null)

  // ---------- 操作 ----------
  const createTerminal = useCallback((profile: TerminalProfile) => {
    setDialogOpen(false)
    window.t1doo.term.create(profile).catch((err) => {
      alert(err instanceof Error ? err.message : String(err)) // claude 未安装等
    })
  }, [])

  const closeTerminal = useCallback((id: string) => {
    void window.t1doo.term.close(id)
  }, [])

  const toggleSplit = useCallback(() => {
    if (!activeTab) return
    setRightId((prev) => (prev === activeTab ? null : activeTab))
  }, [activeTab])

  // ---------- 快捷键（页面可见时全局监听；xterm 侧已放行这些组合键） ----------
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 't') {
        e.preventDefault()
        setDialogOpen(true)
      } else if (key === 'w') {
        e.preventDefault()
        if (activeTab) closeTerminal(activeTab)
      } else if (key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, activeTab, closeTerminal])

  // ---------- 布局：左 = 活动标签，右 = 固定分屏（v1 最多 2 列，§7.2.5） ----------
  const split = rightId !== null && terms.some((t) => t.id === rightId)
  const leftId = activeTab === rightId ? (order.find((id) => id !== rightId) ?? null) : activeTab
  const search = (dir: 'next' | 'prev'): void => {
    const target = viewRefs.current.get(leftId ?? '')
    if (!target || !query) return
    if (dir === 'next') target.findNext(query)
    else target.findPrevious(query)
  }

  return (
    <div className={`${visible ? 'flex' : 'hidden'} h-full flex-col`}>
      {/* 标签栏 */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {order.map((id) => {
            const term = byId(id)
            if (!term) return null
            const isActive = id === activeTab
            return (
              <div
                key={id}
                draggable
                onDragStart={() => (dragId.current = id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragId.current
                  dragId.current = null
                  if (!from || from === id) return
                  setOrder((prev) => {
                    const next = prev.filter((x) => x !== from)
                    next.splice(next.indexOf(id), 0, from)
                    return next
                  })
                }}
                onClick={() => setActiveId(id)}
                onAuxClick={(e) => {
                  if (e.button === 1) closeTerminal(id)
                }}
                title={`${term.cwd}${term.exit ? t('terminals.exitedSuffix', { code: term.exit.code }) : ''}`}
                className={`group flex max-w-52 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--bg-hover)] text-[var(--fg)]'
                    : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(term.status, term.exit !== null)}`}
                />
                <span className="truncate">{term.title}</span>
                {id === rightId && <span className="shrink-0 text-xs opacity-60">▐</span>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTerminal(id)
                  }}
                  className="shrink-0 rounded px-0.5 opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={toggleSplit}
          disabled={!activeTab}
          title={t(rightId === activeTab ? 'terminals.unsplit' : 'terminals.pinRight')}
          className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-40"
        >
          ◫
        </button>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          title={t('terminals.newWithShortcut')}
          className="shrink-0 rounded-md border border-[var(--accent)] px-2.5 py-1 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)]"
        >
          ＋
        </button>
      </div>

      {/* 终端区：所有实例常驻 DOM（display 切换），避免重放闪烁并保住滚动位置 */}
      <div className="relative flex min-h-0 flex-1">
        {terms.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--fg-muted)]">
            <p>{t('terminals.empty')}</p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="rounded-md border border-[var(--accent)] px-4 py-2 text-[var(--accent)] hover:bg-[var(--bg-hover)]"
            >
              {t('terminals.newWithShortcut')}
            </button>
          </div>
        )}
        {terms.map((term) => {
          const isLeft = term.id === leftId
          const isRight = split && term.id === rightId
          const shown = isLeft || isRight
          return (
            <div
              key={term.id}
              style={{ order: isRight ? 1 : 0 }}
              className={`${shown ? 'block' : 'hidden'} min-w-0 flex-1 ${
                isRight ? 'border-l border-[var(--border)]' : ''
              } bg-[var(--bg-panel)] p-1`}
            >
              {term.exit && (
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1 text-xs text-[var(--fg-muted)]">
                  <span>{t('terminals.processExited', { code: term.exit.code })}</span>
                  <button
                    type="button"
                    onClick={() => closeTerminal(term.id)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 hover:text-[var(--fg)]"
                  >
                    {t('terminals.closeTab')}
                  </button>
                </div>
              )}
              <XtermView
                terminalId={term.id}
                visible={visible && shown}
                ref={(h) => {
                  if (h) viewRefs.current.set(term.id, h)
                  else viewRefs.current.delete(term.id)
                }}
              />
            </div>
          )
        })}

        {/* Ctrl+F 搜索浮层（作用于左侧活动终端） */}
        {searchOpen && (
          <div className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-1 shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search(e.shiftKey ? 'prev' : 'next')
                if (e.key === 'Escape') {
                  setSearchOpen(false)
                  viewRefs.current.get(leftId ?? '')?.clearSearch()
                }
              }}
              placeholder={t('terminals.searchPlaceholder')}
              className="w-44 rounded border border-transparent bg-[var(--bg)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => search('prev')}
              className="px-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => search('next')}
              className="px-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false)
                viewRefs.current.get(leftId ?? '')?.clearSearch()
              }}
              className="px-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {dialogOpen && (
        <NewTerminalDialog onClose={() => setDialogOpen(false)} onCreate={createTerminal} />
      )}
    </div>
  )
}

export default TerminalsPage
