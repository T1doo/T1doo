import { useEffect, useState } from 'react'
import type { HooksState } from '@shared/terminals'

/** §7.2.4 hooks 状态感知开关：显式开启才写 ~/.claude/settings.json，可一键还原 */
function HooksSection(): React.JSX.Element {
  const [state, setState] = useState<HooksState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.t1doo.hooks.getState().then(setState)
  }, [])

  const toggle = (enabled: boolean): void => {
    setBusy(true)
    void window.t1doo.hooks
      .setEnabled(enabled)
      .then(setState)
      .finally(() => setBusy(false))
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
      <h2 className="mb-1 font-medium">实时状态感知（hooks）</h2>
      <p className="mb-3 text-xs leading-relaxed text-[var(--fg-muted)]">
        开启后向 <code>~/.claude/settings.json</code> 注册 6 个 hook（回环地址上报，Bearer
        校验），终端标签与 Dashboard 可实时显示 working / waiting / idle 并在等待输入时通知。
        写入前自动备份（.bak-t1doo），关闭时精确移除、既有配置原样保留。
        不开启则回退为文件轮询推断（延迟较高、无法识别等待状态）。
      </p>

      {state && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--fg-muted)]">
            {state.enabled ? (
              <>
                <span className={state.running ? 'text-emerald-600' : 'text-red-500'}>
                  {state.running ? '● 运行中' : '● 未运行'}
                </span>
                {state.port && <span className="ml-2">127.0.0.1:{state.port}</span>}
                <span className="ml-2">{state.registered ? '已注册' : '未注册'}</span>
              </>
            ) : (
              <span>未开启</span>
            )}
            {state.error && <div className="mt-1 text-red-500">{state.error}</div>}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => toggle(!state.enabled)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
              state.enabled
                ? 'border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]'
                : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {state.enabled ? '关闭并还原' : '开启'}
          </button>
        </div>
      )}
    </section>
  )
}

export default HooksSection
