import { ipcMain } from 'electron'
import { IPC, IPC_SEND } from '../../shared/ipc'
import { t } from '../services/i18n'
import type { LauncherItem, LauncherState } from '../../shared/launcher'
import type { LauncherService } from '../services/launcher/service'

export function registerLauncherIpc(opts: {
  service: LauncherService
  getState: () => LauncherState
  hide: () => void
  /** 状态变化（扫描完成等）广播给主窗设置页 */
  emitState: () => void
}): void {
  const { service } = opts

  ipcMain.handle(IPC.LauncherQuery, (_e, q: unknown) =>
    service.query(typeof q === 'string' ? q : '')
  )

  ipcMain.handle(IPC.LauncherExecute, async (_e, item: LauncherItem) => {
    // 白名单校验最小载荷形状，防渲染层传畸形对象
    if (!item || typeof item.kind !== 'string' || typeof item.target !== 'string') {
      return { ok: false, message: t('err.launcherInvalidItem') }
    }
    return service.execute(item)
  })

  ipcMain.handle(IPC.LauncherGetState, () => opts.getState())

  ipcMain.handle(IPC.LauncherRescanApps, async () => {
    const scan = service.scanApps() // scanning 标志在首个 await 前同步置位
    opts.emitState()
    try {
      return await scan
    } finally {
      opts.emitState()
    }
  })

  ipcMain.on(IPC_SEND.LauncherHide, () => opts.hide())
}
