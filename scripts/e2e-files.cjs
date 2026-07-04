/* M4 E2E：文件中枢全链路（隔离环境，不碰真实配置）
 * 覆盖：订阅目录索引（预置 T1DOO_WATCH_DIRS）→ 文件名搜索（FTS+LIKE 中缀）→
 *       新建/改名文件 2s 内可搜（验收③）→ 会话-文件联动流 + 反查 + 跳转会话（验收①）→
 *       收藏/标签落库 → Everything 检测（本机装了则实测合并搜索，验收④）
 * 用法：npm run build 后 node scripts/e2e-files.cjs [截图输出目录]
 */
const { _electron } = require('playwright-core')
const { join } = require('path')
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, renameSync } = require('fs')
const { tmpdir } = require('os')

const SHOT_DIR = process.argv[2] || join(__dirname, '..', 'out')
const SESSION_ID = '11111111-1111-4111-8111-111111111111'

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 't1doo-e2e-m4-'))
  const projectsDir = join(tmp, 'projects')
  const userData = join(tmp, 'user-data')
  const watchDir = join(tmp, 'watched')
  const slugDir = join(projectsDir, 'E--Demo-ProjectA')
  mkdirSync(slugDir, { recursive: true })
  mkdirSync(userData, { recursive: true })
  mkdirSync(join(watchDir, 'sub'), { recursive: true })
  mkdirSync(join(watchDir, 'node_modules', 'pkg'), { recursive: true })

  // fixture 会话（含 Edit login.ts / Write login.test.ts / Read login.ts → session_files）
  copyFileSync(
    join(__dirname, '..', 'tests', 'fixtures', 'claude-jsonl', 'normal.jsonl'),
    join(slugDir, `${SESSION_ID}.jsonl`)
  )
  writeFileSync(join(tmp, 'claude-settings.json'), '{}')
  writeFileSync(join(tmp, 'history.jsonl'), '')

  // 订阅目录种子文件（含 CJK 名 + 默认排除目录里的文件）
  writeFileSync(join(watchDir, 'alpha-notes.md'), '# alpha')
  writeFileSync(join(watchDir, 'sub', '性能测试报告.md'), '# perf')
  writeFileSync(join(watchDir, 'sub', 'pty-manager.ts'), 'export {}')
  writeFileSync(join(watchDir, 'node_modules', 'pkg', 'excluded.js'), '// 应被排除')

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
      T1DOO_WATCH_DIRS: watchDir
    }
  })

  const errors = []
  // node 侧显式轮询（waitForFunction 对 async 谓词可能把 pending Promise 当 truthy，不可靠）
  const until = async (fn, timeoutMs, label) => {
    const start = Date.now()
    for (;;) {
      if (await fn()) return Date.now() - start
      if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`)
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  let windows = app.windows()
  for (let i = 0; i < 50 && windows.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 200))
    windows = app.windows()
  }
  const mainPage = windows.find((w) => !w.url().includes('launcher.html'))
  if (!mainPage) throw new Error('主窗口未出现')
  mainPage.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  mainPage.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  await mainPage.waitForLoadState('domcontentloaded')

  // ── 等首轮扫描 + 会话同步完成
  await until(
    () =>
      mainPage.evaluate(async () => {
        const s = await window.t1doo.files.getState()
        return s.totalFiles >= 3 && !s.scanning
      }),
    15000,
    '首轮索引完成'
  )
  const state = await mainPage.evaluate(() => window.t1doo.files.getState())
  console.log(`✅ 首轮索引完成：${state.totalFiles} 个文件（订阅 ${state.dirs.length} 目录）`)

  // ── 排除规则：node_modules 里的文件不入索引
  const excluded = await mainPage.evaluate(() => window.t1doo.files.search('excluded', {}))
  if (excluded.length !== 0) throw new Error(`排除目录文件被索引了：${excluded[0]?.path}`)
  console.log('✅ 默认排除规则生效（node_modules 未入索引）')

  // ── 搜索三路：ASCII 前缀 / 词中缀（LIKE 兜底）/ CJK 一元切分
  const byPrefix = await mainPage.evaluate(() => window.t1doo.files.search('alpha', {}))
  if (!byPrefix.some((h) => h.name === 'alpha-notes.md')) throw new Error('前缀搜索未命中')
  const byInfix = await mainPage.evaluate(() => window.t1doo.files.search('anager', {}))
  if (!byInfix.some((h) => h.name === 'pty-manager.ts')) throw new Error('中缀搜索未命中')
  const byCjk = await mainPage.evaluate(() => window.t1doo.files.search('性能', {}))
  if (!byCjk.some((h) => h.name === '性能测试报告.md')) throw new Error('CJK 搜索未命中')
  console.log('✅ 搜索命中：ASCII 前缀 / 词中缀 / CJK')

  // ── 搜索延迟（验收 <100ms，取 5 次最小值）
  const searchMs = await mainPage.evaluate(async () => {
    let best = Infinity
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      await window.t1doo.files.search('a', {})
      best = Math.min(best, performance.now() - t0)
    }
    return best
  })
  console.log(`✅ 搜索 IPC 往返 ${searchMs.toFixed(1)}ms（验收 <100ms）`)
  if (searchMs > 100) throw new Error(`搜索延迟超标：${searchMs}ms`)

  // ── 验收③：新建文件 2s 内可搜到
  const newFile = join(watchDir, 'sub', 'fresh-created.md')
  writeFileSync(newFile, '# new')
  const createLatency = await until(
    () =>
      mainPage.evaluate(async () => {
        const hits = await window.t1doo.files.search('fresh-created', {})
        return hits.length > 0
      }),
    5000,
    '新建文件可搜'
  )
  console.log(`✅ 新建文件 ${createLatency}ms 后可搜到（验收 <2000ms）`)
  if (createLatency > 2000) throw new Error(`新建可见延迟超标：${createLatency}ms`)

  // ── 验收③：改名文件 2s 内新名可搜、旧名消失
  const renamed = join(watchDir, 'sub', 'fresh-renamed.md')
  renameSync(newFile, renamed)
  const renameLatency = await until(
    () =>
      mainPage.evaluate(async () => {
        const hitNew = await window.t1doo.files.search('fresh-renamed', {})
        const hitOld = await window.t1doo.files.search('fresh-created', {})
        return hitNew.length > 0 && hitOld.length === 0
      }),
    5000,
    '改名文件可搜'
  )
  console.log(`✅ 改名文件 ${renameLatency}ms 后新名可搜、旧名消失（验收 <2000ms）`)
  if (renameLatency > 2000) throw new Error(`改名可见延迟超标：${renameLatency}ms`)

  // ── 验收①：会话-文件联动（活动流 + 反查）
  const loginPath = 'E:\\Demo\\ProjectA\\src\\login.ts'
  await until(
    () => mainPage.evaluate(async () => (await window.t1doo.files.activity(50)).length >= 2),
    10000,
    '会话文件流就绪'
  )
  const activity = await mainPage.evaluate(() => window.t1doo.files.activity(50))
  const loginAct = activity.find((a) => a.path === 'E:\\Demo\\ProjectA\\src\\login.ts')
  const testAct = activity.find((a) => a.name === 'login.test.ts')
  if (!loginAct || loginAct.lastOp !== 'edit') throw new Error('活动流缺 login.ts(edit)')
  if (!testAct || testAct.lastOp !== 'write') throw new Error('活动流缺 login.test.ts(write)')
  console.log(`✅ 会话修改文件流：${activity.length} 条（edit/write 口径正确，read 不入流）`)

  const refs = await mainPage.evaluate(
    (p) => window.t1doo.files.sessionsFor(p),
    loginPath
  )
  if (refs.length !== 1 || !refs[0].title.includes('修复登录页空指针')) {
    throw new Error(`反查结果异常：${JSON.stringify(refs)}`)
  }
  if (refs[0].editCount !== 1 || refs[0].readCount !== 1) {
    throw new Error(`反查操作计数异常：${JSON.stringify(refs[0])}`)
  }
  console.log('✅ 文件→会话反查：login.ts ← 「修复登录页空指针」（edit=1, read=1）')

  // ── 收藏 + 标签落库
  await mainPage.evaluate(async (p) => {
    await window.t1doo.files.setMeta(p, { pinned: true, tags: ['核心', 'bug'] })
  }, loginPath)
  const pinned = await mainPage.evaluate(() => window.t1doo.files.pinned())
  const pinnedHit = pinned.find((h) => h.path === 'E:\\Demo\\ProjectA\\src\\login.ts')
  if (!pinnedHit || !pinnedHit.tags.includes('核心')) throw new Error('收藏/标签未落库')
  if (pinnedHit.sessionCount !== 1) throw new Error('收藏条目缺会话联动计数')
  console.log('✅ 收藏 + 标签落库（索引外路径同样支持）')

  // ── UI 走查：文件页 → 会话动过流 → 详情反查 → 跳转会话页
  await mainPage.locator('nav button:has-text("文件")').click()
  await mainPage.locator('button:has-text("会话动过")').waitFor({ state: 'visible' })
  // 活动流（左栏 aside）里的 login.ts 行
  const row = mainPage.locator('aside button', { hasText: 'login.ts' }).first()
  await row.waitFor({ state: 'visible', timeout: 5000 })
  await mainPage.screenshot({ path: join(SHOT_DIR, 'files-1-activity.png') })
  await row.click()
  await mainPage.locator('text=动过此文件的会话').waitFor({ state: 'visible', timeout: 5000 })
  // 详情面板（右栏 section）里的会话链接——活动流行的副标题同样含标题文本，必须限定区域
  const sessionLink = mainPage.locator('section button', { hasText: '修复登录页空指针' }).first()
  await sessionLink.waitFor({ state: 'visible', timeout: 5000 })
  await mainPage.screenshot({ path: join(SHOT_DIR, 'files-2-detail.png') })
  await sessionLink.click()
  // 跳到会话页并自动打开详情（验收①的「并跳转」）
  await mainPage
    .locator('h2', { hasText: '修复登录页空指针' })
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
  await mainPage.screenshot({ path: join(SHOT_DIR, 'files-3-session-jump.png') })
  console.log('✅ UI：活动流 → 文件详情 → 跳到会话详情 全链路走通')

  // ── 验收④：Everything（本机可用才实测，CI 无则跳过）
  // 注意 Everything 默认按「文件名」匹配（非全路径）——探针放 tmp 根、不进订阅目录，
  // 命中只可能来自 es.exe 全盘（Everything 的 NTFS 实时索引秒级收录新文件）
  const ev = await mainPage.evaluate(() => window.t1doo.files.detectEverything())
  if (ev.available) {
    const probeName = `t1doo-e2e-probe-${Date.now()}.md`
    writeFileSync(join(tmp, probeName), '# probe')
    await until(
      () =>
        mainPage.evaluate(
          async (q) => {
            const merged = await window.t1doo.files.search(q, { everything: true, limit: 30 })
            return merged.some((h) => h.source === 'everything' && h.name.startsWith(q))
          },
          probeName.slice(0, -'.md'.length)
        ),
      10000,
      'Everything 全盘结果合并'
    )
    console.log('✅ Everything 全盘合并：索引外文件经 es.exe 命中（来源已标注，验收④）')
  } else {
    console.log(`⚠️ Everything 不可用（${ev.reason}），全盘搜索用例跳过`)
  }

  // ── 设置页文件区块
  await mainPage.locator('nav button:has-text("设置")').click()
  await mainPage.getByText('订阅目录', { exact: false }).first().waitFor({ state: 'visible' })
  await mainPage.screenshot({ path: join(SHOT_DIR, 'files-4-settings.png') })
  console.log('✅ 设置页文件中枢区块渲染')

  await app.close()

  if (errors.length) {
    console.log(`渲染层报错 ${errors.length} 条：`)
    for (const e of errors.slice(0, 10)) console.log('  -', e.slice(0, 300))
    process.exitCode = 1
  } else {
    console.log('渲染层零报错 ✅ — M4 E2E 全部通过')
  }
}

main().catch((err) => {
  console.error('E2E 失败：', err)
  process.exit(1)
})
