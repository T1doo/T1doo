import { createContext, useContext } from 'react'

export type PageId =
  | 'dashboard'
  | 'sessions'
  | 'terminals'
  | 'chat'
  | 'tasks'
  | 'models'
  | 'usage'
  | 'settings'

export interface AppNav {
  goPage(page: PageId): void
  /** 跳到终端页并聚焦指定终端（恢复会话 / 通知点击 / Dashboard 卡片） */
  goTerminal(terminalId?: string): void
  /** 跳到会话中心并展开指定会话（任务卡片"查看会话"） */
  goSession(sessionId: string): void
  /** 跳到对话页并聚焦指定对话（启动器 @ 提问落点） */
  goChat(convId?: string): void
}

export const AppNavContext = createContext<AppNav>({
  goPage: () => {},
  goTerminal: () => {},
  goSession: () => {},
  goChat: () => {}
})

export function useAppNav(): AppNav {
  return useContext(AppNavContext)
}
