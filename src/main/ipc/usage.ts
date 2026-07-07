import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { PricingSaveInput, UsageQueryRequest } from '../../shared/usage'
import type { UsageDao } from '../db/usage-dao'
import type { UsageService } from '../services/usage/usage-service'

/** F9 用量中心 IPC（§7.8.3）：聚合查询单入口 usage:query（kind 参数）+ 价目表 CRUD */
export function registerUsageIpc(dao: UsageDao, service: UsageService): void {
  ipcMain.handle(IPC.UsageQuery, (_e, req: UsageQueryRequest) => {
    switch (req.kind) {
      case 'summary':
        return dao.summary(req.range, req.filter)
      case 'trend':
        return dao.trend(req.range, req.filter)
      case 'byModel':
        return dao.byModel(req.range, req.filter)
      case 'byProject':
        return dao.byProject(req.range, req.filter)
      case 'bySource':
        return dao.bySource(req.range, req.filter)
      case 'facets':
        return dao.facets(req.range)
    }
  })

  ipcMain.handle(IPC.UsagePricingList, () => dao.listPricing())
  ipcMain.handle(IPC.UsagePricingSave, (_e, input: PricingSaveInput) => dao.savePricing(input))
  ipcMain.handle(IPC.UsagePricingReset, (_e, modelId: string) => dao.resetPricing(modelId))
  ipcMain.handle(IPC.UsageScanState, () => service.scanState())
}
