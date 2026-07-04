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
  StatsUsage: 'stats:usage',
  // F3 启动器（§7.3）
  LauncherQuery: 'launcher:query',
  LauncherExecute: 'launcher:execute',
  LauncherGetState: 'launcher:get-state',
  LauncherRescanApps: 'launcher:rescan-apps',
  // F4 文件中枢（§7.4）
  FilesSearch: 'files:search',
  FilesActivity: 'files:activity',
  FilesSessionsFor: 'files:sessions-for',
  FilesPinned: 'files:pinned',
  FilesRecentOpened: 'files:recent-opened',
  FilesGetState: 'files:get-state',
  FilesAddDir: 'files:add-dir',
  FilesRemoveDir: 'files:remove-dir',
  FilesSetDirEnabled: 'files:set-dir-enabled',
  FilesRescan: 'files:rescan',
  FilesSetMeta: 'files:set-meta',
  FilesOpen: 'files:open',
  FilesReveal: 'files:reveal',
  FilesCopyPath: 'files:copy-path',
  FilesOpenTerminal: 'files:open-terminal',
  FilesDetectEverything: 'files:detect-everything'
} as const

/** 一发通道（ipcRenderer.send，高频低延迟：键入与resize） */
export const IPC_SEND = {
  TermWrite: 'term:write',
  TermResize: 'term:resize',
  LauncherHide: 'launcher:hide'
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
  Navigate: 'evt:navigate',
  /** 启动器窗口即将显示：渲染层清空输入并聚焦 */
  LauncherShow: 'evt:launcher:show',
  /** 启动器运行时状态变化（扫描完成/热键改绑结果） */
  LauncherState: 'evt:launcher:state',
  /** F4 索引扫描进度 */
  FilesIndexProgress: 'evt:files:index-progress',
  /** F4 索引内容有变化（扫描完成/监听增量落库），渲染层失效相关查询 */
  FilesUpdated: 'evt:files:updated'
} as const
