import type { NsDict } from '../types'

/** 启动器：渲染窗 UI + 主进程生成的条目标题/副标题/执行提示 */
export const launcher = {
  // ---------- 渲染窗 UI ----------
  'launcher.input.placeholder': {
    zh: '搜索项目 / 会话 / 终端 / 提示词 / 应用…',
    en: 'Search projects / sessions / terminals / prompts / apps…'
  },
  'launcher.empty.noResults': { zh: '无匹配结果', en: 'No results' },
  'launcher.footer.hints': {
    zh: '> 命令 · @ AI 提问 · ? 网页搜索 · 直接输入网址或路径',
    en: '> commands · @ ask AI · ? web search · or type a URL / path'
  },
  'launcher.footer.keys': {
    zh: '↑↓ 选择 · Enter 执行 · Esc 关闭',
    en: '↑↓ select · Enter run · Esc close'
  },

  // ---------- kind 徽标 ----------
  'launcher.kind.project': { zh: '项目', en: 'Project' },
  'launcher.kind.session': { zh: '会话', en: 'Session' },
  'launcher.kind.terminal': { zh: '终端', en: 'Terminal' },
  'launcher.kind.prompt': { zh: '提示词', en: 'Prompt' },
  'launcher.kind.app': { zh: '应用', en: 'App' },
  'launcher.kind.command': { zh: '命令', en: 'Command' },
  'launcher.kind.url': { zh: '网址', en: 'URL' },
  'launcher.kind.path': { zh: '路径', en: 'Path' },
  'launcher.kind.search': { zh: '搜索', en: 'Search' },

  // ---------- 条目：@ AI 提问 ----------
  'launcher.ai.hintTitle': {
    zh: '输入 @ 问题 直接发起 AI 对话',
    en: 'Type @ question to start an AI chat'
  },
  'launcher.ai.hintSubtitle': {
    zh: '回车后转到对话页流式作答（默认 cli 引擎）',
    en: 'Press Enter to stream the answer on the Chat page (cli engine by default)'
  },
  'launcher.ai.askTitle': { zh: '问 AI：{query}', en: 'Ask AI: {query}' },
  'launcher.ai.askSubtitle': {
    zh: '发起对话（结果落入 F5 对话页）',
    en: 'Start a chat (answer lands on the Chat page)'
  },
  'launcher.ai.notReady': { zh: 'AI 对话服务未就绪', en: 'AI chat service is not ready' },

  // ---------- 条目：搜索 / 网址 / 路径 ----------
  'launcher.search.title': { zh: '搜索：{query}', en: 'Search: {query}' },
  'launcher.search.engine': { zh: '搜索引擎', en: 'Search engine' },
  'launcher.url.title': { zh: '打开 {url}', en: 'Open {url}' },
  'launcher.url.subtitle': { zh: '默认浏览器', en: 'Default browser' },
  'launcher.path.open': { zh: '打开', en: 'Open' },
  'launcher.path.notFound': { zh: '路径不存在', en: 'Path not found' },

  // ---------- 条目副标题 ----------
  'launcher.session.messages': { zh: '{n} 条消息', en: '{n} messages' },
  'launcher.prompt.withProject': { zh: '提示词 · {project}', en: 'Prompt · {project}' },
  'launcher.terminal.subtitle': {
    zh: '运行中终端 · {kind} · {cwd}',
    en: 'Running terminal · {kind} · {cwd}'
  },

  // ---------- 内部命令 ----------
  'launcher.cmd.newTerminal': { zh: '新建终端', en: 'New terminal' },
  'launcher.cmd.newTerminal.subtitle': {
    zh: '转到终端页新建 Claude / Shell 终端',
    en: 'Go to Terminals to create a Claude / Shell terminal'
  },
  'launcher.cmd.openDashboard': { zh: '打开指挥台', en: 'Open Dashboard' },
  'launcher.cmd.openDashboard.subtitle': { zh: 'Dashboard 总览', en: 'Dashboard overview' },
  'launcher.cmd.openSessions': { zh: '打开会话中心', en: 'Open Sessions' },
  'launcher.cmd.openSessions.subtitle': {
    zh: '历史会话搜索与回放',
    en: 'Search and replay past sessions'
  },
  'launcher.cmd.openTerminals': { zh: '打开终端页', en: 'Open Terminals' },
  'launcher.cmd.openTerminals.subtitle': {
    zh: '内置多终端管理',
    en: 'Built-in multi-terminal management'
  },
  'launcher.cmd.openSettings': { zh: '打开设置', en: 'Open Settings' },
  'launcher.cmd.openSettings.subtitle': {
    zh: '主题 / hooks / 后端档案 / 启动器',
    en: 'Theme / hooks / backend profiles / launcher'
  },
  'launcher.cmd.rescanApps': { zh: '重新扫描应用', en: 'Rescan apps' },
  'launcher.cmd.rescanApps.subtitle': {
    zh: '刷新开始菜单应用索引',
    en: 'Refresh the Start Menu app index'
  },
  'launcher.cmd.rescanApps.done': { zh: '已扫描 {n} 个应用', en: 'Scanned {n} apps' },
  'launcher.cmd.quit': { zh: '退出 T1doo', en: 'Quit T1doo' },
  'launcher.cmd.quit.subtitle': {
    zh: '结束所有终端并退出',
    en: 'Close all terminals and quit'
  },
  'launcher.cmd.unknown': { zh: '未知命令：{id}', en: 'Unknown command: {id}' },

  // ---------- 执行反馈 ----------
  'launcher.app.launchFailed': { zh: '启动失败：{error}', en: 'Launch failed: {error}' },
  'launcher.prompt.copied': { zh: '提示词已复制到剪贴板', en: 'Prompt copied to clipboard' },
  'launcher.prompt.copiedResumed': {
    zh: '已恢复会话，提示词已复制（Ctrl+V 粘贴）',
    en: 'Session resumed; prompt copied (press Ctrl+V to paste)'
  },
  'launcher.prompt.copiedProject': {
    zh: '已打开项目终端，提示词已复制（Ctrl+V 粘贴）',
    en: 'Project terminal opened; prompt copied (press Ctrl+V to paste)'
  }
} as const satisfies NsDict
