import { Menu, Tray, nativeImage } from 'electron'
import { APP_NAME } from '../../shared/constants'
import { t } from '../services/i18n'
import icon from '../../../resources/icon.png?asset'

export interface TrayActions {
  onShow: () => void
  onQuit: () => void
}

function buildMenu(actions: TrayActions): Menu {
  return Menu.buildFromTemplate([
    { label: t('tray.show'), click: actions.onShow },
    { type: 'separator' },
    { label: t('tray.quit', { app: APP_NAME }), click: actions.onQuit }
  ])
}

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon))
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(buildMenu(actions))
  tray.on('click', actions.onShow)
  tray.on('double-click', actions.onShow)
  return tray
}

/** 语言切换后重建托盘菜单（Electron Menu 不能就地改 label） */
export function refreshTrayMenu(tray: Tray, actions: TrayActions): void {
  tray.setContextMenu(buildMenu(actions))
}
