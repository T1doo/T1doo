import type { Database } from 'better-sqlite3'

/** 开始菜单扫描落库的应用条目（§7.3） */
export interface AppRecord {
  name: string
  kind: 'win32' | 'uwp'
  target: string
  exePath: string | null
  icon: string | null
}

/** 流水保留窗口：frecency 只看近 90 天（frecency.ts 同一口径） */
export const HISTORY_RETENTION_MS = 90 * 86_400_000

export class LauncherDao {
  constructor(private db: Database) {}

  /** 一轮扫描结果整体落库：upsert 全部条目，并删除本轮未出现的旧应用（卸载即消失） */
  replaceApps(records: AppRecord[], scanTs: number): void {
    const upsert = this.db.prepare(
      `INSERT INTO apps (name, kind, target, exe_path, icon, last_seen_at)
       VALUES (@name, @kind, @target, @exePath, @icon, @scanTs)
       ON CONFLICT(target) DO UPDATE SET
         name = excluded.name,
         exe_path = excluded.exe_path,
         icon = COALESCE(excluded.icon, icon),
         last_seen_at = excluded.last_seen_at`
    )
    this.db.transaction(() => {
      for (const r of records) upsert.run({ ...r, scanTs })
      this.db.prepare('DELETE FROM apps WHERE last_seen_at < ?').run(scanTs)
    })()
  }

  listApps(): AppRecord[] {
    return this.db
      .prepare('SELECT name, kind, target, exe_path AS exePath, icon FROM apps')
      .all() as AppRecord[]
  }

  countApps(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM apps').get() as { n: number }).n
  }

  /** 最近一轮扫描时间（重启后据此判断是否需要重扫） */
  lastScanAt(): number | null {
    const row = this.db.prepare('SELECT MAX(last_seen_at) AS ts FROM apps').get() as {
      ts: number | null
    }
    return row.ts
  }

  /** 已有图标缓存 exe_path → data URL（重扫时跳过重复提取） */
  iconCache(): Map<string, string> {
    const rows = this.db
      .prepare(
        'SELECT exe_path AS exePath, icon FROM apps WHERE exe_path IS NOT NULL AND icon IS NOT NULL'
      )
      .all() as { exePath: string; icon: string }[]
    return new Map(rows.map((r) => [r.exePath, r.icon]))
  }

  recordLaunch(key: string, ts: number): void {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO launch_history (key, ts) VALUES (?, ?)').run(key, ts)
      this.db.prepare('DELETE FROM launch_history WHERE ts < ?').run(ts - HISTORY_RETENTION_MS)
    })()
  }

  /** frecency 原始流水（打分逻辑在 services/launcher/frecency.ts 纯函数里） */
  listLaunches(sinceTs: number): { key: string; ts: number }[] {
    return this.db.prepare('SELECT key, ts FROM launch_history WHERE ts >= ?').all(sinceTs) as {
      key: string
      ts: number
    }[]
  }
}
