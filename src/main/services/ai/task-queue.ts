import { randomUUID } from 'crypto'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import type { TaskInfo, TaskSpec } from '../../../shared/ai'
import type { AiDao } from '../../db/ai-dao'
import type { BackendProfilesService } from '../backend/profiles'
import { resolveClaudeCommand } from '../terminal/claude-cmd'
import { buildClaudeEnv } from '../backend/env'
import { LineSplitter, handleStreamJsonLine } from './stream-json'
import { t } from '../i18n'

/**
 * F5 后台任务队列最小闭环（§7.5.2）：
 * TaskSpec 入 tasks 表（queued）→ 调度器（并发上限 2）spawn 无头 claude -p
 * → 流式事件进输出缓冲、result 事件采集成本字段 → done/failed → 系统通知。
 */

const MAX_OUTPUT_CHARS = 2_000_000 // 输出缓冲上限 ~2MB 字符，超出截断头部

export interface BuiltTask {
  args: string[]
  sessionId: string
}

/** 无头任务启动参数（纯函数，vitest 直测）；预生成 --session-id 使产物会话进 F1 */
export function buildTaskArgs(spec: TaskSpec, sessionId: string): string[] {
  const args = [
    '-p',
    spec.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--session-id',
    sessionId
  ]
  if (spec.model?.trim()) args.push('--model', spec.model.trim())
  if (spec.permissionMode && spec.permissionMode !== 'default') {
    args.push('--permission-mode', spec.permissionMode)
  }
  if (spec.maxBudgetUsd != null && spec.maxBudgetUsd > 0) {
    args.push('--max-budget-usd', String(spec.maxBudgetUsd))
  }
  return args
}

export type SpawnFn = (
  file: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; windowsHide: boolean }
) => ChildProcessWithoutNullStreams

export interface TaskQueueOptions {
  dao: AiDao
  backends: BackendProfilesService
  emit: (task: TaskInfo) => void
  /** 系统通知（Electron 能力由 AppCore 注入，服务不 import Electron） */
  notify: (task: TaskInfo) => void
  maxConcurrent?: number
  log?: (msg: string) => void
  /** 测试注入：替换 child_process.spawn 与 claude 命令解析 */
  spawnFn?: SpawnFn
  resolveCommand?: () => { file: string; argsPrefix: string[] }
}

interface RunningTask {
  child: ChildProcessWithoutNullStreams
  output: string
  cancelled: boolean
}

export class TaskQueue {
  private running = new Map<string, RunningTask>()
  private readonly maxConcurrent: number

  constructor(private readonly opts: TaskQueueOptions) {
    this.maxConcurrent = opts.maxConcurrent ?? 2
  }

  enqueue(spec: TaskSpec): TaskInfo {
    const prompt = spec.prompt.trim()
    if (!prompt) throw new Error(t('err.taskPromptEmpty'))
    if (!spec.cwd || !existsSync(spec.cwd)) {
      throw new Error(t('err.cwdNotFound', { cwd: spec.cwd }))
    }

    const task = this.opts.dao.insertTask({
      id: randomUUID(),
      spec: { ...spec, prompt },
      sessionId: randomUUID(),
      ts: Date.now()
    })
    this.opts.emit(task)
    this.pump()
    return task
  }

  list(): TaskInfo[] {
    return this.opts.dao.listTasks()
  }

  cancel(id: string): TaskInfo | null {
    const task = this.opts.dao.getTask(id)
    if (!task) return null
    if (task.status === 'queued') {
      const updated = this.opts.dao.updateTask(id, { status: 'cancelled', finishedAt: Date.now() })
      if (updated) this.opts.emit(updated)
      return updated
    }
    if (task.status === 'running') {
      const run = this.running.get(id)
      if (run) {
        run.cancelled = true
        this.killTree(run.child)
      }
      return task // 终态由 close 处理器统一落库广播
    }
    return task
  }

  output(id: string): string {
    const run = this.running.get(id)
    if (run) return run.output
    return this.opts.dao.taskOutput(id)
  }

  /** 应用退出：杀掉所有运行中任务的进程树 */
  disposeAll(): void {
    for (const [, run] of this.running) {
      run.cancelled = true
      this.killTree(run.child)
    }
  }

  /** 调度：running 数量低于并发上限时，按入队顺序补位 */
  private pump(): void {
    if (this.running.size >= this.maxConcurrent) return
    const next = this.opts.dao
      .listTasks()
      .filter((t) => t.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!next) return
    this.start(next)
    this.pump()
  }

  private start(task: TaskInfo): void {
    let file: string
    let argsPrefix: string[]
    try {
      const cmd = (this.opts.resolveCommand ?? resolveClaudeCommand)()
      file = cmd.file
      argsPrefix = cmd.argsPrefix
    } catch (err) {
      this.finish(task.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return
    }

    const args = [
      ...argsPrefix,
      ...buildTaskArgs(
        {
          prompt: task.prompt,
          cwd: task.cwd,
          model: task.model ?? undefined,
          permissionMode: (task.permissionMode ?? undefined) as TaskSpec['permissionMode'],
          maxBudgetUsd: task.maxBudgetUsd ?? undefined
        },
        task.sessionId ?? randomUUID()
      )
    ]
    const env = buildClaudeEnv(process.env, this.opts.backends.resolve(task.backendProfileId))
    const spawnFn = this.opts.spawnFn ?? (spawn as unknown as SpawnFn)

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnFn(file, args, { cwd: task.cwd, env, windowsHide: true })
    } catch (err) {
      this.finish(task.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return
    }

    const run: RunningTask = { child, output: '', cancelled: false }
    this.running.set(task.id, run)
    const started = this.opts.dao.updateTask(task.id, { status: 'running', startedAt: Date.now() })
    if (started) this.opts.emit(started)
    this.opts.log?.(`任务开跑 ${task.id} pid=${child.pid}`)

    const splitter = new LineSplitter()
    let stderrTail = ''
    let sawResult = false

    const appendOutput = (text: string): void => {
      run.output += text
      if (run.output.length > MAX_OUTPUT_CHARS) {
        run.output = `${t('err.outputTruncated')}\n${run.output.slice(-MAX_OUTPUT_CHARS)}`
      }
    }

    const handleLine = (line: string): void => {
      handleStreamJsonLine(line, {
        onAssistantText: (text) => appendOutput(`${text}\n`),
        onResult: (r) => {
          sawResult = true
          if (r.resultText && !run.output.trim()) appendOutput(`${r.resultText}\n`)
          this.finish(task.id, {
            status: r.isError ? 'failed' : 'done',
            sessionId: r.sessionId ?? task.sessionId,
            resultSummary: r.resultText,
            totalCostUsd: r.totalCostUsd,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            numTurns: r.numTurns,
            durationMs: r.durationMs,
            error: r.isError ? (r.resultText ?? r.subtype ?? t('err.taskFailed')) : null
          })
        }
      })
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => splitter.feed(chunk, handleLine))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-4000)
    })
    child.on('error', (err) => {
      splitter.flush(handleLine)
      if (!sawResult) {
        this.finish(task.id, {
          status: 'failed',
          error: t('err.processSpawnFailed', { message: err.message })
        })
      }
    })
    child.on('close', (code) => {
      splitter.flush(handleLine)
      if (!sawResult) {
        const tail = stderrTail.trim().slice(-300)
        this.finish(task.id, {
          status: run.cancelled ? 'cancelled' : 'failed',
          error: run.cancelled
            ? null
            : `${t('err.claudeExited', { code: code ?? '?' })}${tail ? t('err.detailSuffix', { detail: tail }) : ''}`
        })
      }
    })
  }

  private finish(
    id: string,
    patch: {
      status: 'done' | 'failed' | 'cancelled'
      sessionId?: string | null
      resultSummary?: string | null
      totalCostUsd?: number | null
      inputTokens?: number | null
      outputTokens?: number | null
      numTurns?: number | null
      durationMs?: number | null
      error?: string | null
    }
  ): void {
    const run = this.running.get(id)
    if (run) {
      this.running.delete(id)
      this.killTree(run.child) // result 已到但进程可能还挂着（如 shim 包装），兜底清理
    }
    const current = this.opts.dao.getTask(id)
    if (!current || ['done', 'failed', 'cancelled'].includes(current.status)) {
      this.pump()
      return // 已终态（如 close 与 result 竞争）：不重复落库
    }
    const updated = this.opts.dao.updateTask(id, {
      ...patch,
      finishedAt: Date.now(),
      output: run ? run.output : null
    })
    if (updated) {
      this.opts.emit(updated)
      if (updated.status === 'done' || updated.status === 'failed') {
        this.opts.notify(updated)
      }
      this.opts.log?.(`任务结束 ${id} → ${updated.status}`)
    }
    this.pump()
  }

  private killTree(child: ChildProcessWithoutNullStreams): void {
    const pid = child.pid
    try {
      child.kill()
    } catch {
      // 已退出
    }
    if (pid && process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
    }
  }
}
