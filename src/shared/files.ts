/** F4 文件中枢的共享视图模型（§7.4） */

export interface WatchedDir {
  id: number
  path: string
  enabled: boolean
  fileCount: number
}

export type FileHitSource = 'index' | 'everything'

export interface FileHit {
  path: string
  name: string
  ext: string | null
  size: number | null
  mtime: number | null
  pinned: boolean
  tags: string[]
  /** 动过此文件的会话数（session_files 反查；0 = 无联动） */
  sessionCount: number
  source: FileHitSource
}

export interface FileSearchOptions {
  /** 扩展名白名单（小写、不含点）；空/缺省 = 不过滤 */
  exts?: string[]
  /** 只保留 mtime 晚于该时间戳的结果 */
  mtimeAfter?: number
  /** 追加 Everything 全盘结果（仅检测可用时生效，来源标注 everything） */
  everything?: boolean
  limit?: number
}

/** 「最近被会话修改的文件」流（F4 第零层核心卖点，§7.4） */
export interface SessionFileActivity {
  path: string
  name: string
  lastOp: string
  lastTs: number | null
  opCount: number
  sessionCount: number
  lastSessionId: string
  lastSessionTitle: string | null
  pinned: boolean
  tags: string[]
}

/** 「这个文件被哪些会话动过」反查条目 */
export interface FileSessionRef {
  sessionId: string
  title: string
  projectPath: string | null
  editCount: number
  writeCount: number
  readCount: number
  firstTs: number | null
  lastTs: number | null
}

export interface EverythingState {
  available: boolean
  esPath: string | null
  /** 不可用原因（未安装 / Everything 未运行），available=true 时为 null */
  reason: string | null
}

export interface FilesState {
  dirs: WatchedDir[]
  totalFiles: number
  scanning: boolean
  everything: EverythingState
}

export interface FilesIndexProgress {
  dirId: number
  phase: 'scanning' | 'done'
  scanned: number
}

export interface FileMetaPatch {
  pinned?: boolean
  tags?: string[]
}

/** 类型筛选分类 → 扩展名集合（UI 与 IPC 共用口径） */
export const FILE_CATEGORIES: Record<string, string[]> = {
  code: [
    'ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'hpp',
    'cs', 'rb', 'php', 'swift', 'kt', 'sql', 'sh', 'ps1', 'bat', 'cmd', 'vue', 'svelte',
    'json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'scss', 'less'
  ],
  doc: ['md', 'txt', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'rtf', 'org'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff'],
  media: ['mp3', 'mp4', 'wav', 'flac', 'ogg', 'mkv', 'mov', 'avi', 'webm', 'm4a']
}
