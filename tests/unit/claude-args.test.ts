import { describe, expect, it } from 'vitest'
import { buildClaudeArgs } from '../../src/main/services/terminal/claude-cmd'

const NEW_ID = '99999999-9999-4999-8999-999999999999'

describe('buildClaudeArgs（§7.2.2 / §7.2.3）', () => {
  it('新建：预生成 UUID 传 --session-id，绑定即刻确定', () => {
    const { args, sessionId } = buildClaudeArgs({}, NEW_ID)
    expect(args).toEqual(['--session-id', NEW_ID])
    expect(sessionId).toBe(NEW_ID)
  })

  it('恢复：--resume 且绑定 resume 目标，不用新 id', () => {
    const { args, sessionId } = buildClaudeArgs({ resumeSessionId: 'abc-123' }, NEW_ID)
    expect(args).toEqual(['--resume', 'abc-123'])
    expect(sessionId).toBe('abc-123')
  })

  it('model / permissionMode / name / extraArgs 全量透传', () => {
    const { args } = buildClaudeArgs(
      {
        model: 'claude-opus-4-8',
        permissionMode: 'acceptEdits',
        name: '修复登录页',
        extraArgs: ['--verbose']
      },
      NEW_ID
    )
    expect(args).toEqual([
      '--session-id',
      NEW_ID,
      '--model',
      'claude-opus-4-8',
      '--permission-mode',
      'acceptEdits',
      '-n',
      '修复登录页',
      '--verbose'
    ])
  })

  it('permissionMode=default 不产生 --permission-mode 参数', () => {
    const { args } = buildClaudeArgs({ permissionMode: 'default' }, NEW_ID)
    expect(args).toEqual(['--session-id', NEW_ID])
  })

  it('bypassPermissions 照传（UI 层负责风险确认）', () => {
    const { args } = buildClaudeArgs({ permissionMode: 'bypassPermissions' }, NEW_ID)
    expect(args).toContain('bypassPermissions')
  })
})
