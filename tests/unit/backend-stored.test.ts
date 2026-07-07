import { describe, expect, it } from 'vitest'
import { normalizeStoredProfile } from '../../src/main/services/backend/stored'

/** M2(v1) 落盘形态原样样本——M7 验收⑦：旧档案数据无损加载 */
const V1_PROFILE = {
  id: 'abc-123',
  name: 'DeepSeek',
  auth: 'custom',
  baseUrl: 'https://api.deepseek.com/anthropic',
  authTokenEnc: 'ZW5jcnlwdGVk',
  model: 'deepseek-chat',
  smallFastModel: 'deepseek-lite',
  extraEnv: { API_TIMEOUT_MS: '600000' },
  clearInheritedEnv: true,
  isDefault: true
}

describe('normalizeStoredProfile（v1→v2 兼容加载，§7.7.7）', () => {
  it('v1 记录：既有字段无损，v2 新字段补默认值', () => {
    const p = normalizeStoredProfile(V1_PROFILE)!
    expect(p).not.toBeNull()
    expect(p.id).toBe('abc-123')
    expect(p.baseUrl).toBe('https://api.deepseek.com/anthropic')
    expect(p.authTokenEnc).toBe('ZW5jcnlwdGVk')
    expect(p.extraEnv).toEqual({ API_TIMEOUT_MS: '600000' })
    expect(p.clearInheritedEnv).toBe(true)
    expect(p.isDefault).toBe(true)
    // v2 默认值
    expect(p.defaultSonnetModel).toBeNull()
    expect(p.defaultOpusModel).toBeNull()
    expect(p.presetId).toBeNull()
    expect(p.category).toBe('custom') // custom 档案缺分类 → 'custom'
    expect(p.websiteUrl).toBeNull()
    expect(p.modelCache).toEqual([])
  })

  it('v1 订阅档案缺分类 → official', () => {
    const p = normalizeStoredProfile({
      id: 'builtin-subscription',
      name: 'Max 订阅',
      auth: 'subscription'
    })!
    expect(p.category).toBe('official')
    expect(p.auth).toBe('subscription')
  })

  it('v2 记录：全字段往返', () => {
    const p = normalizeStoredProfile({
      ...V1_PROFILE,
      defaultSonnetModel: 'glm-5.1',
      defaultOpusModel: 'glm-5.1',
      presetId: 'zhipu-glm',
      category: 'cn_official',
      websiteUrl: 'https://open.bigmodel.cn',
      notes: '备注',
      modelCache: ['glm-5.1', 42, 'glm-4']
    })!
    expect(p.defaultSonnetModel).toBe('glm-5.1')
    expect(p.presetId).toBe('zhipu-glm')
    expect(p.category).toBe('cn_official')
    expect(p.modelCache).toEqual(['glm-5.1', 'glm-4']) // 非字符串项过滤
  })

  it('坏记录（缺 id/name、非对象）→ null 丢弃不崩', () => {
    expect(normalizeStoredProfile(null)).toBeNull()
    expect(normalizeStoredProfile('junk')).toBeNull()
    expect(normalizeStoredProfile({ name: 'no-id' })).toBeNull()
    expect(normalizeStoredProfile({ id: '', name: 'empty-id' })).toBeNull()
  })

  it('未知 category → 按 auth 回落', () => {
    const p = normalizeStoredProfile({ ...V1_PROFILE, category: 'bogus' })!
    expect(p.category).toBe('custom')
  })
})
