import { execFile } from 'child_process'

/**
 * 开始菜单应用扫描（§7.3 "够用"层）：
 * 一次 PowerShell 调用同时解析两处开始菜单的 .lnk（WScript.Shell COM）与 UWP（Get-StartApps）。
 */
export interface ScannedApp {
  kind: 'win32' | 'uwp'
  name: string
  /** win32 = .lnk 绝对路径（启动 .lnk 本体保留参数/工作目录）；uwp = AppUserModelID */
  target: string
  /** .lnk 解析出的 TargetPath（图标提取用）；uwp 为 null */
  exePath: string | null
}

/**
 * Get-StartApps 会把 win32 应用也列出来（AppID 是路径形态），与 .lnk 扫描重复；
 * 打包应用的 AppUserModelID 恒含 "!"，据此只保留真 UWP。
 */
export const SCAN_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$sh = New-Object -ComObject WScript.Shell
$items = New-Object System.Collections.Generic.List[object]
$dirs = @(
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs')
)
foreach ($d in $dirs) {
  if (-not (Test-Path -LiteralPath $d)) { continue }
  Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk -File | ForEach-Object {
    $t = $null
    try { $t = $sh.CreateShortcut($_.FullName).TargetPath } catch {}
    $items.Add([pscustomobject]@{ kind = 'win32'; name = $_.BaseName; target = $_.FullName; exe = $t })
  }
}
Get-StartApps | Where-Object { $_.AppID -like '*!*' } | ForEach-Object {
  $items.Add([pscustomobject]@{ kind = 'uwp'; name = $_.Name; target = [string]$_.AppID; exe = $null })
}
ConvertTo-Json -InputObject $items -Compress -Depth 3
`.trim()

/** 卸载器/帮助文档类快捷方式不进启动器 */
const NAME_SKIP_RE = /uninstall|卸载/i
const EXE_SKIP_RE = /\\(unins[0-9a-z]*|uninstall[^\\]*|setup|install(er)?)\.exe$/i
/** .lnk 指向文档/网页的不算应用 */
const TARGET_EXT_SKIP_RE = /\.(txt|html?|url|chm|pdf|md|rtf)$/i

/** PowerShell JSON 输出 → 过滤去重后的应用清单（纯函数，可单测） */
export function parseScanOutput(stdout: string): ScannedApp[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  // ConvertTo-Json 对单元素列表会退化为单对象
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  const out: ScannedApp[] = []
  const seenTargets = new Set<string>()
  const seenIdentity = new Set<string>()
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const r = row as Record<string, unknown>
    const kind = r.kind === 'win32' || r.kind === 'uwp' ? r.kind : null
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const target = typeof r.target === 'string' ? r.target.trim() : ''
    const exePath = typeof r.exe === 'string' && r.exe.trim() ? r.exe.trim() : null
    if (!kind || !name || !target) continue
    if (NAME_SKIP_RE.test(name)) continue
    if (exePath && (EXE_SKIP_RE.test(exePath) || TARGET_EXT_SKIP_RE.test(exePath))) continue

    if (seenTargets.has(target.toLowerCase())) continue
    // ProgramData 与 AppData 常有同名同 exe 的重复 .lnk，保留先出现的
    const identity = `${name.toLowerCase()}|${(exePath ?? target).toLowerCase()}`
    if (seenIdentity.has(identity)) continue
    seenTargets.add(target.toLowerCase())
    seenIdentity.add(identity)
    out.push({ kind, name, target, exePath })
  }
  return out
}

export function scanStartMenuApps(): Promise<ScannedApp[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', SCAN_SCRIPT],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(parseScanOutput(stdout))
      }
    )
  })
}
