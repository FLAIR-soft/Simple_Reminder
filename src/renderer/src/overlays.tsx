import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconBell, IconCheck, IconClock, IconRepeat, IconZzz } from '@tabler/icons-react'
import type { Snapshot } from '@shared/api'
import type { ReminderEvent } from '@shared/model'
import { currentNotification, missedEvents, repeatTotal } from '@shared/scheduler'
import { dayTime, errorText, intervalText, when } from './format'
import { FieldError } from './components/EventForm'
import { useSnapshot, useSoundPlayer, useTheme } from './hooks'

const q = new URLSearchParams(location.search)
const MAX_W = Number(q.get('maxW')) || 760
const MAX_H = Number(q.get('maxH')) || 600
const PAD = Number(q.get('pad')) || 20

/** Measures the card and asks the main process to fit and centre the window around it. */
function Overlay({ children }: { children: ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let last = ''
    const send = (): void => {
      const r = el.getBoundingClientRect()
      const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
      if (key === last || r.width < 2 || r.height < 2) return
      last = key
      void window.reminder.overlaySize(r.width, r.height)
    }
    const ro = new ResizeObserver(send)
    ro.observe(el)
    // Fonts change the size once they load.
    void document.fonts.ready.then(send)
    send()
    return () => ro.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className="overlay"
      style={{ ['--overlay-pad' as string]: `${PAD}px`, ['--max-w' as string]: `${MAX_W}px`, ['--max-h' as string]: `${MAX_H}px` }}
    >
      {children}
    </div>
  )
}

function useSoundError(): [string | null, () => void] {
  const [err, setErr] = useState<string | null>(null)
  useSoundPlayer(() => setErr('soundPlay'))
  return [err, () => setErr(null)]
}

export function NotifyView(): React.JSX.Element | null {
  const snap = useSnapshot()
  useTheme(snap)
  const [soundErr] = useSoundError()
  const ev = snap ? currentNotification(snap.state) : null
  if (!snap || !ev) return null
  return (
    <Overlay>
      <NotifyCard key={ev.id} ev={ev} snap={snap} soundErr={soundErr} />
    </Overlay>
  )
}

function repeatFact(ev: ReminderEvent, t: (k: string, o?: Record<string, unknown>) => string): string {
  const interval = intervalText(ev.interval)
  const total = repeatTotal(ev)
  if (!ev.repeat.enabled) return t('notify.once')
  if (total === null) return t('notify.repeatInfinite', { interval })
  const n = ev.doneCount + 1
  if (n >= total) return t('notify.repeatLast', { total })
  return t('notify.repeatOf', { n, total, interval })
}

function NotifyCard({ ev, snap, soundErr }: { ev: ReminderEvent; snap: Snapshot; soundErr: string | null }): React.JSX.Element {
  const { t } = useTranslation()
  const [minutes, setMinutes] = useState(String(snap.state.settings.snoozeMinutes))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const cat = snap.state.categories.find((c) => c.id === ev.categoryId)
  const count = snap.state.queue.length
  const firedAt = ev.firedAt ?? ev.dueAt

  // Focus the card itself, not a button: a key press meant for another app must not confirm anything.
  useEffect(() => cardRef.current?.focus(), [])

  const act = async (p: Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    setBusy(true)
    const r = await p
    setBusy(false)
    if (!r.ok) setErr(errorText(r.error ?? 'generic'))
  }
  const doSnooze = (): void => {
    const n = Number(minutes)
    if (!/^\d{1,4}$/.test(minutes) || n < 1 || n > 1440) return setErr(t('errors.snoozeRange'))
    setErr(null)
    void act(window.reminder.snooze(ev.id, n))
  }

  return (
    <div className="notif" role="alertdialog" aria-labelledby="nt" aria-describedby={ev.description ? 'nd' : undefined}>
      <div className="in" ref={cardRef} tabIndex={-1}>
        <div className="hdr">
          <IconBell size={18} stroke={1.75} />
          {cat && (
            <span className="catchip" style={{ ['--c' as string]: `var(--series-${cat.color})` }}>
              <i />
              {cat.name}
            </span>
          )}
          <span className="q">{count > 1 ? t('notify.queueWaiting', { count }) : t('notify.queue', { count: Math.max(1, count) })}</span>
        </div>
        <h2 id="nt">{ev.title}</h2>
        {ev.description && <p id="nd">{ev.description}</p>}
        <div className="facts">
          <span>
            <IconClock size={16} stroke={1.75} />
            {t('notify.due')} <b className="mono">{when(firedAt, snap.now)}</b>
          </span>
          <span>
            <IconRepeat size={16} stroke={1.75} />
            {repeatFact(ev, t)}
          </span>
        </div>
        <button className="btn primary lg" disabled={busy} onClick={() => void act(window.reminder.done(ev.id))}>
          <IconCheck size={18} stroke={2} />
          {t('notify.done')}
        </button>
        <form
          className="snooze"
          onSubmit={(e) => {
            e.preventDefault()
            doSnooze()
          }}
        >
          <label className="hint" htmlFor="sn">
            {t('notify.snoozeFor')}
          </label>
          <input
            id="sn"
            className="input"
            inputMode="numeric"
            maxLength={4}
            value={minutes}
            aria-invalid={!!err}
            onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ''))}
          />
          <span className="hint">{t('notify.min')}</span>
          <button type="submit" className="btn" style={{ marginLeft: 'auto' }} disabled={busy}>
            <IconZzz size={16} stroke={1.75} />
            {t('notify.snooze')}
          </button>
        </form>
        <FieldError text={err ?? (soundErr ? errorText(soundErr) : undefined)} />
      </div>
    </div>
  )
}

export function MissedView(): React.JSX.Element | null {
  const { t } = useTranslation()
  const snap = useSnapshot()
  useTheme(snap)
  const [soundErr] = useSoundError()
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const list = snap ? missedEvents(snap.state) : []
  useEffect(() => ref.current?.focus(), [snap !== null])
  if (!snap || list.length === 0) return null
  const since = snap.state.missedSince

  const act = async (p: Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    const r = await p
    setErr(r.ok ? null : errorText(r.error ?? 'generic'))
  }

  return (
    <Overlay>
      <div className="missed" role="alertdialog" aria-labelledby="mt" tabIndex={-1} ref={ref}>
        {since !== null && (
          <div className="catchip since">
            <IconClock size={16} stroke={1.75} />
            {t('missed.since', { time: dayTime(since) })}
          </div>
        )}
        <h2 id="mt">{t('missed.title', { count: list.length })}</h2>
        <div className="list">
          {list.map((ev) => {
            const cat = snap.state.categories.find((c) => c.id === ev.categoryId)
            return (
              <div className="mrow" key={ev.id} style={{ ['--c' as string]: `var(--series-${cat?.color ?? 1})` }}>
                <span className="cat" />
                <div className="t">
                  <b>{ev.title}</b>
                  <span className="when mono">{dayTime(ev.firedAt ?? ev.dueAt)}</span>
                </div>
                <button className="btn sm" onClick={() => void act(window.reminder.done(ev.id))} aria-label={`${t('missed.done')}: ${ev.title}`}>
                  {t('missed.done')}
                </button>
              </div>
            )
          })}
        </div>
        <button className="btn primary lg" onClick={() => void act(window.reminder.doneAllMissed())}>
          <IconCheck size={18} stroke={2} />
          {t('missed.allDone')}
        </button>
        <FieldError text={err ?? (soundErr ? errorText(soundErr) : undefined)} />
      </div>
    </Overlay>
  )
}
