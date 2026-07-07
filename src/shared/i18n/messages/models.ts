import type { NsDict } from '../types'

/** F8 模型中心（§7.7）：供应商卡片墙 / 全局切换 / 连通性测试 / API 直连通道 */
export const models = {
  'models.title': { zh: '模型', en: 'Models' },
  'models.subtitle': {
    zh: '管理 Claude Code 的供应商档案与对话面板的 API 直连配置',
    en: 'Manage Claude Code provider profiles and the chat panel API connection'
  },

  // —— 供应商卡片墙 ——
  'models.providers.title': { zh: 'Claude Code 供应商', en: 'Claude Code providers' },
  'models.providers.desc': {
    zh: '一键切换写入 ~/.claude/settings.json 的 env 键（外部终端同样生效）；新建终端时也可为单个终端临时指定档案。',
    en: 'One-click switch writes env keys into ~/.claude/settings.json (external terminals follow too); you can still pick a profile per terminal when creating one.'
  },
  'models.current': { zh: '当前', en: 'Active' },
  'models.switchTo': { zh: '设为当前', en: 'Set active' },
  'models.switching': { zh: '切换中…', en: 'Switching…' },
  'models.switched': { zh: '已切换到「{name}」', en: 'Switched to "{name}"' },
  'models.restore': { zh: '还原 settings.json', en: 'Restore settings.json' },
  'models.restored': {
    zh: '已从 settings.json 移除 T1doo 管理的 env 键',
    en: 'Removed T1doo-managed env keys from settings.json'
  },
  'models.reopenHint': {
    zh: '已运行的终端不受影响，重开后生效',
    en: 'Running terminals are unaffected; reopen to apply'
  },
  'models.addProfile': { zh: '新建档案', en: 'New profile' },
  'models.fromPreset': { zh: '从预设新建', en: 'From preset' },
  'models.presetPicker.title': { zh: '选择供应商预设', en: 'Choose a provider preset' },
  'models.presetPicker.desc': {
    zh: '预设只做表单预填（地址/建议模型/领 Key 链接），保存后可自由修改。',
    en: 'Presets only prefill the form (URL / suggested models / API-key link); edit freely after saving.'
  },
  'models.preset.note.subscription': {
    zh: '零配置：使用 Claude Code 自身的登录态，不注入任何 ANTHROPIC_* 环境变量。',
    en: 'Zero config: uses the Claude Code login session and injects no ANTHROPIC_* variables.'
  },
  'models.preset.note.custom': {
    zh: '空白模板：自行填写 Anthropic 兼容网关地址与 token。',
    en: 'Blank template: fill in your Anthropic-compatible gateway URL and token.'
  },
  'models.getKey': { zh: '领取 Key', en: 'Get API key' },
  'models.console': { zh: '控制台', en: 'Console' },
  'models.category.official': { zh: '官方', en: 'Official' },
  'models.category.cn_official': { zh: '国产官方', en: 'CN official' },
  'models.category.aggregator': { zh: '聚合平台', en: 'Aggregator' },
  'models.category.third_party': { zh: '第三方', en: 'Third-party' },
  'models.category.custom': { zh: '自定义', en: 'Custom' },
  'models.deleteConfirm': { zh: '删除档案「{name}」？', en: 'Delete profile "{name}"?' },
  'models.deleteAppliedBlocked': {
    zh: '该档案是当前全局生效档案，请先切换到其它档案再删除',
    en: 'This profile is currently active globally; switch to another profile before deleting'
  },

  // —— 编辑表单（沿用 settingsBackend.form.* 之外的新字段） ——
  'models.form.defaultSonnet': {
    zh: 'Sonnet 映射（ANTHROPIC_DEFAULT_SONNET_MODEL）',
    en: 'Sonnet mapping (ANTHROPIC_DEFAULT_SONNET_MODEL)'
  },
  'models.form.defaultOpus': {
    zh: 'Opus 映射（ANTHROPIC_DEFAULT_OPUS_MODEL）',
    en: 'Opus mapping (ANTHROPIC_DEFAULT_OPUS_MODEL)'
  },
  'models.form.websiteUrl': {
    zh: '控制台 / 领 Key 链接（可选）',
    en: 'Console / API-key URL (optional)'
  },
  'models.form.notes': { zh: '备注（可选）', en: 'Notes (optional)' },

  // —— 连通性测试 / 模型列表（§7.7.4） ——
  'models.test': { zh: '测试', en: 'Test' },
  'models.testing': { zh: '测试中…', en: 'Testing…' },
  'models.test.ok': {
    zh: '连通正常（{latency}ms，{count} 个模型）',
    en: 'Reachable ({latency}ms, {count} models)'
  },
  'models.test.okNoList': {
    zh: '已连通（{latency}ms），网关未提供模型列表',
    en: 'Reachable ({latency}ms); gateway has no model list'
  },
  'models.test.auth': {
    zh: 'token 无效或未授权（401/403），请检查后端档案的 token',
    en: 'Token invalid or unauthorized (401/403); check the profile token'
  },
  'models.test.notFound': {
    zh: '网关不支持模型列表端点（404），无法自动测试——请发起一次对话验证',
    en: 'Gateway has no models endpoint (404); cannot auto-test — verify with a real conversation'
  },
  'models.test.timeout': {
    zh: '连接超时（5s），请检查地址与网络',
    en: 'Timed out (5s); check URL and network'
  },
  'models.test.network': {
    zh: '无法连接到该地址，请检查 baseUrl 与网络',
    en: 'Cannot reach the endpoint; check baseUrl and network'
  },
  'models.test.http': { zh: '网关返回 HTTP {status}', en: 'Gateway returned HTTP {status}' },
  'models.test.noBaseUrl': { zh: '请先填写 baseUrl', en: 'Fill in baseUrl first' },
  'models.test.subscription': {
    zh: '订阅态由 Claude Code 登录管理，无需连通性测试',
    en: 'Subscription auth is managed by the Claude Code login; no test needed'
  },
  'models.fetchModels': { zh: '拉取模型列表', en: 'Fetch models' },
  'models.fetchModels.ok': { zh: '已拉取 {count} 个模型', en: 'Fetched {count} models' },
  'models.fetchModels.empty': {
    zh: '拉取失败或列表为空，可直接手填模型名',
    en: 'Fetch failed or empty; type a model id manually'
  },

  // —— 全局切换：首次授权 + 冲突三选（§7.7.5） ——
  'models.authorize.title': {
    zh: '允许 T1doo 写入 ~/.claude/settings.json？',
    en: 'Allow T1doo to write ~/.claude/settings.json?'
  },
  'models.authorize.body': {
    zh: '全局切换会把所选档案的 ANTHROPIC_* 环境变量写入 settings.json 的 env 键，使所有 claude 终端（含 T1doo 之外手开的）指向该后端。T1doo 只增删自己记账的键、写前自动备份（settings.json.bak-t1doo）、深合并保留你的其余配置，并可随时一键还原。注意：token 将以明文写入该文件（Claude Code 的配置格式如此）。此授权只询问一次。',
    en: "Global switching writes the profile's ANTHROPIC_* variables into the env key of settings.json, so every claude terminal (including ones outside T1doo) uses that backend. T1doo only adds/removes keys it tracks, backs the file up first (settings.json.bak-t1doo), deep-merges to preserve everything else, and can restore in one click. Note: the token is written to that file in plain text (that is Claude Code's config format). You are asked only once."
  },
  'models.authorize.confirm': { zh: '允许并切换', en: 'Allow and switch' },
  'models.conflict.title': {
    zh: 'settings.json 已被外部修改',
    en: 'settings.json changed externally'
  },
  'models.conflict.body': {
    zh: '以下 env 键与 T1doo 上次写入不一致（可能被你或其它工具改过）。选择如何处理：',
    en: 'These env keys differ from what T1doo last wrote (changed by you or another tool). Choose how to proceed:'
  },
  'models.conflict.overwrite': { zh: '覆盖并切换', en: 'Overwrite and switch' },
  'models.conflict.import': {
    zh: '导入为新档案后再切换',
    en: 'Import as new profile, then switch'
  },
  'models.conflict.imported': { zh: '已导入档案「{name}」', en: 'Imported profile "{name}"' },
  'models.importedName': { zh: '从 settings.json 导入', en: 'Imported from settings.json' },

  // —— API 直连通道（§7.7.6） ——
  'models.api.title': { zh: 'API 直连（对话面板）', en: 'API connection (chat panel)' },
  'models.api.modelFree': {
    zh: '模型（可选预设或直接输入任意模型 id）',
    en: 'Model (pick a preset or type any model id)'
  },
  'models.api.modelPlaceholder': {
    zh: '如 claude-opus-4-8 或第三方模型 id',
    en: 'e.g. claude-opus-4-8 or a gateway model id'
  },

  // —— 设置页迁移提示 ——
  'models.movedFromSettings': {
    zh: '后端档案与 API 模型配置已迁至「模型」板块',
    en: 'Backend profiles and API model settings moved to the Models section'
  },
  'models.openModels': { zh: '打开「模型」', en: 'Open Models' },

  // —— 终端新建对话框：按终端覆盖 ——
  'models.followGlobal': { zh: '跟随全局（当前：{name}）', en: 'Follow global (now: {name})' },
  'models.followGlobal.none': { zh: '跟随全局', en: 'Follow global' }
} as const satisfies NsDict
