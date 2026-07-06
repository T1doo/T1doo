import type { NsDict } from '../types'

/** 主进程用户可见文案：托盘、系统通知、全局热键等（日志不在此列，保持中文源码注释口径） */
export const main = {
  'tray.show': { zh: '显示主窗口', en: 'Show main window' },
  'tray.quit': { zh: '退出 {app}', en: 'Quit {app}' },

  'notify.taskDone': { zh: '后台任务完成', en: 'Background task finished' },
  'notify.taskFailed': { zh: '后台任务失败', en: 'Background task failed' },
  'notify.sessionWaiting': { zh: '会话等待你的输入', en: 'Session is waiting for your input' },

  // ---------- 系统对话框 ----------
  'sys.dialog.exportSession': { zh: '导出会话', en: 'Export session' },
  'sys.dialog.pickCwd': { zh: '选择工作目录', en: 'Choose working directory' },

  // ---------- 后端档案 ----------
  'sys.unnamedProfile': { zh: '未命名档案', en: 'Unnamed profile' },

  // ---------- 会话导出 Markdown 模板（services/claude/export.ts） ----------
  'sys.export.project': { zh: '项目：{path}', en: 'Project: {path}' },
  'sys.export.unknown': { zh: '(未知)', en: '(unknown)' },
  'sys.export.sessionId': { zh: '会话 ID：`{id}`', en: 'Session ID: `{id}`' },
  'sys.export.time': { zh: '时间：{from} — {to}', en: 'Time: {from} — {to}' },
  'sys.export.stats': {
    zh: '消息数：{count} · tokens：输入 {input} / 输出 {output}',
    en: 'Messages: {count} · tokens: input {input} / output {output}'
  },
  'sys.export.model': { zh: '模型：{model}', en: 'Model: {model}' },
  'sys.export.user': { zh: '👤 用户', en: '👤 User' },
  'sys.export.assistant': { zh: '🤖 助手', en: '🤖 Assistant' },
  'sys.export.thinking': { zh: '💭 思考', en: '💭 Thinking' },
  'sys.export.toolResult': { zh: '工具结果', en: 'Tool result' },
  'sys.export.truncated': { zh: '…（截断）', en: '… (truncated)' }
} as const satisfies NsDict
