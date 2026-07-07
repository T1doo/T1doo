/** §7.2.6 / §7.7 后端档案（供应商档案 v2）：切换 `claude` 连接的后端（订阅态 / 自定义 baseURL+token） */

export type BackendAuth = 'subscription' | 'custom'

/** 供应商分类（§7.7.2，预设与卡片墙分组用） */
export type BackendCategory = 'official' | 'cn_official' | 'aggregator' | 'third_party' | 'custom'

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
  /** v2：→ ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_OPUS_MODEL（§7.7.2 模型映射补全） */
  defaultSonnetModel: string | null
  defaultOpusModel: string | null
  extraEnv: Record<string, string>
  /** 订阅态档案可选：注入前清除继承到的 ANTHROPIC_* 覆盖，强制走登录态 */
  clearInheritedEnv: boolean
  isDefault: boolean
  // —— v2 增值字段（§7.7.2）——
  /** 来源预设 id（仅溯源展示，自由编辑不受限） */
  presetId: string | null
  category: BackendCategory
  /** 控制台 / 领取 Key 页 */
  websiteUrl: string | null
  notes: string | null
  /** /v1/models 拉取缓存（仅辅助下拉展示，不参与注入） */
  modelCache: string[]
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
  defaultSonnetModel?: string
  defaultOpusModel?: string
  extraEnv?: Record<string, string>
  clearInheritedEnv?: boolean
  isDefault?: boolean
  presetId?: string
  category?: BackendCategory
  websiteUrl?: string
  notes?: string
}

// —— §7.7.4 连通性测试 / 模型列表拉取 ——

export interface BackendTestResult {
  ok: boolean
  latencyMs: number | null
  /** ok 时返回模型数（供 UI 展示"可用，共 N 个模型"） */
  modelCount: number | null
  /** 失败时的中文提示（describeApiError 同口径） */
  error: string | null
}

export interface BackendModelsResult {
  models: string[]
  error: string | null
}

/**
 * 拉取模型列表的入参：支持未保存档案即填即拉（编辑器场景）。
 * baseUrl/token 缺省时回落到 profileId 对应档案的存量值；
 * 仅当携带 profileId 且拉取成功时回写 modelCache。
 */
export interface BackendModelsRequest {
  profileId?: string
  baseUrl?: string
  /** 明文 token（仅内存传递；缺省 = 用档案已存密文解密） */
  token?: string
}

// —— §7.7.5 全局切换（Q8 ✅：写 ~/.claude/settings.json env 键） ——

export interface GlobalSwitchState {
  /** 首次使用一次性授权（此后切换不再打扰） */
  authorized: boolean
  /** 当前已应用到 settings.json 的档案 id（null = 未写入任何管理键 / 订阅态） */
  appliedProfileId: string | null
  /** T1doo 记账在管的 env 键名（§7.7.5 管理键记账） */
  managedKeys: string[]
}

/** 切换冲突（live 与上次写入不一致：用户手改 / 其它工具写入） */
export interface SwitchConflict {
  /** 发生漂移的键与两侧值（敏感值已脱敏） */
  drifted: { key: string; expected: string; live: string }[]
}

export interface SwitchOutcome {
  ok: boolean
  /** ok=false 且存在冲突时返回，UI 弹三选（覆盖 / 导入为新档案 / 取消） */
  conflict: SwitchConflict | null
  /** ok=false 且非冲突（读写失败等）时的错误信息 */
  error: string | null
  state: GlobalSwitchState
}
