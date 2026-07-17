import { dialog, ipcMain } from 'electron'
import { IPC, IPC_SEND } from '../../shared/ipc'
import { t } from '../services/i18n'
import type {
  BackendModelsRequest,
  BackendModelsResult,
  BackendProfileInput,
  BackendTestResult
} from '../../shared/backend'
import type { TerminalProfile } from '../../shared/terminals'
import type { TerminalManager } from '../services/terminal/manager'
import type { BackendProfilesService } from '../services/backend/profiles'
import type { GlobalSwitchService } from '../services/backend/global-switch'
import { probeModels } from '../services/backend/probe'
import { describeProbeFailure } from '../services/backend/probe-messages'
import { extractProfileFromEnv } from '../services/backend/settings-env'

export function registerTerminalsIpc(deps: {
  terminals: TerminalManager
  backends: BackendProfilesService
  globalSwitch: GlobalSwitchService
  /** hooks 退役清理是否实际发生过（§7.9.4：清理完成后 UI 一次性告知） */
  retireNotice: { get: () => boolean; dismiss: () => void }
}): void {
  const { terminals, backends, globalSwitch, retireNotice } = deps

  ipcMain.handle(IPC.TermCreate, (_e, profile: TerminalProfile) => terminals.create(profile))
  ipcMain.handle(IPC.TermClose, (_e, id: string) => terminals.close(id))
  ipcMain.handle(IPC.TermList, () => terminals.list())
  ipcMain.handle(IPC.TermAttach, (_e, id: string) => terminals.attach(id))
  ipcMain.handle(IPC.TermPickCwd, async (_e, defaultPath?: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('sys.dialog.pickCwd'),
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
  ipcMain.handle(IPC.BackendSave, (_e, input: BackendProfileInput) => {
    const list = backends.save(input)
    // 编辑的是当前全局生效档案 → 自动重写 live，保持 settings.json 与档案同步（§7.7.5）
    const appliedId = globalSwitch.getState().appliedProfileId
    if (input.id && appliedId === input.id) {
      globalSwitch.switchTo(input.id, { force: true })
    }
    return list
  })
  ipcMain.handle(IPC.BackendDelete, (_e, id: string) => {
    // 当前全局生效档案禁止直接删除：live 里还挂着它的 env 键（§7.7.2）
    if (globalSwitch.getState().appliedProfileId === id) {
      throw new Error(t('models.deleteAppliedBlocked'))
    }
    return backends.delete(id)
  })

  // —— §7.7.4 连通性测试 / 模型列表 ——
  ipcMain.handle(IPC.BackendTest, async (_e, id: string): Promise<BackendTestResult> => {
    const view = backends.get(id)
    if (!view) throw new Error(t('err.terminalNotFound', { id }))
    if (view.auth === 'subscription') {
      return { ok: false, latencyMs: null, modelCount: null, error: t('models.test.subscription') }
    }
    if (!view.baseUrl) {
      return { ok: false, latencyMs: null, modelCount: null, error: t('models.test.noBaseUrl') }
    }
    const r = await probeModels(view.baseUrl, backends.resolve(id)?.token ?? null)
    if (r.ok) {
      return { ok: true, latencyMs: r.latencyMs, modelCount: r.models.length, error: null }
    }
    return { ok: false, latencyMs: null, modelCount: null, error: describeProbeFailure(r) }
  })

  ipcMain.handle(
    IPC.BackendModels,
    async (_e, req: BackendModelsRequest | string): Promise<BackendModelsResult> => {
      // 兼容旧签名（string=profileId）；对象形态支持未保存档案即填即拉（编辑器场景）
      const input = typeof req === 'string' ? { profileId: req } : (req ?? {})
      const profile = input.profileId ? backends.get(input.profileId) : null
      const baseUrl = input.baseUrl?.trim() || profile?.baseUrl
      if (!baseUrl) return { models: [], error: t('models.test.noBaseUrl') }
      const token =
        input.token || (input.profileId ? (backends.resolve(input.profileId)?.token ?? null) : null)
      const r = await probeModels(baseUrl, token)
      if (r.ok && r.models.length > 0) {
        if (profile) backends.setModelCache(profile.id, r.models)
        return { models: r.models, error: null }
      }
      // 拉取失败 / 空列表：降级自由输入并报具体原因（R10 口径）
      return { models: [], error: r.ok ? t('models.fetchModels.empty') : describeProbeFailure(r) }
    }
  )

  // —— §7.7.5 全局切换 ——
  ipcMain.handle(IPC.BackendGlobalState, () => globalSwitch.getState())
  ipcMain.handle(
    IPC.BackendSwitch,
    (_e, id: string, opts?: { authorize?: boolean; force?: boolean }) =>
      globalSwitch.switchTo(id, opts ?? {})
  )
  ipcMain.handle(IPC.BackendRestore, () => globalSwitch.restore())
  ipcMain.handle(IPC.BackendImportLive, () => {
    const extracted = extractProfileFromEnv(globalSwitch.readLiveSettings())
    return backends.save({
      name: `${t('models.importedName')} ${new Date().toLocaleString()}`,
      auth: 'custom',
      baseUrl: extracted.baseUrl ?? undefined,
      token: extracted.token ?? undefined,
      model: extracted.model ?? undefined,
      smallFastModel: extracted.smallFastModel ?? undefined,
      defaultSonnetModel: extracted.defaultSonnetModel ?? undefined,
      defaultOpusModel: extracted.defaultOpusModel ?? undefined,
      extraEnv: extracted.extraEnv,
      category: 'custom'
    })
  })

  // —— §7.9.4 hooks 退役 ——
  ipcMain.handle(IPC.StatusRetireNotice, () => retireNotice.get())
  ipcMain.handle(IPC.StatusDismissRetireNotice, () => {
    retireNotice.dismiss()
  })
  // stats:usage 已退役（M8）：Dashboard 用量卡片改由 usage:query（usage_log 全量口径）出数
  // hooks:get-state / hooks:set-enabled 已退役（M9）：状态感知无开关、无配置（§7.9.2）
}
