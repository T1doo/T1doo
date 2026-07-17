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
  /** 空心角标的解释（§7.9.2 如实展示推断局限） */
  'dashboard.status.inferredHint': {
    zh: '推断值：该操作通常需要你确认，但也可能只是工具执行较慢',
    en: 'Inferred: this operation usually needs your approval, but the tool may just be slow'
  },

  // —— v1.0 hooks 退役的一次性告知（§7.9.4） ——
  'dashboard.hooksRetired.title': {
    zh: '已移除 v1.0 的 hooks 注册',
    en: 'v1.0 hooks registration removed'
  },
  'dashboard.hooksRetired.desc': {
    zh: '状态感知已改为直接读取 Claude Code 的会话记录，不再需要向 ~/.claude/settings.json 注册 hook。T1doo 已自动摘除自己留下的条目，你的其余配置分毫未动。',
    en: 'Status awareness now reads Claude Code’s own session transcripts, so hooks in ~/.claude/settings.json are no longer needed. T1doo removed only the entries it had added; the rest of your config is untouched.'
  },
  'dashboard.hooksRetired.dismiss': { zh: '知道了', en: 'Got it' },

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
