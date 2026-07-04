import { clipboard, dialog, ipcMain, shell } from 'electron'
import { dirname } from 'path'
import { IPC } from '../../shared/ipc'
import type { FileHit, FileMetaPatch, FileSearchOptions, FilesState } from '../../shared/files'
import type { FilesDao } from '../db/files-dao'
import type { IndexerService } from '../services/indexer/service'
import type { EverythingBridge } from '../services/indexer/everything'
import type { TerminalManager } from '../services/terminal/manager'

const EVERYTHING_LIMIT = 50

export function registerFilesIpc(deps: {
  dao: FilesDao
  indexer: IndexerService
  everything: EverythingBridge
  terminals: TerminalManager
}): void {
  const { dao, indexer, everything, terminals } = deps

  const state = (): FilesState => ({
    dirs: dao.listDirs(),
    totalFiles: dao.countFiles(),
    scanning: indexer.scanning,
    everything: everything.getState()
  })

  ipcMain.handle(IPC.FilesSearch, async (_e, q: string, opts?: FileSearchOptions) => {
    const hits = dao.search(q, opts)
    if (!opts?.everything || !everything.getState().available) return hits

    // 全盘结果追加在索引结果后，去重（索引命中优先），来源标注 everything（验收④）
    const seen = new Set(hits.map((h) => h.path.toLowerCase()))
    const external = await everything.search(q, EVERYTHING_LIMIT)
    const fresh = external.filter((h) => !seen.has(h.path.toLowerCase()))
    const deco = dao.decorate(fresh.map((h) => h.path))
    const externalHits: FileHit[] = fresh.map((h) => {
      const d = deco.get(h.path)!
      const name = h.path.slice(Math.max(h.path.lastIndexOf('\\'), h.path.lastIndexOf('/')) + 1)
      const dot = name.lastIndexOf('.')
      return {
        path: h.path,
        name,
        ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : null,
        size: h.size,
        mtime: h.mtime,
        pinned: d.pinned,
        tags: d.tags,
        sessionCount: d.sessionCount,
        source: 'everything'
      }
    })
    return [...hits, ...externalHits]
  })

  ipcMain.handle(IPC.FilesActivity, (_e, limit?: number) => dao.activity(limit ?? 100))

  ipcMain.handle(IPC.FilesSessionsFor, (_e, path: string) => dao.sessionsForFile(path))

  ipcMain.handle(IPC.FilesPinned, () => dao.pinnedFiles())

  ipcMain.handle(IPC.FilesRecentOpened, (_e, limit?: number) => dao.recentOpened(limit ?? 50))

  ipcMain.handle(IPC.FilesGetState, () => state())

  ipcMain.handle(IPC.FilesAddDir, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择要订阅索引的目录',
      properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) return null
    indexer.addDir(filePaths[0])
    return state()
  })

  ipcMain.handle(IPC.FilesRemoveDir, (_e, id: number) => {
    indexer.removeDir(id)
    return state()
  })

  ipcMain.handle(IPC.FilesSetDirEnabled, (_e, id: number, enabled: boolean) => {
    indexer.setDirEnabled(id, enabled)
    return state()
  })

  ipcMain.handle(IPC.FilesRescan, (_e, dirId?: number) => {
    indexer.rescan(dirId)
  })

  ipcMain.handle(IPC.FilesSetMeta, (_e, path: string, patch: FileMetaPatch) => {
    dao.setMeta(path, patch)
  })

  ipcMain.handle(IPC.FilesOpen, (_e, path: string) => {
    dao.recordOpen(path, Date.now())
    return shell.openPath(path) // 返回空串成功，否则为错误信息
  })

  ipcMain.handle(IPC.FilesReveal, (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.FilesCopyPath, (_e, path: string) => {
    clipboard.writeText(path)
  })

  ipcMain.handle(IPC.FilesOpenTerminal, (_e, path: string) =>
    terminals.create({ cwd: dirname(path), kind: 'shell' })
  )

  ipcMain.handle(IPC.FilesDetectEverything, () => everything.detect())
}
