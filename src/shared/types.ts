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
  /** 会话等待输入时弹系统通知（§8 默认开启的两类之一） */
  notifyWaiting: boolean
  /** 启动器全局热键（Electron Accelerator 语法；与 PowerToys Run 冲突时改绑，R5） */
  launcherHotkey: string
  /** `? 关键词` 的搜索引擎模板，{query} 占位（§7.3 路由表） */
  launcherSearchUrl: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  autoLaunch: false,
  closeToTray: true,
  notifyWaiting: true,
  launcherHotkey: 'Alt+Space',
  launcherSearchUrl: 'https://www.bing.com/search?q={query}'
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
}
