import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'

/**
 * 在外部 Windows Terminal 中恢复会话（M1；M2 起默认走内置终端）。
 * `wt` 不可用时回退 PowerShell 窗口。参数一律走 spawn 数组，不经 shell 拼接（§11）。
 */
export function resumeSessionExternal(sessionId: string, cwd: string | null): void {
  const dir = cwd && existsSync(cwd) ? cwd : homedir()

  const wt = spawn('wt', ['-d', dir, 'claude', '--resume', sessionId], {
    detached: true,
    stdio: 'ignore'
  })
  wt.on('error', () => {
    const escaped = dir.replace(/'/g, "''")
    const fallback = spawn(
      'powershell.exe',
      [
        '-NoExit',
        '-Command',
        `Set-Location -LiteralPath '${escaped}'; claude --resume ${sessionId}`
      ],
      { detached: true, stdio: 'ignore' }
    )
    fallback.unref()
  })
  wt.unref()
}
