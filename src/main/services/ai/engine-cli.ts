import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { execFile } from 'child_process'
import { homedir } from 'os'
import { resolveClaudeCommand } from '../terminal/claude-cmd'
import { buildClaudeEnv } from '../backend/env'
import type { BackendProfilesService } from '../backend/profiles'
import { LineSplitter, handleStreamJsonLine, type StreamResult } from './stream-json'
import { t } from '../i18n'

/**
 * Engine A：`cli`（默认，§7.5.1）。
 * 多轮对话用 `claude -p --input-format stream-json` 单进程长连（免每回合重付启动开销，
 * 2.1.196 实测支持，§14.2 裁决）；默认 `--tools ""` 纯问答 + `--no-session-persistence`
 * 不写 ~/.claude 会话历史（避免涌入 F1 会话中心）。
 */

export interface CliEngineOptions {
  model?: string | null
  backendProfileId?: string | null
}

export interface CliTurnOutcome {
  text: string
  inputTokens: number | null
  outputTokens: number | null
  /** 用量中心补记（§7.8.2 面板来源）：--no-session-persistence 不落 JSONL，从 result 事件补记 */
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  /** stream-json init/result 的 session_id（usage_log 主键 `cli:<sessionId>:<turn>`） */
  sessionId: string | null
  /** 本回合 assistant 事件携带的模型名（result 事件不带 model） */
  model: string | null
  /** result 事件 subtype（'success' 等），充当面板行的 stop_reason */
  subtype: string | null
}

/** 长连进程启动参数（纯函数，vitest 直测） */
export function buildCliChatArgs(model?: string | null): string[] {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--tools',
    '',
    '--no-session-persistence'
  ]
  if (model) args.push('--model', model)
  return args
}

/** stdin 一行 = 一条用户消息（stream-json 输入格式） */
export function buildUserMessageLine(text: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  })}\n`
}

interface PendingTurn {
  resolve: (r: CliTurnOutcome) => void
  reject: (err: Error) => void
  onDelta: (text: string) => void
  buffer: string
  sawDelta: boolean
  stopped: boolean
  model: string | null
}

interface ConvProc {
  child: ChildProcessWithoutNullStreams
  splitter: LineSplitter
  pending: PendingTurn | null
  stderrTail: string
}

export class CliChatEngine {
  private procs = new Map<string, ConvProc>()

  constructor(
    private readonly backends: BackendProfilesService,
    private readonly log?: (msg: string) => void
  ) {}

  /** 发送一回合；resolve 于 result 事件，reject 于进程失败/中途退出/停止 */
  send(
    convId: string,
    opts: CliEngineOptions,
    text: string,
    onDelta: (text: string) => void
  ): Promise<CliTurnOutcome> {
    return new Promise((resolve, reject) => {
      let proc: ConvProc
      try {
        proc = this.ensureProc(convId, opts)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
        return
      }
      if (proc.pending) {
        reject(new Error(t('err.turnInProgress')))
        return
      }
      proc.pending = {
        resolve,
        reject,
        onDelta,
        buffer: '',
        sawDelta: false,
        stopped: false,
        model: null
      }
      proc.child.stdin.write(buildUserMessageLine(text), (err) => {
        if (err && proc.pending) {
          const pending = proc.pending
          proc.pending = null
          pending.reject(new Error(t('err.claudeStdinWriteFailed', { message: err.message })))
          this.disposeConv(convId)
        }
      })
    })
  }

  /** 停止进行中的回合（杀进程；长连上下文一并丢弃） */
  stop(convId: string): void {
    const proc = this.procs.get(convId)
    if (!proc) return
    if (proc.pending) {
      proc.pending.stopped = true
    }
    this.killProc(proc)
    this.procs.delete(convId)
  }

  disposeConv(convId: string): void {
    const proc = this.procs.get(convId)
    if (!proc) return
    this.killProc(proc)
    this.procs.delete(convId)
  }

  disposeAll(): void {
    for (const [, proc] of this.procs) this.killProc(proc)
    this.procs.clear()
  }

  private ensureProc(convId: string, opts: CliEngineOptions): ConvProc {
    const existing = this.procs.get(convId)
    if (existing && existing.child.exitCode === null && !existing.child.killed) return existing
    if (existing) this.procs.delete(convId)

    const cmd = resolveClaudeCommand()
    const args = [...cmd.argsPrefix, ...buildCliChatArgs(opts.model)]
    const env = buildClaudeEnv(process.env, this.backends.resolve(opts.backendProfileId))
    const child = spawn(cmd.file, args, {
      cwd: homedir(),
      env,
      windowsHide: true
    })
    this.log?.(`cli 引擎 spawn pid=${child.pid} conv=${convId}`)

    const proc: ConvProc = { child, splitter: new LineSplitter(), pending: null, stderrTail: '' }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      proc.splitter.feed(chunk, (line) => this.handleLine(proc, line))
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      proc.stderrTail = (proc.stderrTail + chunk).slice(-4000)
    })
    child.on('error', (err) => {
      this.failPending(proc, t('err.claudeSpawnFailed', { message: err.message }))
      this.procs.delete(convId)
    })
    child.on('close', (code) => {
      proc.splitter.flush((line) => this.handleLine(proc, line))
      if (proc.pending) {
        const base = t('err.claudeExitedUnexpected', { code: code ?? '?' })
        const tail = proc.stderrTail.trim().slice(-300)
        const msg = proc.pending.stopped
          ? t('err.stopped')
          : `${base}${tail ? t('err.detailSuffix', { detail: tail }) : ''}`
        this.failPending(proc, msg)
      }
      if (this.procs.get(convId) === proc) this.procs.delete(convId)
    })

    this.procs.set(convId, proc)
    return proc
  }

  private handleLine(proc: ConvProc, line: string): void {
    const pending = proc.pending
    if (!pending) {
      // 回合外的事件（init 等）无需处理
      handleStreamJsonLine(line, {})
      return
    }
    handleStreamJsonLine(line, {
      onDelta: (text) => {
        pending.sawDelta = true
        pending.buffer += text
        pending.onDelta(text)
      },
      onAssistantText: (text) => {
        // 无 partial 事件时以完整 assistant 消息回退（一次性推给 UI）
        if (!pending.sawDelta) {
          pending.buffer += text
          pending.onDelta(text)
        }
      },
      onAssistantModel: (model) => {
        pending.model = model
      },
      onResult: (r) => this.finishTurn(proc, r)
    })
  }

  private finishTurn(proc: ConvProc, r: StreamResult): void {
    const pending = proc.pending
    if (!pending) return
    proc.pending = null
    if (r.isError) {
      const detail =
        r.resultText || proc.stderrTail.trim().slice(-300) || r.subtype || t('common.unknownError')
      pending.reject(new Error(t('err.claudeReturnedError', { detail })))
      return
    }
    pending.resolve({
      // partial 缺失且 assistant 事件也缺失时，用 result 文本兜底
      text: pending.buffer || r.resultText || '',
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheReadTokens: r.cacheReadTokens,
      cacheCreationTokens: r.cacheCreationTokens,
      sessionId: r.sessionId,
      model: pending.model,
      subtype: r.subtype
    })
  }

  private failPending(proc: ConvProc, message: string): void {
    const pending = proc.pending
    if (!pending) return
    proc.pending = null
    pending.reject(new Error(message))
  }

  private killProc(proc: ConvProc): void {
    const pid = proc.child.pid
    try {
      proc.child.stdin.end()
    } catch {
      // 已关闭
    }
    try {
      proc.child.kill()
    } catch {
      // 已退出
    }
    // Windows 下兜底清理整棵进程树（cmd.exe shim 包了一层时尤其必要）
    if (pid) execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
  }
}
