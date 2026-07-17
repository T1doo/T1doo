import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { t } from '../i18n'

/**
 * `~/.claude/settings.json` 的读写底座（§1.4 唯一写入例外的收口处）。
 *
 * v1.1 之前 hooks 注册器与全局切换各自实现了一份，行为还不一致（前者无备份、非原子写）。
 * hooks 退役（§7.9.4）时统一到这里：**读**解析失败一律向上抛，绝不覆盖读不懂的用户配置；
 * **写**恒为 备份 → 临时文件 → rename 落盘。
 *
 * 备份文件名与 v1.0 保持一致，升级后的一键还原仍能认得旧备份。
 */
export const SETTINGS_BACKUP_SUFFIX = '.bak-t1doo'
const SETTINGS_TMP_SUFFIX = '.tmp-t1doo'

/** 读；文件不存在或空 → `{}`。结构非对象即抛（宁可不写也不毁配置） */
export function readClaudeSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {}
  const raw = readFileSync(settingsPath, 'utf8')
  if (!raw.trim()) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(t('err.claudeSettingsMalformed'))
  }
  return parsed as Record<string, unknown>
}

/** 写：备份既有文件 → 临时文件 → 原子 rename */
export function writeClaudeSettings(settingsPath: string, settings: Record<string, unknown>): void {
  mkdirSync(dirname(settingsPath), { recursive: true })
  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, `${settingsPath}${SETTINGS_BACKUP_SUFFIX}`)
  }
  const tmp = `${settingsPath}${SETTINGS_TMP_SUFFIX}`
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  renameSync(tmp, settingsPath)
}
