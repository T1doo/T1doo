import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { describe, expect, it } from 'vitest'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { TaskInfo, TaskSpec } from '../../src/shared/ai'
import { TaskQueue, type SpawnFn } from '../../src/main/services/ai/task-queue'
import type { AiDao } from '../../src/main/db/ai-dao'
import type { BackendProfilesService } from '../../src/main/services/backend/profiles'

/** 内存版 tasks 表：状态机测试不碰 better-sqlite3（Electron ABI，DAO 走 E2E 覆盖） */
class FakeDao {
  tasks = new Map<string, TaskInfo & { output?: string | null }>()

  insertTask(t: { id: string; spec: TaskSpec; sessionId: string; ts: number }): TaskInfo {
    const info: TaskInfo = {
      id: t.id,
      prompt: t.spec.prompt,
      cwd: t.spec.cwd,
      status: 'queued',
      model: t.spec.model ?? null,
      backendProfileId: t.spec.backendProfileId ?? null,
      permissionMode: t.spec.permissionMode ?? 'default',
      maxBudgetUsd: t.spec.maxBudgetUsd ?? null,
      sessionId: t.sessionId,
      createdAt: t.ts,
      startedAt: null,
      finishedAt: null,
      resultSummary: null,
      totalCostUsd: null,
      inputTokens: null,
      outputTokens: null,
      numTurns: null,
      durationMs: null,
      error: null
    }
    this.tasks.set(t.id, { ...info })
    return { ...info }
  }

  getTask(id: string): TaskInfo | null {
    const t = this.tasks.get(id)
    return t ? { ...t } : null
  }

  listTasks(): TaskInfo[] {
    return [...this.tasks.values()].map((t) => ({ ...t }))
  }

  updateTask(id: string, patch: Record<string, unknown>): TaskInfo | null {
    const t = this.tasks.get(id)
    if (!t) return null
    Object.assign(t, patch)
    return { ...t }
  }

  taskOutput(id: string): string {
    return this.tasks.get(id)?.output ?? ''
  }
}

class FakeChild extends EventEmitter {
  stdout = new PassThrough({ encoding: 'utf8' })
  stderr = new PassThrough({ encoding: 'utf8' })
  pid = 4242
  killed = false
  kill(): boolean {
    this.killed = true
    return true
  }
}

interface Harness {
  queue: TaskQueue
  dao: FakeDao
  children: FakeChild[]
  events: TaskInfo[]
  notified: TaskInfo[]
}

function makeHarness(maxConcurrent = 2): Harness {
  const dao = new FakeDao()
  const children: FakeChild[] = []
  const events: TaskInfo[] = []
  const notified: TaskInfo[] = []
  const spawnFn: SpawnFn = () => {
    const child = new FakeChild()
    children.push(child)
    return child as unknown as ChildProcessWithoutNullStreams
  }
  const queue = new TaskQueue({
    dao: dao as unknown as AiDao,
    backends: { resolve: () => null } as unknown as BackendProfilesService,
    emit: (t) => events.push(t),
    notify: (t) => notified.push(t),
    maxConcurrent,
    spawnFn,
    resolveCommand: () => ({ file: 'claude.exe', argsPrefix: [] })
  })
  return { queue, dao, children, events, notified }
}

const SPEC: TaskSpec = { prompt: '测试任务', cwd: process.cwd() }

function emitResult(child: FakeChild, overrides: Record<string, unknown> = {}): void {
  child.stdout.write(
    `${JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '完成了',
      session_id: 'sess-1',
      total_cost_usd: 0.01,
      usage: { input_tokens: 10, output_tokens: 20 },
      num_turns: 1,
      duration_ms: 100,
      ...overrides
    })}\n`
  )
}

async function tick(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

describe('任务队列状态机（§7.5.2）', () => {
  it('enqueue → running → result 事件 → done（采集成本字段 + 通知）', async () => {
    const h = makeHarness()
    const task = h.queue.enqueue(SPEC)
    expect(h.dao.getTask(task.id)?.status).toBe('running') // 并发有空位立即开跑

    h.children[0].stdout.write(
      `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '干活中' }] } })}\n`
    )
    emitResult(h.children[0])
    await tick()

    const done = h.dao.getTask(task.id)!
    expect(done.status).toBe('done')
    expect(done.sessionId).toBe('sess-1')
    expect(done.totalCostUsd).toBe(0.01)
    expect(done.inputTokens).toBe(10)
    expect(done.outputTokens).toBe(20)
    expect(done.numTurns).toBe(1)
    expect(h.notified.map((t) => t.status)).toEqual(['done'])
    expect(h.dao.taskOutput(task.id)).toContain('干活中')
    expect(done.resultSummary).toBe('完成了') // result 文本单独入 resultSummary（卡片摘要）
  })

  it('result is_error → failed；进程无 result 退出 → failed 带 stderr', async () => {
    const h = makeHarness()
    const t1 = h.queue.enqueue(SPEC)
    emitResult(h.children[0], { is_error: true, result: '预算超限' })
    await tick()
    expect(h.dao.getTask(t1.id)?.status).toBe('failed')
    expect(h.dao.getTask(t1.id)?.error).toContain('预算超限')

    const t2 = h.queue.enqueue(SPEC)
    h.children[1].stderr.write('boom')
    h.children[1].emit('close', 1)
    await tick()
    expect(h.dao.getTask(t2.id)?.status).toBe('failed')
    expect(h.dao.getTask(t2.id)?.error).toContain('boom')
  })

  it('并发上限 2：第三个任务排队，前面完成后补位', async () => {
    const h = makeHarness(2)
    const a = h.queue.enqueue(SPEC)
    const b = h.queue.enqueue(SPEC)
    const c = h.queue.enqueue(SPEC)
    expect(h.dao.getTask(a.id)?.status).toBe('running')
    expect(h.dao.getTask(b.id)?.status).toBe('running')
    expect(h.dao.getTask(c.id)?.status).toBe('queued')
    expect(h.children).toHaveLength(2)

    emitResult(h.children[0])
    await tick()
    expect(h.dao.getTask(c.id)?.status).toBe('running')
    expect(h.children).toHaveLength(3)
  })

  it('取消：queued 直接 cancelled；running 杀进程后由 close 收敛为 cancelled', async () => {
    const h = makeHarness(1)
    const a = h.queue.enqueue(SPEC)
    const b = h.queue.enqueue(SPEC)
    expect(h.dao.getTask(b.id)?.status).toBe('queued')

    h.queue.cancel(b.id)
    expect(h.dao.getTask(b.id)?.status).toBe('cancelled')

    h.queue.cancel(a.id)
    expect(h.children[0].killed).toBe(true)
    h.children[0].emit('close', 1) // taskkill 后进程关闭
    await tick()
    expect(h.dao.getTask(a.id)?.status).toBe('cancelled')
    expect(h.dao.getTask(a.id)?.error).toBeNull()
    // 取消不弹"完成/失败"通知
    expect(h.notified).toHaveLength(0)
  })

  it('result 与 close 竞争：终态只落一次', async () => {
    const h = makeHarness()
    const task = h.queue.enqueue(SPEC)
    emitResult(h.children[0])
    h.children[0].emit('close', 0)
    await tick()
    expect(h.dao.getTask(task.id)?.status).toBe('done')
    const doneEvents = h.events.filter((e) => e.id === task.id && e.status === 'done')
    expect(doneEvents).toHaveLength(1)
  })

  it('空 prompt / 不存在的 cwd：入队即拒绝', () => {
    const h = makeHarness()
    expect(() => h.queue.enqueue({ prompt: '  ', cwd: process.cwd() })).toThrow()
    expect(() => h.queue.enqueue({ prompt: 'x', cwd: 'Z:\\no-such-dir-xyz' })).toThrow()
  })
})
