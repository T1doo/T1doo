import { app } from 'electron'

/** 开机自启注册；开发环境跳过，避免把 dev 版 electron.exe 写进登录项 */
export function applyAutoLaunch(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden']
  })
}
