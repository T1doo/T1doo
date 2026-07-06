/* E2E 冒烟：启动应用 → 会话页 → 抽查 N 个会话渲染 → 搜索 → 截图
 * 用法：node scripts/e2e-smoke.cjs [截图输出目录]
 * 会话数据读真实 ~/.claude（"真数据冒烟"）；userData/DB 走临时目录——
 * 既避开安装版托盘实例的单例锁（同 userData 才互斥），也不污染真实配置。
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const { mkdtempSync, mkdirSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const SAMPLE_COUNT = 10

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-smoke-'))
  const userData = join(tmp, 'user-data')
  mkdirSync(userData, { recursive: true })
  // 跳过首启引导（M6）：否则向导覆盖层挡住页面交互
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))

  const app = await _electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      T1DOO_USER_DATA: userData,
      T1DOO_DB_PATH: join(tmp, 'smoke.db')
    }
  })
  const errors = []
  // 等主窗 + 预创建启动器窗都出现，取非 launcher 的主窗（firstWindow 可能抓到启动器窗）
  let windows = app.windows()
  for (let i = 0; i < 50 && windows.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 200))
    windows = app.windows()
  }
  const win = windows.find((w) => !w.url().includes('launcher.html'))
  if (!win) throw new Error(`未找到主窗口：${windows.map((w) => w.url())}`)
  win.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  win.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await win.waitForLoadState('domcontentloaded')
  await win.getByRole('button', { name: '会话' }).click()
  // 冷库重新索引真实数据（本机基线 ~5s）：Node 侧轮询列表行数就绪
  const rowsReady = win.locator('aside button[type=button]')
  for (let i = 0; i < 60; i++) {
    if ((await rowsReady.count()) >= SAMPLE_COUNT) break
    await win.waitForTimeout(1000)
  }
  await win.screenshot({ path: join(SHOT_DIR, 'smoke-1-list.png') })

  // 抽查前 N 个会话的详情渲染
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const rows = win.locator('aside button[type=button]').filter({ hasNot: win.locator('input') })
    const count = await rows.count()
    if (i >= count) break
    await rows.nth(i).click()
    await win.waitForTimeout(700)
    if (i === 0) await win.screenshot({ path: join(SHOT_DIR, 'smoke-2-detail.png') })
  }
  console.log(`抽查 ${SAMPLE_COUNT} 个会话完成`)

  // 全文搜索
  await win.getByPlaceholder('全文搜索所有会话…').fill('性能')
  await win.waitForTimeout(1200)
  await win.screenshot({ path: join(SHOT_DIR, 'smoke-3-search.png') })

  await app.close()

  if (errors.length) {
    console.log(`渲染层报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 10)) console.log('  -', e.slice(0, 300))
    process.exitCode = 1
  } else {
    console.log('渲染层零报错 ✅')
  }
}

main().catch((err) => {
  console.error('冒烟失败：', err)
  process.exit(1)
})
