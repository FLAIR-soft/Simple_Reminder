import { BrowserWindow, screen, type Rectangle } from 'electron'
import path from 'node:path'
import type { ResizeEdge } from '../shared/api'
import type { Bounds, Settings } from '../shared/model'

export type Route = 'main' | 'notify' | 'missed'

const MIN_W = 300
const MIN_H = 360
const DEFAULT_W = 360
const DEFAULT_H = 600

export function webPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    autoplayPolicy: 'no-user-gesture-required',
    devTools: !process.env.REMINDER_NO_DEVTOOLS
  }
}

export function loadRoute(win: BrowserWindow, route: Route, query: Record<string, string> = {}): Promise<void> {
  const q = new URLSearchParams({ view: route, ...query }).toString()
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return win.loadURL(`${devUrl}/index.html?${q}`)
  return win.loadFile(path.join(__dirname, '../renderer/index.html'), { search: q })
}

/** Saved position is used only if the window is still visible on some display; otherwise it returns to the primary one. */
export function sanitizeBounds(b: Bounds | null): Rectangle {
  const wa = screen.getPrimaryDisplay().workArea
  const fallback = {
    width: DEFAULT_W,
    height: Math.min(DEFAULT_H, wa.height - 40),
    x: wa.x + wa.width - DEFAULT_W - 24,
    y: wa.y + 24
  }
  if (!b) return fallback
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const ix = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x)
    const iy = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y)
    return ix >= 80 && iy >= 40 && b.y >= a.y - 10
  })
  if (!visible) return { ...fallback, width: Math.max(MIN_W, Math.min(b.width, wa.width)), height: Math.max(MIN_H, Math.min(b.height, wa.height)) }
  return { x: b.x, y: b.y, width: Math.max(MIN_W, b.width), height: Math.max(MIN_H, b.height) }
}

export function createMainWindow(settings: Settings): BrowserWindow {
  const b = sanitizeBounds(settings.bounds)
  const win = new BrowserWindow({
    ...b,
    minWidth: MIN_W,
    minHeight: MIN_H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Transparent windows cannot be resized by the OS frame on Windows; the renderer draws its own edges.
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    title: 'Reminder',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: webPreferences()
  })
  win.setAlwaysOnTop(settings.alwaysOnTop, 'floating')
  win.setMovable(!settings.lockPosition)
  if (settings.clickThrough) win.setIgnoreMouseEvents(true, { forward: true })
  void loadRoute(win, 'main')
  return win
}

/** Custom edge resize: follows the cursor until the renderer reports pointerup. */
export class Resizer {
  private timer: NodeJS.Timeout | null = null

  start(win: BrowserWindow, edge: ResizeEdge, onDone: (b: Rectangle) => void): void {
    this.stop()
    const start = win.getBounds()
    const c0 = screen.getCursorScreenPoint()
    const [minW, minH] = win.getMinimumSize()
    let last = ''
    this.timer = setInterval(() => {
      if (win.isDestroyed()) return this.stop()
      const c = screen.getCursorScreenPoint()
      const dx = c.x - c0.x
      const dy = c.y - c0.y
      let { x, y, width, height } = start
      if (edge.includes('e')) width = start.width + dx
      if (edge.includes('s')) height = start.height + dy
      if (edge.includes('w')) {
        width = start.width - dx
        x = start.x + dx
      }
      if (edge.includes('n')) {
        height = start.height - dy
        y = start.y + dy
      }
      if (width < minW) {
        if (edge.includes('w')) x -= minW - width
        width = minW
      }
      if (height < minH) {
        if (edge.includes('n')) y -= minH - height
        height = minH
      }
      const key = `${x},${y},${width},${height}`
      if (key !== last) {
        last = key
        win.setBounds({ x, y, width, height })
      }
    }, 16)
    this.onDone = () => onDone(win.getBounds())
  }

  private onDone: (() => void) | null = null

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const d = this.onDone
    this.onDone = null
    d?.()
  }
}

export interface OverlayLimits {
  maxW: number
  maxH: number
}

/** Space around the card for its shadow. Kept in sync with --overlay-pad in the renderer. */
export const OVERLAY_PAD = 20

export function overlayLimits(): OverlayLimits {
  const wa = screen.getPrimaryDisplay().workArea
  return { maxW: Math.floor(Math.min(760, wa.width * 0.8)), maxH: Math.floor(wa.height * 0.8) }
}

/** Notification / missed summary: centre of the primary display, above everything, cannot be closed or minimised. */
export function createOverlay(route: 'notify' | 'missed'): BrowserWindow {
  const wa = screen.getPrimaryDisplay().workArea
  const lim = overlayLimits()
  const w = lim.maxW + OVERLAY_PAD * 2
  const h = 240
  const win = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(wa.x + (wa.width - w) / 2),
    y: Math.round(wa.y + (wa.height - h) / 2),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    title: route === 'notify' ? 'Reminder' : 'Missed reminders',
    webPreferences: webPreferences()
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true)
  void loadRoute(win, route, { maxW: String(lim.maxW), maxH: String(lim.maxH), pad: String(OVERLAY_PAD) })
  return win
}

/** Sizes the overlay to the measured card and centres it on the primary display. */
export function fitOverlay(win: BrowserWindow, width: number, height: number): void {
  const wa = screen.getPrimaryDisplay().workArea
  const w = Math.max(100, Math.min(Math.ceil(width), wa.width))
  const h = Math.max(80, Math.min(Math.ceil(height), wa.height))
  win.setBounds({ x: Math.round(wa.x + (wa.width - w) / 2), y: Math.round(wa.y + (wa.height - h) / 2), width: w, height: h })
  if (!win.isVisible()) {
    win.show()
    win.focus()
  }
  win.moveTop()
}
