import path from 'node:path'
import { Menu, Tray, nativeImage } from 'electron'
import type { Settings } from '../shared/model'

export interface TrayActions {
  show(): void
  newEvent(): void
  toggle(key: 'alwaysOnTop' | 'clickThrough' | 'startWithWindows', value: boolean): void
  quit(): void
}

/** Tray icon and menu (screen 7 of the mockup). */
export class AppTray {
  private tray: Tray

  constructor(private actions: TrayActions) {
    const dir = path.join(__dirname, '../../resources')
    const img = nativeImage.createFromPath(path.join(dir, 'icon-16.png'))
    img.addRepresentation({ scaleFactor: 1.25, buffer: nativeImage.createFromPath(path.join(dir, 'icon-20.png')).toPNG() })
    img.addRepresentation({ scaleFactor: 1.5, buffer: nativeImage.createFromPath(path.join(dir, 'icon-24.png')).toPNG() })
    img.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(path.join(dir, 'icon-32.png')).toPNG() })
    this.tray = new Tray(img)
    this.tray.setToolTip('Reminder')
    this.tray.on('click', () => actions.show())
  }

  update(s: Settings): void {
    const a = this.actions
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Reminder', click: () => a.show() },
        { label: 'New event', click: () => a.newEvent() },
        { type: 'separator' },
        { label: 'Always on top', type: 'checkbox', checked: s.alwaysOnTop, click: (m) => a.toggle('alwaysOnTop', m.checked) },
        { label: 'Click-through', type: 'checkbox', checked: s.clickThrough, click: (m) => a.toggle('clickThrough', m.checked) },
        { label: 'Start with Windows', type: 'checkbox', checked: s.startWithWindows, click: (m) => a.toggle('startWithWindows', m.checked) },
        { type: 'separator' },
        { label: 'Quit', click: () => a.quit() }
      ])
    )
  }

  destroy(): void {
    this.tray.destroy()
  }
}
