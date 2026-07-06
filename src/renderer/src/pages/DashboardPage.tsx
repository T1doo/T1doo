import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { UsageStats } from '@shared/api'
import type { ClaudeStatus, TerminalInfo } from '@shared/terminals'
import type { I18nKey } from '@shared/i18n'
import { useI18n } from '../lib/i18n'
import { formatTokens, useFormat } from '../lib/format'
import { useAppNav } from '../lib/app-nav'

const STATUS_LABEL: Record<ClaudeStatus, { labelKey: I18nKey; cls: string }> = {
  working: { labelKey: 'dashboard.status.working', cls: 'text-sky-500' },
  waiting: { labelKey: 'dashboard.status.waiting', cls: 'text-amber-500' },
  idle: { labelKey: 'dashboard.status.idle', cls: 'text-emerald-600' }
}

/** F6 指挥台初版（§7.6）：聚合只读视图，数据全部来自既有表/运行时 */
function DashboardPage(): React.JSX.Element {
  const { t } = useI18n()
  const fmt = useFormat()
  const nav = useAppNav()
  const queryClient = useQueryClient()
  const [terms, setTerms] = useState<TerminalInfo[]>([])

  // 终端与状态：初始拉取 + 事件驱动刷新
  useEffect(() => {
    const refresh = (): void => {
      void window.t1doo.term.list().then(setTerms)
    }
    refresh()
    const offs = [
      window.t1doo.term.onOpened(refresh),
      window.t1doo.term.onClosed(refresh),
      window.t1doo.term.onUpdated((info) =>
        setTerms((prev) => prev.map((term) => (term.id === info.id ? info : term)))
      ),
      window.t1doo.term.onExit(refresh)
    ]
    return () => offs.forEach((off) => off())
  }, [])

  const usageQuery = useQuery<UsageStats>({
    queryKey: ['usage'],
    queryFn: () => window.t1doo.stats.usage(),
    refetchInterval: 60_000
  })
  const sessionsQuery = useQuery({
    queryKey: ['dash-sessions'],
    queryFn: () => window.t1doo.sessions.list()
  })

  // 会话索引更新时刷新最近会话与用量
  useEffect(() => {
    return window.t1doo.sessions.onUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['dash-sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['usage'] })
    })
  }, [queryClient])

  const running = terms.filter((term) => !term.exit)
  const waiting = running.filter((term) => term.status === 'waiting')
  const recent = (sessionsQuery.data ?? []).slice(0, 6)
  const usage = usageQuery.data

  const maxDaily = useMemo(
    () => Math.max(1, ...(usage?.daily.map((d) => d.input + d.output) ?? [1])),
    [usage]
  )

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.dashboard')}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{t('dashboard.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => nav.goTerminal()}
          className="rounded-md border border-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--bg-hover)]"
        >
          ＋ {t('dashboard.newTerminal')}
        </button>
      </div>

      {/* 等待确认的会话置顶提醒 */}
      {waiting.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/60 bg-amber-500/10 p-4">
          <h2 className="mb-2 font-medium text-amber-500">⏳ {t('dashboard.waitingForInput')}</h2>
          <ul className="space-y-1">
            {waiting.map((term) => (
              <li key={term.id}>
                <button
                  type="button"
                  onClick={() => nav.goTerminal(term.id)}
                  className="text-left hover:underline"
                >
                  {term.title}
                  <span className="ml-2 text-xs text-[var(--fg-muted)]">{term.cwd}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid max-w-4xl grid-cols-2 gap-4">
        {/* 活跃终端 */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">
            {t('dashboard.activeTerminals', { n: running.length })}
          </h2>
          {running.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('dashboard.noTerminals')}</p>
          ) : (
            <ul className="space-y-1.5">
              {running.map((term) => (
                <li key={term.id}>
                  <button
                    type="button"
                    onClick={() => nav.goTerminal(term.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-[var(--bg-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate">{term.title}</span>
                    {term.kind === 'claude' && term.status ? (
                      <span className={`shrink-0 text-xs ${STATUS_LABEL[term.status].cls}`}>
                        {t(STATUS_LABEL[term.status].labelKey)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-[var(--fg-muted)]">shell</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* token 用量（§7.6 成本口径：只展示 token 数，不折算美元） */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('dashboard.tokenUsage')}</h2>
          {usage ? (
            <>
              <div className="mb-3 flex gap-6 text-sm">
                <div>
                  <div className="text-[var(--fg-muted)]">{t('dashboard.today')}</div>
                  <div className="font-medium">
                    ↑{formatTokens(usage.todayInput)} ↓{formatTokens(usage.todayOutput)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--fg-muted)]">{t('dashboard.last7Days')}</div>
                  <div className="font-medium">
                    ↑{formatTokens(usage.weekInput)} ↓{formatTokens(usage.weekOutput)}
                  </div>
                </div>
              </div>
              <div className="flex h-16 items-end gap-1">
                {usage.daily.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-[var(--accent)] opacity-70"
                      style={{ height: `${Math.max(2, ((d.input + d.output) / maxDaily) * 56)}px` }}
                      title={t('dashboard.dailyTooltip', {
                        day: d.day,
                        input: formatTokens(d.input),
                        output: formatTokens(d.output)
                      })}
                    />
                    <span className="text-[10px] text-[var(--fg-muted)]">{d.day.slice(3)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[var(--fg-muted)]">{t('dashboard.usageNote')}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">{t('dashboard.statsLoading')}</p>
          )}
        </div>

        {/* 最近会话 */}
        <div className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('dashboard.recentSessions')}</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">{t('dashboard.noSessions')}</p>
          ) : (
            <ul className="space-y-1">
              {recent.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => nav.goPage('sessions')}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-[var(--bg-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="shrink-0 text-xs text-[var(--fg-muted)]">
                      {fmt.projectShortName(s.projectPath)}
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs text-[var(--fg-muted)]">
                      {fmt.formatDateTime(s.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
