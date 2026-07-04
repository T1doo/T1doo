import { execFile } from 'child_process'
import { readFile, readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import type { EverythingState } from '../../../shared/files'

/**
 * F4 第二层 · Everything 集成（§7.4，R11 已实测）：
 * 检测 es.exe → 每次查询经 `-export-txt <tmp>` 落 UTF-8 文件再读回。
 * 不走 stdout：es.exe 控制台输出按 OEM 代码页编码（中文机是 GBK），Node 捕获 CJK 必乱码。
 */

export interface EverythingHit {
  path: string
  size: number | null
  mtime: number | null
}

const QUERY_TIMEOUT_MS = 5_000

function run(
  file: string,
  args: string[],
  timeout = QUERY_TIMEOUT_MS
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout) => {
      const code = err ? ((err as NodeJS.ErrnoException & { code?: unknown }).code ?? 1) : 0
      resolve({ code: typeof code === 'number' ? code : 1, stdout: stdout ?? '' })
    })
  })
}

/** 导出文件内容 → 路径列表（剥 U+FEFF BOM、去空行；目录行以分隔符结尾，滤掉兜底） */
export function parseExportedPaths(text: string): string[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.endsWith('\\') && !l.endsWith('/'))
}

/** 查询参数（纯函数供单测）：files-only、按修改时间倒序、结果导出 UTF-8 文件 */
export function buildEsArgs(q: string, limit: number, exportPath: string): string[] {
  const terms = q.split(/\s+/).filter(Boolean)
  return [
    '-n', String(limit),
    '-sort', 'date-modified-descending',
    '-export-txt', exportPath,
    '-utf8-bom',
    'file:',
    ...terms
  ]
}

export class EverythingBridge {
  private esPath: string | null = null
  private state: EverythingState = { available: false, esPath: null, reason: '尚未检测' }
  private querySeq = 0

  constructor(private log: (msg: string) => void) {}

  getState(): EverythingState {
    return this.state
  }

  /** 检测 es.exe（PATH → winget 包目录 → Everything 安装目录），并跑一次探针查询确认 IPC 可用 */
  async detect(): Promise<EverythingState> {
    const candidates: string[] = []
    const { code, stdout } = await run('where.exe', ['es.exe'])
    if (code === 0) {
      candidates.push(...stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    }
    candidates.push(...(await findWingetEs()))
    for (const base of [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA
    ]) {
      if (base) candidates.push(join(base, 'Everything', 'es.exe'))
    }

    for (const candidate of candidates) {
      try {
        await stat(candidate)
      } catch {
        continue
      }
      const probe = await run(candidate, ['-n', '1', '-get-result-count', '*'])
      if (probe.code === 0) {
        this.esPath = candidate
        this.state = { available: true, esPath: candidate, reason: null }
        this.log(`Everything 可用：${candidate}`)
        return this.state
      }
      // es.exe 在但查询失败 → 多半是 Everything 本体没跑（IPC 窗口不存在）
      this.esPath = null
      this.state = {
        available: false,
        esPath: candidate,
        reason: 'es.exe 已找到，但 Everything 未在运行'
      }
      this.log(`Everything 检测失败（exit=${probe.code}）：${candidate}`)
      return this.state
    }

    this.state = { available: false, esPath: null, reason: '未检测到 es.exe（Everything CLI）' }
    return this.state
  }

  /** 全盘搜索：结果按修改时间倒序，附 stat 元数据（已删除文件跳过） */
  async search(q: string, limit: number): Promise<EverythingHit[]> {
    if (!this.esPath || !q.trim()) return []
    const exportPath = join(tmpdir(), `t1doo-es-${process.pid}-${++this.querySeq}.txt`)
    try {
      const { code } = await run(this.esPath, buildEsArgs(q, limit, exportPath))
      if (code !== 0) {
        this.log(`Everything 查询失败（exit=${code}），标记不可用`)
        this.state = { available: false, esPath: this.esPath, reason: 'Everything 查询失败（未在运行？）' }
        this.esPath = null
        return []
      }
      const text = await readFile(exportPath, 'utf8').catch(() => '')
      const paths = parseExportedPaths(text)
      const hits = await Promise.all(
        paths.map(async (p): Promise<EverythingHit | null> => {
          try {
            const st = await stat(p)
            return { path: p, size: st.size, mtime: Math.floor(st.mtimeMs) }
          } catch {
            return null // 索引滞后：文件已删
          }
        })
      )
      return hits.filter((h): h is EverythingHit => h !== null)
    } finally {
      void unlink(exportPath).catch(() => undefined)
    }
  }
}

/** winget 便携安装的 es.exe 不在旧进程 PATH 里，按包目录约定兜底查找 */
async function findWingetEs(): Promise<string[]> {
  const packagesDir =
    process.env.LOCALAPPDATA != null
      ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
      : join(homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages')
  try {
    const entries = await readdir(packagesDir)
    return entries
      .filter((e) => e.toLowerCase().startsWith('voidtools.everything.cli'))
      .map((e) => join(packagesDir, e, 'es.exe'))
  } catch {
    return []
  }
}
