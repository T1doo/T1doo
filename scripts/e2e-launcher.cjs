/* M3 E2E：启动器全链路（隔离环境，不 spawn claude、不碰真实配置）
 * 覆盖：启动器窗口预创建 → 显示/聚焦 → CC 对象匹配（项目/会话/提示词）→
 *       意图路由（URL / > 命令）→ 命令执行跳转主窗设置页 → Esc 隐藏
 * 用法：npm run build 后 node scripts/e2e-launcher.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const SESSION_ID = '11111111-1111-4111-8111-111111111111'

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m3-'))
  const projectsDir = join(tmp, 'projects')
  const userData = join(tmp, 'user-data')
  const slugDir = join(projectsDir, 'E--Demo-ProjectA')
  mkdirSync(slugDir, { recursive: true })
  mkdirSync(userData, { recursive: true })
  // 跳过首启引导（M6）：否则向导覆盖层挡住页面交互
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))

  // fixture 会话（标题"修复登录页空指针"，项目 E:\Demo\ProjectA）
  copyFileSync(
    join(__dirname, '..', 'tests', 'fixtures', 'claude-jsonl', 'normal.jsonl'),
    join(slugDir, `${SESSION_ID}.jsonl`)
  )
  // fixture 最近提示词
  const historyPath = join(tmp, 'history.jsonl')
  writeFileSync(
    historyPath,
    [
      JSON.stringify({
        display: '帮我优化启动器的排序逻辑',
        pastedContents: {},
        timestamp: Date.now() - 60_000,
        project: 'E:\\Demo\\ProjectA',
        sessionId: SESSION_ID
      }),
      ''
    ].join('\n')
  )
  writeFileSync(join(tmp, 'claude-settings.json'), '{}')

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
      T1DOO_CLAUDE_HISTORY: historyPath
    }
  })

  const errors = []
  const hookWindow = (w, tag) => {
    w.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${tag}] ${msg.text()}`)
    })
    w.on('pageerror', (err) => errors.push(`[${tag}] pageerror: ${err.message}`))
  }

  // 等两个窗口都出现（主窗 + 预创建的启动器窗）
  let windows = app.windows()
  for (let i = 0; i < 50 && windows.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 200))
    windows = app.windows()
  }
  const launcherPage = windows.find((w) => w.url().includes('launcher.html'))
  const mainPage = windows.find((w) => !w.url().includes('launcher.html'))
  if (!launcherPage || !mainPage) throw new Error(`窗口数异常：${windows.map((w) => w.url())}`)
  hookWindow(mainPage, 'main')
  hookWindow(launcherPage, 'launcher')
  await launcherPage.waitForLoadState('domcontentloaded')
  console.log('✅ 启动器窗口已预创建（隐藏）')

  // 等 fixture 同步入库
  await new Promise((r) => setTimeout(r, 2500))

  const showLauncher = () =>
    app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('launcher.html')
      )
      win.webContents.send('evt:launcher:show')
      win.show()
      win.focus()
    })
  const launcherVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('launcher.html'))
        .isVisible()
    )

  await showLauncher()
  const input = launcherPage.locator('input')
  await input.waitFor({ state: 'visible' })

  const queryAndFirst = async (q, expectKind) => {
    await input.fill(q)
    await launcherPage.waitForTimeout(350)
    const rows = launcherPage.locator('button[data-index]')
    const count = await rows.count()
    if (count === 0) throw new Error(`查询「${q}」无结果`)
    const text = await rows.first().textContent()
    if (expectKind && !text.includes(expectKind)) {
      throw new Error(`查询「${q}」首条不含「${expectKind}」：${text}`)
    }
    return text
  }

  // ① CC 对象：项目 / 会话 / 提示词
  const p = await queryAndFirst('projecta', '项目')
  if (!p.includes('ProjectA')) throw new Error(`项目匹配异常：${p}`)
  console.log('✅ 项目秒跳条目命中：', p.slice(0, 40))

  const s = await queryAndFirst('登录', '会话')
  if (!s.includes('修复登录页空指针')) throw new Error(`会话标题匹配异常：${s}`)
  console.log('✅ 会话秒跳条目命中：', s.slice(0, 40))

  const pr = await queryAndFirst('优化启动器', '提示词')
  if (!pr.includes('帮我优化启动器的排序逻辑')) throw new Error(`提示词匹配异常：${pr}`)
  console.log('✅ 最近提示词条目命中：', pr.slice(0, 40))

  // ② 意图路由：URL / 路径 / 命令
  const u = await queryAndFirst('github.com', '网址')
  if (!u.includes('https://github.com')) throw new Error(`URL 路由异常：${u}`)
  const path = await queryAndFirst(tmp, '路径')
  if (!path.includes('打开')) throw new Error(`路径路由异常：${path}`)
  console.log('✅ URL / 路径意图路由正确')

  // 验收②：输入到结果（本地源查询 IPC 往返）< 50ms，取 5 次最小值排除 JIT 抖动
  const queryMs = await launcherPage.evaluate(async () => {
    let best = Infinity
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      await window.t1doo.launcher.query('a')
      best = Math.min(best, performance.now() - t0)
    }
    return best
  })
  console.log(`✅ 查询 IPC 往返 ${queryMs.toFixed(1)}ms（验收 <50ms）`)
  if (queryMs > 50) throw new Error(`查询延迟超标：${queryMs}ms`)

  await input.fill('> 设置')
  await launcherPage.waitForTimeout(350)
  await launcherPage.screenshot({ path: join(SHOT_DIR, 'launcher-1-command.png') })

  // ③ 执行内部命令 → 主窗跳到设置页、启动器自动隐藏
  await input.press('Enter')
  await launcherPage.waitForTimeout(800)
  if (await launcherVisible()) throw new Error('执行命令后启动器未隐藏')
  await mainPage.locator('h1:has-text("设置")').waitFor({ state: 'visible', timeout: 5000 })
  await mainPage.screenshot({ path: join(SHOT_DIR, 'launcher-2-settings.png') })
  console.log('✅ 「> 设置」执行 → 主窗跳转设置页 + 启动器隐藏')

  // ④ 设置页出现启动器区块（热键与应用索引状态）
  await mainPage
    .getByText('全局热键', { exact: true })
    .waitFor({ state: 'visible', timeout: 3000 })
  console.log('✅ 设置页启动器区块渲染')

  // ⑤ 再次唤起 → Esc 隐藏
  await showLauncher()
  await launcherPage.waitForTimeout(300)
  if (!(await launcherVisible())) throw new Error('二次唤起失败')
  await launcherPage.screenshot({ path: join(SHOT_DIR, 'launcher-3-empty.png') })
  await launcherPage.locator('input').press('Escape')
  await launcherPage.waitForTimeout(400)
  if (await launcherVisible()) throw new Error('Esc 后启动器未隐藏')
  console.log('✅ show/hide 复用 + Esc 隐藏')

  await app.close()

  if (errors.length) {
    console.log(`渲染层报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 10)) console.log('  -', e.slice(0, 300))
    process.exitCode = 1
  } else {
    console.log('渲染层零报错 ✅ — M3 E2E 全部通过')
  }
}

main().catch((err) => {
  console.error('E2E 失败：', err)
  process.exit(1)
})
