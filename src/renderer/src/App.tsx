import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings } from '@shared/types'
import OnboardingWizard from './components/onboarding/OnboardingWizard'
import DashboardPage from './pages/DashboardPage'
import SessionsPage from './pages/SessionsPage'
import SettingsPage from './pages/SettingsPage'
import TerminalsPage from './pages/TerminalsPage'
import ChatPage from './pages/ChatPage'
import TasksPage from './pages/TasksPage'
import ModelsPage from './pages/ModelsPage'
import { AppNavContext, type AppNav } from './lib/app-nav'
import type { PageId } from './lib/app-nav'
import { useI18n } from './lib/i18n'
import type { I18nKey } from '@shared/i18n'

// F4 文件中枢已彻底废弃（2026-07-05，§14.2）：导航不再保留「文件」入口
const NAV = [
  { id: 'dashboard', labelKey: 'nav.dashboard' },
  { id: 'sessions', labelKey: 'nav.sessions' },
  { id: 'terminals', labelKey: 'nav.terminals' },
  { id: 'chat', labelKey: 'nav.chat' },
  { id: 'tasks', labelKey: 'nav.tasks' },
  { id: 'models', labelKey: 'nav.models' },
  { id: 'settings', labelKey: 'nav.settings' }
] as const satisfies readonly { id: PageId; labelKey: I18nKey }[]

function App(): React.JSX.Element {
  const { t } = useI18n()
  const [page, setPage] = useState<PageId>('dashboard')
  const [focusRequest, setFocusRequest] = useState<{ terminalId: string; seq: number } | null>(null)
  const [sessionFocus, setSessionFocus] = useState<{ sessionId: string; seq: number } | null>(null)
  const [chatFocus, setChatFocus] = useState<{ convId: string; seq: number } | null>(null)
  const seqRef = useRef(0)
  // 首启引导：onboardingDone=false 时全屏向导覆盖（M6 §8）
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    let mounted = true
    void window.t1doo.settings.get().then((s) => {
      if (mounted) setAppSettings(s)
    })
    return () => {
      mounted = false
    }
  }, [])

  const finishOnboarding = useCallback((goSettings: boolean) => {
    void window.t1doo.settings.set({ onboardingDone: true }).then(setAppSettings)
    if (goSettings) setPage('settings')
  }, [])

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

  const goChat = useCallback((convId?: string) => {
    setPage('chat')
    if (convId) {
      seqRef.current += 1
      setChatFocus({ convId, seq: seqRef.current })
    }
  }, [])

  const nav = useMemo<AppNav>(
    () => ({ goPage: setPage, goTerminal, goSession, goChat }),
    [goTerminal, goSession, goChat]
  )

  // 主进程要求跳转（系统通知点击 / 启动器 @ 提问等）
  useEffect(() => {
    return window.t1doo.nav.onNavigate((req) => {
      if (req.page === 'terminals') goTerminal(req.terminalId)
      else if (req.page === 'sessions' && req.sessionId) goSession(req.sessionId)
      else if (req.page === 'chat') goChat(req.convId)
      else setPage(req.page)
    })
  }, [goTerminal, goSession, goChat])

  return (
    <AppNavContext.Provider value={nav}>
      {appSettings && !appSettings.onboardingDone && (
        <OnboardingWizard hotkey={appSettings.launcherHotkey} onDone={finishOnboarding} />
      )}
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
                  {t(item.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 overflow-auto">
          {page === 'dashboard' && <DashboardPage />}
          {page === 'sessions' && <SessionsPage focusRequest={sessionFocus} />}
          {page === 'chat' && <ChatPage focusRequest={chatFocus} />}
          {page === 'tasks' && <TasksPage />}
          {page === 'models' && <ModelsPage />}
          {page === 'settings' && <SettingsPage />}
          {/* 终端页常驻挂载：xterm 实例与滚动状态跨页面切换保留（§7.2.1 回放仅首挂载） */}
          <TerminalsPage visible={page === 'terminals'} focusRequest={focusRequest} />
        </main>
      </div>
    </AppNavContext.Provider>
  )
}

export default App
