/* 开发工具：检查 t1doo.db 内容与搜索性能
 * 用法：ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/db-stats.cjs
 * （better-sqlite3 按 Electron ABI 构建，须用 Electron 的 node 运行）
 */
const Database = require('better-sqlite3')
const { join } = require('path')

const dbPath = process.argv[2] || join(process.env.APPDATA, 't1doo', 't1doo.db')
const db = new Database(dbPath, { readonly: true })
const one = (sql) => db.prepare(sql).get()

console.log('db:', dbPath)
console.log('sessions:', one('SELECT COUNT(*) n FROM sessions').n)
console.log('messages:', one('SELECT COUNT(*) n FROM messages').n)
console.log('projects:', one('SELECT COUNT(*) n FROM projects').n)
console.log('session_files:', one('SELECT COUNT(*) n FROM session_files').n)
console.log(
  'title 来源分布:',
  db.prepare('SELECT title_source, COUNT(*) n FROM sessions GROUP BY title_source').all()
)

for (const raw of ['electron', '性能', '修复 bug', '不存在的词汇组合xyzq']) {
  const q = raw
    .split(/\s+/)
    .map((t) => `"${t.replace(/"/g, '')}"`)
    .join(' ')
  const t0 = performance.now()
  const rows = db
    .prepare(
      `SELECT m.uuid FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid
       WHERE messages_fts MATCH ? ORDER BY rank LIMIT 100`
    )
    .all(q)
  console.log(
    `search ${JSON.stringify(raw)}: ${rows.length} hits, ${(performance.now() - t0).toFixed(1)}ms`
  )
}
