/** F2 终端管理的共享视图模型（§7.2） */

export type TerminalKind = 'claude' | 'shell'

/** claude 会话终端的实时状态（hooks 或降级路径推断）；shell 终端无状态 */
export type ClaudeStatus = 'working' | 'waiting' | 'idle'

/** 2.1.196 `--help` 实测全集（§7.2.2） */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'dontAsk'
  | 'auto'
  | 'bypassPermissions'

export interface ClaudeLaunchOptions {
  /** 引用后端档案；缺省 = 订阅态（不注入任何 ANTHROPIC_*） */
  backendProfileId?: string
  /** 透传 --model，覆盖后端档案的默认模型 */
  model?: string
  permissionMode?: PermissionMode
  /** 恢复已有会话（--resume <id>，绑定即刻确定） */
  resumeSessionId?: string
  /** 透传 -n <name>：会话显示名，终端标签名与之同步 */
  name?: string
  extraArgs?: string[]
}

export interface TerminalProfile {
  cwd: string
  kind: TerminalKind
  claude?: ClaudeLaunchOptions
}

export interface TerminalInfo {
  id: string
  kind: TerminalKind
  cwd: string
  title: string
  pid: number
  createdAt: number
  /** 绑定的 Claude sessionId：新建=--session-id 预生成；恢复=--resume 已知；shell=hooks SessionStart 校正 */
  sessionId: string | null
  backendProfileId: string | null
  /** claude 终端的实时状态；shell 终端恒为 null */
  status: ClaudeStatus | null
  /** 进程已退出时的退出码（标签保留供回看，需手动关闭） */
  exit: { code: number } | null
}

/** attach 返回：终端元信息 + 环形缓冲区回放内容 */
export interface TerminalAttachResult {
  info: TerminalInfo
  buffer: string
}

/** 会话级状态事件（hooks 上报后广播；Dashboard 与终端页共用） */
export interface ClaudeStatusEvent {
  sessionId: string
  status: ClaudeStatus | 'closed'
  cwd: string | null
  terminalId: string | null
  ts: number
}

/** hooks 状态感知的运行时状态（设置页展示） */
export interface HooksState {
  enabled: boolean
  running: boolean
  port: number | null
  /** 注册进 ~/.claude/settings.json 是否成功 */
  registered: boolean
  error: string | null
}
