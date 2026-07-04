import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private quitting = false

  constructor(private shouldCloseToTray: () => boolean) {}

  /** app 即将退出时置位，使 close 不再拦截为隐藏 */
  setQuitting(quitting: boolean): void {
    this.quitting = quitting
  }

  createMainWindow(showOnReady = true): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return this.mainWindow

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 940,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    win.on('ready-to-show', () => {
      if (showOnReady) win.show()
    })

    // 常驻工具：默认关闭即隐藏到托盘（可在设置关闭此行为）
    win.on('close', (e) => {
      if (!this.quitting && this.shouldCloseToTray()) {
        e.preventDefault()
        win.hide()
      }
    })

    win.on('closed', () => {
      this.mainWindow = null
    })

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    this.mainWindow = win
    return win
  }

  showMainWindow(): void {
    const win = this.createMainWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  broadcast(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }
}
