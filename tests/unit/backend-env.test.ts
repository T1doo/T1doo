import { describe, expect, it } from 'vitest'
import { buildClaudeEnv, redactSecrets } from '../../src/main/services/backend/env'
import type { ResolvedBackend } from '../../src/main/services/backend/env'

const BASE = {
  PATH: 'C:\\Windows',
  ANTHROPIC_API_KEY: 'inherited-key',
  ANTHROPIC_BASE_URL: 'https://inherited.example.com',
  UNDEF: undefined
}

function custom(over: Partial<ResolvedBackend> = {}): ResolvedBackend {
  return {
    auth: 'custom',
    baseUrl: 'https://gw.example.com',
    token: 'sk-test-1234567890',
    model: 'deepseek-v3',
    smallFastModel: 'deepseek-lite',
    extraEnv: {},
    clearInheritedEnv: false,
    ...over
  }
}

describe('buildClaudeEnv（§7.2.6 注入机制）', () => {
  it('订阅态（null）：原样透传，不覆盖任何 ANTHROPIC_*', () => {
    const env = buildClaudeEnv(BASE, null)
    expect(env.ANTHROPIC_API_KEY).toBe('inherited-key')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://inherited.example.com')
    expect(env.PATH).toBe('C:\\Windows')
    expect('UNDEF' in env).toBe(false)
  })

  it('订阅态 clearInheritedEnv：剥除全部继承的 ANTHROPIC_*', () => {
    const env = buildClaudeEnv(BASE, {
      auth: 'subscription',
      baseUrl: null,
      token: null,
      model: null,
      smallFastModel: null,
      extraEnv: {},
      clearInheritedEnv: true
    })
    expect('ANTHROPIC_API_KEY' in env).toBe(false)
    expect('ANTHROPIC_BASE_URL' in env).toBe(false)
    expect(env.PATH).toBe('C:\\Windows')
  })

  it('custom：注入 BASE_URL/AUTH_TOKEN/MODEL/DEFAULT_HAIKU_MODEL', () => {
    const env = buildClaudeEnv(BASE, custom())
    expect(env.ANTHROPIC_BASE_URL).toBe('https://gw.example.com')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-1234567890')
    expect(env.ANTHROPIC_MODEL).toBe('deepseek-v3')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('deepseek-lite')
  })

  it('custom：删除继承的 ANTHROPIC_API_KEY（与 AUTH_TOKEN 同设冲突，附录 A.4）', () => {
    const env = buildClaudeEnv(BASE, custom())
    expect('ANTHROPIC_API_KEY' in env).toBe(false)
  })

  it('custom：extraEnv 追加且可覆盖，空键丢弃', () => {
    const env = buildClaudeEnv(BASE, custom({ extraEnv: { ANTHROPIC_CUSTOM_HEADERS: 'x: 1', '': 'drop' } }))
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe('x: 1')
    expect('' in env).toBe(false)
  })

  it('custom 未填 model/smallFastModel：不注入对应变量', () => {
    const env = buildClaudeEnv({}, custom({ model: null, smallFastModel: null }))
    expect('ANTHROPIC_MODEL' in env).toBe(false)
    expect('ANTHROPIC_DEFAULT_HAIKU_MODEL' in env).toBe(false)
  })
})

describe('redactSecrets（token 不落日志）', () => {
  it('替换全部命中；短于 8 字符的秘密不参与（避免误伤）', () => {
    expect(redactSecrets('token=sk-test-1234567890 again sk-test-1234567890', ['sk-test-1234567890'])).toBe(
      'token=*** again ***'
    )
    expect(redactSecrets('short abc', ['abc'])).toBe('short abc')
  })
})
