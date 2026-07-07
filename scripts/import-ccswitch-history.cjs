/* M8 附录：从 cc-switch 一次性导入历史用量（usage_daily_rollups → usage_log）
 *
 * 背景：Claude Code 默认 30 天清理转录（cleanupPeriodDays），被删历史无法从磁盘重建；
 * cc-switch 自 2026-03 起把逐日汇总固化在 ~/.cc-switch/cc-switch.db，可据此回填。
 *
 * 口径：
 *   - 只导 app_type='claude' 且 date < cutoff 的行；cutoff 默认取 usage_log 现有
 *     非导入行的最早本地日（= 本机转录可见起点），确保与转录明细零重叠、不双算。
 *   - rollups 是"日×模型"聚合，无逐请求明细 → 每组按 request_count 拆成等宽行
 *     （token 均分、余数进首行），**同时保住 token 合计与请求数两个口径**；
 *     ts 统一为当日本地 12:00 起逐秒排布（仅影响小时桶显示，日/月桶精确）。
 *   - message_id 形如 `ccswitch:<date>:<model>:<i>`（确定性键，重跑幂等）；
 *     导入前先清掉既有 ccswitch:* 行，变更 cutoff 重跑也干净。
 *   - source='imported'，无项目维度（project_path NULL）；成本不导入，
 *     由 T1doo 价目表按 token 动态估算。
 *
 * 用法（先完全退出 T1doo，脚本会拒绝写入被占用的库）：
 *   node scripts/import-ccswitch-history.cjs [--dry-run]
 *     [--source <cc-switch.db>] [--target <t1doo.db>] [--cutoff YYYY-MM-DD]
 */
const { join } = require('path')
const { existsSync, copyFileSync, readFileSync } = require('fs')
const Database = require('better-sqlite3-node') // Node ABI 副本（vitest/perf-audit 同款）

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const DRY = args.includes('--dry-run')
const SOURCE_DB =
  flag('--source') || join(process.env.USERPROFILE || '', '.cc-switch', 'cc-switch.db')
const TARGET_DB = flag('--target') || join(process.env.APPDATA || '', 't1doo', 't1doo.db')

function localDay(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function main() {
  if (!existsSync(SOURCE_DB)) throw new Error(`未找到 cc-switch 库：${SOURCE_DB}`)
  if (!existsSync(TARGET_DB)) throw new Error(`未找到 T1doo 库：${TARGET_DB}（先安装并运行一次 1.1.0-m8）`)

  // —— 目标库：独占探测（应用在跑会持锁）+ 必要时补 004 迁移 ——
  const target = new Database(TARGET_DB, { timeout: 2000 })
  try {
    target.exec('BEGIN IMMEDIATE; ROLLBACK;')
  } catch {
    target.close()
    throw new Error('T1doo 库被占用——请先完全退出 T1doo（托盘右键退出）再运行')
  }
  const verRow = target.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()
  let version = verRow ? Number(verRow.value) : 0
  if (version < 3) {
    target.close()
    throw new Error(`schema_version=${version} 过旧——先运行一次 T1doo 完成迁移`)
  }
  if (version === 3) {
    // 与主程序 migrate() 同语义：备份 → 执行 004 → 版本号推进（app 之后启动会跳过 v4）
    const sql = readFileSync(join(__dirname, '..', 'src', 'main', 'db', 'migrations', '004_usage.sql'), 'utf8')
    if (DRY) {
      console.log('[dry-run] 将应用 004_usage 迁移（当前 schema_version=3）')
    } else {
      copyFileSync(TARGET_DB, `${TARGET_DB}.bak-v3`)
      target.transaction(() => {
        target.exec(sql)
        target
          .prepare(`INSERT INTO meta (key, value) VALUES ('schema_version','4')
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .run()
      })()
      version = 4
      console.log('已应用 004_usage 迁移（备份于 .bak-v3）')
    }
  }

  // —— cutoff：现有非导入行的最早本地日（转录可见起点） ——
  let cutoff = flag('--cutoff')
  if (!cutoff) {
    const row = version >= 4
      ? target
          .prepare(`SELECT MIN(ts) lo FROM usage_log WHERE ts IS NOT NULL AND source != 'imported'`)
          .get()
      : null
    if (!row || row.lo == null) {
      target.close()
      throw new Error(
        '目标库还没有转录扫描数据，无法自动定界——先运行一次 T1doo 1.1.0-m8 完成首扫，或显式传 --cutoff YYYY-MM-DD'
      )
    }
    cutoff = localDay(row.lo)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error(`非法 cutoff：${cutoff}`)

  // —— 源库：日×模型聚合（date < cutoff，只取 claude） ——
  const source = new Database(SOURCE_DB, { readonly: true })
  const groups = source
    .prepare(
      `SELECT date, model,
              SUM(request_count) AS requests,
              SUM(input_tokens) AS input, SUM(output_tokens) AS output,
              SUM(cache_read_tokens) AS cacheRead, SUM(cache_creation_tokens) AS cacheCreation
       FROM usage_daily_rollups
       WHERE app_type = 'claude' AND date < ?
       GROUP BY date, model ORDER BY date, model`
    )
    .all(cutoff)
  source.close()

  const totals = groups.reduce(
    (t, g) => ({
      requests: t.requests + g.requests,
      tok: t.tok + g.input + g.output + g.cacheRead + g.cacheCreation
    }),
    { requests: 0, tok: 0 }
  )
  console.log(
    `来源：${groups.length} 个 日×模型 分组（date < ${cutoff}），` +
      `${totals.requests.toLocaleString()} 请求 / ${totals.tok.toLocaleString()} tokens`
  )
  if (groups.length === 0) {
    target.close()
    console.log('没有可导入的数据（cutoff 之前为空）')
    return
  }

  if (DRY) {
    for (const g of groups.slice(0, 5)) console.log('[dry-run] 样例:', JSON.stringify(g))
    console.log('[dry-run] 未写入任何数据')
    target.close()
    return
  }

  // —— 写入：清旧导入 → 按 request_count 拆行（token 均分、余数进首行） ——
  const insert = target.prepare(
    `INSERT OR REPLACE INTO usage_log (
       message_id, session_id, project_path, model, ts,
       input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
       stop_reason, source, backend_profile_id
     ) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, 'imported', NULL)`
  )
  let inserted = 0
  target.transaction(() => {
    target.prepare(`DELETE FROM usage_log WHERE message_id LIKE 'ccswitch:%'`).run()
    for (const g of groups) {
      const n = Math.max(1, g.requests)
      const [y, m, d] = g.date.split('-').map(Number)
      const base = new Date(y, m - 1, d, 12, 0, 0).getTime()
      const split = (total) => {
        const q = Math.floor(total / n)
        return (i) => (i === 0 ? total - q * (n - 1) : q)
      }
      const si = split(g.input)
      const so = split(g.output)
      const sr = split(g.cacheRead)
      const sc = split(g.cacheCreation)
      for (let i = 0; i < n; i++) {
        insert.run(`ccswitch:${g.date}:${g.model}:${i}`, g.model, base + i * 1000, si(i), so(i), sr(i), sc(i))
        inserted++
      }
    }
  })()

  // —— 校验：导入行合计必须与源聚合完全一致 ——
  const check = target
    .prepare(
      `SELECT COUNT(*) rows, SUM(input_tokens+output_tokens+cache_read_tokens+cache_creation_tokens) tok
       FROM usage_log WHERE source = 'imported'`
    )
    .get()
  const monthly = target
    .prepare(
      `SELECT strftime('%Y-%m', ts/1000, 'unixepoch', 'localtime') m,
              SUM(input_tokens+output_tokens+cache_read_tokens+cache_creation_tokens) tok, COUNT(*) reqs
       FROM usage_log WHERE source = 'imported' GROUP BY m ORDER BY m`
    )
    .all()
  target.close()

  console.log(`已写入 ${inserted.toLocaleString()} 行（cutoff=${cutoff}，重跑幂等）`)
  for (const r of monthly) console.log(`  ${r.m}: ${r.tok.toLocaleString()} tokens / ${r.reqs.toLocaleString()} 请求`)
  const ok = check.tok === totals.tok && check.rows === totals.requests
  console.log(
    ok
      ? `校验 ✅ token 合计与请求数均与 cc-switch rollups 完全一致（${check.tok.toLocaleString()}）`
      : `校验 ❌ 目标 ${check.tok}/${check.rows} vs 源 ${totals.tok}/${totals.requests}`
  )
  if (!ok) process.exitCode = 1
}

try {
  main()
} catch (err) {
  console.error('导入失败：', err.message ?? err)
  process.exit(1)
}
