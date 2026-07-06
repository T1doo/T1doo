import type { AppInfo, AppSettings, ClaudeProbeResult } from './types'
import type {
  ExportFormat,
  ProjectSummary,
  SearchHit,
  SessionDetail,
  SessionFilter,
  SessionSummary,
  SyncProgress
} from './sessions'
import type { BackendProfileInput, BackendProfileView } from './backend'
import type {
  LauncherExecuteResult,
  LauncherItem,
  LauncherQueryResult,
  LauncherState
} from './launcher'
import type {
  ClaudeStatusEvent,
  HooksState,
  TerminalAttachResult,
  TerminalInfo,
  TerminalProfile
} from './terminals'
import type {
  AiApiConfig,
  AiApiConfigInput,
  AiDeltaEvent,
  ChatSearchHit,
  ChatSendInput,
  ChatSendResult,
  ConvMessagesResult,
  ConversationSummary,
  TaskInfo,
  TaskSpec
} from './ai'

/** Dashboard 用量聚合（token 数口径，不折算美元——§7.6） */
export interface UsageStats {
  todayInput: number
  todayOutput: number
  weekInput: number
  weekOutput: number
  /** 近 7 天逐日 output token（旧→新，Dashboard 曲线用） */
  daily: { day: string; input: number; output: number }[]
}

export interface NavigateRequest {
  page: 'dashboard' | 'sessions' | 'terminals' | 'chat' | 'tasks' | 'settings'
  terminalId?: string
  sessionId?: string
  /** page='chat' 时聚焦的对话（启动器 @ 提问落点） */
  convId?: string
}

/** preload 通过 contextBridge 暴露给渲染层的白名单 API（window.t1doo） */
export interface T1dooApi {
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    /** 订阅设置变更，返回取消订阅函数 */
    onUpdated(cb: (settings: AppSettings) => void): () => void
  }
  app: {
    info(): Promise<AppInfo>
    /** 首启引导：探测 claude 命令与版本（5s 超时，不抛错） */
    probeClaude(): Promise<ClaudeProbeResult>
  }
  sessions: {
    list(filter?: SessionFilter): Promise<SessionSummary[]>
    projects(): Promise<ProjectSummary[]>
    get(id: string): Promise<SessionDetail>
    search(q: string, projectId?: number): Promise<SearchHit[]>
    /** 返回导出文件路径；用户取消返回 null */
    export(id: string, fmt: ExportFormat): Promise<string | null>
    /** 在内置终端恢复会话，返回新终端信息（M2 起默认路径） */
    resume(id: string, backendProfileId?: string): Promise<TerminalInfo>
    /** 在外部 Windows Terminal 恢复（M1 行为保留为可选项） */
    resumeExternal(id: string): Promise<void>
    update(id: string, patch: { pinned?: boolean; note?: string }): Promise<void>
    /** 会话索引有增量更新（参数为受影响的 sessionId 列表） */
    onUpdated(cb: (sessionIds: string[]) => void): () => void
    onProgress(cb: (p: SyncProgress) => void): () => void
  }
  term: {
    create(profile: TerminalProfile): Promise<TerminalInfo>
    /** 杀进程并移除记录（进程已退出时仅移除记录） */
    close(id: string): Promise<void>
    list(): Promise<TerminalInfo[]>
    /** 取元信息 + 缓冲区回放；随后经 onData 接收增量 */
    attach(id: string): Promise<TerminalAttachResult>
    /** 目录选择对话框；用户取消返回 null */
    pickCwd(defaultPath?: string): Promise<string | null>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    onData(cb: (payload: { id: string; data: string }) => void): () => void
    onOpened(cb: (info: TerminalInfo) => void): () => void
    onExit(cb: (payload: { id: string; exitCode: number }) => void): () => void
    onClosed(cb: (id: string) => void): () => void
    /** 元信息变化（状态点/标题/绑定 sessionId） */
    onUpdated(cb: (info: TerminalInfo) => void): () => void
  }
  backend: {
    list(): Promise<BackendProfileView[]>
    save(input: BackendProfileInput): Promise<BackendProfileView[]>
    delete(id: string): Promise<BackendProfileView[]>
  }
  hooks: {
    getState(): Promise<HooksState>
    setEnabled(enabled: boolean): Promise<HooksState>
    onClaudeStatus(cb: (e: ClaudeStatusEvent) => void): () => void
  }
  stats: {
    usage(): Promise<UsageStats>
  }
  launcher: {
    query(q: string): Promise<LauncherQueryResult>
    execute(item: LauncherItem): Promise<LauncherExecuteResult>
    /** 渲染层请求隐藏启动器窗（Esc/执行完成） */
    hide(): void
    getState(): Promise<LauncherState>
    /** 手动重扫开始菜单应用，返回扫描后的应用数 */
    rescanApps(): Promise<number>
    onShow(cb: () => void): () => void
    onState(cb: (state: LauncherState) => void): () => void
  }
  ai: {
    /** 发起一个回合（convId 缺省=新建对话）；流式内容走 onDelta */
    send(input: ChatSendInput): Promise<ChatSendResult>
    /** 停止某对话正在进行的回合 */
    stop(convId: string): Promise<void>
    convList(): Promise<ConversationSummary[]>
    convMessages(convId: string): Promise<ConvMessagesResult>
    convDelete(convId: string): Promise<void>
    /** 对话历史全文搜索（FTS，CJK 切分口径与会话中心一致） */
    convSearch(q: string): Promise<ChatSearchHit[]>
    configGet(): Promise<AiApiConfig>
    configSet(input: AiApiConfigInput): Promise<AiApiConfig>
    onDelta(cb: (e: AiDeltaEvent) => void): () => void
  }
  tasks: {
    enqueue(spec: TaskSpec): Promise<TaskInfo>
    list(): Promise<TaskInfo[]>
    /** 取消排队/运行中的任务 */
    cancel(id: string): Promise<TaskInfo | null>
    /** 任务输出全文（运行中=内存缓冲；完成后=落库文本） */
    output(id: string): Promise<string>
    onUpdate(cb: (task: TaskInfo) => void): () => void
  }
  nav: {
    onNavigate(cb: (req: NavigateRequest) => void): () => void
  }
}
