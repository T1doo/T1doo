import { describe, expect, it } from 'vitest'
import {
  applyManagedEnv,
  buildProfileEnvBlock,
  detectDrift,
  extractProfileFromEnv,
  removeManagedEnv
} from '../../src/main/services/backend/settings-env'
import type { ResolvedBackend } from '../../src/main/services/backend/env'

function resolved(over: Partial<ResolvedBackend> = {}): ResolvedBackend {
  return {
    auth: 'custom',
    baseUrl: 'https://api.deepseek.com/anthropic',
    token: 'sk-secret-1234567890',
    model: 'deepseek-chat',
    smallFastModel: 'deepseek-chat',
    defaultSonnetModel: 'deepseek-chat',
    defaultOpusModel: 'deepseek-reasoner',
    extraEnv: { API_TIMEOUT_MS: '600000' },
    clearInheritedEnv: false,
    ...over
  }
}

/** 模拟用户既有 settings.json（含 hooks/permissions/自有 env 键——全都不许动） */
const USER_SETTINGS = {
  permissions: { allow: ['Bash(git *)'] },
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-own' }] }] },
  env: { MY_OWN_VAR: 'keep-me' },
  theme: 'dark'
}

describe('buildProfileEnvBlock（§7.7.5 由档案生成 env 块）', () => {
  it('custom：全字段映射 + extraEnv；只含有值的键', () => {
    const block = buildProfileEnvBlock(resolved())
    expect(block).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'sk-secret-1234567890',
      ANTHROPIC_MODEL: 'deepseek-chat',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-chat',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-chat',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-reasoner',
      API_TIMEOUT_MS: '600000'
    })
  })

  it('缺省字段不产生键；订阅态恒为空块（切换即只移除管理键）', () => {
    expect(buildProfileEnvBlock(resolved({ token: null, model: null }))).not.toHaveProperty(
      'ANTHROPIC_AUTH_TOKEN'
    )
    expect(buildProfileEnvBlock(resolved({ auth: 'subscription' }))).toEqual({})
  })
})

describe('applyManagedEnv / removeManagedEnv（管理键记账，深合并只动自己的键）', () => {
  it('写入：用户自有 env 键与顶层键分毫不动', () => {
    const block = buildProfileEnvBlock(resolved())
    const { settings, managedKeys } = applyManagedEnv(USER_SETTINGS, block, [])
    const env = settings.env as Record<string, string>
    expect(env.MY_OWN_VAR).toBe('keep-me')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic')
    expect(settings.permissions).toEqual(USER_SETTINGS.permissions)
    expect(settings.hooks).toEqual(USER_SETTINGS.hooks)
    expect(settings.theme).toBe('dark')
    expect(managedKeys.sort()).toEqual(Object.keys(block).sort())
  })

  it('换档：按上次记账精确移除旧键再写新键（旧档多出的键不残留）', () => {
    const first = applyManagedEnv(USER_SETTINGS, buildProfileEnvBlock(resolved()), [])
    const second = applyManagedEnv(
      first.settings,
      buildProfileEnvBlock(
        resolved({
          baseUrl: 'https://open.bigmodel.cn/api/anthropic',
          token: 'sk-glm-0987654321',
          extraEnv: {} // 新档没有 API_TIMEOUT_MS
        })
      ),
      first.managedKeys
    )
    const env = second.settings.env as Record<string, string>
    expect(env.ANTHROPIC_BASE_URL).toBe('https://open.bigmodel.cn/api/anthropic')
    expect('API_TIMEOUT_MS' in env).toBe(false) // 旧档管理键被精确清除
    expect(env.MY_OWN_VAR).toBe('keep-me')
  })

  it('还原：移除全部管理键后与原文件深度相等；env 变空时连 env 键收干净', () => {
    const { settings, managedKeys } = applyManagedEnv(
      USER_SETTINGS,
      buildProfileEnvBlock(resolved()),
      []
    )
    expect(removeManagedEnv(settings, managedKeys)).toEqual(USER_SETTINGS)

    const bare = applyManagedEnv({}, buildProfileEnvBlock(resolved()), [])
    expect(removeManagedEnv(bare.settings, bare.managedKeys)).toEqual({})
  })
})

describe('detectDrift（§7.7.5 冲突检测：只看管理键）', () => {
  const block = buildProfileEnvBlock(resolved())
  const applied = applyManagedEnv(USER_SETTINGS, block, [])

  it('未漂移 → 空；用户自有键的变化不算漂移', () => {
    expect(detectDrift(applied.settings, block, applied.managedKeys)).toEqual([])
    const touched = {
      ...applied.settings,
      env: { ...(applied.settings.env as object), MY_OWN_VAR: 'changed' }
    }
    expect(detectDrift(touched, block, applied.managedKeys)).toEqual([])
  })

  it('管理键被改/被删 → 漂移；token 类值脱敏为尾 4 位', () => {
    const env = { ...(applied.settings.env as Record<string, string>) }
    env.ANTHROPIC_BASE_URL = 'https://hand-edited.example.com'
    env.ANTHROPIC_AUTH_TOKEN = 'sk-other-5678'
    delete env.ANTHROPIC_MODEL
    const drifted = detectDrift({ ...applied.settings, env }, block, applied.managedKeys)
    const keys = drifted.map((d) => d.key).sort()
    expect(keys).toEqual(['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'])
    const token = drifted.find((d) => d.key === 'ANTHROPIC_AUTH_TOKEN')!
    expect(token.live).toBe('…5678')
    expect(token.expected).toBe('…7890')
    expect(token.live).not.toContain('sk-other')
  })
})

describe('extractProfileFromEnv（冲突三选之"导入为新档案"）', () => {
  it('核心键映射为档案字段，其余归 extraEnv；API_KEY 兜底为 token', () => {
    const out = extractProfileFromEnv({
      env: {
        ANTHROPIC_BASE_URL: 'https://gw.example.com',
        ANTHROPIC_API_KEY: 'sk-via-api-key',
        ANTHROPIC_MODEL: 'kimi-k2.7-code',
        SOME_EXTRA: 'x'
      }
    })
    expect(out.baseUrl).toBe('https://gw.example.com')
    expect(out.token).toBe('sk-via-api-key')
    expect(out.model).toBe('kimi-k2.7-code')
    expect(out.extraEnv).toEqual({ SOME_EXTRA: 'x' })
  })

  it('无 env 块 → 全空', () => {
    const out = extractProfileFromEnv({})
    expect(out.baseUrl).toBeNull()
    expect(out.token).toBeNull()
    expect(out.extraEnv).toEqual({})
  })
})
