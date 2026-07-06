import type { NsDict } from '../types'

/** 终端页（标签/新建对话框/xterm 视图）文案 */
export const terminals = {
  // ---- 标签栏 / 终端区（TerminalsPage） ----
  'terminals.exitedSuffix': { zh: '（已退出 {code}）', en: ' (exited {code})' },
  'terminals.unsplit': { zh: '取消分屏', en: 'Unsplit' },
  'terminals.pinRight': { zh: '固定到右侧分屏', en: 'Pin to right split' },
  'terminals.newWithShortcut': { zh: '新建终端（Ctrl+T）', en: 'New terminal (Ctrl+T)' },
  'terminals.empty': { zh: '还没有终端', en: 'No terminals yet' },
  'terminals.processExited': {
    zh: '进程已退出（code {code}）——输出保留供回看',
    en: 'Process exited (code {code}) — output kept for review'
  },
  'terminals.closeTab': { zh: '关闭标签', en: 'Close tab' },
  'terminals.searchPlaceholder': { zh: '终端内搜索', en: 'Search in terminal' },

  // ---- 新建终端对话框（NewTerminalDialog） ----
  'terminals.newTerminal': { zh: '新建终端', en: 'New Terminal' },
  'terminals.kind.claude': { zh: 'Claude 会话', en: 'Claude session' },
  'terminals.kind.shell': { zh: 'PowerShell', en: 'PowerShell' },
  'terminals.cwd': { zh: '工作目录', en: 'Working directory' },
  'terminals.browse': { zh: '浏览…', en: 'Browse…' },
  'terminals.backendProfile': { zh: '后端档案', en: 'Backend profile' },
  'terminals.customBackendSuffix': { zh: '（自定义后端）', en: ' (custom backend)' },
  'terminals.model': { zh: '模型', en: 'Model' },
  'terminals.modelHint': { zh: '可选，覆盖档案默认', en: 'optional, overrides profile default' },
  'terminals.modelPlaceholder': { zh: '跟随档案 / CLI 默认', en: 'Profile / CLI default' },
  'terminals.permissionMode': { zh: '权限模式', en: 'Permission mode' },
  'terminals.permMode.default': { zh: 'default（逐项确认）', en: 'default (confirm each action)' },
  'terminals.permMode.acceptEdits': {
    zh: 'acceptEdits（自动接受编辑）',
    en: 'acceptEdits (auto-accept edits)'
  },
  'terminals.permMode.plan': { zh: 'plan（规划模式）', en: 'plan (planning mode)' },
  'terminals.permMode.dontAsk': { zh: 'dontAsk', en: 'dontAsk' },
  'terminals.permMode.auto': { zh: 'auto', en: 'auto' },
  'terminals.permMode.bypass': {
    zh: 'bypassPermissions（跳过全部确认）',
    en: 'bypassPermissions (skip all confirmations)'
  },
  'terminals.sessionName': { zh: '会话名', en: 'Session name' },
  'terminals.sessionNameHint': { zh: '可选，-n', en: 'optional, -n' },
  'terminals.sessionNamePlaceholder': { zh: '标签名与之同步', en: 'Tab title follows it' },
  'terminals.bypassDanger': { zh: '危险：', en: 'Danger: ' },
  'terminals.bypassWarning': {
    zh: 'bypassPermissions（--dangerously-skip-permissions）将跳过所有工具权限确认， Claude 可以直接执行任意命令与文件修改。我了解风险并确认在此目录启用。',
    en: 'bypassPermissions (--dangerously-skip-permissions) skips all tool permission confirmations; Claude can run arbitrary commands and modify files directly. I understand the risk and confirm enabling it in this directory.'
  },
  'terminals.create': { zh: '创建', en: 'Create' }
} as const satisfies NsDict
