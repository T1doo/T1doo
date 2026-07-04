/** §7.2.6 后端档案：切换 `claude` 连接的后端（订阅态 / 自定义 baseURL+token） */

export type BackendAuth = 'subscription' | 'custom'

/** 渲染层可见的档案视图：token 明文永不出主进程，只暴露 hasToken */
export interface BackendProfileView {
  id: string
  name: string
  auth: BackendAuth
  baseUrl: string | null
  hasToken: boolean
  model: string | null
  /** 后台小模型 → ANTHROPIC_DEFAULT_HAIKU_MODEL（SMALL_FAST_MODEL 已弃用，附录 A.4） */
  smallFastModel: string | null
  extraEnv: Record<string, string>
  /** 订阅态档案可选：注入前清除继承到的 ANTHROPIC_* 覆盖，强制走登录态 */
  clearInheritedEnv: boolean
  isDefault: boolean
}

/** 保存档案的入参（新建时 id 缺省） */
export interface BackendProfileInput {
  id?: string
  name: string
  auth: BackendAuth
  baseUrl?: string
  /** 明文 token：undefined = 保持原值不变；空串 = 清除 */
  token?: string
  model?: string
  smallFastModel?: string
  extraEnv?: Record<string, string>
  clearInheritedEnv?: boolean
  isDefault?: boolean
}
