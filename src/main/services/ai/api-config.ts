import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { AiApiConfig, AiApiConfigInput } from '../../../shared/ai'
import { DEFAULT_API_MODEL } from '../../../shared/ai'

interface AiApiStoreShape {
  /** safeStorage(DPAPI) 密文 base64；明文永不落盘（验收②） */
  apiKeyEnc: string | null
  baseUrl: string | null
  model: string
}

/** F5 API 引擎配置：Key 走 DPAPI 加密存储，与后端档案 token 同一安全口径（§11） */
export class AiApiConfigService {
  private store = new Store<AiApiStoreShape>({
    name: 'ai-api',
    defaults: { apiKeyEnc: null, baseUrl: null, model: DEFAULT_API_MODEL }
  })

  get(): AiApiConfig {
    const key = this.resolveKey()
    return {
      hasKey: key !== null,
      keyTail: key ? key.slice(-4) : null,
      baseUrl: this.store.get('baseUrl'),
      model: this.store.get('model') || DEFAULT_API_MODEL
    }
  }

  set(input: AiApiConfigInput): AiApiConfig {
    if (input.apiKey !== undefined) {
      if (input.apiKey === '') {
        this.store.set('apiKeyEnc', null)
      } else {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('系统加密（DPAPI）不可用，拒绝保存明文 API Key')
        }
        this.store.set('apiKeyEnc', safeStorage.encryptString(input.apiKey).toString('base64'))
      }
    }
    if (input.baseUrl !== undefined) {
      this.store.set('baseUrl', input.baseUrl.trim() || null)
    }
    if (input.model !== undefined && input.model.trim()) {
      this.store.set('model', input.model.trim())
    }
    return this.get()
  }

  /** 解密 Key（仅主进程内存中短暂存在，随请求注入 SDK） */
  resolveKey(): string | null {
    const enc = this.store.get('apiKeyEnc')
    if (!enc || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null // 密文损坏（如换机）：按未配置处理
    }
  }
}
