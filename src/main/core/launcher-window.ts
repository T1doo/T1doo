import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC_EVENTS } from '../../shared/ipc'

const WIDTH = 680
const HEIGHT = 480

/**
 * F3 启动器窗口（§7.3）：frameless、置顶、常驻隐藏（show/hide 而非重建，保证 <100ms 唤起）、
 * 失焦即隐。独立小入口 launcher.html，不背主应用的包。
 */
export class LauncherWindow {
  private win: BrowserWindow | null = null
  private quitting = false

  setQuitting(quitting: boolean): void {
    this.quitting = quitting
  }

  /** 应用启动即预创建（隐藏），唤起时零加载开销 */
  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win

    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    // 盖过全屏应用与任务栏
    win.setAlwaysOnTop(true, 'screen-saver')

    win.on('blur', () => {
      // 开发时打开 DevTools 会触发 blur，别把窗口藏了
      if (win.webContents.isDevToolsOpened()) return
      this.hide()
    })
    win.on('close', (e) => {
      if (!this.quitting) {
        e.preventDefault()
        this.hide()
      }
    })
    win.on('closed', () => {
      this.win = null
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/launcher.html`)
    } else {
      win.loadFile(join(__dirname, '../renderer/launcher.html'))
    }

    this.win = win
    return win
  }

  toggle(): void {
    if (this.win?.isVisible()) this.hide()
    else this.show()
  }

  show(): void {
    const win = this.create()
    // 出现在鼠标所在显示器的上三分之一处（多显示器友好）
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { workArea } = display
    win.setPosition(
      Math.round(workArea.x + (workArea.width - WIDTH) / 2),
      Math.round(workArea.y + workArea.height * 0.18)
    )
    win.webContents.send(IPC_EVENTS.LauncherShow)
    win.show()
    win.focus()
  }

  hide(): void {
    if (this.win?.isVisible()) this.win.hide()
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false
  }
}
