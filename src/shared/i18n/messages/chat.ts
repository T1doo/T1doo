import type { NsDict } from '../types'

/** AI 对话页 + Markdown/代码块渲染文案 */
export const chat = {
  'chat.new': { zh: '＋ 新对话', en: '+ New chat' },
  'chat.searchPlaceholder': { zh: '搜索对话历史…', en: 'Search chat history…' },
  'chat.searching': { zh: '搜索中…', en: 'Searching…' },
  'chat.noMatches': { zh: '无匹配结果', en: 'No matches' },
  'chat.messageCountShort': { zh: '{n} 条', en: '{n} msgs' },
  'chat.deleteConvTitle': { zh: '删除对话', en: 'Delete chat' },
  'chat.deleteConfirm': {
    zh: '删除该对话及全部消息？',
    en: 'Delete this chat and all its messages?'
  },
  'chat.emptyList': {
    zh: '还没有对话。输入问题开始第一段对话，或在任意界面按启动器热键后输入「@ 问题」。',
    en: 'No chats yet. Type a question to start your first chat, or press the launcher hotkey anywhere and enter "@ question".'
  },
  'chat.newConversation': { zh: '新对话', en: 'New chat' },
  'chat.engineCliBadge': { zh: 'CLI（Claude Code）', en: 'CLI (Claude Code)' },
  'chat.emptyTitle': { zh: '发起新对话', en: 'Start a new chat' },
  'chat.emptyHint': {
    zh: 'CLI 引擎复用 Claude Code 登录态/后端档案，零配置；API 引擎直连 Anthropic（在设置页配置 Key）。',
    en: 'The CLI engine reuses your Claude Code login / backend profiles with zero setup; the API engine connects directly to Anthropic (configure a Key in Settings).'
  },
  'chat.interrupted': { zh: '中断：{msg}', en: 'Interrupted: {msg}' },
  'chat.thinking': { zh: '思考中…', en: 'Thinking…' },
  'chat.answering': { zh: '回答中…', en: 'Answering…' },
  'chat.engineCli': { zh: 'CLI 引擎', en: 'CLI engine' },
  'chat.engineApi': { zh: 'API 引擎', en: 'API engine' },
  'chat.defaultBackend': { zh: '默认后端档案', en: 'Default backend profile' },
  'chat.apiModelDefault': {
    zh: '默认：{model}（可输任意模型 id）',
    en: 'Default: {model} (type any model id)'
  },
  'chat.noApiKey': {
    zh: '未配置 API Key（模型 → API 直连）',
    en: 'API Key not configured (Models → API connection)'
  },
  'chat.inputPlaceholder': {
    zh: '输入问题，Enter 发送，Shift+Enter 换行',
    en: 'Type a question. Enter to send, Shift+Enter for a new line'
  },
  'chat.stop': { zh: '停止', en: 'Stop' },
  'chat.send': { zh: '发送', en: 'Send' }
} as const satisfies NsDict
