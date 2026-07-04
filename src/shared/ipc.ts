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
  SessionsUpdate: 'sessions:update'
} as const

export const IPC_EVENTS = {
  SettingsUpdated: 'evt:settings:updated',
  SessionsUpdated: 'evt:sessions:updated',
  IndexProgress: 'evt:index:progress'
} as const
