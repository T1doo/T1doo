/** F3 启动器的共享视图模型（§7.3） */

/** CC 对象（project/session/terminal/prompt）排序优先于便利层（app/command 等） */
export type LauncherItemKind =
  | 'project'
  | 'session'
  | 'terminal'
  | 'prompt'
  | 'app'
  | 'command'
  | 'url'
  | 'path'
  | 'search'
  | 'hint'

export interface LauncherItem {
  /** 稳定键 kind:target，frecency 记账与去重用 */
  key: string
  kind: LauncherItemKind
  title: string
  subtitle: string | null
  /** app 图标 data: URL；其余 kind 由渲染层按类型用内置图标 */
  icon: string | null
  /**
   * 动作载荷：project=cwd | session=sessionId | terminal=terminalId | prompt=提示词全文
   * app=.lnk 路径或 AppUserModelID | url=完整 URL | path=绝对路径 | search=原始词 | command=命令 id
   */
  target: string
  meta?: {
    sessionId?: string
    projectPath?: string
    appKind?: 'win32' | 'uwp'
  }
}

/** 输入形态解析出的意图（§7.3 意图路由表） */
export type LauncherIntent = 'mixed' | 'command' | 'ai' | 'url' | 'path' | 'search'

export interface LauncherQueryResult {
  intent: LauncherIntent
  items: LauncherItem[]
}

export interface LauncherExecuteResult {
  ok: boolean
  /** 执行后给用户的提示（如"提示词已复制到剪贴板"）；null = 静默关窗 */
  message: string | null
}

/** 设置页与启动器窗共用的运行时状态 */
export interface LauncherState {
  hotkey: string
  /** 全局热键是否注册成功（false = 被占用，需改绑，R5） */
  hotkeyRegistered: boolean
  appCount: number
  scanning: boolean
  lastScanAt: number | null
}
