/* M6 性能审计（§10.3 预算基线）：对打包版（dist/win-unpacked）量测
 *   ① 冷启动到 Dashboard 可交互（预算 <3s）
 *   ② 常驻内存：空闲 + 1 个 shell 终端，进程树 RSS 合计（预算 <350MB）
 *   ③ CPU 空闲占用：10s 采样窗（预算 <1% 全机）
 * M8 扩项（§7.8.5 用量中心预算）：
 *   ④ 用量首扫（含 subagents/wf_*，真实 ~/.claude/projects）后台 <30s，期间 UI 可交互
 *   ⑤ 聚合查询（全年范围，含 IPC 往返）<100ms
 *   ⑥ usage_log 增量库体积（usage 相关表+索引）<30MB
 *   ⑦ 日常增量（追加一轮交互 → evt:usage:updated）<300ms（含防抖）
 * 用法：pnpm build:win 后 node scripts/perf-audit.cjs
 * 注意：Win11 会把后台 shell 启动的进程树打入效率模式（EcoQoS），定时器/调度退化——
 * 量测前把进程树优先级拉回 Normal（§14.2 2026-07-04 压测坑档案）。
 */
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const { join } = require('path')
const { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, existsSync } = require('fs')
const { tmpdir, cpus } = require('os')

const ROOT = join(__dirname, '..')
const EXE = join(ROOT, 'dist', 'win-unpacked', 'T1doo.exe')
const LOG_PATH = join(ROOT, 'out', 'perf-audit.log')

// stdout 重定向到文件时是块缓冲（进程不退出就看不到任何输出）→ 每行同步落盘一份
function log(line) {
  console.log(line)
  try {
    appendFileSync(LOG_PATH, `${line}\n`)
  } catch {
    /* out 目录不存在等：忽略 */
  }
}

/** Playwright electron close 偶发不归还（进程已退仍 pending）→ 15s 超时竞速 */
function closeWithTimeout(app) {
  return Promise.race([app.close(), new Promise((r) => setTimeout(r, 15_000))])
}

function ps(cmd) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], {
    encoding: 'utf8'
  }).trim()
}

/** 进程树（rootPid 及其后代）的 pid 列表 */
function processTree(rootPid) {
  const rows = ps(
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'
  )
  const all = JSON.parse(rows)
  const childrenOf = new Map()
  for (const p of all) {
    if (!childrenOf.has(p.ParentProcessId)) childrenOf.set(p.ParentProcessId, [])
    childrenOf.get(p.ParentProcessId).push(p.ProcessId)
  }
  const out = []
  const queue = [rootPid]
  while (queue.length) {
    const pid = queue.shift()
    out.push(pid)
    for (const c of childrenOf.get(pid) ?? []) queue.push(c)
  }
  return out
}

/** 进程树内存（私有工作集，任务管理器同口径——WorkingSet64 会重复计共享页）与 CPU 累计秒 */
function treeStats(pids) {
  const list = pids.join(',')
  const json = ps(
    `Get-Process -Id ${list} -ErrorAction SilentlyContinue | Select-Object WorkingSet64,@{N='Cpu';E={$_.TotalProcessorTime.TotalSeconds}} | ConvertTo-Json -Compress`
  )
  const rows = json ? [].concat(JSON.parse(json)) : []
  const pidSet = new Set(pids)
  const perfJson = ps(
    `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "Name like 'T1doo%'" | Select-Object IDProcess,WorkingSetPrivate | ConvertTo-Json -Compress`
  )
  const perf = perfJson ? [].concat(JSON.parse(perfJson)) : []
  return {
    rssMb: rows.reduce((n, r) => n + r.WorkingSet64, 0) / 1048576,
    privateMb:
      perf.filter((p) => pidSet.has(p.IDProcess)).reduce((n, p) => n + p.WorkingSetPrivate, 0) /
      1048576,
    cpuSec: rows.reduce((n, r) => n + (r.Cpu ?? 0), 0)
  }
}

async function main() {
  if (!existsSync(EXE)) throw new Error(`未找到打包产物 ${EXE}——先 pnpm build:win`)
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-perf-'))
  const userData = join(tmp, 'user-data')
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))

  // ① 冷启动：spawn → Dashboard 首屏内容可见
  const t0 = performance.now()
  const app = await _electron.launch({
    executablePath: EXE,
    args: [],
    env: { ...process.env, T1DOO_USER_DATA: userData, T1DOO_DB_PATH: join(tmp, 'perf.db') }
  })
  let windows = app.windows()
  for (let i = 0; i < 100 && windows.length < 1; i++) {
    await new Promise((r) => setTimeout(r, 100))
    windows = app.windows()
  }
  let win = windows.find((w) => !w.url().includes('launcher.html'))
  for (let i = 0; i < 100 && !win; i++) {
    await new Promise((r) => setTimeout(r, 100))
    win = app.windows().find((w) => !w.url().includes('launcher.html'))
  }
  await win.waitForSelector('nav >> text=T1doo', { timeout: 15_000 })
  // Dashboard 可交互口径：新建终端按钮可点击
  await win.waitForSelector('button:has-text("新建终端")', { timeout: 15_000 })
  const coldStartMs = performance.now() - t0
  log(`① 冷启动到 Dashboard 可交互: ${(coldStartMs / 1000).toFixed(2)}s（预算 <3s）`)

  // EcoQoS 解除：进程树优先级拉回 Normal 再量测
  const rootPid = app.process().pid
  let pids = processTree(rootPid)
  ps(
    `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = 'Normal' }`
  )

  // ④ 用量首扫（真实 ~/.claude/projects 基线）：轮询 scanState，同时探测 UI 响应
  let scan = await win.evaluate(() => window.t1doo.usage.scanState())
  let maxUiLagMs = 0
  const scanDeadline = Date.now() + 180_000
  while (scan.scanning && Date.now() < scanDeadline) {
    const p0 = Date.now()
    scan = await win.evaluate(() => window.t1doo.usage.scanState()) // 本身就是 UI/IPC 响应探针
    maxUiLagMs = Math.max(maxUiLagMs, Date.now() - p0)
    await new Promise((r) => setTimeout(r, 500))
  }
  log(
    `④ 用量首扫: ${((scan.lastFullScanMs ?? 0) / 1000).toFixed(1)}s，` +
      `${scan.totalFiles} 个文件 / ${scan.rowCount.toLocaleString()} 行（预算 <30s）；` +
      `扫描期间 UI 最大响应延迟 ${maxUiLagMs}ms`
  )


  // ② 开 1 个 shell 终端后空闲内存
  await win.evaluate(() => {
    const home = 'C:\\\\'
    return window.t1doo.term.create({ cwd: home, kind: 'shell' })
  })
  await new Promise((r) => setTimeout(r, 30_000)) // 终端就绪 + 首次索引/首屏查询平息

  // ② 内存必须在 ⑤ 查询爆发之前量（15 连发查询的瞬时页 Windows 懒回收，
  // 实测会虚增 ~100MB——保持与 M6 一致的"空闲态"口径）
  pids = processTree(rootPid)
  const m1 = treeStats(pids)
  log(
    `② 常驻内存（1 shell 终端，进程树 ${pids.length} 进程）: ` +
      `私有工作集 ${m1.privateMb.toFixed(0)}MB（预算 <350MB，任务管理器口径）` +
      ` / WorkingSet 合计 ${m1.rssMb.toFixed(0)}MB（含共享页重复计数，仅参考）`
  )

  // ⑤ 聚合查询延迟（全年范围，含 IPC 往返；预算 <100ms）——
  // 必须在 F1 初始同步平息后量测（主线程写库期间 IPC 排队会把 200ms 的等待算进查询头上），
  // 每档取 3 次最小值（微基准口径）
  const aggMs = await win.evaluate(async () => {
    const range = { from: Date.now() - 365 * 86_400_000, to: Date.now() }
    const out = {}
    for (const kind of ['summary', 'trend', 'byModel', 'byProject', 'bySource']) {
      let best = Infinity
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now()
        await window.t1doo.usage.query({ kind, range })
        best = Math.min(best, performance.now() - t0)
      }
      out[kind] = Math.round(best * 10) / 10
    }
    return out
  })
  const worstAgg = Math.max(...Object.values(aggMs))
  log(
    `⑤ 聚合查询（全年，F1 平息后 3 次取最小）: ${Object.entries(aggMs)
      .map(([k, v]) => `${k} ${v}ms`)
      .join(' / ')}（最慢 ${worstAgg}ms，预算 <100ms 含 IPC）`
  )

  await new Promise((r) => setTimeout(r, 5_000)) // 查询余波平息再进 CPU 采样窗

  // ③ CPU 空闲：10s 采样窗
  const windowMs = 10_000
  const before = treeStats(pids)
  await new Promise((r) => setTimeout(r, windowMs))
  const after = treeStats(processTree(rootPid))
  const cpuDelta = after.cpuSec - before.cpuSec
  const pctMachine = (cpuDelta / (windowMs / 1000) / cpus().length) * 100
  const pctCore = (cpuDelta / (windowMs / 1000)) * 100
  log(
    `③ CPU 空闲占用: 全机 ${pctMachine.toFixed(2)}% / 单核口径 ${pctCore.toFixed(1)}%（预算 全机 <1%）`
  )

  await closeWithTimeout(app)

  // ⑥ usage_log 增量库体积（usage 表+索引实占页；预算 <30MB 本机基线）
  try {
    const Database = require('better-sqlite3-node') // Node ABI 副本（vitest 同款别名）
    const audit = new Database(join(tmp, 'perf.db'), { readonly: true })
    const { bytes } = audit
      .prepare(
        `SELECT SUM(pgsize) AS bytes FROM dbstat
         WHERE name IN ('usage_log','usage_sync','model_pricing','idx_usage_ts','idx_usage_model')`
      )
      .get()
    audit.close()
    log(`⑥ usage_log 增量库体积: ${((bytes ?? 0) / 1048576).toFixed(1)}MB（预算 <30MB）`)
  } catch (err) {
    log(`⑥ usage_log 体积量测失败（dbstat 不可用？）：${String(err).slice(0, 120)}`)
  }

  // ⑦ 日常增量：隔离 fixture 追加一行 → evt:usage:updated 到达（预算 <300ms 含防抖）
  const tmp2 = mkdtempSync(join(tmpdir(), 't1doo-perf-inc-'))
  const projectsDir = join(tmp2, 'projects')
  const sess = 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0002'
  const slugDir = join(projectsDir, 'C--work-perf')
  mkdirSync(slugDir, { recursive: true })
  const userData2 = join(tmp2, 'user-data')
  mkdirSync(userData2, { recursive: true })
  writeFileSync(join(userData2, 'settings.json'), JSON.stringify({ onboardingDone: true }))
  const mkLine = (id) =>
    `${JSON.stringify({
      type: 'assistant',
      uuid: `u-${id}`,
      sessionId: sess,
      cwd: 'C:\\work\\perf',
      timestamp: new Date().toISOString(),
      message: {
        id,
        role: 'assistant',
        model: 'claude-opus-4-8',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'x' }],
        usage: { input_tokens: 100, output_tokens: 100 }
      }
    })}\n`
  const sessFile = join(slugDir, `${sess}.jsonl`)
  writeFileSync(sessFile, mkLine('msg_perf_0'))

  const app2 = await _electron.launch({
    executablePath: EXE,
    args: [],
    env: {
      ...process.env,
      T1DOO_USER_DATA: userData2,
      T1DOO_DB_PATH: join(tmp2, 'perf.db'),
      T1DOO_PROJECTS_DIR: projectsDir
    }
  })
  let win2 = app2.windows().find((w) => !w.url().includes('launcher.html'))
  for (let i = 0; i < 100 && !win2; i++) {
    await new Promise((r) => setTimeout(r, 100))
    win2 = app2.windows().find((w) => !w.url().includes('launcher.html'))
  }
  await win2.waitForLoadState('domcontentloaded')
  // 等首扫完成 + 监听器就位
  for (let i = 0; i < 60; i++) {
    const s = await win2.evaluate(() => window.t1doo.usage.scanState())
    if (!s.scanning && s.rowCount >= 1) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const eventAt = win2.evaluate(
    () =>
      new Promise((resolve) => {
        const off = window.t1doo.usage.onUpdated(() => {
          off()
          resolve(Date.now())
        })
      })
  )
  await new Promise((r) => setTimeout(r, 300)) // 确保订阅先于追加生效
  const tAppend = Date.now()
  appendFileSync(sessFile, mkLine('msg_perf_1'))
  const incMs = (await eventAt) - tAppend
  log(`⑦ 日常增量（追加 → evt:usage:updated）: ${incMs}ms（预算 <300ms 含防抖）`)
  await closeWithTimeout(app2)

  log('审计完成')
  process.exit(0) // playwright 偶发悬挂句柄不放，主动收尾
}

main().catch((err) => {
  log(`审计失败：${err?.stack ?? err}`)
  process.exit(1)
})
