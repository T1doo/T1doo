import { spawn as ptySpawn, type IPty } from 'node-pty'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { basename } from 'path'
import type {
  ClaudeStatus,
  TerminalAttachResult,
  TerminalInfo,
  TerminalProfile
} from '../../../shared/terminals'
import { RingBuffer } from './ring-buffer'
import { buildClaudeArgs, resolveClaudeCommand } from './claude-cmd'
import { buildClaudeEnv } from '../backend/env'
import type { BackendProfilesService } from '../backend/profiles'

const FLUSH_INTERVAL_MS = 16
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30

interface TermRecord {
  info: TerminalInfo
  pty: IPty | null // 进程退出后置 null，记录保留供回看
  buffer: RingBuffer
  pending: string
  flushTimer: NodeJS.Timeout | null
}

export interface TerminalManagerOptions {
  backends: BackendProfilesService
  emit: (channel: string, ...args: unknown[]) => void
  events: { data: string; opened: string; exit: string; closed: string; updated: string }
  log?: (msg: string) => void
}

/** F2 PTY 托管（§7.2.1）：spawn/回放/节流转发/退出清理，一个实例管全部终端 */
export class TerminalManager {
  private records = new Map<string, TermRecord>()

  constructor(private readonly opts: TerminalManagerOptions) {}

  create(profile: TerminalProfile): TerminalInfo {
    const cwd = profile.cwd && existsSync(profile.cwd) ? profile.cwd : homedir()
    const id = randomUUID()

    let file: string
    let args: string[]
    let sessionId: string | null = null
    let backendProfileId: string | null = null
    let env: Record<string, string>
    let title: string

    if (profile.kind === 'claude') {
      const claudeOpts = profile.claude ?? {}
      const cmd = resolveClaudeCommand()
      const built = buildClaudeArgs(claudeOpts, randomUUID())
      file = cmd.file
      args = [...cmd.argsPrefix, ...built.args]
      sessionId = built.sessionId
      backendProfileId = claudeOpts.backendProfileId ?? null
      env = buildClaudeEnv(process.env, this.opts.backends.resolve(backendProfileId))
      title = claudeOpts.name || basename(cwd) || 'claude'
    } else {
      file = 'powershell.exe'
      args = ['-NoLogo']
      env = buildClaudeEnv(process.env, null)
      title = basename(cwd) || 'shell'
    }

    const pty = ptySpawn(file, args, {
      name: 'xterm-256color',
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cwd,
      env
    })

    const info: TerminalInfo = {
      id,
      kind: profile.kind,
      cwd,
      title,
      pid: pty.pid,
      createdAt: Date.now(),
      sessionId,
      backendProfileId,
      status: profile.kind === 'claude' ? 'idle' : null,
      exit: null
    }
    const record: TermRecord = { info, pty, buffer: new RingBuffer(), pending: '', flushTimer: null }
    this.records.set(id, record)

    pty.onData((data) => {
      record.buffer.append(data)
      record.pending += data
      if (!record.flushTimer) {
        record.flushTimer = setTimeout(() => this.flush(record), FLUSH_INTERVAL_MS)
      }
    })
    pty.onExit(({ exitCode }) => {
      this.flush(record)
      record.pty = null
      record.info = { ...record.info, exit: { code: exitCode } }
      this.opts.emit(this.opts.events.exit, { id, exitCode })
      this.opts.emit(this.opts.events.updated, record.info)
    })

    this.opts.log?.(`spawn ${profile.kind} pid=${pty.pid} cwd=${cwd}`)
    this.opts.emit(this.opts.events.opened, info)
    return info
  }

  write(id: string, data: string): void {
    this.records.get(id)?.pty?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return
    try {
      this.records.get(id)?.pty?.resize(cols, rows)
    } catch {
      // 进程刚退出时 resize 可能抛错，忽略
    }
  }

  attach(id: string): TerminalAttachResult {
    const record = this.mustGet(id)
    return { info: record.info, buffer: record.buffer.snapshot() }
  }

  list(): TerminalInfo[] {
    return [...this.records.values()]
      .map((r) => r.info)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  close(id: string): void {
    const record = this.records.get(id)
    if (!record) return
    this.killTree(record)
    if (record.flushTimer) clearTimeout(record.flushTimer)
    this.records.delete(id)
    this.opts.emit(this.opts.events.closed, id)
  }

  /** hooks SessionStart 权威校正：把 sessionId 绑到 cwd 匹配且尚未绑定的终端（§7.2.3） */
  adoptSession(sessionId: string, cwd: string | null): TerminalInfo | null {
    const bound = this.findBySession(sessionId)
    if (bound) return bound.info
    if (!cwd) return null
    const norm = normalizePath(cwd)
    for (const record of this.records.values()) {
      if (record.pty && !record.info.sessionId && normalizePath(record.info.cwd) === norm) {
        record.info = { ...record.info, sessionId, status: 'idle' }
        this.opts.emit(this.opts.events.updated, record.info)
        return record.info
      }
    }
    return null
  }

  setStatusBySession(sessionId: string, status: ClaudeStatus): TerminalInfo | null {
    const record = this.findBySession(sessionId)
    if (!record) return null
    if (record.info.status !== status) {
      record.info = { ...record.info, status }
      this.opts.emit(this.opts.events.updated, record.info)
    }
    return record.info
  }

  getBySession(sessionId: string): TerminalInfo | null {
    return this.findBySession(sessionId)?.info ?? null
  }

  /** 应用退出：杀全部 pty 进程树，不留孤儿 claude/conhost（验收⑤） */
  disposeAll(): void {
    for (const record of this.records.values()) {
      this.killTree(record)
      if (record.flushTimer) clearTimeout(record.flushTimer)
    }
    this.records.clear()
  }

  private flush(record: TermRecord): void {
    if (record.flushTimer) {
      clearTimeout(record.flushTimer)
      record.flushTimer = null
    }
    if (!record.pending) return
    const data = record.pending
    record.pending = ''
    this.opts.emit(this.opts.events.data, { id: record.info.id, data })
  }

  private killTree(record: TermRecord): void {
    const pty = record.pty
    if (!pty) return
    const pid = pty.pid
    try {
      pty.kill()
    } catch {
      // 已退出
    }
    // ConPTY 关闭通常会带走子进程；taskkill /T 兜底清理整棵树（shell 里手动启动的 claude 等）
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
  }

  private findBySession(sessionId: string): TermRecord | null {
    for (const record of this.records.values()) {
      if (record.info.sessionId === sessionId) return record
    }
    return null
  }

  private mustGet(id: string): TermRecord {
    const record = this.records.get(id)
    if (!record) throw new Error(`终端不存在：${id}`)
    return record
  }
}

function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
}
