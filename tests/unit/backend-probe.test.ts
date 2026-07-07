import { describe, expect, it } from 'vitest'
import { modelsCandidates, parseModelsResponse } from '../../src/main/services/backend/probe'
import { BACKEND_PRESETS } from '../../src/shared/backend-presets'

describe('modelsCandidates（§7.7.4 兼容子路径剥离回退，cc-switch 同款）', () => {
  it('无兼容子路径：仅 base 两个候选', () => {
    expect(modelsCandidates('https://api.example.com/')).toEqual([
      'https://api.example.com/v1/models',
      'https://api.example.com/models'
    ])
  })

  it('DeepSeek /anthropic：追加根路径变体（模型列表在根上）', () => {
    expect(modelsCandidates('https://api.deepseek.com/anthropic')).toEqual([
      'https://api.deepseek.com/anthropic/v1/models',
      'https://api.deepseek.com/anthropic/models',
      'https://api.deepseek.com/v1/models',
      'https://api.deepseek.com/models'
    ])
  })

  it('智谱 /api/anthropic 与百炼 /apps/anthropic：剥到根', () => {
    expect(modelsCandidates('https://open.bigmodel.cn/api/anthropic')).toContain(
      'https://open.bigmodel.cn/v1/models'
    )
    expect(modelsCandidates('https://dashscope.aliyuncs.com/apps/anthropic')).toContain(
      'https://dashscope.aliyuncs.com/v1/models'
    )
  })
})

describe('parseModelsResponse（§7.7.4 双形态兼容解析）', () => {
  it('OpenAI 形态 {data:[{id}]}', () => {
    expect(
      parseModelsResponse({
        object: 'list',
        data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }]
      })
    ).toEqual(['deepseek-chat', 'deepseek-reasoner'])
  })

  it('Anthropic 形态 {data:[{id,display_name}]}', () => {
    expect(
      parseModelsResponse({
        data: [
          { type: 'model', id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' },
          { type: 'model', id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' }
        ],
        has_more: false
      })
    ).toEqual(['claude-opus-4-8', 'claude-haiku-4-5'])
  })

  it('坏形态一律空数组（null/非对象/data 非数组/项缺 id）', () => {
    expect(parseModelsResponse(null)).toEqual([])
    expect(parseModelsResponse('x')).toEqual([])
    expect(parseModelsResponse({ data: 'nope' })).toEqual([])
    expect(parseModelsResponse({ data: [{ name: 'no-id' }, null, { id: 'ok' }] })).toEqual(['ok'])
  })
})

describe('BACKEND_PRESETS（§7.7.3 预设完整性）', () => {
  it('预设清单固定 6 家（2026-07-07 用户裁决精简：国产仅 DeepSeek/GLM/Kimi），id 唯一', () => {
    expect(BACKEND_PRESETS.map((p) => p.id)).toEqual([
      'subscription',
      'anthropic-api',
      'deepseek',
      'kimi',
      'zhipu-glm',
      'custom'
    ])
  })

  it('custom 预设的 baseUrl/链接均为 https', () => {
    for (const p of BACKEND_PRESETS) {
      if (p.baseUrl) expect(p.baseUrl).toMatch(/^https:\/\//)
      if (p.websiteUrl) expect(p.websiteUrl).toMatch(/^https:\/\//)
      if (p.apiKeyUrl) expect(p.apiKeyUrl).toMatch(/^https:\/\//)
    }
  })

  it('订阅预设恒存在且为 subscription；其余 custom 预设都有 baseUrl（空白模板除外）', () => {
    const sub = BACKEND_PRESETS.find((p) => p.id === 'subscription')!
    expect(sub.auth).toBe('subscription')
    for (const p of BACKEND_PRESETS) {
      if (p.auth === 'custom' && p.id !== 'custom') expect(p.baseUrl).toBeTruthy()
    }
  })
})
