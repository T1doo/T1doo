import { useCallback, useEffect, useRef, useState } from 'react'
import type { LauncherItem, LauncherQueryResult } from '@shared/launcher'
import type { I18nKey } from '@shared/i18n'
import { useI18n } from '../lib/i18n'

/** 各 kind 的内置图标（app 有真实图标时优先用真实图标） */
const KIND_ICONS: Record<string, string> = {
  project: 'M2 5a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z',
  session: 'M3 3h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6l-3 3V4a1 1 0 0 1 1-1z',
  terminal:
    'M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 3l2.5 2L4 10m4 0h4',
  prompt: 'M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1zm.5 3v4.2l2.8 1.7',
  app: 'M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z',
  command: 'M3 4l4 4-4 4m6 0h4',
  url: 'M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1zM1 8h14M8 1c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z',
  path: 'M4 1h6l3 3v11H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 0v4h4',
  search: 'M7 2a5 5 0 1 0 0 10A5 5 0 0 0 7 2zm7 12l-3.5-3.5',
  hint: 'M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1zM8 5v4m0 2.5v.5'
}

/** kind 徽标文案 key（hint/ai 无徽标，缺省即不渲染） */
const KIND_LABEL_KEYS: Partial<Record<string, I18nKey>> = {
  project: 'launcher.kind.project',
  session: 'launcher.kind.session',
  terminal: 'launcher.kind.terminal',
  prompt: 'launcher.kind.prompt',
  app: 'launcher.kind.app',
  command: 'launcher.kind.command',
  url: 'launcher.kind.url',
  path: 'launcher.kind.path',
  search: 'launcher.kind.search'
}

function KindIcon({ item }: { item: LauncherItem }): React.JSX.Element {
  if (item.icon) {
    return <img src={item.icon} alt="" className="h-5 w-5 shrink-0" draggable={false} />
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4.5 w-4.5 shrink-0 ${item.kind === 'hint' ? 'text-[var(--fg-muted)]' : 'text-[var(--accent)]'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={KIND_ICONS[item.kind] ?? KIND_ICONS.app} />
    </svg>
  )
}

function LauncherApp(): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<LauncherQueryResult>({ intent: 'mixed', items: [] })
  const [selected, setSelected] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const querySeq = useRef(0)

  const runQuery = useCallback((q: string) => {
    const seq = ++querySeq.current
    void window.t1doo.launcher.query(q).then((r) => {
      if (seq === querySeq.current) {
        setResult(r)
        setSelected(0)
      }
    })
  }, [])

  // 唤起时清空重置并聚焦（窗口是 show/hide 复用的）
  useEffect(() => {
    return window.t1doo.launcher.onShow(() => {
      setQuery('')
      setToast(null)
      runQuery('')
      inputRef.current?.focus()
    })
  }, [runQuery])

  useEffect(() => {
    runQuery('')
  }, [runQuery])

  const execute = useCallback(async (item: LauncherItem) => {
    const res = await window.t1doo.launcher.execute(item)
    if (res.message) {
      setToast(res.message)
      if (res.ok) setTimeout(() => window.t1doo.launcher.hide(), 1500)
    } else if (res.ok) {
      window.t1doo.launcher.hide()
    }
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return // 输入法组字过程中的按键不当导航
      const n = result.items.length
      if (e.key === 'ArrowDown' && n > 0) {
        e.preventDefault()
        setSelected((s) => (s + 1) % n)
      } else if (e.key === 'ArrowUp' && n > 0) {
        e.preventDefault()
        setSelected((s) => (s - 1 + n) % n)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = result.items[selected]
        if (item) void execute(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        window.t1doo.launcher.hide()
      }
    },
    [result, selected, execute]
  )

  // 选中项跟随键盘滚动到可视区
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="flex h-full flex-col p-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl">
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            runQuery(e.target.value)
          }}
          onKeyDown={onKeyDown}
          placeholder={t('launcher.input.placeholder')}
          className="w-full shrink-0 border-b border-[var(--border)] bg-transparent px-4 py-3.5 text-lg outline-none placeholder:text-[var(--fg-muted)]"
          spellCheck={false}
        />

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {result.items.length === 0 && query.trim() !== '' && (
            <div className="px-4 py-6 text-center text-[var(--fg-muted)]">
              {t('launcher.empty.noResults')}
            </div>
          )}
          {result.items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              data-index={i}
              onClick={() => void execute(item)}
              onMouseMove={() => setSelected(i)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                i === selected ? 'bg-[var(--bg-hover)]' : ''
              }`}
            >
              <span
                className={`h-5 w-0.5 shrink-0 rounded ${i === selected ? 'bg-[var(--accent)]' : 'bg-transparent'}`}
              />
              <KindIcon item={item} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                {item.subtitle && (
                  <span className="block truncate text-xs text-[var(--fg-muted)]">
                    {item.subtitle}
                  </span>
                )}
              </span>
              {KIND_LABEL_KEYS[item.kind] && (
                <span className="shrink-0 rounded bg-[var(--bg)] px-1.5 py-0.5 text-xs text-[var(--fg-muted)]">
                  {t(KIND_LABEL_KEYS[item.kind]!)}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] px-4 py-1.5 text-xs text-[var(--fg-muted)]">
          {toast ? (
            <span className="truncate text-[var(--accent)]">{toast}</span>
          ) : (
            <span>{t('launcher.footer.hints')}</span>
          )}
          <span className="shrink-0 pl-3">{t('launcher.footer.keys')}</span>
        </div>
      </div>
    </div>
  )
}

export default LauncherApp
