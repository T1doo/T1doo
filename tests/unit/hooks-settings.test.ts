import { describe, expect, it } from 'vitest'
import {
  HOOK_EVENTS,
  buildHookCommand,
  hasOurHooks,
  mergeHooks,
  removeHooks
} from '../../src/main/services/hooks/settings-file'

const CMD = buildHookCommand(45678, 'tok-abcdef')

/** 模拟本机实测的真实 settings.json：含 permissions/enabledPlugins/env 与用户自有 hook */
function userSettings(): Record<string, unknown> {
  return {
    permissions: { allow: ['Bash(git *)'], deny: [] },
    enabledPlugins: ['telegram'],
    env: { FOO: 'bar' },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo user-own-stop-hook' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo guard' }] }]
    }
  }
}

describe('hooks settings.json 注册/还原（§7.2.4，验收③）', () => {
  it('buildHookCommand：始终 exit 0、2 秒超时、Bearer token、静默失败', () => {
    expect(CMD).toContain('curl.exe -s -m 2')
    expect(CMD).toContain('http://127.0.0.1:45678/t1doo-hook')
    expect(CMD).toContain('Authorization: Bearer tok-abcdef')
    expect(CMD).toContain('exit /b 0')
    expect(CMD).toContain('2>NUL')
  })

  it('merge：六个事件全注册，permissions/enabledPlugins/env 与用户 hooks 原样保留', () => {
    const merged = mergeHooks(userSettings(), CMD)
    expect(merged.permissions).toEqual({ allow: ['Bash(git *)'], deny: [] })
    expect(merged.enabledPlugins).toEqual(['telegram'])
    expect(merged.env).toEqual({ FOO: 'bar' })

    const hooks = merged.hooks as Record<string, { hooks: { command: string }[] }[]>
    for (const event of HOOK_EVENTS) {
      const groups = hooks[event]
      expect(groups.some((g) => g.hooks.some((h) => h.command === CMD))).toBe(true)
    }
    // 用户自有 Stop hook 与 PreToolUse 守卫仍在
    expect(
      hooks.Stop.some((g) => g.hooks.some((h) => h.command.includes('user-own-stop-hook')))
    ).toBe(true)
    expect(hooks.PreToolUse).toHaveLength(1)
  })

  it('merge 幂等：端口变化时重复注册不产生重复条目', () => {
    const once = mergeHooks(userSettings(), CMD)
    const newCmd = buildHookCommand(50000, 'tok-new')
    const twice = mergeHooks(once, newCmd)
    const hooks = twice.hooks as Record<string, { hooks: { command: string }[] }[]>
    for (const event of HOOK_EVENTS) {
      const ours = hooks[event]
        .flatMap((g) => g.hooks)
        .filter((h) => h.command.includes('/t1doo-hook'))
      expect(ours).toHaveLength(1)
      expect(ours[0].command).toBe(newCmd)
    }
  })

  it('remove：精确还原 —— merge 后 remove 与原文件深度相等', () => {
    const original = userSettings()
    const roundTrip = removeHooks(mergeHooks(userSettings(), CMD))
    expect(roundTrip).toEqual(original)
  })

  it('remove：原本没有 hooks 键的文件，merge→remove 后不留空 hooks 键', () => {
    const bare = { permissions: { allow: [] } }
    const roundTrip = removeHooks(mergeHooks({ ...bare }, CMD))
    expect(roundTrip).toEqual(bare)
    expect('hooks' in roundTrip).toBe(false)
  })

  it('remove：同组混有用户条目时只删我们的，组保留', () => {
    const mixed = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: 'echo mine' },
              { type: 'command', command: CMD }
            ]
          }
        ]
      }
    }
    const cleaned = removeHooks(mixed)
    const stop = (cleaned.hooks as Record<string, { hooks: { command: string }[] }[]>).Stop
    expect(stop).toHaveLength(1)
    expect(stop[0].hooks).toEqual([{ type: 'command', command: 'echo mine' }])
  })

  it('hasOurHooks：注册前 false / 注册后 true / 移除后 false', () => {
    const s = userSettings()
    expect(hasOurHooks(s)).toBe(false)
    const merged = mergeHooks(s, CMD)
    expect(hasOurHooks(merged)).toBe(true)
    expect(hasOurHooks(removeHooks(merged))).toBe(false)
  })
})
