import { createContext, useContext } from 'react'

export type PageId =
  'dashboard' | 'sessions' | 'terminals' | 'files' | 'chat' | 'tasks' | 'settings'

export interface AppNav {
  goPage(page: PageId): void
  /** 跳到终端页并聚焦指定终端（恢复会话 / 通知点击 / Dashboard 卡片） */
  goTerminal(terminalId?: string): void
  /** 跳到会话页并打开指定会话详情（F4「跳到动过它的会话」等） */
  goSession(sessionId: string): void
}

export const AppNavContext = createContext<AppNav>({
  goPage: () => {},
  goTerminal: () => {},
  goSession: () => {}
})

export function useAppNav(): AppNav {
  return useContext(AppNavContext)
}
