import type { AppInfo, AppSettings } from './types'
import type {
  ExportFormat,
  ProjectSummary,
  SearchHit,
  SessionDetail,
  SessionFilter,
  SessionSummary,
  SyncProgress
} from './sessions'

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
  }
  sessions: {
    list(filter?: SessionFilter): Promise<SessionSummary[]>
    projects(): Promise<ProjectSummary[]>
    get(id: string): Promise<SessionDetail>
    search(q: string, projectId?: number): Promise<SearchHit[]>
    /** 返回导出文件路径；用户取消返回 null */
    export(id: string, fmt: ExportFormat): Promise<string | null>
    /** 在外部 Windows Terminal 中恢复会话 */
    resume(id: string): Promise<void>
    update(id: string, patch: { pinned?: boolean; note?: string }): Promise<void>
    /** 会话索引有增量更新（参数为受影响的 sessionId 列表） */
    onUpdated(cb: (sessionIds: string[]) => void): () => void
    onProgress(cb: (p: SyncProgress) => void): () => void
  }
}
