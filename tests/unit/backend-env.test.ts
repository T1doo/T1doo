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
    defaultSonnetModel: null,
    defaultOpusModel: null,
    extraEnv: {},
    clearInheritedEnv: false,
    ...over
  }
}

function subscription(over: Partial<ResolvedBackend> = {}): ResolvedBackend {
  return {
    auth: 'subscription',
    baseUrl: null,
    token: null,
    model: null,
    smallFastModel: null,
    defaultSonnetModel: null,
    defaultOpusModel: null,
    extraEnv: {},
    clearInheritedEnv: false,
    ...over
  }
}

describe('buildClaudeEnv（§7.2.6 注入 / §7.7.5 覆盖中和——2026-07-07 实测：子进程 env > settings env，空串=未设置）', () => {
  it('跟随全局（null）：原样透传，不覆盖任何 ANTHROPIC_*（settings.json env 块自然生效）', () => {
    const env = buildClaudeEnv(BASE, null)
    expect(env.ANTHROPIC_API_KEY).toBe('inherited-key')
    expect(env.ANTHROPIC_BASE_URL).toBe('https://inherited.example.com')
    expect(env.PATH).toBe('C:\\Windows')
    expect('UNDEF' in env).toBe(false)
  })

  it('显式订阅态：剥除继承 ANTHROPIC_* 且核心键置空——中和全局块，强制登录态', () => {
    const env = buildClaudeEnv(BASE, subscription())
    expect(env.ANTHROPIC_BASE_URL).toBe('')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('')
    expect(env.ANTHROPIC_API_KEY).toBe('')
    expect(env.ANTHROPIC_MODEL).toBe('')
    expect(env.PATH).toBe('C:\\Windows')
  })

  it('custom：注入 BASE_URL/AUTH_TOKEN/MODEL/DEFAULT_{HAIKU,SONNET,OPUS}_MODEL', () => {
    const env = buildClaudeEnv(
      BASE,
      custom({ defaultSonnetModel: 'glm-sonnet', defaultOpusModel: 'glm-opus' })
    )
    expect(env.ANTHROPIC_BASE_URL).toBe('https://gw.example.com')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-1234567890')
    expect(env.ANTHROPIC_MODEL).toBe('deepseek-v3')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('deepseek-lite')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('glm-sonnet')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('glm-opus')
  })

  it('custom：ANTHROPIC_API_KEY 置空（与 AUTH_TOKEN 同设冲突，附录 A.4）且不继承', () => {
    const env = buildClaudeEnv(BASE, custom())
    expect(env.ANTHROPIC_API_KEY).toBe('')
  })

  it('custom：extraEnv 追加且可覆盖，空键丢弃', () => {
    const env = buildClaudeEnv(
      BASE,
      custom({ extraEnv: { ANTHROPIC_CUSTOM_HEADERS: 'x: 1', '': 'drop' } })
    )
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe('x: 1')
    expect('' in env).toBe(false)
  })

  it('custom 未填的模型映射键：置空中和（不残留全局块的旧值）', () => {
    const env = buildClaudeEnv({}, custom({ model: null, smallFastModel: null }))
    expect(env.ANTHROPIC_MODEL).toBe('')
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('')
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('')
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('')
  })
})

describe('redactSecrets（token 不落日志）', () => {
  it('替换全部命中；短于 8 字符的秘密不参与（避免误伤）', () => {
    expect(
      redactSecrets('token=sk-test-1234567890 again sk-test-1234567890', ['sk-test-1234567890'])
    ).toBe('token=*** again ***')
    expect(redactSecrets('short abc', ['abc'])).toBe('short abc')
  })
})
