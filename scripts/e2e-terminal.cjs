/* M2 E2E：内置终端 + hooks 状态感知全链路（隔离环境，不碰真实配置、不 spawn claude）
 * 覆盖：shell 终端 echo 回显 → hooks 开启注册 → SessionStart 启发式绑定 →
 *       UserPromptSubmit/Stop 状态流转 → hooks 关闭精确还原 → 退出无孤儿进程
 * 用法：npm run build 后 node scripts/e2e-terminal.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { execFileSync } = require('child_process')
const { join } = require('path')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } = require('fs')
const { tmpdir } = require('os')
const http = require('http')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const MARKER = `T1DOO_ECHO_${Date.now()}`

function post(port, token, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/t1doo-hook',
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body) }
      },
      (res) => resolve(res.statusCode)
    )
    req.on('error', reject)
    req.end(body)
  })
}

function pidAlive(pid) {
  const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8' })
  return out.includes(String(pid))
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m2-'))
  const projectsDir = join(tmp, 'projects')
  const userData = join(tmp, 'user-data')
  mkdirSync(projectsDir, { recursive: true })
  mkdirSync(userData, { recursive: true })
  // 跳过首启引导（M6）：否则向导覆盖层挡住页面交互
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ onboardingDone: true }))
  // 预置"用户既有配置"验证深合并保留 + 精确还原
  const claudeSettingsPath = join(tmp, 'claude-settings.json')
  const originalSettings = {
    permissions: { allow: ['Bash(git *)'] },
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-own' }] }] }
  }
  writeFileSync(claudeSettingsPath, JSON.stringify(originalSettings, null, 2))

  // T1DOO_EXE 指向打包产物（如 dist/win-unpacked/T1doo.exe）时验证打包版；缺省跑开发构建
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
  const win = await app.firstWindow()
  win.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  win.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  await win.waitForLoadState('domcontentloaded')

  const fail = (msg) => {
    throw new Error(msg)
  }

  // ---------- 1. shell 终端 echo 回显 ----------
  await win.getByRole('button', { name: '终端', exact: true }).click()
  await win.getByRole('button', { name: '新建终端（Ctrl+T）' }).click()
  await win.getByRole('button', { name: 'PowerShell' }).click()
  await win.getByPlaceholder('E:\\Github\\MyProject').fill(join(__dirname, '..'))
  await win.getByRole('button', { name: '创建', exact: true }).click()
  await win.waitForTimeout(3500) // PowerShell 启动

  await win.keyboard.type(`echo ${MARKER}`)
  await win.keyboard.press('Enter')
  await win.waitForTimeout(1500)
  await win.screenshot({ path: join(SHOT_DIR, 'm2-1-terminal.png') })

  const terms = await win.evaluate(() => window.t1doo.term.list())
  if (terms.length !== 1) fail(`期望 1 个终端，实际 ${terms.length}`)
  const shellTerm = terms[0]
  const attach = await win.evaluate((id) => window.t1doo.term.attach(id), shellTerm.id)
  const hits = attach.buffer.split(MARKER).length - 1
  if (hits < 2) fail(`echo 回显未出现（buffer 命中 ${hits} 次）`)
  console.log(`① shell 终端 echo 回显 ✅（缓冲回放命中 ${hits} 次，pid=${shellTerm.pid}）`)

  // ---------- 1b. 同开 6 个终端并发回显（验收①） ----------
  const cwd = join(__dirname, '..')
  const extraIds = []
  for (let i = 0; i < 5; i++) {
    const info = await win.evaluate((c) => window.t1doo.term.create({ cwd: c, kind: 'shell' }), cwd)
    extraIds.push(info.id)
  }
  await win.waitForTimeout(4000) // 5 个 PowerShell 启动
  for (let i = 0; i < extraIds.length; i++) {
    await win.evaluate(
      ([id, i]) => window.t1doo.term.write(id, `echo STRESS_${i}_OK\r`),
      [extraIds[i], i]
    )
  }
  await win.waitForTimeout(2000)
  for (let i = 0; i < extraIds.length; i++) {
    const a = await win.evaluate((id) => window.t1doo.term.attach(id), extraIds[i])
    if (!a.buffer.includes(`STRESS_${i}_OK`)) fail(`并发终端 ${i} 回显丢失`)
  }
  const allTerms = await win.evaluate(() => window.t1doo.term.list())
  if (allTerms.length !== 6) fail(`期望同开 6 个终端，实际 ${allTerms.length}`)
  await win.screenshot({ path: join(SHOT_DIR, 'm2-1b-six-terminals.png') })
  for (const id of extraIds) await win.evaluate((x) => window.t1doo.term.close(x), id)
  await win.waitForTimeout(500)
  console.log('①b 同开 6 终端并发输入输出 ✅')

  // ---------- 2. hooks 开启：注册 + 备份 ----------
  await win.getByRole('button', { name: '设置' }).click()
  await win.getByRole('button', { name: '开启', exact: true }).click()
  await win.waitForTimeout(800)
  const registered = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'))
  const events = [
    'UserPromptSubmit',
    'PermissionRequest',
    'Notification',
    'Stop',
    'SessionStart',
    'SessionEnd'
  ]
  for (const ev of events) {
    const groups = registered.hooks?.[ev] ?? []
    const ours = groups
      .flatMap((g) => g.hooks ?? [])
      .filter((h) => String(h.command).includes('/t1doo-hook'))
    if (ours.length !== 1) fail(`hooks 注册缺失/重复：${ev} 命中 ${ours.length}`)
  }
  if (
    !registered.hooks.Stop.some((g) => (g.hooks ?? []).some((h) => h.command === 'echo user-own'))
  )
    fail('用户自有 Stop hook 被破坏')
  if (JSON.stringify(registered.permissions) !== JSON.stringify(originalSettings.permissions))
    fail('permissions 键被破坏')
  if (!existsSync(`${claudeSettingsPath}.bak-t1doo`)) fail('备份文件未生成')
  const cmd = registered.hooks.Stop.flatMap((g) => g.hooks ?? []).find((h) =>
    String(h.command).includes('/t1doo-hook')
  ).command
  const port = Number(cmd.match(/127\.0\.0\.1:(\d+)\/t1doo-hook/)[1])
  const token = cmd.match(/Bearer ([0-9a-f]+)/)[1]
  console.log(`② hooks 注册六事件 + 既有配置保留 + 备份 ✅（port=${port}）`)

  // ---------- 3. 状态链路：SessionStart 绑定 → working → waiting → idle ----------
  const fakeSession = '55555555-5555-4555-8555-555555555555'
  if ((await post(port, 'wrong-token', { hook_event_name: 'Stop' })) !== 401)
    fail('错误 token 未被拒绝')
  await post(port, token, {
    hook_event_name: 'SessionStart',
    session_id: fakeSession,
    cwd: shellTerm.cwd
  })
  await win.waitForTimeout(400)
  let t = (await win.evaluate(() => window.t1doo.term.list()))[0]
  if (t.sessionId !== fakeSession) fail(`SessionStart 未绑定（sessionId=${t.sessionId}）`)

  await post(port, token, {
    hook_event_name: 'UserPromptSubmit',
    session_id: fakeSession,
    cwd: shellTerm.cwd
  })
  await win.waitForTimeout(400)
  t = (await win.evaluate(() => window.t1doo.term.list()))[0]
  if (t.status !== 'working') fail(`UserPromptSubmit 后状态=${t.status}，期望 working`)

  await post(port, token, { hook_event_name: 'Stop', session_id: fakeSession, cwd: shellTerm.cwd })
  await win.waitForTimeout(400)
  t = (await win.evaluate(() => window.t1doo.term.list()))[0]
  if (t.status !== 'idle') fail(`Stop 后状态=${t.status}，期望 idle`)
  console.log('③ hooks 状态链路（401 拒绝/绑定校正/working/idle）✅')
  await win.screenshot({ path: join(SHOT_DIR, 'm2-2-hooks.png') })

  // ---------- 4. hooks 关闭：精确还原 ----------
  await win.getByRole('button', { name: '关闭并还原' }).click()
  await win.waitForTimeout(600)
  const restored = JSON.parse(readFileSync(claudeSettingsPath, 'utf8'))
  if (JSON.stringify(restored) !== JSON.stringify(originalSettings))
    fail(`还原不精确：\n${JSON.stringify(restored, null, 2)}`)
  console.log('④ hooks 关闭 settings.json 精确还原 ✅')

  // ---------- 4b. 后端档案：token 磁盘为 DPAPI 密文（验收⑥存储侧） ----------
  const SECRET = 'sk-e2e-plaintext-secret-0987654321'
  await win.evaluate(
    (tok) =>
      window.t1doo.backend.save({
        name: 'E2E 自定义后端',
        auth: 'custom',
        baseUrl: 'https://gw.example.com',
        token: tok
      }),
    SECRET
  )
  const profilesRaw = readFileSync(join(userData, 'backend-profiles.json'), 'utf8')
  if (profilesRaw.includes(SECRET)) fail('token 以明文落盘！')
  const stored = JSON.parse(profilesRaw).profiles.find((p) => p.name === 'E2E 自定义后端')
  if (!stored?.authTokenEnc || stored.authTokenEnc.length < 16) fail('authTokenEnc 缺失')
  const views = await win.evaluate(() => window.t1doo.backend.list())
  const view = views.find((v) => v.name === 'E2E 自定义后端')
  if (!view?.hasToken) fail('hasToken 视图不正确')
  if (JSON.stringify(views).includes(SECRET)) fail('token 明文泄漏到渲染层视图！')
  console.log('④b 后端档案 token DPAPI 密文落盘、明文不出主进程 ✅')

  // ---------- 5. 退出清理：无孤儿进程 ----------
  const shellPid = shellTerm.pid
  await app.close()
  await new Promise((r) => setTimeout(r, 2500))
  if (pidAlive(shellPid)) fail(`孤儿进程存活：powershell pid=${shellPid}`)
  console.log('⑤ 应用退出无孤儿 pty 进程 ✅')

  if (errors.length) {
    console.log(`渲染层报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 10)) console.log('  -', e.slice(0, 300))
    process.exitCode = 1
  } else {
    console.log('渲染层零报错 ✅')
  }
}

main().catch((err) => {
  console.error('M2 E2E 失败：', err)
  process.exit(1)
})
