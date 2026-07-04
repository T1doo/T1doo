import { dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import { IPC } from '../../shared/ipc'
import { sessionToMarkdown } from '../services/claude/export'
import { resumeSessionExternal } from '../services/claude/resume'
import { streamCompleteLines } from '../services/claude/reader'
import type { ExportFormat, SessionFilter } from '../../shared/sessions'
import type { SessionsDao } from '../db/dao'
import type { ClaudeDataService } from '../services/claude/sync'

export function registerSessionsIpc(dao: SessionsDao, service: ClaudeDataService): void {
  ipcMain.handle(IPC.SessionsList, (_e, filter?: SessionFilter) => dao.listSessions(filter))

  ipcMain.handle(IPC.SessionsProjects, () => dao.listProjects())

  ipcMain.handle(IPC.SessionsGet, (_e, id: string) => service.getDetail(id))

  ipcMain.handle(IPC.SessionsSearch, (_e, q: string, projectId?: number) =>
    dao.search(q, projectId)
  )

  ipcMain.handle(IPC.SessionsUpdate, (_e, id: string, patch: { pinned?: boolean; note?: string }) =>
    dao.updateSessionMeta(id, patch)
  )

  ipcMain.handle(IPC.SessionsResume, (_e, id: string) => {
    const paths = dao.getSessionPath(id)
    resumeSessionExternal(id, paths?.projectPath ?? null)
  })

  ipcMain.handle(IPC.SessionsExport, async (_e, id: string, fmt: ExportFormat) => {
    const summary = dao.getSessionSummary(id)
    if (!summary) throw new Error(`会话不存在：${id}`)
    const safeTitle = summary.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || id
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出会话',
      defaultPath: `${safeTitle}.${fmt}`,
      filters:
        fmt === 'md'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null

    if (fmt === 'md') {
      const detail = await service.getDetail(id)
      await writeFile(filePath, sessionToMarkdown(detail, true), 'utf8')
    } else {
      const paths = dao.getSessionPath(id)
      if (!paths?.jsonlPath) throw new Error(`会话缺少 JSONL 路径：${id}`)
      const rows: unknown[] = []
      await streamCompleteLines(paths.jsonlPath, 0, (line) => {
        try {
          rows.push(JSON.parse(line))
        } catch {
          // 坏行跳过，与索引口径一致
        }
      })
      await writeFile(filePath, JSON.stringify(rows, null, 1), 'utf8')
    }
    return filePath
  })
}
