import { closeSync, openSync, readSync, statSync } from 'fs'

/**
 * 最近提示词（§7.3 CC 对象之一）：读 ~/.claude/history.jsonl 尾部。
 * 行格式（2026-07-04 实测）：{display, pastedContents, timestamp(ms), project, sessionId}
 */
export interface RecentPrompt {
  display: string
  project: string | null
  sessionId: string | null
  ts: number
}

/** 只读文件尾部这么多字节：全量历史可能很大，启动器只关心最近的 */
const TAIL_BYTES = 256 * 1024

export function parseHistoryLines(text: string, limit: number): RecentPrompt[] {
  const byDisplay = new Map<string, RecentPrompt>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let row: unknown
    try {
      row = JSON.parse(trimmed)
    } catch {
      continue // 尾部截断的半行或脏行，静默跳过（与 F1 同一容错纪律）
    }
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    if (typeof r.display !== 'string' || !r.display.trim()) continue
    const display = r.display.trim()
    // 斜杠命令与超短输入对"重发提示词"没有价值
    if (display.length < 4 || display.startsWith('/')) continue
    const prompt: RecentPrompt = {
      display,
      project: typeof r.project === 'string' ? r.project : null,
      sessionId: typeof r.sessionId === 'string' ? r.sessionId : null,
      ts: typeof r.timestamp === 'number' ? r.timestamp : 0
    }
    // 同文案去重，保留最新一次
    const prev = byDisplay.get(display)
    if (!prev || prompt.ts > prev.ts) byDisplay.set(display, prompt)
  }
  return [...byDisplay.values()].sort((a, b) => b.ts - a.ts).slice(0, limit)
}

export class RecentPromptsReader {
  private cache: { mtimeMs: number; size: number; prompts: RecentPrompt[] } | null = null

  constructor(private readonly filePath: string) {}

  read(limit = 200): RecentPrompt[] {
    let stat: { mtimeMs: number; size: number }
    try {
      stat = statSync(this.filePath)
    } catch {
      return [] // 文件不存在（未装 Claude Code）
    }
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs && this.cache.size === stat.size) {
      return this.cache.prompts
    }

    const start = Math.max(0, stat.size - TAIL_BYTES)
    const buf = Buffer.alloc(stat.size - start)
    const fd = openSync(this.filePath, 'r')
    try {
      readSync(fd, buf, 0, buf.length, start)
    } finally {
      closeSync(fd)
    }
    let text = buf.toString('utf8')
    // 从文件中段起读时丢掉第一段残行
    if (start > 0) text = text.slice(text.indexOf('\n') + 1)

    const prompts = parseHistoryLines(text, limit)
    this.cache = { mtimeMs: stat.mtimeMs, size: stat.size, prompts }
    return prompts
  }
}
