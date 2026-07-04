import { dialog, ipcMain } from 'electron'
import { IPC, IPC_SEND } from '../../shared/ipc'
import type { BackendProfileInput } from '../../shared/backend'
import type { TerminalProfile } from '../../shared/terminals'
import type { UsageStats } from '../../shared/api'
import type { TerminalManager } from '../services/terminal/manager'
import type { BackendProfilesService } from '../services/backend/profiles'
import type { HooksService } from '../services/hooks/server'
import type { SessionsDao } from '../db/dao'

export function registerTerminalsIpc(deps: {
  terminals: TerminalManager
  backends: BackendProfilesService
  hooks: HooksService
  dao: SessionsDao
}): void {
  const { terminals, backends, hooks, dao } = deps

  ipcMain.handle(IPC.TermCreate, (_e, profile: TerminalProfile) => terminals.create(profile))
  ipcMain.handle(IPC.TermClose, (_e, id: string) => terminals.close(id))
  ipcMain.handle(IPC.TermList, () => terminals.list())
  ipcMain.handle(IPC.TermAttach, (_e, id: string) => terminals.attach(id))
  ipcMain.handle(IPC.TermPickCwd, async (_e, defaultPath?: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择工作目录',
      defaultPath,
      properties: ['openDirectory']
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })

  // 高频一发通道：键入与 resize 不走 invoke 往返
  ipcMain.on(IPC_SEND.TermWrite, (_e, id: string, data: string) => {
    if (typeof id === 'string' && typeof data === 'string') terminals.write(id, data)
  })
  ipcMain.on(IPC_SEND.TermResize, (_e, id: string, cols: number, rows: number) => {
    if (typeof id === 'string') terminals.resize(id, cols, rows)
  })

  ipcMain.handle(IPC.BackendList, () => backends.list())
  ipcMain.handle(IPC.BackendSave, (_e, input: BackendProfileInput) => backends.save(input))
  ipcMain.handle(IPC.BackendDelete, (_e, id: string) => backends.delete(id))

  ipcMain.handle(IPC.HooksGetState, () => hooks.getState())
  ipcMain.handle(IPC.HooksSetEnabled, (_e, enabled: boolean) => hooks.setEnabled(enabled === true))

  ipcMain.handle(IPC.StatsUsage, (): UsageStats => {
    const daily = dao.usageDaily(7)
    const today = daily[daily.length - 1] ?? { input: 0, output: 0 }
    return {
      todayInput: today.input,
      todayOutput: today.output,
      weekInput: daily.reduce((sum, d) => sum + d.input, 0),
      weekOutput: daily.reduce((sum, d) => sum + d.output, 0),
      daily
    }
  })
}
