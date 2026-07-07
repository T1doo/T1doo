import type { NsDict } from '../types'

/** F9 用量中心板块文案（§7.8.4） */
export const usage = {
  'usage.subtitle': {
    zh: '全量 Token 用量 · 含子代理与工作流 · 面板来源一并计入',
    en: 'Full token usage · includes subagents & workflows · panel turns counted'
  },
  'usage.scanning': {
    zh: '首次扫描中（{done}/{total}）——数字会随扫描逐步补全',
    en: 'Initial scan in progress ({done}/{total}) — numbers fill in as it completes'
  },

  // 筛选栏
  'usage.range.today': { zh: '今天', en: 'Today' },
  'usage.range.7d': { zh: '7 天', en: '7 days' },
  'usage.range.30d': { zh: '30 天', en: '30 days' },
  'usage.range.month': { zh: '本月', en: 'This month' },
  'usage.range.year': { zh: '今年', en: 'This year' },
  'usage.range.custom': { zh: '自定义', en: 'Custom' },
  'usage.range.from': { zh: '开始', en: 'From' },
  'usage.range.to': { zh: '结束', en: 'To' },
  'usage.filter.allProjects': { zh: '全部项目', en: 'All projects' },
  'usage.filter.allModels': { zh: '全部模型', en: 'All models' },
  'usage.filter.allSources': { zh: '全部来源', en: 'All sources' },
  'usage.filter.noProject': { zh: '（无项目）', en: '(no project)' },

  // 来源
  'usage.source.session': { zh: '终端会话', en: 'Terminal sessions' },
  'usage.source.subagent': { zh: '子代理', en: 'Subagents' },
  'usage.source.workflow': { zh: '工作流', en: 'Workflows' },
  'usage.source.api-panel': { zh: '面板 · API', en: 'Panel · API' },
  'usage.source.cli-panel': { zh: '面板 · CLI', en: 'Panel · CLI' },
  'usage.source.imported': { zh: '历史导入', en: 'Imported history' },

  // Hero 指标卡
  'usage.hero.totalTokens': { zh: '总 Token', en: 'Total tokens' },
  'usage.hero.requests': { zh: '请求数', en: 'Requests' },
  'usage.hero.cacheHitRate': { zh: '缓存命中率', en: 'Cache hit rate' },
  'usage.hero.cost': { zh: '估算成本', en: 'Est. cost' },
  'usage.hero.costEstimated': { zh: '估算', en: 'estimate' },
  'usage.hero.costPartial': {
    zh: '部分模型无价目匹配，估算不完整',
    en: 'Some models have no pricing match; estimate is incomplete'
  },
  'usage.hero.noData': { zh: '—', en: '—' },
  'usage.dim.input': { zh: '输入', en: 'Input' },
  'usage.dim.output': { zh: '输出', en: 'Output' },
  'usage.dim.cacheRead': { zh: '缓存读', en: 'Cache read' },
  'usage.dim.cacheCreation': { zh: '缓存写', en: 'Cache write' },
  'usage.hero.cacheHitNote': {
    zh: '缓存读 ÷（输入 + 缓存写 + 缓存读）',
    en: 'cache read ÷ (input + cache write + cache read)'
  },

  // 趋势图
  'usage.trend.title': { zh: '用量趋势', en: 'Usage trend' },
  'usage.trend.stacked': { zh: '堆叠柱', en: 'Bars' },
  'usage.trend.area': { zh: '面积', en: 'Area' },
  'usage.trend.empty': { zh: '该范围内暂无用量数据', en: 'No usage data in this range' },

  // 分布区
  'usage.byModel.title': { zh: '分模型', en: 'By model' },
  'usage.byModel.model': { zh: '模型', en: 'Model' },
  'usage.byModel.tokens': { zh: 'Token', en: 'Tokens' },
  'usage.byModel.requests': { zh: '请求', en: 'Requests' },
  'usage.byModel.avg': { zh: '单请求均值', en: 'Avg/request' },
  'usage.byModel.cost': { zh: '估算成本', en: 'Est. cost' },
  'usage.byModel.unknown': { zh: '（未知模型）', en: '(unknown model)' },
  'usage.byProject.title': { zh: '分项目 Top {n}', en: 'Top {n} projects' },
  'usage.bySource.title': { zh: '来源占比', en: 'By source' },

  // 价目表
  'usage.pricing.title': { zh: '价目表', en: 'Pricing' },
  'usage.pricing.open': { zh: '编辑价目', en: 'Edit pricing' },
  'usage.pricing.close': { zh: '收起', en: 'Close' },
  'usage.pricing.model': { zh: '模型标识', en: 'Model ID' },
  'usage.pricing.input': { zh: '输入 $/M', en: 'Input $/M' },
  'usage.pricing.output': { zh: '输出 $/M', en: 'Output $/M' },
  'usage.pricing.cacheRead': { zh: '缓存读 $/M', en: 'Cache read $/M' },
  'usage.pricing.cacheWrite': { zh: '缓存写 $/M', en: 'Cache write $/M' },
  'usage.pricing.builtin': { zh: '内置', en: 'Built-in' },
  'usage.pricing.customized': { zh: '已修改', en: 'Modified' },
  'usage.pricing.save': { zh: '保存', en: 'Save' },
  'usage.pricing.reset': { zh: '重置', en: 'Reset' },
  'usage.pricing.delete': { zh: '删除', en: 'Delete' },
  'usage.pricing.add': { zh: '＋ 添加模型价目', en: '+ Add model pricing' },
  'usage.pricing.note': {
    zh: '单价为每百万 token 美元；模型名支持前缀匹配（日期后缀自动归并）',
    en: 'Prices are USD per million tokens; model IDs match by prefix (date suffixes fold in)'
  },
  'usage.pricing.invalid': { zh: '单价须为非负数字', en: 'Price must be a non-negative number' },

  // 成本开关
  'usage.cost.toggle': { zh: '显示名义成本估算', en: 'Show nominal cost estimate' },
  'usage.cost.note': {
    zh: '按本地价目对 token 折算的名义值；订阅/自定义后端的真实账单可能完全不同',
    en: 'Nominal conversion via local pricing; real billing for subscription/custom backends may differ entirely'
  },

  // 数据起点说明
  'usage.dataOrigin': {
    zh: '数据自首次扫描起持续累积入库，之后不受 Claude Code 转录清理影响；早于首扫的历史仅能经一次性导入补齐（来源标记「历史导入」，日粒度、无项目维度）。',
    en: 'Data accumulates permanently from the first scan onward, unaffected by Claude Code transcript cleanup; history older than the first scan can only be backfilled via one-time import (source "Imported history", day granularity, no project dimension).'
  },

  // Dashboard 精简卡片
  'usage.dash.viewMore': { zh: '查看用量板块 →', en: 'Open usage board →' }
} as const satisfies NsDict
