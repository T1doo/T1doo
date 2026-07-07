import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { t } from '../services/i18n'
import type { AiApiConfigInput, ChatSendInput, TaskSpec } from '../../shared/ai'
import type { BackendModelsResult } from '../../shared/backend'
import type { AiDao } from '../db/ai-dao'
import type { ChatService } from '../services/ai/conversations'
import type { TaskQueue } from '../services/ai/task-queue'
import type { AiApiConfigService } from '../services/ai/api-config'
import { probeModels } from '../services/backend/probe'
import { describeProbeFailure } from '../services/backend/probe-messages'

const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com'

export function registerAiIpc(deps: {
  chat: ChatService
  tasks: TaskQueue
  aiDao: AiDao
  apiConfig: AiApiConfigService
}): void {
  const { chat, tasks, aiDao, apiConfig } = deps

  ipcMain.handle(IPC.AiChatSend, (_e, input: ChatSendInput) => chat.send(input))
  ipcMain.handle(IPC.AiChatStop, (_e, convId: string) => chat.stop(convId))
  ipcMain.handle(IPC.AiConvList, () => aiDao.listConversations())
  ipcMain.handle(IPC.AiConvMessages, (_e, convId: string) => chat.messagesWithPending(convId))
  ipcMain.handle(IPC.AiConvDelete, (_e, convId: string) => chat.deleteConversation(convId))
  ipcMain.handle(IPC.AiConvSearch, (_e, q: string) => aiDao.search(q))
  ipcMain.handle(IPC.AiConfigGet, () => apiConfig.get())
  ipcMain.handle(IPC.AiConfigSet, (_e, input: AiApiConfigInput) => apiConfig.set(input))
  // §7.7.6 API 直连通道：用配置的 baseUrl+Key 拉取网关模型列表（失败降级自由输入，报具体原因）
  ipcMain.handle(IPC.AiModels, async (): Promise<BackendModelsResult> => {
    const cfg = apiConfig.get()
    const r = await probeModels(cfg.baseUrl || DEFAULT_ANTHROPIC_BASE, apiConfig.resolveKey())
    if (r.ok && r.models.length > 0) return { models: r.models, error: null }
    return { models: [], error: r.ok ? t('models.fetchModels.empty') : describeProbeFailure(r) }
  })

  ipcMain.handle(IPC.TasksEnqueue, (_e, spec: TaskSpec) => tasks.enqueue(spec))
  ipcMain.handle(IPC.TasksList, () => tasks.list())
  ipcMain.handle(IPC.TasksCancel, (_e, id: string) => tasks.cancel(id))
  ipcMain.handle(IPC.TasksOutput, (_e, id: string) => tasks.output(id))
}
