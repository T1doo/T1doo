/**
 * 档案落盘形态与兼容归一（纯函数，不依赖 Electron —— vitest 直测 v1→v2 兼容加载）。
 * v1（M2）字段全保留；v2（M7 §7.7.2）新增字段全部可缺省，旧档案无损加载。
 */
import type { BackendCategory } from '../../../shared/backend'

/** 落盘形态：token 只存 safeStorage(DPAPI) 密文的 base64 */
export interface StoredProfile {
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
  // —— v2（M7）——
  defaultSonnetModel: string | null
  defaultOpusModel: string | null
  presetId: string | null
  category: BackendCategory
  websiteUrl: string | null
  notes: string | null
  modelCache: string[]
}

const CATEGORIES: BackendCategory[] = [
  'official',
  'cn_official',
  'aggregator',
  'third_party',
  'custom'
]

export function sanitizeExtraEnv(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = k.trim()
    if (key && typeof v === 'string') out[key] = v
  }
  return out
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

/** v1/v2 落盘记录归一到 v2 形态（未知字段丢弃，缺失字段补默认值） */
export function normalizeStoredProfile(raw: unknown): StoredProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string') return null
  const category = CATEGORIES.includes(r.category as BackendCategory)
    ? (r.category as BackendCategory)
    : r.auth === 'subscription'
      ? 'official'
      : 'custom'
  return {
    id: r.id,
    name: r.name,
    auth: r.auth === 'custom' ? 'custom' : 'subscription',
    baseUrl: str(r.baseUrl),
    authTokenEnc: str(r.authTokenEnc),
    model: str(r.model),
    smallFastModel: str(r.smallFastModel),
    extraEnv: sanitizeExtraEnv(r.extraEnv),
    clearInheritedEnv: r.clearInheritedEnv === true,
    isDefault: r.isDefault === true,
    defaultSonnetModel: str(r.defaultSonnetModel),
    defaultOpusModel: str(r.defaultOpusModel),
    presetId: str(r.presetId),
    category,
    websiteUrl: str(r.websiteUrl),
    notes: str(r.notes),
    modelCache: Array.isArray(r.modelCache)
      ? r.modelCache.filter((m): m is string => typeof m === 'string')
      : []
  }
}
