import { useEffect, useRef, useState } from 'react'
import type { LauncherState } from '@shared/launcher'

/** 键盘事件 → Electron Accelerator（修饰键 + 主键；单独按修饰键不成立） */
function eventToAccelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  const key = e.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null
  if (mods.length === 0) return null // 裸键不允许做全局热键
  let main = key.length === 1 ? key.toUpperCase() : key
  if (key === ' ') main = 'Space'
  if (key === 'Escape') return null // Esc 保留为取消录制
  return [...mods, main].join('+')
}

function formatScanTime(ts: number | null): string {
  if (!ts) return '尚未扫描'
  const min = Math.round((Date.now() - ts) / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.round(min / 60)
  return hours < 24 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`
}

function LauncherSection(): React.JSX.Element {
  const [state, setState] = useState<LauncherState | null>(null)
  const [recording, setRecording] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const hotkeyRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let mounted = true
    void window.t1doo.launcher.getState().then((s) => {
      if (mounted) setState(s)
    })
    const unsubscribe = window.t1doo.launcher.onState(setState)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  if (!state) return <></>

  const setHotkey = async (accelerator: string): Promise<void> => {
    await window.t1doo.settings.set({ launcherHotkey: accelerator })
    setState(await window.t1doo.launcher.getState())
  }

  const rescan = async (): Promise<void> => {
    setRescanning(true)
    try {
      await window.t1doo.launcher.rescanApps()
      setState(await window.t1doo.launcher.getState())
    } finally {
      setRescanning(false)
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">启动器</h2>
      <p className="mb-4 text-xs text-[var(--fg-muted)]">
        全局热键唤起命令面板：秒跳项目 / 会话 / 终端 / 提示词，启动应用与打开网址
      </p>

      <div className="flex items-center justify-between py-1.5">
        <span>
          全局热键
          {!state.hotkeyRegistered && (
            <span className="ml-2 text-xs text-red-500">
              注册失败（可能与 PowerToys Run 等冲突），请改绑
            </span>
          )}
        </span>
        <button
          ref={hotkeyRef}
          type="button"
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return
            e.preventDefault()
            if (e.key === 'Escape') {
              setRecording(false)
              return
            }
            const acc = eventToAccelerator(e)
            if (acc) {
              setRecording(false)
              void setHotkey(acc)
            }
          }}
          className={`min-w-32 rounded-md border px-3 py-1.5 font-mono text-sm ${
            recording
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : state.hotkeyRegistered
                ? 'border-[var(--border)]'
                : 'border-red-500 text-red-500'
          }`}
        >
          {recording ? '按下新热键…' : state.hotkey}
        </button>
      </div>

      <div className="flex items-center justify-between py-1.5">
        <span>
          应用索引
          <span className="ml-2 text-xs text-[var(--fg-muted)]">
            {state.appCount} 个应用 · {formatScanTime(state.lastScanAt)}
          </span>
        </span>
        <button
          type="button"
          disabled={rescanning || state.scanning}
          onClick={() => void rescan()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)] disabled:opacity-50"
        >
          {rescanning || state.scanning ? '扫描中…' : '重新扫描'}
        </button>
      </div>
    </section>
  )
}

export default LauncherSection
