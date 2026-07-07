/* M8 验收②对拍：T1doo usage_log 与 ccusage 的逐日 token 合计对比（目标误差 <1%）
 * 用法：
 *   1. 先让应用完成一次用量首扫（正常启动开发版/打包版，或跑 perf-audit），
 *      得到含 usage_log 的 DB（默认 %APPDATA%/t1doo/t1doo.db，或传入自定义路径）。
 *   2. node scripts/usage-vs-ccusage.cjs [db 路径] [对比天数=30]
 * 说明：ccusage 逐版本扫描范围略有出入（是否含 subagents/wf_*）——脚本同时输出
 *      「全量口径」与「仅顶层会话口径」两组误差，取与 ccusage 扫描范围一致的一组评判。
 */
const { execFileSync } = require('child_process')
const { join } = require('path')
const { existsSync } = require('fs')

const DB_PATH =
  process.argv[2] || join(process.env.APPDATA || '', 't1doo', 't1doo.db')
const DAYS = Number(process.argv[3] || 30)

function pad(n) {
  return String(n).padStart(2, '0')
}
function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function main() {
  if (!existsSync(DB_PATH)) {
    throw new Error(`未找到 DB：${DB_PATH}——先运行一次应用完成用量首扫，或传入 DB 路径`)
  }
  const Database = require('better-sqlite3-node') // Node ABI 副本（vitest/perf-audit 同款）
  const db = new Database(DB_PATH, { readonly: true })
  const since = new Date()
  since.setDate(since.getDate() - (DAYS - 1))
  const from = new Date(since.getFullYear(), since.getMonth(), since.getDate()).getTime()

  const queryDaily = (sourceFilter) =>
    new Map(
      db
        .prepare(
          `SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS day,
                  SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS total
           FROM usage_log WHERE ts >= ? ${sourceFilter} GROUP BY day`
        )
        .all(from)
        .map((r) => [r.day, r.total])
    )
  // 面板来源不落 ~/.claude JSONL，ccusage 必然看不到——两组口径都排除
  const t1dooAll = queryDaily(`AND source NOT IN ('api-panel','cli-panel')`)
  const t1dooSession = queryDaily(`AND source = 'session'`)
  db.close()

  // ccusage：npx 拉起（需要网络首跑）；--json 输出逐日聚合
  const raw = execFileSync('npx', ['-y', 'ccusage', 'daily', '--json'], {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024
  })
  const parsed = JSON.parse(raw)
  const entries = parsed.daily ?? parsed.data ?? []
  const ccDaily = new Map()
  for (const e of entries) {
    // 新版 ccusage：日期字段为 period，且聚合多 agent（codex 等）——
    // 按 modelBreakdowns 只取 claude 系模型，与 usage_log 口径对齐
    const day = e.period ?? e.date
    let total = 0
    if (Array.isArray(e.modelBreakdowns)) {
      for (const m of e.modelBreakdowns) {
        if (!String(m.modelName ?? '').toLowerCase().includes('claude')) continue
        total +=
          (m.inputTokens ?? 0) +
          (m.outputTokens ?? 0) +
          (m.cacheReadTokens ?? 0) +
          (m.cacheCreationTokens ?? 0)
      }
    } else {
      total =
        (e.inputTokens ?? 0) +
        (e.outputTokens ?? 0) +
        (e.cacheReadTokens ?? e.cacheReadInputTokens ?? 0) +
        (e.cacheCreationTokens ?? e.cacheCreationInputTokens ?? 0)
    }
    if (day) ccDaily.set(day, (ccDaily.get(day) ?? 0) + total)
  }

  const days = []
  for (let i = 0; i < DAYS; i++) {
    days.push(dayKey(new Date(from + i * 86_400_000)))
  }

  const compare = (label, mine) => {
    let sumMine = 0
    let sumCc = 0
    console.log(`\n—— ${label} ——`)
    console.log('日期         T1doo        ccusage      偏差')
    for (const day of days) {
      const a = mine.get(day) ?? 0
      const b = ccDaily.get(day) ?? 0
      if (a === 0 && b === 0) continue
      sumMine += a
      sumCc += b
      const err = b > 0 ? (((a - b) / b) * 100).toFixed(2) : a > 0 ? '∞' : '0'
      console.log(
        `${day}  ${String(a).padStart(12)} ${String(b).padStart(12)}  ${err}%`
      )
    }
    // 零除保护：ccusage 侧为 0 而本侧有量 → 100%（口径没对上，不得误判通过）
    const totalErr =
      sumCc > 0 ? (Math.abs(sumMine - sumCc) / sumCc) * 100 : sumMine > 0 ? 100 : 0
    console.log(
      `合计 ${sumMine.toLocaleString()} vs ${sumCc.toLocaleString()} → 总误差 ${totalErr.toFixed(3)}%（目标 <1%）`
    )
    return totalErr
  }

  const errAll = compare('全量口径（session+subagent+workflow）', t1dooAll)
  const errSession = compare('仅顶层会话口径（session）', t1dooSession)
  const best = Math.min(errAll, errSession)
  console.log(
    `\n结论：最接近口径误差 ${best.toFixed(3)}%${best < 1 ? ' ✅' : ' ❌（>1%，需核查 ccusage 扫描范围/版本差异）'}`
  )
  if (best >= 1) process.exitCode = 1
}

try {
  main()
} catch (err) {
  console.error('对拍失败：', err.message ?? err)
  process.exit(1)
}
