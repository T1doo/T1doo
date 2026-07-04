/** 时间与数字展示工具 */

export function formatRelative(ts: number | null): string {
  if (ts == null) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

export function formatDateTime(ts: number | null): string {
  if (ts == null) return ''
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatBytes(n: number | null): string {
  if (n == null) return ''
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`
  return `${n} B`
}

/** 项目路径 → 短名（尾目录名） */
export function projectShortName(path: string | null): string {
  if (!path) return '(未知项目)'
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** 文件路径 → 所在目录 */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i > 0 ? path.slice(0, i) : path
}
