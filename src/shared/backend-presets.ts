import type { BackendCategory } from './backend'

/**
 * §7.7.3 供应商预设模板：只做表单预填与领 Key 引导，不锁定任何字段。
 * baseUrl/模型名参照 cc-switch v3.16.5 预设（2026-07-07 源码核对，推广参数已剥除）；
 * 第三方端点与模型名随时间漂移，保存后用户可自由改，连通性以 backend:test 实测为准。
 */
export interface BackendPreset {
  id: string
  /** 展示名（供应商名不翻译，中英一致） */
  name: string
  category: BackendCategory
  auth: 'subscription' | 'custom'
  baseUrl?: string
  /** 控制台首页 */
  websiteUrl?: string
  /** 领取 API Key 的直达页 */
  apiKeyUrl?: string
  /** 建议模型映射（ANTHROPIC_MODEL / DEFAULT_{HAIKU,SONNET,OPUS}） */
  model?: string
  smallFastModel?: string
  defaultSonnetModel?: string
  defaultOpusModel?: string
  /** i18n key 由 UI 侧拼（models.preset.note.<id>）；无则不展示 */
  hasNote?: boolean
}

export const BACKEND_PRESETS: BackendPreset[] = [
  {
    id: 'subscription',
    name: 'Claude 订阅（登录态）',
    category: 'official',
    auth: 'subscription',
    websiteUrl: 'https://claude.ai',
    hasNote: true
  },
  {
    id: 'anthropic-api',
    name: 'Anthropic API',
    category: 'official',
    auth: 'custom',
    baseUrl: 'https://api.anthropic.com',
    websiteUrl: 'https://console.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'cn_official',
    auth: 'custom',
    baseUrl: 'https://api.deepseek.com/anthropic',
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    model: 'deepseek-chat',
    smallFastModel: 'deepseek-chat',
    defaultSonnetModel: 'deepseek-chat',
    defaultOpusModel: 'deepseek-reasoner'
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    category: 'cn_official',
    auth: 'custom',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    websiteUrl: 'https://platform.moonshot.cn',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    model: 'kimi-k2.7-code',
    smallFastModel: 'kimi-k2.7-code',
    defaultSonnetModel: 'kimi-k2.7-code',
    defaultOpusModel: 'kimi-k2.7-code'
  },
  {
    id: 'zhipu-glm',
    name: '智谱 GLM',
    category: 'cn_official',
    auth: 'custom',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyUrl: 'https://www.bigmodel.cn/claude-code',
    model: 'glm-5.1',
    smallFastModel: 'glm-5.1',
    defaultSonnetModel: 'glm-5.1',
    defaultOpusModel: 'glm-5.1'
  },
  {
    id: 'bailian',
    name: '阿里云百炼（通义）',
    category: 'cn_official',
    auth: 'custom',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    websiteUrl: 'https://bailian.console.aliyun.com',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1'
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    category: 'cn_official',
    auth: 'custom',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    websiteUrl: 'https://platform.minimaxi.com',
    apiKeyUrl: 'https://platform.minimaxi.com/subscribe/coding-plan',
    model: 'MiniMax-M2.7',
    smallFastModel: 'MiniMax-M2.7',
    defaultSonnetModel: 'MiniMax-M2.7',
    defaultOpusModel: 'MiniMax-M2.7'
  },
  {
    id: 'volcengine',
    name: '火山方舟（豆包）',
    category: 'cn_official',
    auth: 'custom',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/compatible',
    websiteUrl: 'https://www.volcengine.com/product/doubao',
    apiKeyUrl: 'https://console.volcengine.com/ark'
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    category: 'aggregator',
    auth: 'custom',
    baseUrl: 'https://api.siliconflow.cn',
    websiteUrl: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak'
  },
  {
    id: 'modelscope',
    name: '魔搭 ModelScope',
    category: 'aggregator',
    auth: 'custom',
    baseUrl: 'https://api-inference.modelscope.cn',
    websiteUrl: 'https://modelscope.cn',
    apiKeyUrl: 'https://modelscope.cn/my/myaccesstoken'
  },
  {
    id: 'custom',
    name: '自定义',
    category: 'custom',
    auth: 'custom',
    hasNote: true
  }
]

export function findPreset(id: string | null | undefined): BackendPreset | null {
  if (!id) return null
  return BACKEND_PRESETS.find((p) => p.id === id) ?? null
}
