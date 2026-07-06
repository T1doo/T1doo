/* M6 性能审计（§10.3 预算基线）：对打包版（dist/win-unpacked）量测
 *   ① 冷启动到 Dashboard 可交互（预算 <3s）
 *   ② 常驻内存：空闲 + 1 个 shell 终端，进程树 RSS 合计（预算 <350MB）
 *   ③ CPU 空闲占用：10s 采样窗（预算 <1% 全机）
 * 用法：pnpm build:win 后 node scripts/perf-audit.cjs
 * 注意：Win11 会把后台 shell 启动的进程树打入效率模式（EcoQoS），定时器/调度退化——
 * 量测前把进程树优先级拉回 Normal（§14.2 2026-07-04 压测坑档案）。
 */
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const { join } = require('path')
const { mkdtempSync, mkdirSync, writeFileSync, existsSync } = require('fs')
const { tmpdir, cpus } = require('os')

const ROOT = join(__dirname, '..')
const EXE = join(ROOT, 'dist', 'win-unpacked', 'T1doo.exe')

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
  console.log(`① 冷启动到 Dashboard 可交互: ${(coldStartMs / 1000).toFixed(2)}s（预算 <3s）`)

  // EcoQoS 解除：进程树优先级拉回 Normal 再量测
  const rootPid = app.process().pid
  let pids = processTree(rootPid)
  ps(
    `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = 'Normal' }`
  )

  // ② 开 1 个 shell 终端后空闲内存
  await win.evaluate(() => {
    const home = 'C:\\\\'
    return window.t1doo.term.create({ cwd: home, kind: 'shell' })
  })
  await new Promise((r) => setTimeout(r, 30_000)) // 终端就绪 + 首次索引/首屏查询平息
  pids = processTree(rootPid)
  const m1 = treeStats(pids)
  console.log(
    `② 常驻内存（1 shell 终端，进程树 ${pids.length} 进程）: ` +
      `私有工作集 ${m1.privateMb.toFixed(0)}MB（预算 <350MB，任务管理器口径）` +
      ` / WorkingSet 合计 ${m1.rssMb.toFixed(0)}MB（含共享页重复计数，仅参考）`
  )

  // ③ CPU 空闲：10s 采样窗
  const windowMs = 10_000
  const before = treeStats(pids)
  await new Promise((r) => setTimeout(r, windowMs))
  const after = treeStats(processTree(rootPid))
  const cpuDelta = after.cpuSec - before.cpuSec
  const pctMachine = (cpuDelta / (windowMs / 1000) / cpus().length) * 100
  const pctCore = (cpuDelta / (windowMs / 1000)) * 100
  console.log(
    `③ CPU 空闲占用: 全机 ${pctMachine.toFixed(2)}% / 单核口径 ${pctCore.toFixed(1)}%（预算 全机 <1%）`
  )

  await app.close()
  console.log('审计完成')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
