import Store from 'electron-store'

/**
 * §7.9.4 hooks 退役的一次性告知标记。
 *
 * 清理发生在启动瞬间，但 T1doo 可能**隐藏启动到托盘**（settings.startHidden）——
 * 若只用内存标记，用户这次根本看不到就没了。故落盘保留，直到用户确认才消抹。
 */
export class RetireNoticeStore {
  private store = new Store<{ pending: boolean }>({
    name: 'status',
    defaults: { pending: false }
  })

  markPending(): void {
    this.store.set('pending', true)
  }

  get(): boolean {
    return this.store.get('pending')
  }

  dismiss(): void {
    this.store.set('pending', false)
  }
}
