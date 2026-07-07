/* M7 E2E：模型中心全链路（隔离环境 + 本地 mock 网关 + 假 claude，零额度/零真实外联）
 * 覆盖：预设建档一键预填 → 连通性测试 200/401/404/超时四分支 → /v1/models 拉取入缓存 →
 *       全局切换（首次授权 → settings.json env 键写入 + 备份 + 用户键保留）→
 *       按终端覆盖 env 注入断言（假 claude 回显；订阅态覆盖=空串中和）→
 *       外部手改触发冲突三选（覆盖分支）→ 一键还原与原文件深度相等 →
 *       API 通道任意模型名读盘断言（明文 Key 不落盘）→ 设置页跳转
 * 用法：npm run build 后 node scripts/e2e-models.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const http = require('http')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const GOOD_TOKEN = 'sk-e2e-mock-token-123456'
const API_KEY = 'sk-ant-e2e-plaintext-should-never-touch-disk-m7'

/** mock 网关：/good（鉴权 200）/bad401（恒 401）/nf（恒 404）/slow（不响应→超时） */
function startMockGateway() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || ''
      if (url.startsWith('/slow/')) return // 永不响应 → 5s 超时分支
      if (url === '/good/v1/models') {
        const auth = req.headers.authorization
        if (auth !== `Bearer ${GOOD_TOKEN}`) {
          res.writeHead(401, { 'content-type': 'application/json' })
          return res.end('{"error":{"type":"authentication_error"}}')
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ data: [{ id: 'mock-model-a' }, { id: 'mock-model-b' }] }))
      }
      if (url.startsWith('/bad401/')) {
        res.writeHead(401, { 'content-type': 'application/json' })
        return res.end('{"error":{"type":"authentication_error"}}')
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{"error":{"type":"not_found_error"}}')
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function main() {
  const gateway = await startMockGateway()
  const gwPort = gateway.address().port
  const gw = (prefix) => `http://127.0.0.1:${gwPort}/${prefix}`

  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m7-'))
  const projectsDir = join(tmp, 'projects')
  const userData = join(tmp, 'user-data')
  mkdirSync(projectsDir, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))
  // 预置"用户既有配置"：验证全局切换深合并保留 + 还原深度相等
  const claudeSettingsPath = join(tmp, 'claude-settings.json')
  const originalSettings = {
    permissions: { allow: ['Bash(git *)'] },
    env: { MY_OWN_VAR: 'keep-me' },
    theme: 'dark'
  }
  writeFileSync(claudeSettingsPath, JSON.stringify(originalSettings, null, 2))
  writeFileSync(join(tmp, 'history.jsonl'), '')

  const fakeCmd = join(tmp, 'claude.cmd')
  writeFileSync(fakeCmd, `@echo off\r\nnode "${join(__dirname, 'fake-claude.cjs')}" %*\r\n`)

  const app = await _electron.launch({
    ...(process.env.T1DOO_EXE
      ? { executablePath: process.env.T1DOO_EXE, args: [] }
      : { args: ['.'], cwd: join(__dirname, '..') }),
    env: {
      ...process.env,
      T1DOO_DB_PATH: join(tmp, 'e2e.db'),
      T1DOO_PROJECTS_DIR: projectsDir,
      T1DOO_USER_DATA: userData,
      T1DOO_CLAUDE_SETTINGS: claudeSettingsPath,
      T1DOO_CLAUDE_HISTORY: join(tmp, 'history.jsonl'),
      T1DOO_CLAUDE_CMD: fakeCmd,
      T1DOO_FAKE_ECHO_ENV: '1'
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
  const readLive = () => JSON.parse(readFileSync(claudeSettingsPath, 'utf8'))

  // ---------- ① 预设建档一键预填 ----------
  await page.locator('nav button:has-text("模型")').click()
  await page.locator('[data-testid="models-from-preset"]').click()
  await page.locator('[data-testid="preset-deepseek"]').click()
  const prefilledUrl = await page.locator('[data-testid="provider-baseurl"]').inputValue()
  if (prefilledUrl !== 'https://api.deepseek.com/anthropic')
    fail(`预设 baseUrl 未预填：${prefilledUrl}`)
  const prefilledName = await page.locator('[data-testid="provider-name"]').inputValue()
  if (prefilledName !== 'DeepSeek') fail(`预设名称未预填：${prefilledName}`)
  // 改指 mock 网关后保存
  await page.locator('[data-testid="provider-name"]').fill('E2E-Good')
  await page.locator('[data-testid="provider-baseurl"]').fill(gw('good'))
  await page.locator('[data-testid="provider-token"]').fill(GOOD_TOKEN)
  await page.locator('[data-testid="provider-save"]').click()
  await page.waitForSelector('[data-profile-name="E2E-Good"]')
  console.log('① 预设建档一键预填（DeepSeek 模板 → 改指 mock）✅')

  // 其余测试档案走 API 直建（表单路径①已覆盖）
  await page.evaluate(
    ([url, tok]) =>
      window.t1doo.backend
        .save({ name: 'E2E-401', auth: 'custom', baseUrl: `${url}`, token: 'wrong-token' })
        .then(() =>
          window.t1doo.backend.save({ name: 'E2E-404', auth: 'custom', baseUrl: `${tok}` })
        ),
    [gw('bad401'), gw('nf')]
  )
  await page.evaluate(
    (url) => window.t1doo.backend.save({ name: 'E2E-Slow', auth: 'custom', baseUrl: url }),
    gw('slow')
  )
  await page.locator('nav button:has-text("指挥台")').click() // 触发重挂载刷新列表
  await page.locator('nav button:has-text("模型")').click()
  await page.waitForSelector('[data-profile-name="E2E-Slow"]')

  // ---------- ② 连通性测试四分支 ----------
  const testCard = async (name, expectText) => {
    const card = page.locator(`[data-profile-name="${name}"]`)
    await card.locator('[data-testid="test-btn"]').click()
    await card.locator('[data-testid="test-result"]').waitFor({ timeout: 15000 })
    const text = await card.locator('[data-testid="test-result"]').textContent()
    if (!text.includes(expectText)) fail(`${name} 测试提示不符：${text}（期望含「${expectText}」）`)
    console.log(`  · ${name} → ${text.slice(0, 50)}`)
  }
  await testCard('E2E-Good', '连通正常')
  await testCard('E2E-401', 'token 无效')
  await testCard('E2E-404', '不支持模型列表')
  await testCard('E2E-Slow', '超时')
  await page.screenshot({ path: join(SHOT_DIR, 'm7-1-test-branches.png') })
  console.log('② 连通性测试 200/401/404/超时 四分支中文提示 ✅')

  // ---------- ③ /v1/models 拉取 → modelCache ----------
  const modelsResult = await page.evaluate(async () => {
    const list = await window.t1doo.backend.list()
    const good = list.find((p) => p.name === 'E2E-Good')
    const r = await window.t1doo.backend.models(good.id)
    const after = await window.t1doo.backend.list()
    return { fetched: r.models, cached: after.find((p) => p.name === 'E2E-Good').modelCache }
  })
  if (modelsResult.fetched.join() !== 'mock-model-a,mock-model-b')
    fail(`模型拉取结果不符：${modelsResult.fetched}`)
  if (modelsResult.cached.join() !== 'mock-model-a,mock-model-b')
    fail(`modelCache 未持久化：${modelsResult.cached}`)
  // 失败降级：404 网关拉取返回空列表 + 错误提示，不抛异常
  const nfModels = await page.evaluate(async () => {
    const list = await window.t1doo.backend.list()
    return window.t1doo.backend.models(list.find((p) => p.name === 'E2E-404').id)
  })
  if (nfModels.models.length !== 0 || !nfModels.error) fail('404 网关拉取未降级')
  console.log('③ 模型列表拉取入缓存 + 失败降级自由输入 ✅')

  // ---------- ④ 全局切换：首次授权 → 写入 settings.json ----------
  await page.locator('[data-profile-name="E2E-Good"] [data-testid="switch-btn"]').click()
  await page.waitForSelector('[data-testid="authorize-dialog"]')
  await page.screenshot({ path: join(SHOT_DIR, 'm7-2-authorize.png') })
  await page.locator('[data-testid="authorize-confirm"]').click()
  await page.waitForSelector('[data-testid="models-toast"]')
  let live = readLive()
  if (live.env.ANTHROPIC_BASE_URL !== gw('good'))
    fail(`BASE_URL 未写入：${live.env.ANTHROPIC_BASE_URL}`)
  if (live.env.ANTHROPIC_AUTH_TOKEN !== GOOD_TOKEN) fail('AUTH_TOKEN 未写入')
  if (live.env.MY_OWN_VAR !== 'keep-me') fail('用户自有 env 键被破坏')
  if (JSON.stringify(live.permissions) !== JSON.stringify(originalSettings.permissions))
    fail('permissions 键被破坏')
  if (live.theme !== 'dark') fail('theme 键被破坏')
  if (!existsSync(`${claudeSettingsPath}.bak-t1doo`)) fail('写前备份未生成')
  const badge = await page
    .locator('[data-profile-name="E2E-Good"] [data-testid="current-badge"]')
    .count()
  if (badge !== 1) fail('「当前」角标未出现')
  console.log('④ 全局切换：首次授权 → env 键写入 + 用户键保留 + 备份 + 当前角标 ✅')

  // ---------- ⑤ 按终端覆盖：假 claude 回显 env（显式档案注入 / 订阅态空串中和） ----------
  const overrideId = await page.evaluate(async () => {
    const list = await window.t1doo.backend.save({
      name: 'E2E-Override',
      auth: 'custom',
      baseUrl: 'https://override.example.com',
      token: 'sk-override-9999999999',
      model: 'override-model'
    })
    return list.find((p) => p.name === 'E2E-Override').id
  })
  const termCwd = join(__dirname, '..')
  const overrideTerm = await page.evaluate(
    ([cwd, id]) =>
      window.t1doo.term.create({ cwd, kind: 'claude', claude: { backendProfileId: id } }),
    [termCwd, overrideId]
  )
  const subTerm = await page.evaluate(
    (cwd) =>
      window.t1doo.term.create({
        cwd,
        kind: 'claude',
        claude: { backendProfileId: 'builtin-subscription' }
      }),
    termCwd
  )
  await new Promise((r) => setTimeout(r, 2500)) // 等假 claude 输出
  const overrideBuf = (await page.evaluate((id) => window.t1doo.term.attach(id), overrideTerm.id))
    .buffer
  if (!overrideBuf.includes('ENVDUMP ANTHROPIC_BASE_URL=https://override.example.com'))
    fail(`覆盖终端 env 注入缺失：\n${overrideBuf.slice(0, 400)}`)
  if (!overrideBuf.includes('ENVDUMP ANTHROPIC_MODEL=override-model'))
    fail('覆盖终端 MODEL 注入缺失')
  const subBuf = (await page.evaluate((id) => window.t1doo.term.attach(id), subTerm.id)).buffer
  if (!/ENVDUMP ANTHROPIC_BASE_URL=\s*$/m.test(subBuf.replace(/\r/g, '')))
    fail(`订阅态覆盖未中和 BASE_URL：\n${subBuf.slice(0, 400)}`)
  await page.evaluate((id) => window.t1doo.term.close(id), overrideTerm.id)
  await page.evaluate((id) => window.t1doo.term.close(id), subTerm.id)
  console.log('⑤ 按终端覆盖 env 注入断言（显式档案 / 订阅态空串中和）✅')

  // ---------- ⑥ 外部手改 → 冲突三选（覆盖分支） ----------
  const tampered = readLive()
  tampered.env.ANTHROPIC_BASE_URL = 'https://hand-edited.example.com'
  writeFileSync(claudeSettingsPath, JSON.stringify(tampered, null, 2))
  // 切走再切回触发 ModelsPage 重挂载，刷新出 evaluate 直建的 E2E-Override 卡片
  await page.locator('nav button:has-text("指挥台")').click()
  await page.locator('nav button:has-text("模型")').click()
  await page.waitForSelector('[data-profile-name="E2E-Override"]')
  await page.locator('[data-profile-name="E2E-Override"] [data-testid="switch-btn"]').click()
  await page.waitForSelector('[data-testid="conflict-dialog"]', { timeout: 5000 })
  const conflictText = await page.locator('[data-testid="conflict-dialog"]').textContent()
  if (!conflictText.includes('ANTHROPIC_BASE_URL')) fail('冲突详情未列出漂移键')
  await page.screenshot({ path: join(SHOT_DIR, 'm7-3-conflict.png') })
  await page.locator('[data-testid="conflict-overwrite"]').click()
  await page.waitForSelector('[data-testid="models-toast"]')
  live = readLive()
  if (live.env.ANTHROPIC_BASE_URL !== 'https://override.example.com')
    fail('覆盖切换后 BASE_URL 不符')
  if (live.env.MY_OWN_VAR !== 'keep-me') fail('冲突覆盖破坏了用户自有键')
  console.log('⑥ 外部手改 → 冲突提示（不静默覆盖）→ 覆盖分支 ✅')

  // ---------- ⑦ 一键还原：与原文件深度相等 ----------
  await page.locator('[data-testid="models-restore"]').click()
  await page.waitForSelector('[data-testid="models-toast"]')
  await new Promise((r) => setTimeout(r, 300))
  const restored = readLive()
  if (JSON.stringify(restored) !== JSON.stringify(originalSettings))
    fail(`还原不精确：\n${JSON.stringify(restored, null, 2)}`)
  const globalState = await page.evaluate(() => window.t1doo.backend.globalState())
  if (globalState.appliedProfileId !== null || globalState.managedKeys.length !== 0)
    fail('还原后全局状态未清零')
  console.log('⑦ 一键还原 settings.json 与原文件深度相等 ✅')

  // ---------- ⑧ API 通道：任意模型名 + Key 密文落盘 ----------
  await page.locator('[data-testid="ai-key-input"]').fill(API_KEY)
  await page.locator('[data-testid="ai-key-save"]').click()
  await page
    .locator(`[data-testid="ai-key-state"]:has-text("${API_KEY.slice(-4)}")`)
    .waitFor({ timeout: 5000 })
  await page.locator('[data-testid="api-model-input"]').fill('my-gateway/custom-model-x')
  await page.locator('[data-testid="api-model-input"]').press('Enter')
  await new Promise((r) => setTimeout(r, 500))
  const aiCfg = await page.evaluate(() => window.t1doo.ai.configGet())
  if (aiCfg.model !== 'my-gateway/custom-model-x') fail(`自由模型名未生效：${aiCfg.model}`)
  const aiRaw = readFileSync(join(userData, 'ai-api.json'), 'utf8')
  if (!aiRaw.includes('my-gateway/custom-model-x')) fail('模型名未落盘')
  if (aiRaw.includes(API_KEY)) fail('API Key 明文落盘！')
  console.log('⑧ API 通道任意模型名生效 + Key 仅密文落盘 ✅')

  // ---------- ⑨ 设置页迁移跳转 ----------
  await page.locator('nav button:has-text("设置")').click()
  await page.locator('[data-testid="settings-goto-models"]').click()
  await page.waitForSelector('[data-testid="models-page"]')
  await page.screenshot({ path: join(SHOT_DIR, 'm7-4-models-page.png') })
  console.log('⑨ 设置页迁移提示 → 跳转模型板块 ✅')

  await app.close()
  gateway.close()

  if (errors.length) {
    console.log(`渲染层报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 10)) console.log('  -', e.slice(0, 300))
    process.exitCode = 1
  } else {
    console.log('渲染层零报错 ✅')
  }
}

main().catch((err) => {
  console.error('M7 E2E 失败：', err)
  process.exit(1)
})
