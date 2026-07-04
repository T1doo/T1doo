import { app, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { APP_NAME } from '../../shared/constants'
import type { AppInfo, AppSettings } from '../../shared/types'
import type { SettingsService } from '../services/settings'

export function registerIpcHandlers(settings: SettingsService): void {
  ipcMain.handle(IPC.SettingsGet, (): AppSettings => settings.get())

  ipcMain.handle(IPC.SettingsSet, (_event, patch: Partial<AppSettings>): AppSettings =>
    settings.set(patch)
  )

  ipcMain.handle(IPC.AppInfo, (): AppInfo => ({
    name: APP_NAME,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  }))
}
