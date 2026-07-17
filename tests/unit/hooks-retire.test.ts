import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { hasOurHooks, removeHooks, retireHooks } from '../../src/main/services/claude/hooks-retire'

/**
 * §7.9.4 hooks 退役清理（验收③）。
 *
 * 与 v1.0 的注册/还原单测同口径（「移除后与原文件深度相等」），但夹具不再由自家的
 * mergeHooks 生成 —— 注册侧已随退役删除，而升级要面对的是**磁盘上真实躺着的东西**。
 * 故这里直接内联 v1.0 实际写出的命令串（取自本机会话记录里的真实注册）。
 */

/** v1.0 buildHookCommand 的真实产物 */
const V1_CMD =
  'cmd /c "curl.exe -s -m 2 -X POST http://127.0.0.1:52244/t1doo-hook' +
  ' -H "Authorization: Bearer 09c6f1015061551436a51ba4d638794a91a4ee198afae48f"' +
  ' --data-binary @- 2>NUL & exit /b 0"'

const V1_EVENTS = [
  'UserPromptSubmit',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SessionStart',
  'SessionEnd'
] as const

/** 用户自己的 settings.json（含 permissions/enabledPlugins/env 与自有 hook） */
function userSettings(): Record<string, unknown> {
  return {
    permissions: { allow: ['Bash(git *)'], deny: [] },
    enabledPlugins: ['telegram'],
    env: { ANTHROPIC_BASE_URL: 'https://example.com' },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo user-own-stop-hook' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo guard' }] }]
    }
  }
}

/** 在用户配置上叠加 v1.0 的注册，模拟升级前的磁盘状态 */
function withV1Registration(base: Record<string, unknown>): Record<string, unknown> {
  const hooks = { ...((base.hooks as Record<string, unknown>) ?? {}) }
  for (const event of V1_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : []
    hooks[event] = [...groups, { hooks: [{ type: 'command', command: V1_CMD }] }]
  }
  return { ...base, hooks }
}

describe('removeHooks（纯函数）', () => {
  it('精确还原：摘除 v1.0 注册后与原文件深度相等', () => {
    const original = userSettings()
    expect(removeHooks(withV1Registration(userSettings()))).toEqual(original)
  })

  it('原本没有 hooks 键的文件：清理后不留空 hooks 键', () => {
    const bare = { permissions: { allow: [] } }
    const cleaned = removeHooks(withV1Registration({ ...bare }))
    expect(cleaned).toEqual(bare)
    expect('hooks' in cleaned).toBe(false)
  })

  it('同组混有用户条目时只删我们的，组与用户条目保留', () => {
    const mixed = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: 'echo mine' },
              { type: 'command', command: V1_CMD }
            ]
          }
        ]
      }
    }
    const stop = (removeHooks(mixed).hooks as Record<string, { hooks: unknown[] }[]>).Stop
    expect(stop).toHaveLength(1)
    expect(stop[0].hooks).toEqual([{ type: 'command', command: 'echo mine' }])
  })

  it('端口不同的历史注册同样认得（标记是 URL 路径，不是端口）', () => {
    const other = V1_CMD.replace('52244', '60001')
    const s = { hooks: { Stop: [{ hooks: [{ type: 'command', command: other }] }] } }
    expect(hasOurHooks(s)).toBe(true)
    expect(removeHooks(s)).toEqual({})
  })

  it('用户自己的 hooks（无标记）分毫不动', () => {
    const s = userSettings()
    expect(hasOurHooks(s)).toBe(false)
    expect(removeHooks(s)).toEqual(s)
  })

  it('hooks 键结构异常（非数组）时原样透传，不抛不吞', () => {
    const weird = { hooks: { Stop: 'not-an-array' } }
    expect(removeHooks(weird)).toEqual(weird)
  })
})

describe('retireHooks（落盘，验收③）', () => {
  function tmpSettings(content: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 't1doo-retire-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify(content, null, 2), 'utf8')
    return path
  }

  it('检测到 v1.0 注册 → 精确移除、备份存在、其余键深度相等', () => {
    const path = tmpSettings(withV1Registration(userSettings()))
    expect(retireHooks(path)).toBe(true)

    const after = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(after).toEqual(userSettings())
    expect(existsSync(`${path}.bak-t1doo`)).toBe(true)
    // 备份留的是清理前的原样
    expect(JSON.parse(readFileSync(`${path}.bak-t1doo`, 'utf8'))).toEqual(
      withV1Registration(userSettings())
    )
  })

  it('无我们的注册 → 不写盘、不备份、返回 false', () => {
    const path = tmpSettings(userSettings())
    const before = readFileSync(path, 'utf8')
    expect(retireHooks(path)).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(existsSync(`${path}.bak-t1doo`)).toBe(false)
  })

  it('清理幂等：第二次启动不再动它', () => {
    const path = tmpSettings(withV1Registration(userSettings()))
    expect(retireHooks(path)).toBe(true)
    expect(retireHooks(path)).toBe(false)
  })

  it('文件不存在 → false（全新用户）', () => {
    const dir = mkdtempSync(join(tmpdir(), 't1doo-retire-'))
    expect(retireHooks(join(dir, 'settings.json'))).toBe(false)
  })

  it('结构异常（顶层是数组）→ 抛错且绝不覆盖用户文件', () => {
    const path = tmpSettings([1, 2, 3])
    const before = readFileSync(path, 'utf8')
    expect(() => retireHooks(path)).toThrow()
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('JSON 语法坏掉 → 抛错且绝不覆盖用户文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 't1doo-retire-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, '{ "hooks": ', 'utf8')
    expect(() => retireHooks(path)).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{ "hooks": ')
  })

  it('空文件 → 视作 {}，false', () => {
    const dir = mkdtempSync(join(tmpdir(), 't1doo-retire-'))
    const path = join(dir, 'settings.json')
    writeFileSync(path, '   \n', 'utf8')
    expect(retireHooks(path)).toBe(false)
  })
})
