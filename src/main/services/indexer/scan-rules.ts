/** F4 索引的排除规则与条目派生（纯模块，Vitest 直测） */

/** 目录名排除集合：精确匹配、不分大小写 */
export function buildExcludeSet(excludeDirs: string[]): Set<string> {
  return new Set(excludeDirs.map((d) => d.trim().toLowerCase()).filter(Boolean))
}

/** 路径中任一目录段命中排除集合即排除（输入为相对被扫根的路径） */
export function isExcludedRelPath(relPath: string, exclude: Set<string>): boolean {
  if (!relPath) return false
  for (const seg of relPath.split(/[\\/]/)) {
    if (exclude.has(seg.toLowerCase())) return true
  }
  return false
}

/** 文件名 → 扩展名（小写、不含点）；无扩展名/点开头隐藏文件返回 null */
export function extOf(name: string): string | null {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return null
  const ext = name.slice(i + 1).toLowerCase()
  return ext.length <= 12 ? ext : null
}
