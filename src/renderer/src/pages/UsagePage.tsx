import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type {
  PricingRow,
  UsageBucket,
  UsageFilter,
  UsagePreset,
  UsageSource
} from '@shared/usage'
import { resolveUsageRange } from '@shared/usage'
import type { AppSettings } from '@shared/types'
import type { I18nKey } from '@shared/i18n'
import { useI18n } from '../lib/i18n'
import { formatTokens } from '../lib/format'

/** F9「用量」板块（§7.8.4）：筛选栏 + Hero 指标卡 + Recharts 趋势 + 分布区 + 价目表 */

const PRESETS: UsagePreset[] = ['today', '7d', '30d', 'month', 'year', 'custom']
const SOURCES: UsageSource[] = [
  'session',
  'subagent',
  'workflow',
  'api-panel',
  'cli-panel',
  'imported'
]

type Dim = 'input' | 'output' | 'cacheRead' | 'cacheCreation'
const DIMS: { key: Dim; labelKey: I18nKey; color: string }[] = [
  { key: 'input', labelKey: 'usage.dim.input', color: 'var(--chart-input)' },
  { key: 'output', labelKey: 'usage.dim.output', color: 'var(--chart-output)' },
  { key: 'cacheRead', labelKey: 'usage.dim.cacheRead', color: 'var(--chart-cache-read)' },
  { key: 'cacheCreation', labelKey: 'usage.dim.cacheCreation', color: 'var(--chart-cache-write)' }
]

function todayStr(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tickLabel(key: string, bucket: UsageBucket): string {
  if (bucket === 'hour') return `${key.slice(11)}:00` // 'YYYY-MM-DD HH' → 'HH:00'
  if (bucket === 'day') return key.slice(5) // → 'MM-DD'
  return key // 'YYYY-MM'
}

const TOOLTIP_STYLE = {
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--fg)'
} as const

function UsagePage(): React.JSX.Element {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // ---------- 筛选状态 ----------
  const [preset, setPreset] = useState<UsagePreset>('7d')
  const [customFrom, setCustomFrom] = useState(() => todayStr(-6))
  const [customTo, setCustomTo] = useState(() => todayStr())
  const [project, setProject] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [source, setSource] = useState<UsageSource | null>(null)
  const [chartMode, setChartMode] = useState<'bar' | 'area'>('bar')
  const [dimOn, setDimOn] = useState<Record<Dim, boolean>>({
    input: true,
    output: true,
    cacheRead: true,
    cacheCreation: true
  })
  const [pricingOpen, setPricingOpen] = useState(false)

  // 成本开关持久化在设置里（默认关，§7.8.3）
  const [settings, setSettings] = useState<AppSettings | null>(null)
  useEffect(() => {
    void window.t1doo.settings.get().then(setSettings)
    return window.t1doo.settings.onUpdated(setSettings)
  }, [])
  const showCost = settings?.usageShowCost ?? false

  const filter = useMemo<UsageFilter>(
    () => ({ projectPath: project, model, source }),
    [project, model, source]
  )
  // range 在 queryFn 内即时计算（"今天"等预设随失效刷新自然滚动）
  const rangeKey = [preset, preset === 'custom' ? `${customFrom}~${customTo}` : '']
  const getRange = (): { from: number; to: number } =>
    resolveUsageRange(preset, new Date(), { fromDay: customFrom, toDay: customTo })

  // ---------- 查询（事件推送失效，不做轮询，§7.8.4） ----------
  const summaryQ = useQuery({
    queryKey: ['usage', 'summary', ...rangeKey, filter],
    queryFn: () => window.t1doo.usage.query({ kind: 'summary', range: getRange(), filter })
  })
  const trendQ = useQuery({
    queryKey: ['usage', 'trend', ...rangeKey, filter],
    queryFn: () => window.t1doo.usage.query({ kind: 'trend', range: getRange(), filter })
  })
  const byModelQ = useQuery({
    queryKey: ['usage', 'byModel', ...rangeKey, filter],
    queryFn: () => window.t1doo.usage.query({ kind: 'byModel', range: getRange(), filter })
  })
  const byProjectQ = useQuery({
    queryKey: ['usage', 'byProject', ...rangeKey, filter],
    queryFn: () => window.t1doo.usage.query({ kind: 'byProject', range: getRange(), filter })
  })
  const bySourceQ = useQuery({
    queryKey: ['usage', 'bySource', ...rangeKey, filter],
    queryFn: () => window.t1doo.usage.query({ kind: 'bySource', range: getRange(), filter })
  })
  const facetsQ = useQuery({
    queryKey: ['usage', 'facets', ...rangeKey],
    queryFn: () => window.t1doo.usage.query({ kind: 'facets', range: getRange() })
  })
  const scanQ = useQuery({
    queryKey: ['usage', 'scan'],
    queryFn: () => window.t1doo.usage.scanState(),
    refetchInterval: (q) => (q.state.data?.scanning ? 1_000 : false)
  })

  useEffect(() => {
    return window.t1doo.usage.onUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ['usage'] })
    })
  }, [queryClient])

  const summary = summaryQ.data
  const trend = trendQ.data
  const scan = scanQ.data
  const trendHasData = useMemo(
    () =>
      (trend?.points ?? []).some((p) => p.input + p.output + p.cacheRead + p.cacheCreation > 0),
    [trend]
  )
  const activeDims = DIMS.filter((d) => dimOn[d.key])

  const toggleCost = (): void => {
    void window.t1doo.settings.set({ usageShowCost: !showCost }).then(setSettings)
  }

  return (
    <div className="p-8" data-testid="usage-page">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.usage')}</h1>
          <p className="text-sm text-[var(--fg-muted)]">{t('usage.subtitle')}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fg-muted)]">
          <input
            type="checkbox"
            data-testid="usage-cost-toggle"
            checked={showCost}
            onChange={toggleCost}
          />
          {t('usage.cost.toggle')}
        </label>
      </div>

      {scan?.scanning && (
        <div
          className="mb-4 rounded-md border border-[var(--accent)]/50 bg-[var(--bg-panel)] px-4 py-2 text-sm text-[var(--fg-muted)]"
          data-testid="usage-scanning"
        >
          ⏳ {t('usage.scanning', { done: scan.scannedFiles, total: scan.totalFiles })}
        </div>
      )}

      {/* ---------- 筛选栏 ---------- */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              data-testid={`usage-range-${p}`}
              onClick={() => setPreset(p)}
              className={`px-3 py-1.5 text-sm transition-colors ${
                preset === p
                  ? 'bg-[var(--accent)] font-medium text-white'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t(`usage.range.${p}` as I18nKey)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1 text-sm">
            <label className="text-[var(--fg-muted)]">{t('usage.range.from')}</label>
            <input
              type="date"
              data-testid="usage-custom-from"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1"
            />
            <label className="ml-1 text-[var(--fg-muted)]">{t('usage.range.to')}</label>
            <input
              type="date"
              data-testid="usage-custom-to"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1"
            />
          </div>
        )}
        <select
          value={project ?? ''}
          data-testid="usage-filter-project"
          onChange={(e) => setProject(e.target.value || null)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5 text-sm"
        >
          <option value="">{t('usage.filter.allProjects')}</option>
          {(facetsQ.data?.projects ?? [])
            .filter((p): p is string => p !== null)
            .map((p) => (
              <option key={p} value={p}>
                {p.split(/[\\/]/).pop() || p}
              </option>
            ))}
        </select>
        <select
          value={model ?? ''}
          data-testid="usage-filter-model"
          onChange={(e) => setModel(e.target.value || null)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5 text-sm"
        >
          <option value="">{t('usage.filter.allModels')}</option>
          {(facetsQ.data?.models ?? []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={source ?? ''}
          data-testid="usage-filter-source"
          onChange={(e) => setSource((e.target.value || null) as UsageSource | null)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1.5 text-sm"
        >
          <option value="">{t('usage.filter.allSources')}</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`usage.source.${s}` as I18nKey)}
            </option>
          ))}
        </select>
      </div>

      {/* ---------- Hero 指标卡 ---------- */}
      <div className={`mb-5 grid gap-3 ${showCost ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="text-xs text-[var(--fg-muted)]">{t('usage.hero.totalTokens')}</div>
          <div className="mt-1 text-2xl font-semibold" data-testid="usage-hero-total">
            {summary
              ? formatTokens(
                  summary.input + summary.output + summary.cacheRead + summary.cacheCreation
                )
              : t('usage.hero.noData')}
          </div>
          {summary && (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-[var(--fg-muted)]">
              {DIMS.map((d) => (
                <span key={d.key} className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {t(d.labelKey)} {formatTokens(summary[d.key])}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="text-xs text-[var(--fg-muted)]">{t('usage.hero.requests')}</div>
          <div className="mt-1 text-2xl font-semibold" data-testid="usage-hero-requests">
            {summary ? summary.requests.toLocaleString() : t('usage.hero.noData')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="text-xs text-[var(--fg-muted)]">{t('usage.hero.cacheHitRate')}</div>
          <div className="mt-1 text-2xl font-semibold" data-testid="usage-hero-hitrate">
            {summary?.cacheHitRate != null
              ? `${(summary.cacheHitRate * 100).toFixed(1)}%`
              : t('usage.hero.noData')}
          </div>
          <div className="mt-2 text-xs text-[var(--fg-muted)]">{t('usage.hero.cacheHitNote')}</div>
        </div>
        {showCost && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="text-xs text-[var(--fg-muted)]">
              {t('usage.hero.cost')}
              <span
                className="ml-1 rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[10px] text-[var(--accent)]"
                data-testid="usage-cost-estimated-badge"
              >
                {t('usage.hero.costEstimated')}
              </span>
            </div>
            <div className="mt-1 text-2xl font-semibold" data-testid="usage-hero-cost">
              {summary?.costUsd != null ? `$${summary.costUsd}` : t('usage.hero.noData')}
            </div>
            <div className="mt-2 text-xs text-[var(--fg-muted)]">
              {summary?.costIsPartial ? t('usage.hero.costPartial') : t('usage.cost.note')}
            </div>
          </div>
        )}
      </div>

      {/* ---------- 趋势图 ---------- */}
      <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">{t('usage.trend.title')}</h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {DIMS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  data-testid={`usage-series-${d.key}`}
                  onClick={() => setDimOn((s) => ({ ...s, [d.key]: !s[d.key] }))}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                    dimOn[d.key]
                      ? 'border-[var(--border)] text-[var(--fg)]'
                      : 'border-transparent text-[var(--fg-muted)] line-through opacity-60'
                  }`}
                >
                  <i className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {t(d.labelKey)}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-xs">
              {(['bar', 'area'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`usage-mode-${m}`}
                  onClick={() => setChartMode(m)}
                  className={`px-2 py-1 ${
                    chartMode === m
                      ? 'bg-[var(--bg-hover)] font-medium'
                      : 'text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {t(m === 'bar' ? 'usage.trend.stacked' : 'usage.trend.area')}
                </button>
              ))}
            </div>
          </div>
        </div>
        {trend && trendHasData ? (
          <div className="h-72" data-testid="usage-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'bar' ? (
                <BarChart data={trend.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tickFormatter={(k: string) => tickLabel(k, trend.bucket)}
                    tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatTokens(v)}
                    tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                    stroke="var(--border)"
                    width={52}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: 'var(--fg-muted)' }}
                    formatter={(value, name) => [Number(value).toLocaleString(), String(name)]}
                    cursor={{ fill: 'var(--bg-hover)', opacity: 0.5 }}
                  />
                  {activeDims.map((d) => (
                    <Bar
                      key={d.key}
                      dataKey={d.key}
                      name={t(d.labelKey)}
                      stackId="u"
                      fill={d.color}
                    />
                  ))}
                </BarChart>
              ) : (
                <AreaChart data={trend.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    tickFormatter={(k: string) => tickLabel(k, trend.bucket)}
                    tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatTokens(v)}
                    tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                    stroke="var(--border)"
                    width={52}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: 'var(--fg-muted)' }}
                    formatter={(value, name) => [Number(value).toLocaleString(), String(name)]}
                  />
                  {activeDims.map((d) => (
                    <Area
                      key={d.key}
                      dataKey={d.key}
                      name={t(d.labelKey)}
                      stackId="u"
                      stroke={d.color}
                      fill={d.color}
                      fillOpacity={0.35}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-[var(--fg-muted)]">
            {t('usage.trend.empty')}
          </p>
        )}
      </div>

      {/* ---------- 分布区 ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-4">
        {/* 分模型：条形 + 明细表 */}
        <div className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('usage.byModel.title')}</h2>
          <table className="w-full text-sm" data-testid="usage-bymodel-table">
            <thead>
              <tr className="text-left text-xs text-[var(--fg-muted)]">
                <th className="pb-2 font-normal">{t('usage.byModel.model')}</th>
                <th className="pb-2 text-right font-normal">{t('usage.byModel.tokens')}</th>
                <th className="pb-2 text-right font-normal">{t('usage.byModel.requests')}</th>
                <th className="pb-2 text-right font-normal">{t('usage.byModel.avg')}</th>
                {showCost && (
                  <th className="pb-2 text-right font-normal">
                    {t('usage.byModel.cost')}（{t('usage.hero.costEstimated')}）
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(byModelQ.data ?? []).map((r) => {
                const total = r.input + r.output + r.cacheRead + r.cacheCreation
                const max = Math.max(
                  1,
                  ...(byModelQ.data ?? []).map(
                    (x) => x.input + x.output + x.cacheRead + x.cacheCreation
                  )
                )
                return (
                  <tr key={r.model || '(unknown)'} className="border-t border-[var(--border)]">
                    <td className="py-1.5 pr-3">
                      <div className="truncate font-mono text-xs">
                        {r.model || t('usage.byModel.unknown')}
                      </div>
                      <div className="mt-1 h-1.5 max-w-64 rounded bg-[var(--bg-hover)]">
                        <div
                          className="h-full rounded bg-[var(--accent)] opacity-80"
                          style={{ width: `${Math.max(2, (total / max) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-1.5 text-right" title={total.toLocaleString()}>
                      {formatTokens(total)}
                    </td>
                    <td className="py-1.5 text-right">{r.requests.toLocaleString()}</td>
                    <td className="py-1.5 text-right">
                      {formatTokens(Math.round(total / Math.max(1, r.requests)))}
                    </td>
                    {showCost && (
                      <td className="py-1.5 text-right">
                        {r.costUsd != null ? `$${r.costUsd}` : t('usage.hero.noData')}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 分项目 Top-N */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('usage.byProject.title', { n: 8 })}</h2>
          <ul className="space-y-2" data-testid="usage-byproject">
            {(byProjectQ.data ?? []).slice(0, 8).map((r) => {
              const total = r.input + r.output + r.cacheRead + r.cacheCreation
              const max = Math.max(
                1,
                ...(byProjectQ.data ?? [])
                  .slice(0, 8)
                  .map((x) => x.input + x.output + x.cacheRead + x.cacheCreation)
              )
              const name = r.projectPath
                ? r.projectPath.split(/[\\/]/).pop() || r.projectPath
                : t('usage.filter.noProject')
              return (
                <li key={r.projectPath ?? '(none)'} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate" title={r.projectPath ?? undefined}>
                      {name}
                    </span>
                    <span className="shrink-0 text-[var(--fg-muted)]">{formatTokens(total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-[var(--bg-hover)]">
                    <div
                      className="h-full rounded bg-[var(--chart-input)] opacity-80"
                      style={{ width: `${Math.max(2, (total / max) * 100)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* 来源占比 */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <h2 className="mb-3 font-medium">{t('usage.bySource.title')}</h2>
          <ul className="space-y-2" data-testid="usage-bysource">
            {(bySourceQ.data ?? []).map((r) => {
              const total = r.input + r.output + r.cacheRead + r.cacheCreation
              const all = (bySourceQ.data ?? []).reduce(
                (n, x) => n + x.input + x.output + x.cacheRead + x.cacheCreation,
                0
              )
              const pct = all > 0 ? (total / all) * 100 : 0
              return (
                <li key={r.source} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span>{t(`usage.source.${r.source}` as I18nKey)}</span>
                    <span className="shrink-0 text-[var(--fg-muted)]">
                      {formatTokens(total)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-[var(--bg-hover)]">
                    <div
                      className="h-full rounded bg-[var(--chart-cache-read)] opacity-80"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* ---------- 价目表 ---------- */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t('usage.pricing.title')}</h2>
          <button
            type="button"
            data-testid="usage-pricing-open"
            onClick={() => setPricingOpen((v) => !v)}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          >
            {pricingOpen ? t('usage.pricing.close') : t('usage.pricing.open')}
          </button>
        </div>
        {pricingOpen && <PricingEditor />}
      </div>

      <p className="mt-4 text-xs text-[var(--fg-muted)]" data-testid="usage-data-origin">
        {t('usage.dataOrigin')}
      </p>
    </div>
  )
}

/** 价目表编辑器：改内置项即转为用户项；内置模型可重置回种子价（§7.8.3） */
function PricingEditor(): React.JSX.Element {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const pricingQ = useQuery({
    queryKey: ['usage-pricing'],
    queryFn: () => window.t1doo.usage.pricingList()
  })
  const [drafts, setDrafts] = useState<Record<string, PricingRow>>({})
  const [adding, setAdding] = useState({ modelId: '', input: '', output: '', read: '', write: '' })
  const [error, setError] = useState<string | null>(null)

  const DEC_RE = /^\d+(\.\d+)?$/
  const rowOf = (r: PricingRow): PricingRow => drafts[r.modelId] ?? r

  const refresh = (rows: PricingRow[]): void => {
    queryClient.setQueryData(['usage-pricing'], rows)
    void queryClient.invalidateQueries({ queryKey: ['usage'] })
  }

  const save = async (r: PricingRow): Promise<void> => {
    for (const v of [r.inputPerM, r.outputPerM, r.cacheReadPerM, r.cacheWritePerM]) {
      if (!DEC_RE.test(v)) {
        setError(t('usage.pricing.invalid'))
        return
      }
    }
    setError(null)
    refresh(await window.t1doo.usage.pricingSave(r))
    setDrafts((d) => {
      const next = { ...d }
      delete next[r.modelId]
      return next
    })
  }

  const reset = async (modelId: string): Promise<void> => {
    refresh(await window.t1doo.usage.pricingReset(modelId))
    setDrafts((d) => {
      const next = { ...d }
      delete next[modelId]
      return next
    })
  }

  const addNew = async (): Promise<void> => {
    if (!adding.modelId.trim()) return
    for (const v of [adding.input, adding.output, adding.read, adding.write]) {
      if (!DEC_RE.test(v)) {
        setError(t('usage.pricing.invalid'))
        return
      }
    }
    setError(null)
    refresh(
      await window.t1doo.usage.pricingSave({
        modelId: adding.modelId.trim(),
        inputPerM: adding.input,
        outputPerM: adding.output,
        cacheReadPerM: adding.read,
        cacheWritePerM: adding.write
      })
    )
    setAdding({ modelId: '', input: '', output: '', read: '', write: '' })
  }

  const cell =
    'w-20 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-right font-mono text-xs'

  return (
    <div className="mt-4" data-testid="usage-pricing-editor">
      <p className="mb-3 text-xs text-[var(--fg-muted)]">{t('usage.pricing.note')}</p>
      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--fg-muted)]">
            <th className="pb-2 font-normal">{t('usage.pricing.model')}</th>
            <th className="pb-2 text-right font-normal">{t('usage.pricing.input')}</th>
            <th className="pb-2 text-right font-normal">{t('usage.pricing.output')}</th>
            <th className="pb-2 text-right font-normal">{t('usage.pricing.cacheRead')}</th>
            <th className="pb-2 text-right font-normal">{t('usage.pricing.cacheWrite')}</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {(pricingQ.data ?? []).map((r) => {
            const d = rowOf(r)
            const dirty = drafts[r.modelId] !== undefined
            const setField = (field: keyof PricingRow, value: string): void =>
              setDrafts((prev) => ({ ...prev, [r.modelId]: { ...rowOf(r), [field]: value } }))
            return (
              <tr
                key={r.modelId}
                className="border-t border-[var(--border)]"
                data-pricing-model={r.modelId}
              >
                <td className="py-1.5 pr-2">
                  <span className="font-mono text-xs">{r.modelId}</span>
                  <span className="ml-2 rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[10px] text-[var(--fg-muted)]">
                    {r.isBuiltin ? t('usage.pricing.builtin') : t('usage.pricing.customized')}
                  </span>
                </td>
                {(
                  [
                    ['inputPerM', d.inputPerM],
                    ['outputPerM', d.outputPerM],
                    ['cacheReadPerM', d.cacheReadPerM],
                    ['cacheWritePerM', d.cacheWritePerM]
                  ] as const
                ).map(([field, value]) => (
                  <td key={field} className="py-1.5 pl-2 text-right">
                    <input
                      className={cell}
                      data-testid={`pricing-${r.modelId}-${field}`}
                      value={value}
                      onChange={(e) => setField(field, e.target.value)}
                    />
                  </td>
                ))}
                <td className="py-1.5 pl-3 text-right whitespace-nowrap">
                  {dirty && (
                    <button
                      type="button"
                      data-testid={`pricing-save-${r.modelId}`}
                      onClick={() => void save(d)}
                      className="mr-2 rounded border border-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                    >
                      {t('usage.pricing.save')}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`pricing-reset-${r.modelId}`}
                    onClick={() => void reset(r.modelId)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
                  >
                    {r.isBuiltin || BUILTIN_IDS.has(r.modelId)
                      ? t('usage.pricing.reset')
                      : t('usage.pricing.delete')}
                  </button>
                </td>
              </tr>
            )
          })}
          {/* 新增行 */}
          <tr className="border-t border-[var(--border)]">
            <td className="py-1.5 pr-2">
              <input
                className="w-56 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-mono text-xs"
                data-testid="pricing-add-model"
                placeholder="model-id"
                value={adding.modelId}
                onChange={(e) => setAdding((a) => ({ ...a, modelId: e.target.value }))}
              />
            </td>
            {(['input', 'output', 'read', 'write'] as const).map((f) => (
              <td key={f} className="py-1.5 pl-2 text-right">
                <input
                  className={cell}
                  data-testid={`pricing-add-${f}`}
                  placeholder="0"
                  value={adding[f]}
                  onChange={(e) => setAdding((a) => ({ ...a, [f]: e.target.value }))}
                />
              </td>
            ))}
            <td className="py-1.5 pl-3 text-right">
              <button
                type="button"
                data-testid="pricing-add-save"
                onClick={() => void addNew()}
                className="rounded border border-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
              >
                {t('usage.pricing.add')}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** 与主进程 BUILTIN_PRICING 同步的 id 集（仅决定按钮文案：重置 vs 删除） */
const BUILTIN_IDS = new Set([
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5'
])

export default UsagePage
