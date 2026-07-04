import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENTS } from '../shared/ipc'
import type { T1dooApi } from '../shared/api'
import type { AppSettings } from '../shared/types'
import type { SyncProgress } from '../shared/sessions'

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
    info: () => ipcRenderer.invoke(IPC.AppInfo)
  },
  sessions: {
    list: (filter) => ipcRenderer.invoke(IPC.SessionsList, filter),
    projects: () => ipcRenderer.invoke(IPC.SessionsProjects),
    get: (id) => ipcRenderer.invoke(IPC.SessionsGet, id),
    search: (q, projectId) => ipcRenderer.invoke(IPC.SessionsSearch, q, projectId),
    export: (id, fmt) => ipcRenderer.invoke(IPC.SessionsExport, id, fmt),
    resume: (id) => ipcRenderer.invoke(IPC.SessionsResume, id),
    update: (id, patch) => ipcRenderer.invoke(IPC.SessionsUpdate, id, patch),
    onUpdated: (cb) => subscribe<string[]>(IPC_EVENTS.SessionsUpdated, cb),
    onProgress: (cb) => subscribe<SyncProgress>(IPC_EVENTS.IndexProgress, cb)
  }
}

contextBridge.exposeInMainWorld('t1doo', api)
