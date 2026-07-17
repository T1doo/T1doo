import type { NsDict } from '../types'

/** 设置页四个功能区块（AI 引擎 / 启动器 / hooks / 后端档案）文案 */
export const settingsSections = {
  // —— AI 对话（API 引擎） ——
  'settingsAi.title': { zh: 'AI 对话（API 引擎）', en: 'AI Chat (API engine)' },
  'settingsAi.desc': {
    zh: 'CLI 引擎零配置（复用 Claude Code 登录态/后端档案）；API 引擎直连 Anthropic，Key 经 Windows DPAPI 加密存储，明文不落盘。',
    en: 'The CLI engine needs no setup (reuses your Claude Code login / backend profiles); the API engine connects directly to Anthropic, with the key encrypted via Windows DPAPI and never stored in plain text.'
  },
  'settingsAi.key.configured': {
    zh: '已配置（尾号 …{tail}）',
    en: 'Configured (ending …{tail})'
  },
  'settingsAi.key.notConfigured': { zh: '未配置', en: 'Not configured' },
  'settingsAi.key.clear': { zh: '清除', en: 'Clear' },
  'settingsAi.key.clearConfirm': {
    zh: '清除已保存的 API Key？',
    en: 'Clear the saved API key?'
  },
  'settingsAi.baseUrl': {
    zh: '自定义 baseUrl（可选，Anthropic 兼容网关）',
    en: 'Custom baseUrl (optional, Anthropic-compatible gateway)'
  },
  'settingsAi.model': { zh: '默认模型', en: 'Default model' },
  'settingsAi.saved': { zh: '已保存', en: 'Saved' },

  // —— 启动器 ——
  'settingsLauncher.title': { zh: '启动器', en: 'Launcher' },
  'settingsLauncher.desc': {
    zh: '全局热键唤起命令面板：秒跳项目 / 会话 / 终端 / 提示词，启动应用与打开网址',
    en: 'Summon the command palette with a global hotkey: jump to projects / sessions / terminals / prompts, launch apps and open URLs'
  },
  'settingsLauncher.hotkey': { zh: '全局热键', en: 'Global hotkey' },
  'settingsLauncher.hotkey.failed': {
    zh: '注册失败（可能与 PowerToys Run 等冲突），请改绑',
    en: 'Registration failed (possibly conflicts with PowerToys Run etc.), please rebind'
  },
  'settingsLauncher.hotkey.recording': { zh: '按下新热键…', en: 'Press a new hotkey…' },
  'settingsLauncher.appIndex': { zh: '应用索引', en: 'App index' },
  'settingsLauncher.appCount': { zh: '{n} 个应用', en: '{n} apps' },
  'settingsLauncher.scan.never': { zh: '尚未扫描', en: 'Not scanned yet' },
  'settingsLauncher.scanning': { zh: '扫描中…', en: 'Scanning…' },
  'settingsLauncher.rescan': { zh: '重新扫描', en: 'Rescan' },

  // —— 后端档案 ——
  'settingsBackend.title': { zh: '后端档案', en: 'Backend profiles' },
  'settingsBackend.subtitle': {
    zh: 'claude 连接的后端，终端/任务通用',
    en: 'Backends claude connects to, shared by terminals and tasks'
  },
  'settingsBackend.add': { zh: '＋ 添加', en: '＋ Add' },
  'settingsBackend.default': { zh: '默认', en: 'Default' },
  'settingsBackend.setDefault': { zh: '设为默认', en: 'Set as default' },
  'settingsBackend.edit': { zh: '编辑', en: 'Edit' },
  'settingsBackend.subscriptionDesc': {
    zh: '订阅登录态（不注入 ANTHROPIC_*）',
    en: 'Subscription login (no ANTHROPIC_* injected)'
  },
  'settingsBackend.noBaseUrl': { zh: '未填 baseURL', en: 'baseURL not set' },
  'settingsBackend.token.configured': { zh: '已配置', en: 'configured' },
  'settingsBackend.token.notConfigured': { zh: '未配置', en: 'not configured' },
  'settingsBackend.form.name': { zh: '名称', en: 'Name' },
  'settingsBackend.form.namePlaceholder': {
    zh: 'DeepSeek / 公司网关…',
    en: 'DeepSeek / company gateway…'
  },
  'settingsBackend.form.auth': { zh: '类型', en: 'Type' },
  'settingsBackend.auth.custom': {
    zh: '自定义后端（baseURL + token）',
    en: 'Custom backend (baseURL + token)'
  },
  'settingsBackend.auth.subscription': { zh: '订阅登录态', en: 'Subscription login' },
  'settingsBackend.form.baseUrl': {
    zh: 'Base URL（ANTHROPIC_BASE_URL）',
    en: 'Base URL (ANTHROPIC_BASE_URL)'
  },
  'settingsBackend.form.token': {
    zh: 'Token（ANTHROPIC_AUTH_TOKEN，DPAPI 加密存储；留空 = 保持不变）',
    en: 'Token (ANTHROPIC_AUTH_TOKEN, DPAPI-encrypted; leave empty to keep unchanged)'
  },
  'settingsBackend.form.model': { zh: '默认模型（可选）', en: 'Default model (optional)' },
  'settingsBackend.form.smallFastModel': {
    zh: '后台小模型（可选）',
    en: 'Small fast model (optional)'
  },
  'settingsBackend.form.clearEnv': {
    zh: '清除继承到的 ANTHROPIC_* 环境变量（强制订阅登录态）',
    en: 'Clear inherited ANTHROPIC_* environment variables (force subscription login)'
  }
} as const satisfies NsDict
