import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'

function DashboardPage(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let mounted = true
    window.t1doo.app.info().then((i) => {
      if (mounted) setInfo(i)
    })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="p-8">
      <h1 className="mb-1 text-xl font-semibold">指挥台</h1>
      <p className="mb-6 text-[var(--fg-muted)]">
        活跃会话、Token 用量、最近文件与任务将在后续里程碑逐步汇聚到这里。
      </p>

      <div className="max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-5">
        <h2 className="mb-3 font-medium">M0 · 工程奠基</h2>
        <ul className="space-y-1.5 text-[var(--fg-muted)]">
          <li>✓ 单实例锁 / 系统托盘 / 关闭至托盘</li>
          <li>✓ 设置持久化（主题 · 开机自启）</li>
          <li>✓ 类型化 IPC（contextBridge 白名单）</li>
        </ul>
        {info && (
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--fg-muted)]">
            {info.name} v{info.version} · Electron {info.electron} · Node {info.node}
          </p>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
