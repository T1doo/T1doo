import { readdir, stat } from 'fs/promises'
import { join } from 'path'

export interface DiscoveredFile {
  path: string
  sessionId: string
  size: number
  mtimeMs: number
}

/** 主会话文件名 = <uuid>.jsonl（子代理/workflow 转录在会话子目录里，不进入发现范围） */
export const SESSION_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i

/** 只发现顶层 projects/<slug>/*.jsonl（§6.3 第 0 条：嵌套转录不入索引） */
export async function discoverSessionFiles(projectsDir: string): Promise<DiscoveredFile[]> {
  const out: DiscoveredFile[] = []
  let slugs: string[]
  try {
    slugs = (await readdir(projectsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return out // 目录不存在（未装 Claude Code）→ 空结果，不报错
  }

  for (const slug of slugs) {
    const dir = join(projectsDir, slug)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isFile() || !SESSION_FILE_RE.test(e.name)) continue
      const filePath = join(dir, e.name)
      try {
        const st = await stat(filePath)
        out.push({
          path: filePath,
          sessionId: e.name.slice(0, -'.jsonl'.length).toLowerCase(),
          size: st.size,
          mtimeMs: st.mtimeMs
        })
      } catch {
        // stat 竞态失败（文件刚被移走）→ 跳过
      }
    }
  }
  return out
}
