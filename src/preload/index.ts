import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENTS, IPC_SEND } from '../shared/ipc'
import type { NavigateRequest, T1dooApi } from '../shared/api'
import type { AppSettings, UpdaterState } from '../shared/types'
import type { SyncProgress } from '../shared/sessions'
import type { ClaudeStatusEvent, TerminalInfo } from '../shared/terminals'
import type { LauncherState } from '../shared/launcher'
import type { AiDeltaEvent, TaskInfo } from '../shared/ai'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

// 渲染层唯一入口：白名单 API，不透传 ipcRenderer 本体
const api: T1dooApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.SettingsSet, patch),
    onUpdated: (cb) => subscribe<AppSettings>(IPC_EVENTS.SettingsUpdated, cb)
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.AppInfo),
    probeClaude: () => ipcRenderer.invoke(IPC.AppProbeClaude)
  },
  updater: {
    getState: () => ipcRenderer.invoke(IPC.UpdaterGetState),
    check: () => ipcRenderer.invoke(IPC.UpdaterCheck),
    install: () => ipcRenderer.invoke(IPC.UpdaterInstall),
    onState: (cb) => subscribe<UpdaterState>(IPC_EVENTS.UpdaterState, cb)
  },
  sessions: {
    list: (filter) => ipcRenderer.invoke(IPC.SessionsList, filter),
    projects: () => ipcRenderer.invoke(IPC.SessionsProjects),
    get: (id) => ipcRenderer.invoke(IPC.SessionsGet, id),
    search: (q, projectId) => ipcRenderer.invoke(IPC.SessionsSearch, q, projectId),
    export: (id, fmt) => ipcRenderer.invoke(IPC.SessionsExport, id, fmt),
    resume: (id, backendProfileId) => ipcRenderer.invoke(IPC.SessionsResume, id, backendProfileId),
    resumeExternal: (id) => ipcRenderer.invoke(IPC.SessionsResumeExternal, id),
    update: (id, patch) => ipcRenderer.invoke(IPC.SessionsUpdate, id, patch),
    onUpdated: (cb) => subscribe<string[]>(IPC_EVENTS.SessionsUpdated, cb),
    onProgress: (cb) => subscribe<SyncProgress>(IPC_EVENTS.IndexProgress, cb)
  },
  term: {
    create: (profile) => ipcRenderer.invoke(IPC.TermCreate, profile),
    close: (id) => ipcRenderer.invoke(IPC.TermClose, id),
    list: () => ipcRenderer.invoke(IPC.TermList),
    attach: (id) => ipcRenderer.invoke(IPC.TermAttach, id),
    pickCwd: (defaultPath) => ipcRenderer.invoke(IPC.TermPickCwd, defaultPath),
    write: (id, data) => ipcRenderer.send(IPC_SEND.TermWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC_SEND.TermResize, id, cols, rows),
    onData: (cb) => subscribe<{ id: string; data: string }>(IPC_EVENTS.TermData, cb),
    onOpened: (cb) => subscribe<TerminalInfo>(IPC_EVENTS.TermOpened, cb),
    onExit: (cb) => subscribe<{ id: string; exitCode: number }>(IPC_EVENTS.TermExit, cb),
    onClosed: (cb) => subscribe<string>(IPC_EVENTS.TermClosed, cb),
    onUpdated: (cb) => subscribe<TerminalInfo>(IPC_EVENTS.TermUpdated, cb)
  },
  backend: {
    list: () => ipcRenderer.invoke(IPC.BackendList),
    save: (input) => ipcRenderer.invoke(IPC.BackendSave, input),
    delete: (id) => ipcRenderer.invoke(IPC.BackendDelete, id)
  },
  hooks: {
    getState: () => ipcRenderer.invoke(IPC.HooksGetState),
    setEnabled: (enabled) => ipcRenderer.invoke(IPC.HooksSetEnabled, enabled),
    onClaudeStatus: (cb) => subscribe<ClaudeStatusEvent>(IPC_EVENTS.ClaudeStatus, cb)
  },
  stats: {
    usage: () => ipcRenderer.invoke(IPC.StatsUsage)
  },
  launcher: {
    query: (q) => ipcRenderer.invoke(IPC.LauncherQuery, q),
    execute: (item) => ipcRenderer.invoke(IPC.LauncherExecute, item),
    hide: () => ipcRenderer.send(IPC_SEND.LauncherHide),
    getState: () => ipcRenderer.invoke(IPC.LauncherGetState),
    rescanApps: () => ipcRenderer.invoke(IPC.LauncherRescanApps),
    onShow: (cb) => subscribe<void>(IPC_EVENTS.LauncherShow, cb),
    onState: (cb) => subscribe<LauncherState>(IPC_EVENTS.LauncherState, cb)
  },
  ai: {
    send: (input) => ipcRenderer.invoke(IPC.AiChatSend, input),
    stop: (convId) => ipcRenderer.invoke(IPC.AiChatStop, convId),
    convList: () => ipcRenderer.invoke(IPC.AiConvList),
    convMessages: (convId) => ipcRenderer.invoke(IPC.AiConvMessages, convId),
    convDelete: (convId) => ipcRenderer.invoke(IPC.AiConvDelete, convId),
    convSearch: (q) => ipcRenderer.invoke(IPC.AiConvSearch, q),
    configGet: () => ipcRenderer.invoke(IPC.AiConfigGet),
    configSet: (input) => ipcRenderer.invoke(IPC.AiConfigSet, input),
    onDelta: (cb) => subscribe<AiDeltaEvent>(IPC_EVENTS.AiDelta, cb)
  },
  tasks: {
    enqueue: (spec) => ipcRenderer.invoke(IPC.TasksEnqueue, spec),
    list: () => ipcRenderer.invoke(IPC.TasksList),
    cancel: (id) => ipcRenderer.invoke(IPC.TasksCancel, id),
    output: (id) => ipcRenderer.invoke(IPC.TasksOutput, id),
    onUpdate: (cb) => subscribe<TaskInfo>(IPC_EVENTS.TaskUpdate, cb)
  },
  nav: {
    onNavigate: (cb) => subscribe<NavigateRequest>(IPC_EVENTS.Navigate, cb)
  }
}

contextBridge.exposeInMainWorld('t1doo', api)
