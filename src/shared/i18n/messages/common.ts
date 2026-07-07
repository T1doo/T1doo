import type { NsDict } from '../types'

/** 跨页面通用文案：导航、通用按钮与状态。新增页面专属文案请放各自命名空间文件 */
export const common = {
  'nav.dashboard': { zh: '指挥台', en: 'Dashboard' },
  'nav.sessions': { zh: '会话', en: 'Sessions' },
  'nav.terminals': { zh: '终端', en: 'Terminals' },
  'nav.chat': { zh: '对话', en: 'Chat' },
  'nav.tasks': { zh: '任务', en: 'Tasks' },
  'nav.models': { zh: '模型', en: 'Models' },
  'nav.usage': { zh: '用量', en: 'Usage' },
  'nav.settings': { zh: '设置', en: 'Settings' },

  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.confirm': { zh: '确认', en: 'Confirm' },
  'common.copy': { zh: '复制', en: 'Copy' },
  'common.copied': { zh: '已复制', en: 'Copied' },
  'common.refresh': { zh: '刷新', en: 'Refresh' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.none': { zh: '无', en: 'None' },
  'common.enabled': { zh: '已开启', en: 'Enabled' },
  'common.disabled': { zh: '已关闭', en: 'Disabled' },
  'common.unknownError': { zh: '未知错误', en: 'Unknown error' },
  'common.unknownProject': { zh: '(未知项目)', en: '(unknown project)' },

  'time.justNow': { zh: '刚刚', en: 'just now' },
  'time.minutesAgo': { zh: '{n} 分钟前', en: '{n} min ago' },
  'time.hoursAgo': { zh: '{n} 小时前', en: '{n} h ago' },
  'time.daysAgo': { zh: '{n} 天前', en: '{n} d ago' }
} as const satisfies NsDict
