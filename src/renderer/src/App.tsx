import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DashboardPage from './pages/DashboardPage'
import FilesPage from './pages/FilesPage'
import PlaceholderPage from './pages/PlaceholderPage'
import SessionsPage from './pages/SessionsPage'
import SettingsPage from './pages/SettingsPage'
import TerminalsPage from './pages/TerminalsPage'
import { AppNavContext, type AppNav, type PageId } from './lib/app-nav'

const NAV = [
  { id: 'dashboard', label: '指挥台' },
  { id: 'sessions', label: '会话' },
  { id: 'terminals', label: '终端' },
  { id: 'files', label: '文件' },
  { id: 'chat', label: '对话' },
  { id: 'tasks', label: '任务' },
  { id: 'settings', label: '设置' }
] as const

const PLACEHOLDERS: Partial<Record<PageId, { title: string; milestone: string }>> = {
  chat: { title: 'AI 对话', milestone: 'M5' },
  tasks: { title: '任务队列', milestone: 'M5' }
}

function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('dashboard')
  const [focusRequest, setFocusRequest] = useState<{ terminalId: string; seq: number } | null>(null)
  const [sessionFocus, setSessionFocus] = useState<{ sessionId: string; seq: number } | null>(null)
  const seqRef = useRef(0)

  const goTerminal = useCallback((terminalId?: string) => {
    setPage('terminals')
    if (terminalId) {
      seqRef.current += 1
      setFocusRequest({ terminalId, seq: seqRef.current })
    }
  }, [])

  const goSession = useCallback((sessionId: string) => {
    setPage('sessions')
    seqRef.current += 1
    setSessionFocus({ sessionId, seq: seqRef.current })
  }, [])

  const nav = useMemo<AppNav>(
    () => ({ goPage: setPage, goTerminal, goSession }),
    [goTerminal, goSession]
  )

  // 主进程要求跳转（系统通知点击等）
  useEffect(() => {
    return window.t1doo.nav.onNavigate((req) => {
      if (req.page === 'terminals') goTerminal(req.terminalId)
      else if (req.page === 'sessions' && req.sessionId) goSession(req.sessionId)
      else setPage(req.page)
    })
  }, [goTerminal, goSession])

  const placeholder = PLACEHOLDERS[page]

  return (
    <AppNavContext.Provider value={nav}>
      <div className="flex h-full">
        <nav className="flex w-44 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="px-4 py-4 text-lg font-semibold tracking-wide text-[var(--accent)]">
            T1doo
          </div>
          <ul className="flex-1 space-y-0.5 px-2">
            {NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                    page === item.id
                      ? 'bg-[var(--bg-hover)] font-medium text-[var(--fg)]'
                      : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]'
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 overflow-auto">
          {page === 'dashboard' && <DashboardPage />}
          {page === 'sessions' && <SessionsPage focusRequest={sessionFocus} />}
          {page === 'files' && <FilesPage />}
          {page === 'settings' && <SettingsPage />}
          {/* 终端页常驻挂载：xterm 实例与滚动状态跨页面切换保留（§7.2.1 回放仅首挂载） */}
          <TerminalsPage visible={page === 'terminals'} focusRequest={focusRequest} />
          {placeholder && (
            <PlaceholderPage title={placeholder.title} milestone={placeholder.milestone} />
          )}
        </main>
      </div>
    </AppNavContext.Provider>
  )
}

export default App
