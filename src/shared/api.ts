import type { AppInfo, AppSettings } from './types'

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
}
