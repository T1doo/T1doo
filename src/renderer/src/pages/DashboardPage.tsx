import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClaudeStatus, TerminalInfo } from '@shared/terminals'
import type { I18nKey } from '@shared/i18n'
import { resolveUsageRange } from '@shared/usage'
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
  // §7.9.4：v1.0 hooks 注册被自动清理后的一次性告知（落盘标记，隐藏启动也不会漏掉）
  const [retireNotice, setRetireNotice] = useState(false)

  useEffect(() => {
    void window.t1doo.status.retireNotice().then(setRetireNotice)
  }, [])

  const dismissRetireNotice = (): void => {
    setRetireNotice(false)
    void window.t1doo.status.dismissRetireNotice()
  }

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

  // M8 起用量卡片改由 usage_log 出数（精简版：今日/7 天 + 迷你趋势，点击跳转「用量」板块）
  const todayQuery = useQuery({
    queryKey: ['dash-usage', 'today'],
    queryFn: () =>
      window.t1doo.usage.query({ kind: 'summary', range: resolveUsageRange('today', new Date()) })
  })
  const weekQuery = useQuery({
    queryKey: ['dash-usage', 'week'],
    queryFn: () =>
      window.t1doo.usage.query({ kind: 'summary', range: resolveUsageRange('7d', new Date()) })
  })
  const trendQuery = useQuery({
    queryKey: ['dash-usage', 'trend'],
    queryFn: () =>
      window.t1doo.usage.query({ kind: 'trend', range: resolveUsageRange('7d', new Date()) })
  })
  const sessionsQuery = useQuery({
    queryKey: ['dash-sessions'],
    queryFn: () => window.t1doo.sessions.list()
  })

  // 会话索引/用量增量更新时刷新
  useEffect(() => {
    const offSessions = window.t1doo.sessions.onUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['dash-sessions'] })
    })
    const offUsage = window.t1doo.usage.onUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['dash-usage'] })
    })
    return () => {
      offSessions()
      offUsage()
    }
  }, [queryClient])

  const running = terms.filter((term) => !term.exit)
  const waiting = running.filter((term) => term.status === 'waiting')
  const recent = (sessionsQuery.data ?? []).slice(0, 6)
  const today = todayQuery.data
  const week = weekQuery.data
  const trendPoints = trendQuery.data?.points

  const maxDaily = useMemo(
    () =>
      Math.max(
        1,
        ...(trendPoints?.map((p) => p.input + p.output + p.cacheRead + p.cacheCreation) ?? [1])
      ),
    [trendPoints]
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

      {/* hooks 退役的一次性告知（§7.9.4） */}
      {retireNotice && (
        <div
          data-testid="hooks-retired-notice"
          className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4"
        >
          <h2 className="mb-1 font-medium">{t('dashboard.hooksRetired.title')}</h2>
          <p className="mb-3 text-xs leading-relaxed text-[var(--fg-muted)]">
            {t('dashboard.hooksRetired.desc')}
          </p>
          <button
            type="button"
            onClick={dismissRetireNotice}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--bg-hover)]"
          >
            {t('dashboard.hooksRetired.dismiss')}
          </button>
        </div>
      )}

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
                      <span
                        className={`shrink-0 text-xs ${STATUS_LABEL[term.status].cls}`}
                        title={
                          term.status === 'waiting' && !term.statusCertain
                            ? t('dashboard.status.inferredHint')
                            : undefined
                        }
                      >
                        {/* 空心圈＝推断值，与确定判定区分（§7.9.2） */}
                        {term.status === 'waiting' && !term.statusCertain ? '○ ' : ''}
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

        {/* token 用量精简卡片（M8 §7.8.4）：今日/7 天 + 迷你趋势，点击进「用量」板块 */}
        <button
          type="button"
          data-testid="dash-usage-card"
          onClick={() => nav.goPage('usage')}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5 text-left transition-colors hover:border-[var(--accent)]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">{t('dashboard.tokenUsage')}</h2>
            <span className="text-xs text-[var(--accent)]">{t('usage.dash.viewMore')}</span>
          </div>
          {today && week ? (
            <>
              <div className="mb-3 flex gap-6 text-sm">
                <div>
                  <div className="text-[var(--fg-muted)]">{t('dashboard.today')}</div>
                  <div className="font-medium">
                    ↑{formatTokens(today.input)} ↓{formatTokens(today.output)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--fg-muted)]">{t('dashboard.last7Days')}</div>
                  <div className="font-medium">
                    ↑{formatTokens(week.input)} ↓{formatTokens(week.output)}
                  </div>
                </div>
              </div>
              <div className="flex h-16 items-end gap-1">
                {(trendPoints ?? []).map((p) => {
                  const total = p.input + p.output + p.cacheRead + p.cacheCreation
                  return (
                    <div key={p.key} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm bg-[var(--accent)] opacity-70"
                        style={{ height: `${Math.max(2, (total / maxDaily) * 56)}px` }}
                        title={t('dashboard.dailyTooltip', {
                          day: p.key.slice(5),
                          input: formatTokens(p.input),
                          output: formatTokens(p.output)
                        })}
                      />
                      <span className="text-[10px] text-[var(--fg-muted)]">{p.key.slice(8)}</span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[10px] text-[var(--fg-muted)]">{t('dashboard.usageNote')}</p>
            </>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">{t('dashboard.statsLoading')}</p>
          )}
        </button>

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
