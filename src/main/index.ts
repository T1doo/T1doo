import { BrowserWindow, app, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { APP_ID } from '../shared/constants'
import { IPC_EVENTS } from '../shared/ipc'
import { WindowManager } from './core/window-manager'
import { createTray } from './core/tray'
import { applyAutoLaunch } from './core/auto-launch'
import { SettingsService } from './services/settings'
import { registerIpcHandlers } from './ipc'

// 单实例锁：二次启动只聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  const settings = new SettingsService()
  const windows = new WindowManager(() => settings.get().closeToTray)

  app.on('second-instance', () => {
    windows.showMainWindow()
  })

  app.on('before-quit', () => {
    windows.setQuitting(true)
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_ID)

    // 开发环境 F12 开 DevTools；生产屏蔽 Ctrl+R
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    nativeTheme.themeSource = settings.get().theme
    applyAutoLaunch(settings.get().autoLaunch)
    settings.onChange((s) => {
      nativeTheme.themeSource = s.theme
      applyAutoLaunch(s.autoLaunch)
      windows.broadcast(IPC_EVENTS.SettingsUpdated, s)
    })

    registerIpcHandlers(settings)

    createTray({
      onShow: () => windows.showMainWindow(),
      onQuit: () => {
        windows.setQuitting(true)
        app.quit()
      }
    })

    // 开机自启带 --hidden：静默启动到托盘
    const startHidden = process.argv.includes('--hidden')
    windows.createMainWindow(!startHidden)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.showMainWindow()
    })
  })
}
