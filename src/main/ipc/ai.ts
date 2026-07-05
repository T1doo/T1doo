import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AiApiConfigInput, ChatSendInput, TaskSpec } from '../../shared/ai'
import type { AiDao } from '../db/ai-dao'
import type { ChatService } from '../services/ai/conversations'
import type { TaskQueue } from '../services/ai/task-queue'
import type { AiApiConfigService } from '../services/ai/api-config'

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

  ipcMain.handle(IPC.TasksEnqueue, (_e, spec: TaskSpec) => tasks.enqueue(spec))
  ipcMain.handle(IPC.TasksList, () => tasks.list())
  ipcMain.handle(IPC.TasksCancel, (_e, id: string) => tasks.cancel(id))
  ipcMain.handle(IPC.TasksOutput, (_e, id: string) => tasks.output(id))
}
