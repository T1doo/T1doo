import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { IPC } from '../../shared/ipc'
import { APP_NAME } from '../../shared/constants'
import type { AppInfo, AppSettings, ClaudeProbeResult, UpdaterState } from '../../shared/types'
import type { SettingsService } from '../services/settings'
import type { UpdaterService } from '../services/updater'
import { resolveClaudeCommand } from '../services/terminal/claude-cmd'

/** `claude --version`（5s 超时）；未安装/超时 → found:false，不抛错 */
function probeClaude(): Promise<ClaudeProbeResult> {
  return new Promise((resolve) => {
    let cmd: ReturnType<typeof resolveClaudeCommand>
    try {
      cmd = resolveClaudeCommand()
    } catch {
      resolve({ found: false, version: null })
      return
    }
    execFile(
      cmd.file,
      [...cmd.argsPrefix, '--version'],
      { timeout: 5_000, encoding: 'utf8' },
      (err, stdout) => {
        if (err) resolve({ found: false, version: null })
        else resolve({ found: true, version: stdout.trim() || null })
      }
    )
  })
}

export function registerIpcHandlers(settings: SettingsService, updater: UpdaterService): void {
  ipcMain.handle(IPC.SettingsGet, (): AppSettings => settings.get())

  ipcMain.handle(IPC.SettingsSet, (_event, patch: Partial<AppSettings>): AppSettings =>
    settings.set(patch)
  )

  ipcMain.handle(IPC.AppProbeClaude, (): Promise<ClaudeProbeResult> => probeClaude())

  ipcMain.handle(IPC.UpdaterGetState, (): UpdaterState => updater.getState())
  ipcMain.handle(IPC.UpdaterCheck, (): UpdaterState => updater.check())
  ipcMain.handle(IPC.UpdaterInstall, (): void => updater.install())

  ipcMain.handle(IPC.AppInfo, (): AppInfo => ({
    name: APP_NAME,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  }))
}
