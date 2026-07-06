import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdaterState } from '../../shared/types'

export interface UpdaterOptions {
  /** 状态变化广播到全部窗口 */
  emit: (state: UpdaterState) => void
  /** quitAndInstall 前解除 closeToTray 拦截 */
  onBeforeInstall: () => void
  log?: (msg: string) => void
}

/**
 * 自动更新（M6 §13）：GitHub Releases 源，"提示后安装"不强更。
 * 策略：启动 30s 后静默检查，autoDownload 后台下载，下载完成只提示；
 * 用户在设置页点「重启并安装」才 quitAndInstall（autoInstallOnAppQuit 兜底：下次退出时装）。
 * 仅打包版启用；portable zip 无 NSIS 卸载信息，检查可用但安装会失败——README 注明手动更新。
 */
export class UpdaterService {
  private state: UpdaterState

  constructor(private opts: UpdaterOptions) {
    this.state = {
      status: app.isPackaged ? 'idle' : 'disabled',
      version: null,
      percent: null,
      error: null
    }
    if (!app.isPackaged) return

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }))
    autoUpdater.on('update-available', (info) =>
      this.set({ status: 'downloading', version: info.version, percent: 0 })
    )
    autoUpdater.on('update-not-available', () =>
      this.set({ status: 'none', version: null, percent: null })
    )
    autoUpdater.on('download-progress', (p) =>
      this.set({ status: 'downloading', percent: Math.round(p.percent) })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.set({ status: 'downloaded', version: info.version, percent: 100 })
    )
    autoUpdater.on('error', (err) => {
      this.set({ status: 'error', error: err.message })
      this.opts.log?.(`更新出错：${err.message}`)
    })
  }

  getState(): UpdaterState {
    return { ...this.state }
  }

  /** 手动/定时检查；未打包时是 no-op */
  check(): UpdaterState {
    if (!app.isPackaged) return this.getState()
    // 下载中/已下载不重复触发
    if (this.state.status !== 'downloading' && this.state.status !== 'downloaded') {
      void autoUpdater.checkForUpdates().catch(() => {
        // error 事件已统一处理
      })
    }
    return this.getState()
  }

  /** 用户确认后重启安装（仅 downloaded 状态有效） */
  install(): void {
    if (this.state.status !== 'downloaded') return
    this.opts.onBeforeInstall()
    autoUpdater.quitAndInstall()
  }

  private set(patch: Partial<UpdaterState>): void {
    this.state = { ...this.state, ...patch }
    this.opts.emit(this.getState())
  }
}
