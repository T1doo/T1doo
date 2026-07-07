/** IPC 通道名单一事实源（§5.2）。invoke 通道按域命名，事件通道以 evt: 前缀。 */
export const IPC = {
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  AppInfo: 'app:info',
  /** 首启引导：探测 claude 可用性与版本 */
  AppProbeClaude: 'app:probe-claude',
  // 自动更新（M6 §13）
  UpdaterGetState: 'updater:get-state',
  UpdaterCheck: 'updater:check',
  UpdaterInstall: 'updater:install',
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
  // 后端档案（§7.2.6）/ 模型中心（§7.7）
  BackendList: 'backend:list',
  BackendSave: 'backend:save',
  BackendDelete: 'backend:delete',
  /** 连通性测试（GET /v1/models，5s 超时，§7.7.4） */
  BackendTest: 'backend:test',
  /** 拉取网关模型列表 → modelCache（§7.7.4） */
  BackendModels: 'backend:models',
  /** 全局切换状态（授权/当前档案/管理键，§7.7.5） */
  BackendGlobalState: 'backend:global-state',
  /** 一键切换：写 settings.json env 键（含首次授权/冲突检测） */
  BackendSwitch: 'backend:switch',
  /** 一键还原：按记账移除全部管理键 */
  BackendRestore: 'backend:restore',
  /** 冲突三选之"导入为新档案"：把 live env 块导入为 custom 档案 */
  BackendImportLive: 'backend:import-live',
  /** API 直连通道拉取模型列表（用 ai 配置的 baseUrl+Key，§7.7.6） */
  AiModels: 'ai:models',
  // hooks 状态感知（§7.2.4）
  HooksGetState: 'hooks:get-state',
  HooksSetEnabled: 'hooks:set-enabled',
  // F9 用量中心（§7.8）：Dashboard 卡片与板块共用（stats:usage 已随 M8 退役）
  /** 聚合查询单入口（kind: summary/trend/byModel/byProject/bySource/facets） */
  UsageQuery: 'usage:query',
  UsagePricingList: 'usage:pricing-list',
  UsagePricingSave: 'usage:pricing-save',
  /** 内置模型恢复种子价，用户自建模型删行 */
  UsagePricingReset: 'usage:pricing-reset',
  /** 扫描器状态（首扫进度/行数，perf-audit 也用） */
  UsageScanState: 'usage:scan-state',
  // F3 启动器（§7.3）
  LauncherQuery: 'launcher:query',
  LauncherExecute: 'launcher:execute',
  LauncherGetState: 'launcher:get-state',
  LauncherRescanApps: 'launcher:rescan-apps',
  // F5 AI 能力（§7.5）
  AiChatSend: 'ai:chat:send',
  AiChatStop: 'ai:chat:stop',
  AiConvList: 'ai:conv:list',
  AiConvMessages: 'ai:conv:messages',
  AiConvDelete: 'ai:conv:delete',
  AiConvSearch: 'ai:conv:search',
  AiConfigGet: 'ai:config:get',
  AiConfigSet: 'ai:config:set',
  TasksEnqueue: 'tasks:enqueue',
  TasksList: 'tasks:list',
  TasksCancel: 'tasks:cancel',
  TasksOutput: 'tasks:output'
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
  /** F5 对话流式事件（delta/done/error，按 convId+turnId 定位） */
  AiDelta: 'evt:ai:delta',
  /** F5 任务状态变化（入队/开跑/完成/失败/取消） */
  TaskUpdate: 'evt:task:update',
  /** 自动更新状态变化（checking/downloading/downloaded/…） */
  UpdaterState: 'evt:updater:state',
  /** 用量数据有增量写入（扫描器/面板来源），渲染层失效查询即可（不做轮询，§7.8.4） */
  UsageUpdated: 'evt:usage:updated'
} as const
