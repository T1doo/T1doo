import { describe, expect, it } from 'vitest'
import { buildCliChatArgs, buildUserMessageLine } from '../../src/main/services/ai/engine-cli'
import { buildTaskArgs } from '../../src/main/services/ai/task-queue'

describe('cli 引擎参数构造（§7.5.1）', () => {
  it('长连基础参数：stream-json 双向 + 纯问答 + 不写会话历史', () => {
    const args = buildCliChatArgs()
    expect(args).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--tools',
      '',
      '--no-session-persistence'
    ])
  })

  it('model 透传 --model', () => {
    expect(buildCliChatArgs('claude-haiku-4-5')).toContain('--model')
    expect(buildCliChatArgs('claude-haiku-4-5')).toContain('claude-haiku-4-5')
    expect(buildCliChatArgs(null)).not.toContain('--model')
  })

  it('stdin 用户消息行：stream-json 输入格式 + 换行结尾', () => {
    const line = buildUserMessageLine('多行\n内容 "带引号"')
    expect(line.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(line)
    expect(parsed).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '多行\n内容 "带引号"' }] }
    })
  })
})

describe('任务队列参数构造（§7.5.2）', () => {
  it('基础参数：-p 提示词 + stream-json + 预生成 session-id', () => {
    const args = buildTaskArgs({ prompt: '修一个 bug', cwd: 'E:\\proj' }, 'sid-1')
    expect(args).toEqual([
      '-p',
      '修一个 bug',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
      'sid-1'
    ])
  })

  it('可选项：model / permission-mode / max-budget-usd', () => {
    const args = buildTaskArgs(
      {
        prompt: 'x',
        cwd: 'E:\\proj',
        model: 'claude-sonnet-5',
        permissionMode: 'acceptEdits',
        maxBudgetUsd: 1.5
      },
      'sid-2'
    )
    expect(args).toContain('--model')
    expect(args).toContain('claude-sonnet-5')
    expect(args).toContain('--permission-mode')
    expect(args).toContain('acceptEdits')
    expect(args).toContain('--max-budget-usd')
    expect(args).toContain('1.5')
  })

  it('default 权限模式不传 --permission-mode；非法预算不传成本闸', () => {
    const args = buildTaskArgs(
      { prompt: 'x', cwd: 'E:\\proj', permissionMode: 'default', maxBudgetUsd: 0 },
      'sid-3'
    )
    expect(args).not.toContain('--permission-mode')
    expect(args).not.toContain('--max-budget-usd')
  })
})
