/* E2E 冒烟：启动应用 → 会话页 → 抽查 N 个会话渲染 → 搜索 → 截图
 * 用法：node scripts/e2e-smoke.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const SAMPLE_COUNT = 10

async function main() {
  const app = await _electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..')
  })
  const errors = []
  const win = await app.firstWindow()
  win.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  win.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  await win.waitForLoadState('domcontentloaded')
  await win.getByRole('button', { name: '会话' }).click()
  await win.waitForTimeout(1500)
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
