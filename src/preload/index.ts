import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENTS } from '../shared/ipc'
import type { T1dooApi } from '../shared/api'
import type { AppSettings } from '../shared/types'

// 渲染层唯一入口：白名单 API，不透传 ipcRenderer 本体
const api: T1dooApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.SettingsSet, patch),
    onUpdated: (cb) => {
      const listener = (_event: IpcRendererEvent, settings: AppSettings): void => cb(settings)
      ipcRenderer.on(IPC_EVENTS.SettingsUpdated, listener)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.SettingsUpdated, listener)
      }
    }
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.AppInfo)
  }
}

contextBridge.exposeInMainWorld('t1doo', api)
