/* M8 E2E：用量中心全链路（fixtures 数据注入，零额度/零真实外联）
 * 覆盖：首扫（顶层 + subagents + wf_* 全覆盖、message.id 去重）→ Hero 指标口径断言
 *       （四维合计/请求数/缓存命中率）→ Recharts 趋势渲染（暗/亮主题截图）→
 *       来源占比含子代理与工作流 → 来源筛选 → 成本开关默认关/开启恒带「估算」+
 *       内置价目成本断言 → 价目表编辑/重置联动 → 增量追加 ≤10s 反映 →
 *       Dashboard 精简卡片跳转
 * 用法：npm run build 后 node scripts/e2e-usage.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } = require('fs')
const { tmpdir } = require('os')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const SESS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0001'

/** 生成一条 assistant 用量行（JSONL） */
function usageLine({ id, model, input, output, read, write, stop, minutesAgo }) {
  return `${JSON.stringify({
    type: 'assistant',
    uuid: `uuid-${id}`,
    sessionId: SESS,
    cwd: 'C:\\work\\demo-project',
    timestamp: new Date(Date.now() - (minutesAgo ?? 5) * 60_000).toISOString(),
    message: {
      id,
      type: 'message',
      role: 'assistant',
      model,
      stop_reason: stop ?? 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: input ?? 0,
        output_tokens: output ?? 0,
        cache_read_input_tokens: read ?? 0,
        cache_creation_input_tokens: write ?? 0
      }
    }
  })}\n`
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m8-'))
  const projectsDir = join(tmp, 'projects')
  const userData = join(tmp, 'user-data')
  const slug = join(projectsDir, 'C--work-demo-project')
  const subagents = join(slug, SESS, 'subagents')
  const wf = join(subagents, 'workflows', 'wf_e2e-001')
  mkdirSync(wf, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))

  // —— fixtures ——（数字设计成显示值可精确断言）
  // 顶层主会话（haiku，含同 message.id 流式快照 → 去重后只计终态）
  const sessionFile = join(slug, `${SESS}.jsonl`)
  writeFileSync(
    sessionFile,
    usageLine({ id: 'msg_A', model: 'claude-haiku-4-5-20251001', input: 100_000, output: 1, stop: null }) +
      usageLine({
        id: 'msg_A',
        model: 'claude-haiku-4-5-20251001',
        input: 100_000,
        output: 50_000,
        read: 200_000,
        write: 100_000,
        stop: 'end_turn'
      }) +
      '{"type":"user","uuid":"u1","message":{"role":"user","content":"hi"}}\n'
  )
  // 子代理（sonnet-5）
  writeFileSync(
    join(subagents, 'agent-e2e01.jsonl'),
    usageLine({ id: 'msg_B', model: 'claude-sonnet-5', input: 200_000, output: 100_000 })
  )
  // 工作流（opus-4-8）+ journal（应产出 0 行）
  writeFileSync(
    join(wf, 'agent-e2e02.jsonl'),
    usageLine({ id: 'msg_C', model: 'claude-opus-4-8', input: 50_000, output: 10_000 })
  )
  writeFileSync(join(wf, 'journal.jsonl'), '{"event":"agent_done","result":"ok"}\n')
  // 期望合计：in 350k / out 160k / read 200k / write 100k → 总 810.0k；请求 3
  // 命中率 = 200k ÷ (350k+100k+200k) = 30.8%
  // 成本（内置价）：haiku 0.495 + sonnet 2.1 + opus 0.5 = $3.095

  const app = await _electron.launch({
    ...(process.env.T1DOO_EXE
      ? { executablePath: process.env.T1DOO_EXE, args: [] }
      : { args: ['.'], cwd: join(__dirname, '..') }),
    env: {
      ...process.env,
      T1DOO_DB_PATH: join(tmp, 'e2e.db'),
      T1DOO_PROJECTS_DIR: projectsDir,
      T1DOO_USER_DATA: userData,
      T1DOO_CLAUDE_SETTINGS: join(tmp, 'claude-settings.json'),
      T1DOO_CLAUDE_HISTORY: join(tmp, 'history.jsonl')
    }
  })

  const errors = []
  let windows = app.windows()
  for (let i = 0; i < 50 && windows.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 200))
    windows = app.windows()
  }
  const page = windows.find((w) => !w.url().includes('launcher.html'))
  if (!page) throw new Error('主窗口未出现')
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  await page.waitForLoadState('domcontentloaded')

  const fail = (msg) => {
    throw new Error(msg)
  }
  const heroText = async (id) =>
    (await page.locator(`[data-testid="${id}"]`).textContent()).trim()

  // ---------- ① 首扫全覆盖 + 去重 + Hero 口径 ----------
  await page.locator('nav button:has-text("用量")').click()
  await page.waitForSelector('[data-testid="usage-page"]')
  // 首扫完成后合计应为 810.0k（msg_A 去重取终态；journal 行产出 0）
  await page
    .locator('[data-testid="usage-hero-total"]:has-text("810.0k")')
    .waitFor({ timeout: 30_000 })
  if ((await heroText('usage-hero-requests')) !== '3') fail('请求数应为 3（message.id 去重）')
  if ((await heroText('usage-hero-hitrate')) !== '30.8%') {
    fail(`缓存命中率应为 30.8%，实为 ${await heroText('usage-hero-hitrate')}`)
  }
  console.log('① 首扫全覆盖（session+subagent+wf_*）+ message.id 去重 + Hero 口径 ✅')

  // ---------- ② Recharts 趋势渲染（暗 → 亮双主题） ----------
  await page.waitForSelector('[data-testid="usage-trend-chart"] svg', { timeout: 10_000 })
  const bars = await page.locator('[data-testid="usage-trend-chart"] .recharts-bar-rectangle').count()
  if (bars === 0) fail('趋势图未渲染出柱条')
  await page.screenshot({ path: join(SHOT_DIR, 'm8-1-usage-dark.png') })
  await page.evaluate(() => window.t1doo.settings.set({ theme: 'light' }))
  await new Promise((r) => setTimeout(r, 800)) // nativeTheme → prefers-color-scheme 生效
  await page.waitForSelector('[data-testid="usage-trend-chart"] svg')
  await page.screenshot({ path: join(SHOT_DIR, 'm8-2-usage-light.png') })
  await page.evaluate(() => window.t1doo.settings.set({ theme: 'dark' }))
  // 面积模式切换仍可渲染
  await page.locator('[data-testid="usage-mode-area"]').click()
  await page.waitForSelector('[data-testid="usage-trend-chart"] .recharts-area-area', {
    timeout: 5_000
  })
  await page.locator('[data-testid="usage-mode-bar"]').click()
  console.log('② Recharts 趋势渲染（暗/亮主题截图 + 柱/面积双模式）✅')

  // ---------- ③ 来源占比与筛选 ----------
  const bySource = await page.locator('[data-testid="usage-bysource"]').textContent()
  for (const label of ['终端会话', '子代理', '工作流']) {
    if (!bySource.includes(label)) fail(`来源占比缺少「${label}」`)
  }
  await page.locator('[data-testid="usage-filter-source"]').selectOption('workflow')
  await page
    .locator('[data-testid="usage-hero-total"]:has-text("60.0k")')
    .waitFor({ timeout: 10_000 })
  await page.locator('[data-testid="usage-filter-source"]').selectOption('')
  await page
    .locator('[data-testid="usage-hero-total"]:has-text("810.0k")')
    .waitFor({ timeout: 10_000 })
  console.log('③ 来源占比（含子代理/工作流）+ 来源筛选 ✅')

  // ---------- ④ 成本开关：默认关 → 开启恒带「估算」+ 内置价断言 ----------
  if ((await page.locator('[data-testid="usage-hero-cost"]').count()) !== 0) {
    fail('成本卡片默认应隐藏（开关默认关，§7.8.3）')
  }
  await page.locator('[data-testid="usage-cost-toggle"]').click()
  await page.waitForSelector('[data-testid="usage-hero-cost"]', { timeout: 5_000 })
  if ((await page.locator('[data-testid="usage-cost-estimated-badge"]').count()) !== 1) {
    fail('成本开启后须恒带「估算」标注')
  }
  if ((await heroText('usage-hero-cost')) !== '$3.095') {
    fail(`内置价成本应为 $3.095，实为 ${await heroText('usage-hero-cost')}`)
  }
  console.log('④ 成本开关默认关 → 开启恒带「估算」+ 内置价目成本 $3.095 ✅')

  // ---------- ⑤ 价目表编辑 → 成本联动 → 重置还原 ----------
  await page.locator('[data-testid="usage-pricing-open"]').click()
  await page.waitForSelector('[data-testid="usage-pricing-editor"]')
  const haikuInput = page.locator('[data-testid="pricing-claude-haiku-4-5-inputPerM"]')
  await haikuInput.fill('2')
  await page.locator('[data-testid="pricing-save-claude-haiku-4-5"]').click()
  // haiku input 100k：$0.1 → $0.2，总成本 3.095 → 3.195
  await page
    .locator('[data-testid="usage-hero-cost"]:has-text("$3.195")')
    .waitFor({ timeout: 10_000 })
  await page.locator('[data-testid="pricing-reset-claude-haiku-4-5"]').click()
  await page
    .locator('[data-testid="usage-hero-cost"]:has-text("$3.095")')
    .waitFor({ timeout: 10_000 })
  await page.screenshot({ path: join(SHOT_DIR, 'm8-3-pricing.png') })
  console.log('⑤ 价目编辑（改内置转用户项）→ 成本联动 → 重置恢复种子价 ✅')

  // ---------- ⑥ 增量：追加写 ≤10s 反映到板块 ----------
  appendFileSync(
    sessionFile,
    usageLine({ id: 'msg_D', model: 'claude-haiku-4-5-20251001', input: 10_000, minutesAgo: 1 })
  )
  await page
    .locator('[data-testid="usage-hero-total"]:has-text("820.0k")')
    .waitFor({ timeout: 10_000 })
  console.log('⑥ 增量追加写 → 事件推送 → 板块自动刷新（≤10s）✅')

  // ---------- ⑦ Dashboard 精简卡片接跳转 ----------
  await page.locator('nav button:has-text("指挥台")').click()
  await page.waitForSelector('[data-testid="dash-usage-card"]')
  const dashCard = await page.locator('[data-testid="dash-usage-card"]').textContent()
  if (!dashCard.includes('查看用量板块')) fail('Dashboard 卡片缺少跳转入口')
  await page.locator('[data-testid="dash-usage-card"]').click()
  await page.waitForSelector('[data-testid="usage-page"]')
  console.log('⑦ Dashboard 用量卡片精简 + 点击跳转「用量」板块 ✅')

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
  console.error('M8 E2E 失败：', err)
  process.exit(1)
})
