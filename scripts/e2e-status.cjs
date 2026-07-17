/* M9 E2E：状态感知 v2 全链路 + hooks 退役清理（隔离环境，零额度、不 spawn claude）
 *
 * 状态机的输入就是 JSONL 文件本身，所以这里直接按 Claude Code 的真实行格式追加写文件，
 * 无需假 claude 进程 —— 与「外部终端里手开的会话」走的是同一条路。
 *
 * 覆盖：
 *   ① 升级清理：预置带 /t1doo-hook 注册的 settings.json → 启动后精确移除、其余键深度相等 + 备份（验收③）
 *   ② 一次性告知横幅 + 消抹
 *   ③ 冷启动追平历史会话：不误报状态、不发通知
 *   ④ JSONL 首见 → 按 cwd 绑定终端（替代已退役的 hooks SessionStart 校正）
 *   ⑤ 用户提示 → working
 *   ⑥ 悬挂 Edit（default 模式）→ ≤3s 内 waiting（推断值：空心角标，验收②）
 *   ⑦ tool_result 到达 → 回到 working
 *   ⑧ 回合收尾 → idle
 *   ⑨ AskUserQuestion 悬挂 → 确定 waiting（实心角标，零阈值）
 *   ⑩ Agent 悬挂 + bypassPermissions → 不误报 waiting
 * 用法：npm run build 后 node scripts/e2e-status.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const {
  mkdtempSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  existsSync
} = require('fs')
const { tmpdir } = require('os')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')

const LIVE_SESSION = '99999999-9999-4999-8999-999999999999'
const HIST_SESSION = '88888888-8888-4888-8888-888888888888'
const SLUG = 'E--Demo-M9'

/** v1.0 真实写出的 hook 命令 */
const V1_CMD =
  'cmd /c "curl.exe -s -m 2 -X POST http://127.0.0.1:52244/t1doo-hook' +
  ' -H "Authorization: Bearer deadbeef" --data-binary @- 2>NUL & exit /b 0"'
const V1_EVENTS = [
  'UserPromptSubmit',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SessionStart',
  'SessionEnd'
]

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m9-'))
  const projectsDir = join(tmp, 'projects')
  const sessionDir = join(projectsDir, SLUG)
  const userData = join(tmp, 'user-data')
  mkdirSync(sessionDir, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))

  const cwd = join(__dirname, '..')
  const livePath = join(sessionDir, `${LIVE_SESSION}.jsonl`)

  // —— 预置①：带 v1.0 hooks 注册的 settings.json（用户自有配置混在其中） ——
  const claudeSettingsPath = join(tmp, 'claude-settings.json')
  const userOwn = {
    permissions: { allow: ['Bash(git *)'], deny: [] },
    enabledPlugins: ['telegram'],
    env: { FOO: 'bar' },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo user-own-stop-hook' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo guard' }] }]
    }
  }
  const registered = { ...userOwn, hooks: { ...userOwn.hooks } }
  for (const ev of V1_EVENTS) {
    registered.hooks[ev] = [
      ...(registered.hooks[ev] ?? []),
      { hooks: [{ type: 'command', command: V1_CMD }] }
    ]
  }
  writeFileSync(claudeSettingsPath, JSON.stringify(registered, null, 2))

  // —— 预置③：一个陈旧的历史会话（冷启动追平时不得产生状态/通知） ——
  const old = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  writeFileSync(
    join(sessionDir, `${HIST_SESSION}.jsonl`),
    [
      line('user', {
        session: HIST_SESSION,
        ts: old,
        cwd,
        permissionMode: 'default',
        content: '历史提问'
      }),
      // 故意留一个悬挂的 Edit：若判活失效就会误报 waiting
      line('assistant', {
        session: HIST_SESSION,
        ts: old,
        cwd,
        toolUse: { id: 'hist_edit', name: 'Edit' }
      })
    ].join('\n') + '\n'
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
      T1DOO_CLAUDE_SETTINGS: claudeSettingsPath
    }
  })
  const errors = []
  // 主窗可能不是 firstWindow（启动器窗常驻）：按 URL 挑非 launcher 的那个
  let win = await app.firstWindow()
  for (const w of app.windows()) if (!w.url().includes('launcher')) win = w
  win.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  win.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  await win.waitForLoadState('domcontentloaded')

  const fail = (msg) => {
    throw new Error(msg)
  }
  const statusOf = async (sessionId) => {
    const list = await win.evaluate(() => window.t1doo.term.list())
    return list.find((t) => t.sessionId === sessionId) ?? null
  }
  /** 轮询等待状态，返回耗时；超时即失败 */
  const waitStatus = async (sessionId, want, timeoutMs) => {
    const started = Date.now()
    for (;;) {
      const t = await statusOf(sessionId)
      if (t && t.status === want) return Date.now() - started
      if (Date.now() - started > timeoutMs) {
        fail(`等待 ${want} 超时（${timeoutMs}ms），实际=${t ? t.status : '未绑定'}`)
      }
      await win.waitForTimeout(100)
    }
  }

  // ---------- ① 升级清理：精确移除 + 其余键深度相等 + 备份 ----------
  const cleaned = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'))
  if (JSON.stringify(cleaned) !== JSON.stringify(userOwn)) {
    fail(`hooks 退役清理不精确：\n${JSON.stringify(cleaned, null, 2)}`)
  }
  if (!existsSync(`${claudeSettingsPath}.bak-t1doo`)) fail('清理前未生成备份')
  const backup = JSON.parse(readFileSync(`${claudeSettingsPath}.bak-t1doo`, 'utf8'))
  if (JSON.stringify(backup) !== JSON.stringify(registered)) fail('备份内容不是清理前的原样')
  console.log('① hooks 退役清理：精确移除 + 用户配置深度相等 + 备份 ✅')

  // ---------- ② 一次性告知横幅 ----------
  await win.getByRole('button', { name: '指挥台', exact: true }).click()
  const notice = win.getByTestId('hooks-retired-notice')
  await notice.waitFor({ state: 'visible', timeout: 5000 })
  await win.screenshot({ path: join(SHOT_DIR, 'm9-1-retire-notice.png') })
  await win.getByRole('button', { name: '知道了' }).click()
  await notice.waitFor({ state: 'hidden', timeout: 3000 })
  if ((await win.evaluate(() => window.t1doo.status.retireNotice())) !== false) {
    fail('告知消抹未落盘')
  }
  console.log('② 退役一次性告知横幅：展示 → 消抹 → 落盘 ✅')

  // ---------- ③ 冷启动追平历史会话：不误报 ----------
  if (await statusOf(HIST_SESSION)) fail('历史会话不应产生状态（判活失效）')
  console.log('③ 冷启动追平历史会话（含悬挂 Edit）：零状态、零通知 ✅')

  // ---------- ④ 建终端 → 写 JSONL → 按 cwd 绑定（替代 hooks SessionStart） ----------
  await win.getByRole('button', { name: '终端', exact: true }).click()
  await win.evaluate((c) => window.t1doo.term.create({ cwd: c, kind: 'shell' }), cwd)
  await win.waitForTimeout(2500) // PowerShell 启动

  appendFileSync(
    livePath,
    line('user', {
      session: LIVE_SESSION,
      ts: new Date().toISOString(),
      cwd,
      permissionMode: 'default',
      content: '帮我改配置'
    }) + '\n'
  )
  await waitStatus(LIVE_SESSION, 'working', 5000)
  console.log('④⑤ JSONL 首见按 cwd 绑定终端 + 用户提示 → working ✅')

  // ---------- ⑥ 悬挂 Edit → ≤3s waiting（验收②：U4 承诺） ----------
  appendFileSync(
    livePath,
    line('assistant', {
      session: LIVE_SESSION,
      ts: new Date().toISOString(),
      cwd,
      toolUse: { id: 'edit_1', name: 'Edit' }
    }) + '\n'
  )
  const waitMs = await waitStatus(LIVE_SESSION, 'waiting', 3000)
  const waitingTerm = await statusOf(LIVE_SESSION)
  if (waitingTerm.statusCertain !== false) fail('启发层 waiting 应为推断值（certain=false）')
  await win.screenshot({ path: join(SHOT_DIR, 'm9-2-waiting-inferred.png') })
  console.log(`⑥ 悬挂 Edit → waiting 用时 ${waitMs}ms ≤3s，且标记为推断值（空心角标）✅`)

  // ---------- ⑦ tool_result 到达 → 回到 working ----------
  appendFileSync(
    livePath,
    line('user', {
      session: LIVE_SESSION,
      ts: new Date().toISOString(),
      cwd,
      toolResult: 'edit_1'
    }) + '\n'
  )
  await waitStatus(LIVE_SESSION, 'working', 5000)
  console.log('⑦ tool_result 到达（用户已确认）→ 回到 working ✅')

  // ---------- ⑧ 回合收尾（assistant 纯文本、无悬挂）→ idle ----------
  appendFileSync(
    livePath,
    line('assistant', {
      session: LIVE_SESSION,
      ts: new Date().toISOString(),
      cwd,
      text: '改好了。'
    }) + '\n'
  )
  await waitStatus(LIVE_SESSION, 'idle', 5000)
  console.log('⑧ 回合收尾 → idle ✅')

  // ---------- ⑨ AskUserQuestion → 确定 waiting（零阈值、实心角标） ----------
  appendFileSync(
    livePath,
    line('assistant', {
      session: LIVE_SESSION,
      ts: new Date().toISOString(),
      cwd,
      toolUse: { id: 'ask_1', name: 'AskUserQuestion' }
    }) + '\n'
  )
  const askMs = await waitStatus(LIVE_SESSION, 'waiting', 3000)
  const askTerm = await statusOf(LIVE_SESSION)
  if (askTerm.statusCertain !== true) fail('AskUserQuestion 应为确定判定（certain=true）')
  await win.screenshot({ path: join(SHOT_DIR, 'm9-3-waiting-certain.png') })
  console.log(`⑨ AskUserQuestion 悬挂 → 确定 waiting 用时 ${askMs}ms（实心角标）✅`)

  // ---------- ⑩ Agent 悬挂 + bypassPermissions → 不误报 ----------
  appendFileSync(
    livePath,
    [
      line('user', {
        session: LIVE_SESSION,
        ts: new Date().toISOString(),
        cwd,
        toolResult: 'ask_1'
      }),
      JSON.stringify({
        type: 'permission-mode',
        permissionMode: 'bypassPermissions',
        sessionId: LIVE_SESSION
      }),
      line('assistant', {
        session: LIVE_SESSION,
        ts: new Date().toISOString(),
        cwd,
        toolUse: { id: 'agent_1', name: 'Agent' }
      })
    ].join('\n') + '\n'
  )
  await win.waitForTimeout(4000) // 远超 2s 阈值
  const agentTerm = await statusOf(LIVE_SESSION)
  if (agentTerm.status !== 'working') {
    fail(`Agent 悬挂被误报为 ${agentTerm.status}（应恒为 working：是慢不是等）`)
  }
  console.log('⑩ Agent 悬挂 4s + bypassPermissions → 不误报 waiting ✅')

  if (errors.length) fail(`渲染层报错：\n${errors.join('\n')}`)
  console.log('\nM9 状态感知 v2 E2E 全通过 ✅')

  // Playwright 的 app.close 偶发不归还 → 竞速兜底
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 15_000))])
  process.exit(0)
}

/** 按 Claude Code 2.1.x 的真实行格式造行 */
function line(type, o) {
  const base = {
    parentUuid: null,
    isSidechain: false,
    type,
    uuid: `${type}-${Math.random().toString(16).slice(2, 10)}`,
    sessionId: o.session,
    timestamp: o.ts,
    cwd: o.cwd,
    version: '2.1.211',
    slug: SLUG
  }
  if (type === 'user') {
    if (o.toolResult) {
      return JSON.stringify({
        ...base,
        message: {
          role: 'user',
          content: [{ tool_use_id: o.toolResult, type: 'tool_result', content: 'ok' }]
        }
      })
    }
    return JSON.stringify({
      ...base,
      permissionMode: o.permissionMode,
      message: { role: 'user', content: o.content }
    })
  }
  const content = o.toolUse
    ? [{ type: 'tool_use', id: o.toolUse.id, name: o.toolUse.name, input: {} }]
    : [{ type: 'text', text: o.text }]
  return JSON.stringify({
    ...base,
    message: {
      id: `msg_${Math.random().toString(16).slice(2, 8)}`,
      model: 'claude-opus-4-8',
      role: 'assistant',
      content,
      usage: { input_tokens: 100, output_tokens: 20 }
    }
  })
}

main().catch((err) => {
  console.error('❌ M9 E2E 失败：', err.message)
  process.exit(1)
})
