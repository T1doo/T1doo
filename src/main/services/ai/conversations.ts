import { randomUUID } from 'crypto'
import type {
  AiDeltaEvent,
  ChatSendInput,
  ChatSendResult,
  ConvMessagesResult
} from '../../../shared/ai'
import { DEFAULT_API_MODEL } from '../../../shared/ai'
import type { AiDao } from '../../db/ai-dao'
import type { UsageInsertRow } from '../../db/usage-dao'
import type { BackendProfilesService } from '../backend/profiles'
import { CliChatEngine, type CliTurnOutcome } from './engine-cli'
import { ApiChatEngine, type ApiTurnOutcome } from './engine-api'
import type { AiApiConfigService } from './api-config'
import { t } from '../i18n'

/** delta 广播节流窗口：token 级事件按 40ms 合并，降低 IPC 压力 */
const DELTA_FLUSH_MS = 40
const TITLE_MAX = 40

export interface ChatServiceOptions {
  dao: AiDao
  backends: BackendProfilesService
  apiConfig: AiApiConfigService
  emit: (e: AiDeltaEvent) => void
  /** 用量中心面板来源写入（§7.8.2 第 4 条）；任务队列不经此路（其会话落盘 JSONL，session 来源已覆盖） */
  recordUsage?: (row: UsageInsertRow) => void
  log?: (msg: string) => void
}

interface InFlight {
  turnId: string
  engine: 'cli' | 'api'
  /** 已累计文本（切页回来续流用，ai:conv:messages 返回） */
  text: string
  pendingDelta: string
  flushTimer: NodeJS.Timeout | null
}

/** F5 对话编排：双引擎收敛为统一回合流（§7.5.1），历史落库可搜（验收④） */
export class ChatService {
  private cli: CliChatEngine
  private api: ApiChatEngine
  private inFlight = new Map<string, InFlight>()

  constructor(private readonly opts: ChatServiceOptions) {
    this.cli = new CliChatEngine(opts.backends, opts.log)
    this.api = new ApiChatEngine(opts.log)
  }

  /** 发起一个回合：立即返回 convId+turnId，内容经 evt:ai:delta 流式送达 */
  send(input: ChatSendInput): ChatSendResult {
    const text = input.text.trim()
    if (!text) throw new Error(t('err.emptyMessage'))

    let convId = input.convId ?? null
    let conv = convId ? this.opts.dao.getConversation(convId) : null
    if (!conv) {
      // 新建对话：引擎配置在创建时固化，后续回合沿用
      convId = randomUUID()
      const engine = input.engine === 'api' ? 'api' : 'cli'
      this.opts.dao.createConversation({
        id: convId,
        title: truncateTitle(text),
        engine,
        model: input.model?.trim() || (engine === 'api' ? this.opts.apiConfig.get().model : null),
        backendProfileId: engine === 'cli' ? (input.backendProfileId ?? null) : null,
        ts: Date.now()
      })
      conv = this.opts.dao.getConversation(convId)!
    }
    if (this.inFlight.has(conv.id)) throw new Error(t('err.turnInProgressWait'))

    this.opts.dao.appendMessage({ convId: conv.id, role: 'user', content: text, ts: Date.now() })

    const turnId = randomUUID()
    const flight: InFlight = {
      turnId,
      engine: conv.engine,
      text: '',
      pendingDelta: '',
      flushTimer: null
    }
    this.inFlight.set(conv.id, flight)
    void this.runTurn(conv.id, conv.engine, conv.model, conv.backendProfileId, text, flight)
    return { convId: conv.id, turnId }
  }

  stop(convId: string): void {
    const flight = this.inFlight.get(convId)
    if (!flight) return
    if (flight.engine === 'cli') this.cli.stop(convId)
    else this.api.stop(convId)
  }

  messagesWithPending(convId: string): ConvMessagesResult {
    const flight = this.inFlight.get(convId)
    return {
      messages: this.opts.dao.listMessages(convId),
      pending: flight ? { turnId: flight.turnId, text: flight.text } : null
    }
  }

  deleteConversation(convId: string): void {
    this.stop(convId)
    this.cli.disposeConv(convId)
    this.opts.dao.deleteConversation(convId)
  }

  disposeAll(): void {
    this.cli.disposeAll()
    this.api.disposeAll()
  }

  private async runTurn(
    convId: string,
    engine: 'cli' | 'api',
    model: string | null,
    backendProfileId: string | null,
    text: string,
    flight: InFlight
  ): Promise<void> {
    const onDelta = (delta: string): void => {
      flight.text += delta
      flight.pendingDelta += delta
      if (!flight.flushTimer) {
        flight.flushTimer = setTimeout(() => this.flushDelta(convId, flight), DELTA_FLUSH_MS)
      }
    }

    try {
      let outcome: ApiTurnOutcome | CliTurnOutcome
      if (engine === 'api') {
        const apiKey = this.opts.apiConfig.resolveKey()
        if (!apiKey) {
          throw new Error(t('err.apiKeyMissing'))
        }
        outcome = await this.api.send(
          convId,
          {
            model: model || DEFAULT_API_MODEL,
            apiKey,
            baseUrl: this.opts.apiConfig.get().baseUrl,
            history: this.buildApiHistory(convId)
          },
          onDelta
        )
      } else {
        outcome = await this.cli.send(convId, { model, backendProfileId }, text, onDelta)
      }

      this.flushDelta(convId, flight)
      const messageId = this.opts.dao.appendMessage({
        convId,
        role: 'assistant',
        content: outcome.text,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        ts: Date.now()
      })
      this.recordPanelUsage(convId, engine, model, backendProfileId, outcome, messageId)
      this.inFlight.delete(convId)
      this.opts.emit({
        convId,
        turnId: flight.turnId,
        kind: 'done',
        messageId,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens
      })
    } catch (err) {
      this.flushDelta(convId, flight)
      const message = err instanceof Error ? err.message : String(err)
      // 已流出的部分文本落库（标记错误），保住半截回答
      const partialSaved = flight.text.length > 0
      if (partialSaved) {
        this.opts.dao.appendMessage({
          convId,
          role: 'assistant',
          content: flight.text,
          ts: Date.now(),
          error: message
        })
      }
      this.inFlight.delete(convId)
      this.opts.log?.(`回合失败 conv=${convId}: ${message}`)
      this.opts.emit({ convId, turnId: flight.turnId, kind: 'error', message, partialSaved })
    }
  }

  /**
   * 面板回合 → usage_log（全局一张表出数）。主键：api 引擎 `api:<messageId>`；
   * cli 引擎 `--no-session-persistence` 不落 JSONL，用 `cli:<sessionId>:<turn>` 补记
   * （turn = 落库的 assistant 消息行 id，回合内单调且稳定）。
   */
  private recordPanelUsage(
    convId: string,
    engine: 'cli' | 'api',
    model: string | null,
    backendProfileId: string | null,
    outcome: ApiTurnOutcome | CliTurnOutcome,
    messageRowId: number
  ): void {
    if (!this.opts.recordUsage) return
    const input = outcome.inputTokens ?? 0
    const output = outcome.outputTokens ?? 0
    const cacheRead = outcome.cacheReadTokens ?? 0
    const cacheCreation = outcome.cacheCreationTokens ?? 0
    // 口径与扫描器一致：任一计费维度 > 0 才计入
    if (input + output + cacheRead + cacheCreation <= 0) return

    let row: UsageInsertRow
    if (engine === 'api') {
      const o = outcome as ApiTurnOutcome
      if (!o.messageId) return
      row = {
        messageId: `api:${o.messageId}`,
        sessionId: convId,
        projectPath: null,
        model: o.model ?? model ?? DEFAULT_API_MODEL,
        ts: Date.now(),
        input,
        output,
        cacheRead,
        cacheCreation,
        stopReason: o.stopReason,
        source: 'api-panel',
        backendProfileId: null
      }
    } else {
      const o = outcome as CliTurnOutcome
      row = {
        messageId: `cli:${o.sessionId ?? convId}:${messageRowId}`,
        sessionId: o.sessionId ?? convId,
        projectPath: null,
        model: o.model ?? model,
        ts: Date.now(),
        input,
        output,
        cacheRead,
        cacheCreation,
        stopReason: o.subtype,
        source: 'cli-panel',
        backendProfileId
      }
    }
    try {
      this.opts.recordUsage(row)
    } catch (err) {
      this.opts.log?.(`面板用量写入失败（忽略）：${String(err)}`)
    }
  }

  private flushDelta(convId: string, flight: InFlight): void {
    if (flight.flushTimer) {
      clearTimeout(flight.flushTimer)
      flight.flushTimer = null
    }
    if (!flight.pendingDelta) return
    flight.pendingDelta = ''
    // 发送累计全文而非增量：渲染层整包替换，天然幂等（切页/慢订阅都不丢字）
    this.opts.emit({ convId, turnId: flight.turnId, kind: 'delta', text: flight.text })
  }

  /** api 引擎无状态：每回合重发全量历史（含刚插入的用户消息；出错回合跳过） */
  private buildApiHistory(convId: string): { role: 'user' | 'assistant'; content: string }[] {
    return this.opts.dao
      .listMessages(convId)
      .filter((m) => m.content.trim().length > 0 && !m.error)
      .map((m) => ({ role: m.role, content: m.content }))
  }
}

function truncateTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1)}…` : oneLine
}
