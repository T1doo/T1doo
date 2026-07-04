import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import migration001 from './migrations/001_sessions.sql?raw'

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [{ version: 1, name: 'sessions', sql: migration001 }]

/** 打开（必要时创建）数据库：WAL、外键、按序迁移；升级前自动备份 */
export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  migrate(db, dbPath)
  return db
}

function migrate(db: Database.Database, dbPath: string): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)')
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as
    { value: string } | undefined
  const current = row ? Number(row.value) : 0
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version
  )
  if (pending.length === 0) return

  if (current > 0 && existsSync(dbPath)) {
    copyFileSync(dbPath, `${dbPath}.bak-v${current}`)
  }

  const setVersion = db.prepare(
    `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql)
      setVersion.run(String(m.version))
    })()
  }
}
