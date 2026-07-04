/** 输入形态 → 意图路由（§7.3 路由表）。纯函数。 */

export type ParsedInput =
  | { intent: 'command'; query: string }
  | { intent: 'ai'; query: string }
  | { intent: 'search'; query: string }
  | { intent: 'url'; url: string }
  | { intent: 'path'; path: string }
  | { intent: 'mixed'; query: string }

/** 常见 TLD 白名单：裸域名形态只认这些，避免 dao.ts 之类文件名误判成网址 */
const TLDS = new Set([
  'com',
  'cn',
  'net',
  'org',
  'io',
  'dev',
  'ai',
  'me',
  'co',
  'app',
  'xyz',
  'top',
  'edu',
  'gov',
  'info',
  'tv',
  'cc',
  'sh',
  'run',
  'moe'
])

const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+([a-z]{2,})(?::\d+)?(?:[/?#]\S*)?$/i

function isDomainLike(input: string): boolean {
  if (/\s/.test(input)) return false
  if (input.toLowerCase().startsWith('www.')) return true
  const m = DOMAIN_RE.exec(input)
  return m !== null && TLDS.has(m[1].toLowerCase())
}

export function parseInput(raw: string): ParsedInput {
  const input = raw.trim()

  if (input.startsWith('>')) return { intent: 'command', query: input.slice(1).trim() }
  if (input.startsWith('@')) return { intent: 'ai', query: input.slice(1).trim() }
  if (input.startsWith('?') || input.startsWith('？')) {
    return { intent: 'search', query: input.slice(1).trim() }
  }

  if (/^https?:\/\/\S+$/i.test(input)) return { intent: 'url', url: input }
  if (isDomainLike(input)) return { intent: 'url', url: `https://${input}` }

  // Windows 绝对路径（盘符或 UNC）
  if (/^[a-z]:[\\/]/i.test(input) || input.startsWith('\\\\')) {
    return { intent: 'path', path: input }
  }

  return { intent: 'mixed', query: input }
}
