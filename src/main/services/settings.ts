import Store from 'electron-store'
import { DEFAULT_SETTINGS } from '../../shared/types'
import type { AppSettings, ThemeSetting, Language } from '../../shared/types'

type Listener = (settings: AppSettings) => void

const THEMES: readonly ThemeSetting[] = ['dark', 'light', 'system']
const LANGUAGES: readonly Language[] = ['zh-CN', 'en']

/** 过滤 IPC 传入的 patch：只接受已知键与合法值，非法字段静默丢弃 */
function sanitize(patch: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {}
  if (patch.theme !== undefined && THEMES.includes(patch.theme)) out.theme = patch.theme
  if (patch.language !== undefined && LANGUAGES.includes(patch.language)) {
    out.language = patch.language
  }
  if (typeof patch.autoLaunch === 'boolean') out.autoLaunch = patch.autoLaunch
  if (typeof patch.closeToTray === 'boolean') out.closeToTray = patch.closeToTray
  if (typeof patch.notifyWaiting === 'boolean') out.notifyWaiting = patch.notifyWaiting
  return out
}

export class SettingsService {
  private store = new Store<AppSettings>({ name: 'settings', defaults: DEFAULT_SETTINGS })
  private listeners = new Set<Listener>()

  get(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...this.store.store }
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.get(), ...sanitize(patch ?? {}) }
    this.store.set(next)
    for (const listener of this.listeners) listener(next)
    return next
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
