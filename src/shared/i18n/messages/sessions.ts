import type { NsDict } from '../types'

/** 会话中心（列表/详情/搜索/消息渲染/相对时间）文案 */
export const sessions = {
  'sessions.searchPlaceholder': { zh: '全文搜索所有会话…', en: 'Search all sessions…' },
  'sessions.allProjects': { zh: '全部项目（{count}）', en: 'All projects ({count})' },
  'sessions.projectOption': { zh: '{name}（{count}）', en: '{name} ({count})' },
  'sessions.pinnedOnly': { zh: '仅收藏', en: 'Pinned only' },
  'sessions.indexing': {
    zh: '正在索引会话… {done}/{total}',
    en: 'Indexing sessions… {done}/{total}'
  },
  'sessions.selectToView': {
    zh: '选择一个会话查看回放',
    en: 'Select a session to view its replay'
  },

  'sessions.noSessions': { zh: '没有会话', en: 'No sessions' },
  'sessions.messageCountShort': { zh: '{n} 条', en: '{n} msgs' },

  'sessions.parsing': { zh: '解析会话全文中…', en: 'Parsing session transcript…' },
  'sessions.loadError': { zh: '无法加载会话：{error}', en: 'Failed to load session: {error}' },
  'sessions.exported': { zh: '已导出：{path}', en: 'Exported: {path}' },
  'sessions.pin': { zh: '收藏', en: 'Pin' },
  'sessions.unpin': { zh: '取消收藏', en: 'Unpin' },
  'sessions.resume': { zh: '恢复会话', en: 'Resume session' },
  'sessions.resumeTitle': {
    zh: '在内置终端恢复此会话（自动绑定状态感知）',
    en: 'Resume this session in the built-in terminal (auto-binds status awareness)'
  },
  'sessions.resumeExternalTitle': {
    zh: '在外部 Windows Terminal 恢复',
    en: 'Resume in external Windows Terminal'
  },
  'sessions.exportMd': { zh: '导出 MD', en: 'Export MD' },
  'sessions.exportJson': { zh: '导出 JSON', en: 'Export JSON' },
  'sessions.messageCount': { zh: '{n} 条消息', en: '{n} messages' },
  'sessions.tokens': { zh: 'tokens：↑{input} ↓{output}', en: 'tokens: ↑{input} ↓{output}' },
  'sessions.cacheRead': { zh: '（缓存读 {n}）', en: '(cache read {n})' },
  'sessions.badLines': { zh: '{n} 行无法解析已跳过', en: '{n} unparsable lines skipped' },
  'sessions.sidechainGroup': { zh: '子代理轨迹 · {n} 条', en: 'Subagent trace · {n} msgs' },

  'sessions.thinking': { zh: '思考过程', en: 'Thinking' },
  'sessions.toolResult': { zh: '工具结果', en: 'Tool result' },
  'sessions.truncated': { zh: '…（截断）', en: '… (truncated)' },
  'sessions.roleUser': { zh: '用户', en: 'User' },
  'sessions.roleAssistant': { zh: '助手', en: 'Assistant' },

  'sessions.searching': { zh: '搜索中…', en: 'Searching…' },
  'sessions.noMatches': { zh: '没有匹配的消息', en: 'No matching messages' }
} as const satisfies NsDict
