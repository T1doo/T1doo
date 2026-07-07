import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import type { BackendProfileInput, BackendProfileView } from '../../../shared/backend'
import type { ResolvedBackend } from './env'
import { normalizeStoredProfile, sanitizeExtraEnv, type StoredProfile } from './stored'
import { t } from '../i18n'

interface BackendStoreShape {
  profiles: StoredProfile[]
}

const SUBSCRIPTION_PROFILE: StoredProfile = {
  id: 'builtin-subscription',
  name: 'Claude 订阅（登录态）',
  auth: 'subscription',
  baseUrl: null,
  authTokenEnc: null,
  model: null,
  smallFastModel: null,
  extraEnv: {},
  clearInheritedEnv: false,
  isDefault: true,
  defaultSonnetModel: null,
  defaultOpusModel: null,
  presetId: 'subscription',
  category: 'official',
  websiteUrl: null,
  notes: null,
  modelCache: []
}

export class BackendProfilesService {
  private store = new Store<BackendStoreShape>({
    name: 'backend-profiles',
    defaults: { profiles: [SUBSCRIPTION_PROFILE] }
  })

  list(): BackendProfileView[] {
    return this.all().map((p) => this.toView(p))
  }

  /** 保存（新建/更新），返回最新列表 */
  save(input: BackendProfileInput): BackendProfileView[] {
    const profiles = this.all()
    const existing = input.id ? profiles.find((p) => p.id === input.id) : undefined

    let authTokenEnc = existing?.authTokenEnc ?? null
    if (input.token !== undefined) {
      if (input.token === '') {
        authTokenEnc = null
      } else {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error(t('err.dpapiToken'))
        }
        authTokenEnc = safeStorage.encryptString(input.token).toString('base64')
      }
    }

    // undefined = 保留原值；空串 = 清除（token 同语义，见上方 authTokenEnc）
    const pick = (v: string | undefined, old: string | null | undefined): string | null =>
      v === undefined ? (old ?? null) : v.trim() || null

    const next: StoredProfile = {
      id: existing?.id ?? randomUUID(),
      name: input.name.trim() || t('sys.unnamedProfile'),
      auth: input.auth === 'custom' ? 'custom' : 'subscription',
      baseUrl: pick(input.baseUrl, existing?.baseUrl),
      authTokenEnc,
      model: pick(input.model, existing?.model),
      smallFastModel: pick(input.smallFastModel, existing?.smallFastModel),
      extraEnv:
        input.extraEnv !== undefined
          ? sanitizeExtraEnv(input.extraEnv)
          : (existing?.extraEnv ?? {}),
      clearInheritedEnv: input.clearInheritedEnv ?? existing?.clearInheritedEnv ?? false,
      isDefault: input.isDefault === true || (existing?.isDefault ?? false),
      defaultSonnetModel: pick(input.defaultSonnetModel, existing?.defaultSonnetModel),
      defaultOpusModel: pick(input.defaultOpusModel, existing?.defaultOpusModel),
      presetId: input.presetId ?? existing?.presetId ?? null,
      category:
        input.category ?? existing?.category ?? (input.auth === 'custom' ? 'custom' : 'official'),
      websiteUrl: pick(input.websiteUrl, existing?.websiteUrl),
      notes: pick(input.notes, existing?.notes),
      modelCache: existing?.modelCache ?? []
    }

    const merged = existing
      ? profiles.map((p) => (p.id === existing.id ? next : p))
      : [...profiles, next]
    this.persist(input.isDefault === true ? withSoleDefault(merged, next.id) : merged)
    return this.list()
  }

  delete(id: string): BackendProfileView[] {
    const remaining = this.all().filter((p) => p.id !== id)
    // 至少保留一个档案；默认档案被删则回落到第一个
    const safe = remaining.length > 0 ? remaining : [SUBSCRIPTION_PROFILE]
    if (!safe.some((p) => p.isDefault)) safe[0] = { ...safe[0], isDefault: true }
    this.persist(safe)
    return this.list()
  }

  /** 全局切换成功后置"当前"标记（isDefault 即当前，任务/恢复默认沿用） */
  setCurrent(id: string): BackendProfileView[] {
    this.persist(withSoleDefault(this.all(), id))
    return this.list()
  }

  /** 写入 /v1/models 拉取缓存（仅辅助展示） */
  setModelCache(id: string, models: string[]): void {
    this.persist(this.all().map((p) => (p.id === id ? { ...p, modelCache: models } : p)))
  }

  getDefaultId(): string {
    const all = this.all()
    return (all.find((p) => p.isDefault) ?? all[0] ?? SUBSCRIPTION_PROFILE).id
  }

  get(id: string): BackendProfileView | null {
    const p = this.all().find((x) => x.id === id)
    return p ? this.toView(p) : null
  }

  /** 解密档案供 spawn 注入；id 缺省/未知 → null（跟随全局，原样透传） */
  resolve(id: string | undefined | null): ResolvedBackend | null {
    if (!id) return null
    const p = this.all().find((x) => x.id === id)
    if (!p) return null
    return {
      auth: p.auth,
      baseUrl: p.baseUrl,
      token: this.decryptToken(p),
      model: p.model,
      smallFastModel: p.smallFastModel,
      defaultSonnetModel: p.defaultSonnetModel,
      defaultOpusModel: p.defaultOpusModel,
      extraEnv: p.extraEnv,
      clearInheritedEnv: p.clearInheritedEnv
    }
  }

  /** 当前所有已知 token 明文（脱敏用，调用方不得持有引用超出单次使用） */
  allSecrets(): string[] {
    const out: string[] = []
    if (!safeStorage.isEncryptionAvailable()) return out
    for (const p of this.all()) {
      const token = this.decryptToken(p)
      if (token) out.push(token)
    }
    return out
  }

  private decryptToken(p: StoredProfile): string | null {
    if (!p.authTokenEnc || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(p.authTokenEnc, 'base64'))
    } catch {
      return null // 密文损坏（如换机）：按无 token 处理，UI 会因连不上后端而暴露
    }
  }

  private all(): StoredProfile[] {
    const raw = this.store.get('profiles')
    const normalized = Array.isArray(raw)
      ? raw.map(normalizeStoredProfile).filter((p): p is StoredProfile => p !== null)
      : []
    return normalized.length > 0 ? normalized : [SUBSCRIPTION_PROFILE]
  }

  private persist(profiles: StoredProfile[]): void {
    this.store.set('profiles', profiles)
  }

  private toView(p: StoredProfile): BackendProfileView {
    return {
      id: p.id,
      name: p.name,
      auth: p.auth,
      baseUrl: p.baseUrl,
      hasToken: p.authTokenEnc !== null,
      model: p.model,
      smallFastModel: p.smallFastModel,
      defaultSonnetModel: p.defaultSonnetModel,
      defaultOpusModel: p.defaultOpusModel,
      extraEnv: p.extraEnv,
      clearInheritedEnv: p.clearInheritedEnv,
      isDefault: p.isDefault,
      presetId: p.presetId,
      category: p.category,
      websiteUrl: p.websiteUrl,
      notes: p.notes,
      modelCache: p.modelCache
    }
  }
}

function withSoleDefault(profiles: StoredProfile[], defaultId: string): StoredProfile[] {
  return profiles.map((p) => ({ ...p, isDefault: p.id === defaultId }))
}
