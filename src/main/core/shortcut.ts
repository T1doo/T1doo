import { globalShortcut } from 'electron'

/**
 * 启动器全局热键（§7.3 / R5）：注册失败（被 PowerToys Run 等占用）不抛错，
 * 状态暴露给设置页提示改绑。
 */
export class LauncherShortcut {
  private current: string | null = null
  registered = false
  error: string | null = null

  /** 换绑：先解除旧键再注册新键；返回是否成功 */
  apply(accelerator: string, handler: () => void): boolean {
    if (this.current) {
      try {
        globalShortcut.unregister(this.current)
      } catch {
        // 未注册成功过时 unregister 可能抛错，忽略
      }
      this.current = null
    }
    this.registered = false
    this.error = null
    try {
      this.registered = globalShortcut.register(accelerator, handler)
      if (!this.registered) this.error = `热键 ${accelerator} 已被其它程序占用`
    } catch (err) {
      this.error = `热键格式无效：${err instanceof Error ? err.message : String(err)}`
    }
    if (this.registered) this.current = accelerator
    return this.registered
  }

  dispose(): void {
    globalShortcut.unregisterAll()
  }
}
