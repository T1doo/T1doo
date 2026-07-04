export type ThemeSetting = 'dark' | 'light' | 'system'

export type Language = 'zh-CN' | 'en'

export interface AppSettings {
  /** 界面主题；主进程同步到 nativeTheme.themeSource，渲染层经 prefers-color-scheme 生效 */
  theme: ThemeSetting
  language: Language
  /** 开机自启（仅打包后生效，开发环境不注册） */
  autoLaunch: boolean
  /** 点关闭按钮时最小化到托盘而非退出 */
  closeToTray: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  autoLaunch: false,
  closeToTray: true
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
}
