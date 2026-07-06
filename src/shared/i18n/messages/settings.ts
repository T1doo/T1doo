import type { NsDict } from '../types'

/** 设置页主体（外观/语言/行为）；四个功能区块见 settings-sections.ts */
export const settings = {
  'settings.title': { zh: '设置', en: 'Settings' },

  'settings.appearance': { zh: '外观', en: 'Appearance' },
  'settings.theme.dark': { zh: '暗色', en: 'Dark' },
  'settings.theme.light': { zh: '亮色', en: 'Light' },
  'settings.theme.system': { zh: '跟随系统', en: 'System' },

  'settings.language': { zh: '语言 / Language', en: 'Language / 语言' },

  'settings.behavior': { zh: '行为', en: 'Behavior' },
  'settings.autoLaunch': { zh: '开机自启', en: 'Launch at startup' },
  'settings.autoLaunch.hint': { zh: '仅安装版生效', en: 'Installed version only' },
  'settings.closeToTray': {
    zh: '关闭窗口时最小化到托盘',
    en: 'Minimize to tray on window close'
  },
  'settings.notifyWaiting': {
    zh: '会话等待输入时系统通知',
    en: 'Notify when a session waits for input'
  },
  'settings.notifyWaiting.hint': {
    zh: '需开启 hooks 状态感知',
    en: 'Requires hooks status awareness'
  },
  'settings.notifyTaskDone': {
    zh: '后台任务完成/失败时系统通知',
    en: 'Notify when a background task finishes or fails'
  }
} as const satisfies NsDict
