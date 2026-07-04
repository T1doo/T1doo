/* E2E：增量同步延迟测量（隔离环境，不触碰真实 ~/.claude）
 * 用法：node scripts/e2e-incremental.cjs
 */
const { _electron } = require('playwright-core')
const { mkdtempSync, mkdirSync, copyFileSync, appendFileSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const SESSION_ID = '11111111-1111-4111-8111-111111111111'

async function main() {
  const root = mkdtempSync(join(tmpdir(), 't1doo-inc-'))
  const projectsDir = join(root, 'projects')
  const slugDir = join(projectsDir, 'E--Demo-ProjectA')
  mkdirSync(slugDir, { recursive: true })
  const sessionFile = join(slugDir, `${SESSION_ID}.jsonl`)
  copyFileSync(
    join(__dirname, '..', 'tests', 'fixtures', 'claude-jsonl', 'normal.jsonl'),
    sessionFile
  )

  const app = await _electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      T1DOO_PROJECTS_DIR: projectsDir,
      T1DOO_DB_PATH: join(root, 'test.db')
    }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')

  const list = () => win.evaluate(() => window.t1doo.sessions.list())

  // 等首次同步完成（1 个会话、5 条消息）
  let base = null
  for (let i = 0; i < 50; i++) {
    const rows = await list()
    if (rows.length === 1 && rows[0].messageCount === 5) {
      base = rows[0]
      break
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!base) throw new Error('首次同步未在 10s 内完成')
  console.log('首次同步 OK：1 会话 / 5 条消息')

  // 追加一条 assistant 行（先写半行再补齐，顺带验证半行容错）
  const newLine = `{"type":"assistant","uuid":"aaaaaaaa-0006-4000-8000-000000000006","parentUuid":"aaaaaaaa-0005-4000-8000-000000000005","sessionId":"${SESSION_ID}","timestamp":"2026-07-01T10:01:00.000Z","cwd":"E:\\\\Demo\\\\ProjectA","message":{"role":"assistant","model":"claude-opus-4-8","content":[{"type":"text","text":"增量追加的消息"}],"usage":{"input_tokens":10,"output_tokens":5}}}`
  const half = Math.floor(newLine.length / 2)
  appendFileSync(sessionFile, newLine.slice(0, half))
  await new Promise((r) => setTimeout(r, 500)) // 半行状态停留，索引不得推进出错
  const t0 = Date.now()
  appendFileSync(sessionFile, newLine.slice(half) + '\n')

  let elapsed = -1
  for (let i = 0; i < 100; i++) {
    const rows = await list()
    if (rows.length === 1 && rows[0].messageCount === 6) {
      elapsed = Date.now() - t0
      break
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  await app.close()

  if (elapsed < 0) throw new Error('增量未在 5s 内被感知')
  console.log(`增量感知延迟：${elapsed}ms（含 300ms 防抖）${elapsed < 1000 ? '✅ <1s' : '⚠ 超标'}`)
}

main().catch((err) => {
  console.error('失败：', err)
  process.exit(1)
})
