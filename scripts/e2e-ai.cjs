/* M5 E2E：AI 对话双引擎 + 任务队列 + 启动器 @ 提问（隔离环境 + 假 claude，零额度消耗）
 * 覆盖：cli 引擎流式对话 → 历史落库/切换回放 → 历史全文搜索 → api 引擎无 Key 明确报错 →
 *       API Key DPAPI 密文落盘（明文不可见）→ 任务提交→后台执行→完成→输出/会话跳转 →
 *       启动器 @ 提问 → 主窗对话页流式作答
 * 用法：npm run build 后 node scripts/e2e-ai.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = require('fs')
const { tmpdir } = require('os')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const TEST_KEY = 'sk-ant-e2e-plaintext-should-never-touch-disk-1234'

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m5-'))
  const projectsDir = join(tmp, 'projects')
  const userData = join(tmp, 'user-data')
  const taskCwd = join(tmp, 'task-cwd')
  mkdirSync(projectsDir, { recursive: true })
  mkdirSync(userData, { recursive: true })
  mkdirSync(taskCwd, { recursive: true })
  writeFileSync(join(tmp, 'claude-settings.json'), '{}')
  writeFileSync(join(tmp, 'history.jsonl'), '')

  // 假 claude shim：T1DOO_CLAUDE_CMD 直指 .cmd，避免 where 命中真实 claude.exe
  const fakeCmd = join(tmp, 'claude.cmd')
  writeFileSync(
    fakeCmd,
    `@echo off\r\nnode "${join(__dirname, 'fake-claude.cjs')}" %*\r\n`
  )

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
      T1DOO_CLAUDE_HISTORY: join(tmp, 'history.jsonl'),
      T1DOO_CLAUDE_CMD: fakeCmd
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

  // ---------- ① cli 引擎流式对话 ----------
  await page.locator('nav button:has-text("对话")').click()
  const input = page.locator('[data-testid="chat-input"]')
  await input.waitFor({ state: 'visible' })
  await input.fill('第一条测试消息')
  await input.press('Enter')
  // 流式中间态出现
  await page.locator('[data-testid="chat-streaming"]').waitFor({ state: 'visible', timeout: 15000 })
  // 回合完成：assistant 消息渲染（Markdown 加粗生效）
  await page
    .locator('[data-testid="chat-thread"] strong:has-text("假引擎")')
    .waitFor({ state: 'visible', timeout: 15000 })
  console.log('✅ cli 引擎流式对话：delta 中间态 + Markdown 渲染完成')
  await page.screenshot({ path: join(SHOT_DIR, 'ai-1-chat.png') })

  // 多轮：同一对话再发一条（复用长连进程）
  await input.fill('第二条消息')
  await input.press('Enter')
  await page
    .locator('[data-testid="chat-thread"]')
    .locator('text=收到：第二条消息')
    .waitFor({ state: 'visible', timeout: 15000 })
  console.log('✅ 多轮对话（单进程长连）第二回合完成')

  // ---------- ② 历史落库：切走再切回，消息完整回放 ----------
  await page.locator('[data-testid="chat-new"]').click()
  await page.locator('[data-testid="chat-conv-list"] button').first().click()
  await page
    .locator('[data-testid="chat-thread"]')
    .locator('text=第一条测试消息')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
  console.log('✅ 对话历史落库并回放（含用户/助手消息）')

  // ---------- ③ 历史全文搜索（FTS + CJK 切分） ----------
  await page.locator('[data-testid="chat-search"]').fill('假引擎')
  await page.locator('mark').first().waitFor({ state: 'visible', timeout: 5000 })
  console.log('✅ 对话历史全文搜索命中（snippet 高亮）')
  await page.locator('[data-testid="chat-search"]').fill('')

  // ---------- ④ api 引擎无 Key：明确报错 ----------
  await page.locator('[data-testid="chat-new"]').click()
  await page.locator('[data-testid="chat-engine-api"]').click()
  await input.fill('没有 Key 应该明确报错')
  await input.press('Enter')
  const errBox = page.locator('[data-testid="chat-error"]')
  await errBox.waitFor({ state: 'visible', timeout: 10000 })
  const errText = await errBox.textContent()
  if (!errText.includes('未配置 API Key')) throw new Error(`api 无 Key 报错文案异常：${errText}`)
  console.log('✅ api 引擎无 Key → 明确提示：', errText.slice(0, 40))
  await page.screenshot({ path: join(SHOT_DIR, 'ai-2-nokey.png') })

  // ---------- ⑤ API Key DPAPI 密文落盘 ----------
  await page.locator('nav button:has-text("设置")').click()
  await page.locator('[data-testid="ai-key-input"]').fill(TEST_KEY)
  await page.locator('[data-testid="ai-key-save"]').click()
  await page
    .locator(`[data-testid="ai-key-state"]:has-text("${TEST_KEY.slice(-4)}")`)
    .waitFor({ state: 'visible', timeout: 5000 })
  const storeRaw = readFileSync(join(userData, 'ai-api.json'), 'utf8')
  if (storeRaw.includes(TEST_KEY)) throw new Error('API Key 明文出现在磁盘存储！')
  if (!JSON.parse(storeRaw).apiKeyEnc) throw new Error('apiKeyEnc 密文缺失')
  console.log('✅ API Key 落盘为 DPAPI 密文（明文不可见，UI 显示尾号）')

  // ---------- ⑥ 任务队列最小闭环 ----------
  await page.locator('nav button:has-text("任务")').click()
  await page.locator('[data-testid="task-prompt"]').fill('E2E 演练任务：输出一句话')
  await page.locator('[data-testid="task-cwd"]').fill(taskCwd)
  await page.locator('[data-testid="task-submit"]').click()
  const taskCard = page.locator('[data-testid="task-list"] li').first()
  await taskCard.locator('text=完成').first().waitFor({ state: 'visible', timeout: 20000 })
  console.log('✅ 任务：提交 → 后台执行 → done')
  await taskCard.locator('button:has-text("查看输出")').click()
  const outputText = await page.locator('[data-testid="task-output"]').textContent()
  if (!outputText.includes('任务已完成')) throw new Error(`任务输出异常：${outputText}`)
  const hasSessionBtn = await taskCard.locator('button:has-text("查看会话")').count()
  if (hasSessionBtn < 1) throw new Error('任务卡片缺少"查看会话"跳转（session_id 未采集）')
  console.log('✅ 任务输出可查看 + 对应会话跳转按钮就绪')
  await page.screenshot({ path: join(SHOT_DIR, 'ai-3-task.png') })

  // ---------- ⑦ 启动器 @ 提问 → 对话页流式作答 ----------
  const launcherResult = await page.evaluate(async () => {
    const res = await window.t1doo.launcher.query('@ 启动器直达提问')
    const item = res.items[0]
    if (!item || item.kind !== 'ai') return { ok: false, message: `意外条目：${item?.kind}` }
    return window.t1doo.launcher.execute(item)
  })
  if (!launcherResult.ok) throw new Error(`启动器 @ 执行失败：${launcherResult.message}`)
  await page
    .locator('[data-testid="chat-thread"]')
    .locator('text=收到：启动器直达提问')
    .waitFor({ state: 'visible', timeout: 15000 })
  console.log('✅ 启动器 @ 提问 → 主窗对话页自动聚焦新对话并流式作答')
  await page.screenshot({ path: join(SHOT_DIR, 'ai-4-launcher.png') })

  await app.close()

  if (errors.length) {
    console.log(`渲染层报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 10)) console.log('  -', e.slice(0, 300))
    process.exitCode = 1
  } else {
    console.log('渲染层零报错 ✅ — M5 E2E 全部通过')
  }
}

main().catch((err) => {
  console.error('E2E 失败：', err)
  process.exit(1)
})
