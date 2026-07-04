import { createContext, useContext } from 'react'

export type PageId =
  'dashboard' | 'sessions' | 'terminals' | 'files' | 'chat' | 'tasks' | 'settings'

export interface AppNav {
  goPage(page: PageId): void
  /** 跳到终端页并聚焦指定终端（恢复会话 / 通知点击 / Dashboard 卡片） */
  goTerminal(terminalId?: string): void
}

export const AppNavContext = createContext<AppNav>({
  goPage: () => {},
  goTerminal: () => {}
})

export function useAppNav(): AppNav {
  return useContext(AppNavContext)
}
