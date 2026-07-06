import type { NsDict } from '../types'

/** 后台任务队列页文案 */
export const tasks = {
  'tasks.title': { zh: '任务队列', en: 'Task queue' },

  'tasks.status.queued': { zh: '排队中', en: 'Queued' },
  'tasks.status.running': { zh: '执行中', en: 'Running' },
  'tasks.status.done': { zh: '完成', en: 'Done' },
  'tasks.status.failed': { zh: '失败', en: 'Failed' },
  'tasks.status.cancelled': { zh: '已取消', en: 'Cancelled' },

  'tasks.permission.default': {
    zh: 'default（保守，默认）',
    en: 'default (conservative, default)'
  },
  'tasks.permission.acceptEdits': {
    zh: 'acceptEdits（自动接受编辑）',
    en: 'acceptEdits (auto-accept edits)'
  },
  'tasks.permission.plan': { zh: 'plan（只做计划）', en: 'plan (plan only)' },
  'tasks.permission.dontAsk': { zh: 'dontAsk', en: 'dontAsk' },
  'tasks.permission.auto': { zh: 'auto', en: 'auto' },
  'tasks.permission.bypassPermissions': {
    zh: 'bypassPermissions（危险）',
    en: 'bypassPermissions (dangerous)'
  },

  'tasks.promptPlaceholder': {
    zh: '任务描述（将派发给无头 Claude Code 在后台执行）…',
    en: 'Task description (dispatched to headless Claude Code to run in the background)…'
  },
  'tasks.cwdPlaceholder': { zh: '工作目录', en: 'Working directory' },
  'tasks.browse': { zh: '浏览…', en: 'Browse…' },
  'tasks.defaultBackend': { zh: '默认后端档案', en: 'Default backend profile' },
  'tasks.modelPlaceholder': { zh: '模型（可选）', en: 'Model (optional)' },
  'tasks.budgetPlaceholder': { zh: '预算 $（可选）', en: 'Budget $ (optional)' },
  'tasks.budgetTitle': {
    zh: '--max-budget-usd 成本闸（API 计费后端适用）',
    en: '--max-budget-usd cost gate (applies to API-billed backends)'
  },
  'tasks.submit': { zh: '提交任务', en: 'Submit task' },
  'tasks.errPromptRequired': { zh: '任务描述不能为空', en: 'Task description is required' },
  'tasks.errCwdRequired': { zh: '请选择工作目录', en: 'Please select a working directory' },
  'tasks.bypassConfirm': {
    zh: 'bypassPermissions 会跳过全部权限确认，Claude 可无限制修改文件与执行命令。确定继续？',
    en: 'bypassPermissions skips all permission prompts; Claude can modify files and run commands without restriction. Continue?'
  },

  'tasks.empty': {
    zh: '暂无任务。提交一个任务描述，T1doo 会派发给无头 Claude Code 后台执行，完成后通知你。',
    en: 'No tasks yet. Submit a task description and T1doo will dispatch it to headless Claude Code in the background, then notify you when it finishes.'
  },
  'tasks.modelInfo': { zh: '模型 {name}', en: 'Model {name}' },
  'tasks.permissionInfo': { zh: '权限 {mode}', en: 'Permission {mode}' },
  'tasks.turns': { zh: '{n} 回合', en: '{n} turns' },
  'tasks.costTitle': {
    zh: 'claude result 事件回报的名义成本；订阅态仅供参考（§7.6）',
    en: 'Nominal cost reported by the claude result event; reference only on subscription plans (§7.6)'
  },
  'tasks.hideOutput': { zh: '收起输出', en: 'Hide output' },
  'tasks.viewOutput': { zh: '查看输出', en: 'View output' },
  'tasks.viewSession': { zh: '查看会话', en: 'View session' },
  'tasks.viewSessionTitle': {
    zh: '任务产生的会话已进入会话中心',
    en: 'The session produced by this task is available in the session center'
  },
  'tasks.noOutput': { zh: '（暂无输出）', en: '(no output yet)' }
} as const satisfies NsDict
