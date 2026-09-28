import { useEffect, useRef, useState } from 'react'
import type { BackdropSource, Snapshot, WindowPos } from '@shared/api'

/** Current state from the main process: first read, then every broadcast. */
export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    let live = true
    let pushed = false
    const off = window.reminder.onSnapshot((s) => {
      pushed = true
      setSnap(s)
    })
    void window.reminder.getSnapshot().then((s) => {
      // A broadcast that arrived first is newer than this reply.
      if (live && !pushed) setSnap(s)
    })
    return () => {
      live = false
      off()
    }
  }, [])
  return snap
}

/** Wall clock, re-rendered on every second boundary. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: number
    const loop = (): void => {
      setNow(Date.now())
      timer = window.setTimeout(loop, 1000 - (Date.now() % 1000) + 5)
    }
    timer = window.setTimeout(loop, 1000 - (Date.now() % 1000) + 5)
    return () => window.clearTimeout(timer)
  }, [])
  return now
}

/** Applies theme and window opacity to the document. */
export function useTheme(snap: Snapshot | null): void {
  const theme = snap?.state.settings.theme
  const opacity = snap?.state.settings.opacity
  useEffect(() => {
    if (theme) document.documentElement.dataset.rd = theme
  }, [theme])
  useEffect(() => {
    if (opacity !== undefined) document.documentElement.style.setProperty('--op', String(opacity / 100))
  }, [opacity])
}

/** Plays a custom sound when the main process asks for it. */
export function useSoundPlayer(onError?: () => void): void {
  const cb = useRef(onError)
  cb.current = onError
  useEffect(
    () =>
      window.reminder.onPlaySound((url) => {
        const a = new Audio(url)
        a.play().catch(() => cb.current?.())
      }),
    []
  )
}

/** True when the user asked the OS for less motion. */
export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const h = (): void => setR(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return r
}

/** Single-key shortcuts never fire while typing. */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Live desktop stream for the custom blur: one video-only stream of the display under the window,
 * low frame rate and half resolution (it is blurred anyway). Returns the stream, its display and the window position.
 */
export function useBackdrop(enabled: boolean): { stream: MediaStream | null; source: BackdropSource | null; pos: WindowPos | null } {
  const [source, setSource] = useState<BackdropSource | null>(null)
  const [pos, setPos] = useState<WindowPos | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    const offSrc = window.reminder.onBackdrop(setSource)
    const offPos = window.reminder.onWindowPos(setPos)
    return () => {
      offSrc()
      offPos()
    }
  }, [])

  const sourceId = enabled ? (source?.sourceId ?? null) : null
  const w = source ? Math.round((source.width * source.scaleFactor) / 2) : 0
  const h = source ? Math.round((source.height * source.scaleFactor) / 2) : 0
  useEffect(() => {
    if (!sourceId) return
    let live = true
    let opened: MediaStream | null = null
    const constraints = {
      audio: false,
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: w, maxHeight: h, maxFrameRate: 12 } }
    } as unknown as MediaStreamConstraints
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop())
        opened = s
        setStream(s)
      })
      .catch((e) => console.warn('Backdrop stream unavailable', e))
    return () => {
      live = false
      opened?.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
  }, [sourceId, w, h])

  return { stream: sourceId ? stream : null, source, pos }
}
