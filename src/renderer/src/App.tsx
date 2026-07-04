import { useState } from 'react'
import DashboardPage from './pages/DashboardPage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/SettingsPage'

const NAV = [
  { id: 'dashboard', label: '指挥台' },
  { id: 'sessions', label: '会话' },
  { id: 'terminals', label: '终端' },
  { id: 'files', label: '文件' },
  { id: 'chat', label: '对话' },
  { id: 'tasks', label: '任务' },
  { id: 'settings', label: '设置' }
] as const

type PageId = (typeof NAV)[number]['id']

const PLACEHOLDERS: Partial<Record<PageId, { title: string; milestone: string }>> = {
  sessions: { title: '会话中心', milestone: 'M1' },
  terminals: { title: '终端管理', milestone: 'M2' },
  files: { title: '文件中枢', milestone: 'M4' },
  chat: { title: 'AI 对话', milestone: 'M5' },
  tasks: { title: '任务队列', milestone: 'M5' }
}

function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('dashboard')

  const placeholder = PLACEHOLDERS[page]

  return (
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
        {page === 'settings' && <SettingsPage />}
        {placeholder && (
          <PlaceholderPage title={placeholder.title} milestone={placeholder.milestone} />
        )}
      </main>
    </div>
  )
}

export default App
