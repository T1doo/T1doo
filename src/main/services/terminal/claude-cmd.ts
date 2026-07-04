import { execFileSync } from 'child_process'
import type { ClaudeLaunchOptions } from '../../../shared/terminals'

/**
 * claude 命令解析与参数构造（§7.2.1 / §7.2.2）。
 * 参数一律走 spawn 数组，不经 shell 字符串拼接（§11）。
 */

export interface ClaudeCommand {
  /** 可执行文件（.exe 直接 spawn；.cmd shim 须经 cmd.exe /c） */
  file: string
  argsPrefix: string[]
}

let cached: ClaudeCommand | null | undefined

/** `where claude`：优先原生 .exe（CreateProcess 直接可执行），npm .cmd shim 退化走 cmd /c */
export function resolveClaudeCommand(): ClaudeCommand {
  if (cached !== undefined) {
    if (cached === null) throw claudeNotFound()
    return cached
  }
  let lines: string[] = []
  try {
    lines = execFileSync('where.exe', ['claude'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    // where 找不到时以非零退出
  }
  const exe = lines.find((l) => l.toLowerCase().endsWith('.exe'))
  const cmd = lines.find((l) => l.toLowerCase().endsWith('.cmd'))
  if (exe) {
    cached = { file: exe, argsPrefix: [] }
  } else if (cmd) {
    cached = { file: 'cmd.exe', argsPrefix: ['/c', cmd] }
  } else {
    cached = null
    throw claudeNotFound()
  }
  return cached
}

function claudeNotFound(): Error {
  return new Error('未找到 claude 命令：请先安装 Claude Code 并确认其在 PATH 中')
}

export interface BuiltClaudeArgs {
  args: string[]
  /** 本终端绑定的 sessionId（新建=预生成；恢复=resume 目标） */
  sessionId: string
}

/**
 * 构造 claude 启动参数（纯函数，vitest 直测）。
 * 新建预生成 UUID 传 --session-id，绑定即刻确定；恢复直接绑定 resume 目标（§7.2.3）。
 */
export function buildClaudeArgs(opts: ClaudeLaunchOptions, newSessionId: string): BuiltClaudeArgs {
  const args: string[] = []
  let sessionId: string
  if (opts.resumeSessionId) {
    sessionId = opts.resumeSessionId
    args.push('--resume', opts.resumeSessionId)
  } else {
    sessionId = newSessionId
    args.push('--session-id', newSessionId)
  }
  if (opts.model) args.push('--model', opts.model)
  if (opts.permissionMode && opts.permissionMode !== 'default') {
    args.push('--permission-mode', opts.permissionMode)
  }
  if (opts.name) args.push('-n', opts.name)
  if (opts.extraArgs?.length) args.push(...opts.extraArgs)
  return { args, sessionId }
}
