import { desktopCapturer, screen, type BrowserWindow, type WebContents } from 'electron'
import { CH, type BackdropSource, type WindowPos } from '../shared/api'

/**
 * Custom blur like `backdrop-filter` in the mockup. The renderer opens one continuous, low-frame-rate
 * video stream of the display under the main window and draws it blurred behind its own
 * semi-transparent surface. A single long-lived stream avoids the system-wide hitch that a fresh
 * screen capture (desktopCapturer thumbnails) causes on every call.
 * While on, the window is excluded from screen capture (content protection) — otherwise it would
 * capture itself. The picture never leaves the app and is not stored.
 */
export class Backdrop {
  private enabled = false
  private displayId: number | null = null

  constructor(private win: BrowserWindow) {
    win.on('move', () => this.sendPos())
    win.on('moved', () => void this.sync())
    win.on('resize', () => this.sendPos())
    win.on('show', () => void this.sync(true))
    win.on('hide', () => this.release())
    win.webContents.on('did-finish-load', () => void this.sync(true))
  }

  /** The renderer of the main window may open the desktop stream, nothing else. */
  owns(wc: WebContents | null | undefined): boolean {
    return this.enabled && !!wc && !this.win.isDestroyed() && wc === this.win.webContents
  }

  setEnabled(on: boolean): void {
    if (this.win.isDestroyed() || on === this.enabled) return
    this.enabled = on
    this.win.setContentProtection(on)
    if (on) void this.sync(true)
    else this.release()
  }

  stop(): void {
    this.release()
  }

  private release(): void {
    this.displayId = null
    this.send(CH.backdrop, null)
  }

  private send(channel: string, payload: unknown): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, payload)
  }

  private sendPos(): void {
    if (!this.enabled || this.win.isDestroyed()) return
    const b = this.win.getBounds()
    const pos: WindowPos = { x: b.x, y: b.y }
    this.send(CH.windowPos, pos)
  }

  /** (Re)starts the stream when blur is turned on, the window is shown or moved to another display. */
  private async sync(force = false): Promise<void> {
    if (!this.enabled || this.win.isDestroyed() || !this.win.isVisible()) return
    const d = screen.getDisplayMatching(this.win.getBounds())
    this.sendPos()
    if (!force && d.id === this.displayId) return
    this.displayId = d.id
    try {
      // Thumbnails off: this call only lists the screens and is cheap.
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      const src = sources.find((s) => s.display_id === String(d.id)) ?? (sources.length === 1 ? sources[0] : undefined)
      if (!src || !this.enabled) return
      const msg: BackdropSource = {
        sourceId: src.id,
        x: d.bounds.x,
        y: d.bounds.y,
        width: d.bounds.width,
        height: d.bounds.height,
        scaleFactor: d.scaleFactor
      }
      this.send(CH.backdrop, msg)
    } catch (e) {
      console.warn('Backdrop source failed', e)
    }
  }
}
