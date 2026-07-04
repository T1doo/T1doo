import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import type { BackendProfileInput, BackendProfileView } from '../../../shared/backend'
import type { ResolvedBackend } from './env'

/** 落盘形态：token 只存 safeStorage(DPAPI) 密文的 base64 */
interface StoredProfile {
  id: string
  name: string
  auth: 'subscription' | 'custom'
  baseUrl: string | null
  authTokenEnc: string | null
  model: string | null
  smallFastModel: string | null
  extraEnv: Record<string, string>
  clearInheritedEnv: boolean
  isDefault: boolean
}

interface BackendStoreShape {
  profiles: StoredProfile[]
}

const SUBSCRIPTION_PROFILE: StoredProfile = {
  id: 'builtin-subscription',
  name: 'Max 订阅（登录态）',
  auth: 'subscription',
  baseUrl: null,
  authTokenEnc: null,
  model: null,
  smallFastModel: null,
  extraEnv: {},
  clearInheritedEnv: false,
  isDefault: true
}

function sanitizeExtraEnv(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.trim()
    if (key && typeof v === 'string') out[key] = v
  }
  return out
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
          throw new Error('系统加密（DPAPI）不可用，拒绝保存明文 token')
        }
        authTokenEnc = safeStorage.encryptString(input.token).toString('base64')
      }
    }

    const next: StoredProfile = {
      id: existing?.id ?? randomUUID(),
      name: input.name.trim() || '未命名档案',
      auth: input.auth === 'custom' ? 'custom' : 'subscription',
      baseUrl: input.baseUrl?.trim() || null,
      authTokenEnc,
      model: input.model?.trim() || null,
      smallFastModel: input.smallFastModel?.trim() || null,
      extraEnv: sanitizeExtraEnv(input.extraEnv),
      clearInheritedEnv: input.clearInheritedEnv === true,
      isDefault: input.isDefault === true || (existing?.isDefault ?? false)
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

  getDefaultId(): string {
    const all = this.all()
    return (all.find((p) => p.isDefault) ?? all[0] ?? SUBSCRIPTION_PROFILE).id
  }

  /** 解密档案供 spawn 注入；id 缺省/未知 → null（按订阅态处理） */
  resolve(id: string | undefined | null): ResolvedBackend | null {
    if (!id) return null
    const p = this.all().find((x) => x.id === id)
    if (!p) return null
    let token: string | null = null
    if (p.authTokenEnc && safeStorage.isEncryptionAvailable()) {
      try {
        token = safeStorage.decryptString(Buffer.from(p.authTokenEnc, 'base64'))
      } catch {
        token = null // 密文损坏（如换机）：按无 token 处理，UI 会因连不上后端而暴露
      }
    }
    return {
      auth: p.auth,
      baseUrl: p.baseUrl,
      token,
      model: p.model,
      smallFastModel: p.smallFastModel,
      extraEnv: p.extraEnv,
      clearInheritedEnv: p.clearInheritedEnv
    }
  }

  /** 当前所有已知 token 明文（脱敏用，调用方不得持有引用超出单次使用） */
  allSecrets(): string[] {
    const out: string[] = []
    if (!safeStorage.isEncryptionAvailable()) return out
    for (const p of this.all()) {
      if (!p.authTokenEnc) continue
      try {
        out.push(safeStorage.decryptString(Buffer.from(p.authTokenEnc, 'base64')))
      } catch {
        // 忽略坏密文
      }
    }
    return out
  }

  private all(): StoredProfile[] {
    const raw = this.store.get('profiles')
    return Array.isArray(raw) && raw.length > 0 ? raw : [SUBSCRIPTION_PROFILE]
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
      extraEnv: p.extraEnv,
      clearInheritedEnv: p.clearInheritedEnv,
      isDefault: p.isDefault
    }
  }
}

function withSoleDefault(profiles: StoredProfile[], defaultId: string): StoredProfile[] {
  return profiles.map((p) => ({ ...p, isDefault: p.id === defaultId }))
}
