import type { NsDict } from '../types'

/** Dashboard（指挥台）页文案 */
export const dashboard = {
  'dashboard.subtitle': {
    zh: '活跃终端 · Token 用量 · 最近会话',
    en: 'Active terminals · Token usage · Recent sessions'
  },
  'dashboard.newTerminal': { zh: '新建终端', en: 'New Terminal' },

  'dashboard.waitingForInput': { zh: '等待你的输入', en: 'Waiting for your input' },

  'dashboard.activeTerminals': { zh: '活跃终端（{n}）', en: 'Active Terminals ({n})' },
  'dashboard.noTerminals': {
    zh: '暂无——从上方或终端页新建（Ctrl+T）',
    en: 'None yet — create one above or from the Terminals page (Ctrl+T)'
  },
  'dashboard.status.working': { zh: '工作中', en: 'Working' },
  'dashboard.status.waiting': { zh: '等待输入', en: 'Waiting' },
  'dashboard.status.idle': { zh: '空闲', en: 'Idle' },

  'dashboard.tokenUsage': { zh: 'Token 用量', en: 'Token Usage' },
  'dashboard.today': { zh: '今日', en: 'Today' },
  'dashboard.last7Days': { zh: '近 7 天', en: 'Last 7 days' },
  'dashboard.dailyTooltip': {
    zh: '{day}：↑{input} ↓{output}',
    en: '{day}: ↑{input} ↓{output}'
  },
  'dashboard.usageNote': {
    zh: '全量口径（含子代理/工作流/面板）；成本估算见用量板块',
    en: 'Full coverage (subagents / workflows / panel); cost estimates in the Usage board'
  },
  'dashboard.statsLoading': { zh: '统计中…', en: 'Calculating…' },

  'dashboard.recentSessions': { zh: '最近会话', en: 'Recent Sessions' },
  'dashboard.noSessions': { zh: '暂无索引到的会话', en: 'No indexed sessions yet' }
} as const satisfies NsDict
