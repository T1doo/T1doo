import { Menu, Tray, nativeImage } from 'electron'
import { APP_NAME } from '../../shared/constants'
import icon from '../../../resources/icon.png?asset'

export interface TrayActions {
  onShow: () => void
  onQuit: () => void
}

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon))
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: actions.onShow },
      { type: 'separator' },
      { label: `退出 ${APP_NAME}`, click: actions.onQuit }
    ])
  )
  tray.on('click', actions.onShow)
  tray.on('double-click', actions.onShow)
  return tray
}
