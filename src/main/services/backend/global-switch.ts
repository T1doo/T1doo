import Store from 'electron-store'
import { homedir } from 'os'
import { join } from 'path'
import type { GlobalSwitchState, SwitchConflict, SwitchOutcome } from '../../../shared/backend'
import {
  applyManagedEnv,
  buildProfileEnvBlock,
  detectDrift,
  removeManagedEnv
} from './settings-env'
import type { BackendProfilesService } from './profiles'
import { readClaudeSettings, writeClaudeSettings } from '../claude/settings-io'
import { t } from '../i18n'

interface GlobalSwitchStore {
  authorized: boolean
  appliedProfileId: string | null
  managedKeys: string[]
}

/**
 * §7.7.5 全局切换服务（Q8 ✅）：把当前档案的 env 块写入 ~/.claude/settings.json。
 * 安全机制：首次一次性授权 + 写前备份（settings.json.bak-t1doo）+ 深合并只动记账键 +
 * 原子写（temp+rename）+ 漂移检测（冲突三选，不静默覆盖）+ 一键还原。
 */
export class GlobalSwitchService {
  private store = new Store<GlobalSwitchStore>({
    name: 'backend-global',
    defaults: { authorized: false, appliedProfileId: null, managedKeys: [] }
  })

  constructor(
    private readonly backends: BackendProfilesService,
    private readonly settingsPath = join(homedir(), '.claude', 'settings.json'),
    private readonly log: (msg: string) => void = () => {}
  ) {}

  getState(): GlobalSwitchState {
    return {
      authorized: this.store.get('authorized'),
      appliedProfileId: this.store.get('appliedProfileId'),
      managedKeys: this.store.get('managedKeys')
    }
  }

  /**
   * 一键切换：漂移检测 → 备份 → 按记账精确增删 env 键 → 原子写 → 置 isDefault。
   * authorize=true 记录首次授权；未授权且未传 authorize → 返回 error 由 UI 弹授权框。
   * force=true 跳过漂移检测（冲突三选选了"覆盖"）。
   */
  switchTo(profileId: string, opts: { authorize?: boolean; force?: boolean } = {}): SwitchOutcome {
    if (opts.authorize) this.store.set('authorized', true)
    if (!this.store.get('authorized')) {
      return this.outcome(false, null, 'unauthorized')
    }
    const resolved = this.backends.resolve(profileId)
    if (!resolved) return this.outcome(false, null, t('err.terminalNotFound', { id: profileId }))

    let settings: Record<string, unknown>
    try {
      settings = this.readSettings()
    } catch (err) {
      return this.outcome(false, null, String(err instanceof Error ? err.message : err))
    }

    // 漂移检测：live 管理键 vs 由"上次应用档案"重新生成的期望值（token 不落自家明文存储）
    if (!opts.force) {
      const conflict = this.detectConflict(settings)
      if (conflict) return this.outcome(false, conflict, null)
    }

    const block = buildProfileEnvBlock(resolved)
    const applied = applyManagedEnv(settings, block, this.store.get('managedKeys'))
    try {
      this.writeSettings(applied.settings)
    } catch (err) {
      return this.outcome(false, null, String(err instanceof Error ? err.message : err))
    }
    this.store.set('managedKeys', applied.managedKeys)
    this.store.set('appliedProfileId', resolved.auth === 'subscription' ? null : profileId)
    this.backends.setCurrent(profileId)
    this.log(`全局切换 → ${profileId}（写入 ${applied.managedKeys.length} 个 env 键）`)
    return this.outcome(true, null, null)
  }

  /** 一键还原：按记账移除全部管理键（不做整文件回滚，与 hooks 移除同口径） */
  restore(): SwitchOutcome {
    let settings: Record<string, unknown>
    try {
      settings = this.readSettings()
    } catch (err) {
      return this.outcome(false, null, String(err instanceof Error ? err.message : err))
    }
    try {
      this.writeSettings(removeManagedEnv(settings, this.store.get('managedKeys')))
    } catch (err) {
      return this.outcome(false, null, String(err instanceof Error ? err.message : err))
    }
    this.store.set('managedKeys', [])
    this.store.set('appliedProfileId', null)
    this.log('已移除全部 T1doo 管理的 env 键')
    return this.outcome(true, null, null)
  }

  /** 当前 live 是否与应用档案存在漂移（切换前检测；无应用档案 = 无漂移） */
  private detectConflict(settings: Record<string, unknown>): SwitchConflict | null {
    const appliedId = this.store.get('appliedProfileId')
    const managedKeys = this.store.get('managedKeys')
    if (!appliedId || managedKeys.length === 0) return null
    const resolved = this.backends.resolve(appliedId)
    if (!resolved) return null // 档案已删：无从比对，视为可覆盖
    const drifted = detectDrift(settings, buildProfileEnvBlock(resolved), managedKeys)
    return drifted.length > 0 ? { drifted } : null
  }

  // ---------- 文件读写（备份 + 原子写，与 hooks 退役清理共用同一底座） ----------

  private readSettings(): Record<string, unknown> {
    return readClaudeSettings(this.settingsPath)
  }

  private writeSettings(settings: Record<string, unknown>): void {
    writeClaudeSettings(this.settingsPath, settings)
  }

  /** 冲突三选之"导入为新档案"要读 live env 块 */
  readLiveSettings(): Record<string, unknown> {
    return this.readSettings()
  }

  private outcome(
    ok: boolean,
    conflict: SwitchConflict | null,
    error: string | null
  ): SwitchOutcome {
    return { ok, conflict, error, state: this.getState() }
  }
}
