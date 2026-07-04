import { useEffect, useState } from 'react'
import type { FilesState } from '@shared/files'
import type { AppSettings } from '@shared/types'

interface FilesSectionProps {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}

/** 设置页 · 文件中枢区块：订阅目录管理 / 排除规则 / Everything 状态（§7.4） */
function FilesSection({ settings, onUpdate }: FilesSectionProps): React.JSX.Element {
  const [state, setState] = useState<FilesState | null>(null)
  const [excludeDraft, setExcludeDraft] = useState(settings.filesExcludeDirs.join(', '))
  const [lastExclude, setLastExclude] = useState(settings.filesExcludeDirs.join(', '))
  const [detecting, setDetecting] = useState(false)

  // 设置从别处变更（sanitize 后回写等）：渲染期同步草稿
  const settingsExclude = settings.filesExcludeDirs.join(', ')
  if (settingsExclude !== lastExclude) {
    setLastExclude(settingsExclude)
    setExcludeDraft(settingsExclude)
  }

  useEffect(() => {
    let mounted = true
    void window.t1doo.files.getState().then((s) => {
      if (mounted) setState(s)
    })
    const offUpdated = window.t1doo.files.onUpdated(() => {
      void window.t1doo.files.getState().then((s) => {
        if (mounted) setState(s)
      })
    })
    return () => {
      mounted = false
      offUpdated()
    }
  }, [])

  const addDir = async (): Promise<void> => {
    const next = await window.t1doo.files.addDir()
    if (next) setState(next)
  }

  const commitExclude = (): void => {
    const dirs = excludeDraft
      .split(/[,，;；\n]/)
      .map((d) => d.trim())
      .filter(Boolean)
    onUpdate({ filesExcludeDirs: dirs })
  }

  const detectEverything = async (): Promise<void> => {
    setDetecting(true)
    try {
      const ev = await window.t1doo.files.detectEverything()
      setState((s) => (s ? { ...s, everything: ev } : s))
    } finally {
      setDetecting(false)
    }
  }

  const btn =
    'rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)] disabled:opacity-50'

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">文件中枢</h2>
      <p className="mb-4 text-xs text-[var(--fg-muted)]">
        订阅常用目录建立文件名索引；会话-文件联动不依赖订阅、开箱即用
      </p>

      <div className="mb-2 flex items-center justify-between">
        <span>
          订阅目录
          <span className="ml-2 text-xs text-[var(--fg-muted)]">
            共 {state?.totalFiles.toLocaleString() ?? 0} 个文件
            {state?.scanning ? ' · 扫描中…' : ''}
          </span>
        </span>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => void window.t1doo.files.rescan()}>
            全部重扫
          </button>
          <button type="button" className={btn} onClick={() => void addDir()}>
            添加目录
          </button>
        </div>
      </div>

      {!state?.dirs.length ? (
        <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--fg-muted)]">
          还没有订阅目录。建议添加：项目根目录、桌面、下载、文档
        </div>
      ) : (
        <ul className="space-y-1.5">
          {state.dirs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5"
            >
              <input
                type="checkbox"
                checked={d.enabled}
                title={d.enabled ? '暂停索引此目录' : '恢复索引此目录'}
                onChange={(e) =>
                  void window.t1doo.files.setDirEnabled(d.id, e.target.checked).then(setState)
                }
                className="accent-[var(--accent)]"
              />
              <span className={`min-w-0 flex-1 truncate ${d.enabled ? '' : 'opacity-50'}`}>
                {d.path}
              </span>
              <span className="shrink-0 text-xs text-[var(--fg-muted)]">
                {d.fileCount.toLocaleString()}
              </span>
              <button
                type="button"
                title="退订并移除索引（不动磁盘文件）"
                onClick={() => void window.t1doo.files.removeDir(d.id).then(setState)}
                className="shrink-0 text-[var(--fg-muted)] hover:text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span>
            排除目录名
            <span className="ml-2 text-xs text-[var(--fg-muted)]">逗号分隔；改动后自动重扫</span>
          </span>
        </div>
        <textarea
          value={excludeDraft}
          onChange={(e) => setExcludeDraft(e.target.value)}
          onBlur={commitExclude}
          rows={2}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span>
          Everything 全盘搜索
          <span
            className={`ml-2 text-xs ${state?.everything.available ? 'text-green-500' : 'text-[var(--fg-muted)]'}`}
          >
            {state?.everything.available
              ? `可用（${state.everything.esPath}）`
              : (state?.everything.reason ?? '未检测')}
          </span>
        </span>
        <button
          type="button"
          disabled={detecting}
          className={btn}
          onClick={() => void detectEverything()}
        >
          {detecting ? '检测中…' : '重新检测'}
        </button>
      </div>
      {!state?.everything.available && (
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          安装 voidtools Everything 与 es.exe（winget install voidtools.Everything
          voidtools.Everything.Cli）后可选启用全盘文件搜索
        </p>
      )}
    </section>
  )
}

export default FilesSection
