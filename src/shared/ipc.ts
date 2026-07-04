/** IPC 通道名单一事实源（§5.2）。invoke 通道按域命名，事件通道以 evt: 前缀。 */
export const IPC = {
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  AppInfo: 'app:info',
  SessionsList: 'sessions:list',
  SessionsProjects: 'sessions:projects',
  SessionsGet: 'sessions:get',
  SessionsSearch: 'sessions:search',
  SessionsExport: 'sessions:export',
  SessionsResume: 'sessions:resume',
  SessionsResumeExternal: 'sessions:resume-external',
  SessionsUpdate: 'sessions:update',
  // F2 终端
  TermCreate: 'term:create',
  TermClose: 'term:close',
  TermList: 'term:list',
  TermAttach: 'term:attach',
  TermPickCwd: 'term:pick-cwd',
  // 后端档案（§7.2.6）
  BackendList: 'backend:list',
  BackendSave: 'backend:save',
  BackendDelete: 'backend:delete',
  // hooks 状态感知（§7.2.4）
  HooksGetState: 'hooks:get-state',
  HooksSetEnabled: 'hooks:set-enabled',
  // Dashboard
  StatsUsage: 'stats:usage'
} as const

/** 一发通道（ipcRenderer.send，高频低延迟：键入与resize） */
export const IPC_SEND = {
  TermWrite: 'term:write',
  TermResize: 'term:resize'
} as const

export const IPC_EVENTS = {
  SettingsUpdated: 'evt:settings:updated',
  SessionsUpdated: 'evt:sessions:updated',
  IndexProgress: 'evt:index:progress',
  TermData: 'evt:terminal:data',
  TermOpened: 'evt:terminal:opened',
  TermExit: 'evt:terminal:exit',
  TermClosed: 'evt:terminal:closed',
  TermUpdated: 'evt:terminal:updated',
  ClaudeStatus: 'evt:claude:status',
  /** 主进程要求跳转（系统通知点击等）：payload = { page, terminalId? } */
  Navigate: 'evt:navigate'
} as const
