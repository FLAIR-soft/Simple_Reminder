import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertCircle, IconAlertTriangle, IconArchive, IconBell, IconPin, IconPlus, IconSettings, IconX } from '@tabler/icons-react'
import type { ResizeEdge, Result } from '@shared/api'
import type { EventInput, ReminderEvent } from '@shared/model'
import { viewOf } from '@shared/scheduler'
import { EventCard } from './components/EventCard'
import { EventForm, type FormMode } from './components/EventForm'
import { HoldButton } from './components/HoldButton'
import { Settings } from './components/Settings'
import { errorText, hm } from './format'
import { isTyping, useBackdrop, useNow, useSnapshot, useSoundPlayer, useTheme } from './hooks'

type Screen = { kind: 'list' } | { kind: 'form'; mode: FormMode } | { kind: 'settings' }
type Tab = 'active' | 'archive'

const EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

/** Pending and missed first, then by the next time something happens. */
function sortKey(ev: ReminderEvent, now: number): [number, number] {
  const v = viewOf(ev, now)
  switch (v.kind) {
    case 'pending':
      return [0, v.firedAt]
    case 'missed':
      return [1, v.firedAt]
    case 'snoozed':
      return [2, v.until]
    case 'running':
      return [2, v.dueAt]
    case 'paused':
      return [2, v.dueAt]
  }
}

export function MainView(): React.JSX.Element {
  const { t } = useTranslation()
  const snap = useSnapshot()
  const now = useNow()
  useTheme(snap)
  const backdrop = useBackdrop(!!snap?.state.settings.blur)
  const [screen, setScreen] = useState<Screen>({ kind: 'list' })
  const [tab, setTab] = useState<Tab>('active')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useSoundPlayer(() => setToast(errorText('soundPlay')))

  const run = useCallback(async (p: Promise<Result>): Promise<string | null> => {
    const r = await p
    if (r.ok) return null
    return r.error
  }, [])
  const runToast = useCallback(
    async (p: Promise<Result>): Promise<void> => {
      const err = await run(p)
      if (err) setToast(errorText(err))
    },
    [run]
  )

  const openNew = useCallback(() => {
    setMenuId(null)
    setScreen({ kind: 'form', mode: { kind: 'new' } })
  }, [])
  const back = useCallback(() => setScreen({ kind: 'list' }), [])

  useEffect(() => window.reminder.onNavigate((to) => (to === 'new-event' ? openNew() : back())), [openNew, back])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(id)
  }, [toast])

  const events = snap?.state.events ?? []
  const active = events.filter((e) => e.status === 'active')
  const archived = events.filter((e) => e.status === 'archived')

  // Keyboard: N new event, E edit the focused card, Esc closes menus. Never while typing.
  useEffect(() => {
    if (screen.kind !== 'list') return
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (menuId || restoreId) {
          e.preventDefault()
          setMenuId(null)
          setRestoreId(null)
        }
        return
      }
      if (isTyping(e) || e.ctrlKey || e.altKey || e.metaKey) return
      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        openNew()
      } else if (k === 'e') {
        const id = menuId ?? focusId
        const ev = active.find((x) => x.id === id)
        if (ev) {
          e.preventDefault()
          setMenuId(null)
          setScreen({ kind: 'form', mode: { kind: 'edit', ev } })
        }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  if (!snap) return <div className="win" />

  const s = snap.state.settings
  const locked = s.lockPosition
  const showBackdrop = s.blur && !!backdrop.stream && !!backdrop.source && !!backdrop.pos
  const catOf = (ev: ReminderEvent): (typeof snap.state.categories)[number] | undefined => snap.state.categories.find((c) => c.id === ev.categoryId)

  const list = tab === 'active' ? [...active].sort((a, b) => {
    const [ga, ta] = sortKey(a, now)
    const [gb, tb] = sortKey(b, now)
    return ga - gb || ta - tb || a.createdAt - b.createdAt
  }) : [...archived].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))

  const submit = async (input: EventInput): Promise<string | null> => {
    if (screen.kind !== 'form') return null
    const m = screen.mode
    const err = await run(
      m.kind === 'new' ? window.reminder.createEvent(input) : m.kind === 'edit' ? window.reminder.updateEvent(m.ev.id, input) : window.reminder.restoreEvent(m.ev.id, input)
    )
    if (!err) {
      if (m.kind === 'restore') setTab('active')
      setScreen({ kind: 'list' })
    }
    return err
  }

  return (
    <div className={`win ${showBackdrop ? 'blurred' : ''}`} onContextMenu={(e) => e.preventDefault()}>
      {showBackdrop && backdrop.stream && backdrop.source && backdrop.pos && (
        <div className="backdrop" aria-hidden>
          <BackdropVideo
            stream={backdrop.stream}
            style={{
              left: backdrop.source.x - backdrop.pos.x,
              top: backdrop.source.y - backdrop.pos.y,
              width: backdrop.source.width,
              height: backdrop.source.height
            }}
          />
        </div>
      )}
      <div className={`titlebar ${locked ? 'locked' : ''}`}>
        <div className="mark" aria-hidden>
          R
        </div>
        <span className="name">{t('app.name')}</span>
        <span className="clock mono">{hm(now)}</span>
        <button
          className={`ibtn ${locked ? 'on' : ''}`}
          title={locked ? t('app.unpin') : t('app.pin')}
          aria-label={t('app.pin')}
          aria-pressed={locked}
          onClick={() => void runToast(window.reminder.updateSettings({ lockPosition: !locked }))}
        >
          <IconPin size={16} stroke={1.75} />
        </button>
        <button
          className={`ibtn ${screen.kind === 'settings' ? 'on' : ''}`}
          title={t('app.settings')}
          aria-label={t('app.settings')}
          aria-pressed={screen.kind === 'settings'}
          onClick={() => setScreen(screen.kind === 'settings' ? { kind: 'list' } : { kind: 'settings' })}
        >
          <IconSettings size={16} stroke={1.75} />
        </button>
        <button className="ibtn" title={t('app.hide')} aria-label={t('app.hide')} onClick={() => void window.reminder.hideWindow()}>
          <IconX size={16} stroke={1.75} />
        </button>
      </div>

      {snap.loadError && (
        <div className="banner" role="alert">
          <b>
            <IconAlertTriangle size={16} stroke={1.75} />
            {t('banner.title')}
          </b>
          <span>{t('banner.text')}</span>
          <div className="row">
            <button className="btn sm" onClick={() => void runToast(window.reminder.retryLoad())}>
              {t('banner.retry')}
            </button>
            <HoldButton
              className="btn sm"
              label={t('banner.reset')}
              onConfirm={() => {
                void run(window.reminder.resetData()).then((err) => setToast(err ? errorText(err) : t('banner.resetDone')))
              }}
            >
              {t('banner.reset')}
              <span className="hint">{t('banner.resetHint')}</span>
            </HoldButton>
          </div>
        </div>
      )}

      {screen.kind === 'form' && (
        <EventForm
          key={screen.mode.kind === 'new' ? 'new' : `${screen.mode.kind}-${screen.mode.ev.id}`}
          mode={screen.mode}
          categories={snap.state.categories}
          onCancel={back}
          onSubmit={submit}
          onCreateCategory={(name) => run(window.reminder.createCategory({ name, color: (snap.state.categories.length % 5) + 1 }))}
        />
      )}

      {screen.kind === 'settings' && <Settings state={snap.state} dataPath={snap.dataPath} run={run} onBack={back} />}

      {screen.kind === 'list' && (
        <>
          <div className="tabs" role="tablist">
            {(['active', 'archive'] as Tab[]).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={`tab ${tab === k ? 'sel' : ''}`}
                onClick={() => {
                  setTab(k)
                  setMenuId(null)
                  setRestoreId(null)
                }}
              >
                {t(`tabs.${k}`)} <span className="count">{k === 'active' ? active.length : archived.length}</span>
              </button>
            ))}
          </div>
          <div className="body" role="tabpanel">
            {list.length === 0 ? (
              <div className="empty">
                {tab === 'active' ? <IconBell size={28} stroke={1.5} /> : <IconArchive size={28} stroke={1.5} />}
                <h3>{tab === 'active' ? t('list.emptyActiveTitle') : t('list.emptyArchiveTitle')}</h3>
                <p>{tab === 'active' ? t('list.emptyActiveText') : t('list.emptyArchiveText')}</p>
              </div>
            ) : (
              list.map((ev) => (
                <EventCard
                  key={ev.id}
                  ev={ev}
                  category={catOf(ev)}
                  now={now}
                  menuOpen={menuId === ev.id}
                  restoreOpen={restoreId === ev.id}
                  onMenu={(o) => setMenuId(o ? ev.id : null)}
                  onRestoreOpen={(o) => setRestoreId(o ? ev.id : null)}
                  onFocus={() => setFocusId(ev.id)}
                  onEdit={() => {
                    setMenuId(null)
                    setScreen({ kind: 'form', mode: { kind: 'edit', ev } })
                  }}
                  onArchive={() => {
                    setMenuId(null)
                    void runToast(window.reminder.archiveEvent(ev.id))
                  }}
                  onDelete={() => {
                    setMenuId(null)
                    void runToast(window.reminder.deleteEvent(ev.id))
                  }}
                  onRestoreKeep={() => {
                    setRestoreId(null)
                    void runToast(window.reminder.restoreEvent(ev.id, null))
                  }}
                  onRestoreNew={() => {
                    setRestoreId(null)
                    setScreen({ kind: 'form', mode: { kind: 'restore', ev } })
                  }}
                />
              ))
            )}
          </div>
          <div className="foot">
            <button className="btn primary block" onClick={openNew}>
              <IconPlus size={16} stroke={1.75} />
              {t('list.newEvent')} <kbd>N</kbd>
            </button>
          </div>
        </>
      )}

      {toast && (
        <div className="toast" role="status">
          <IconAlertCircle size={16} stroke={1.75} />
          <span>{toast}</span>
          <button className="ibtn x" aria-label="Dismiss" onClick={() => setToast(null)}>
            <IconX size={14} stroke={2} />
          </button>
        </div>
      )}

      {!locked && (
        <>
          {EDGES.map((edge) => (
            <div
              key={edge}
              className={`edge ${edge}`}
              aria-hidden
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.currentTarget.setPointerCapture(e.pointerId)
                void window.reminder.resizeStart(edge)
              }}
              onPointerUp={() => void window.reminder.resizeEnd()}
              onLostPointerCapture={() => void window.reminder.resizeEnd()}
            />
          ))}
          <div className="grip" title={t('app.resize')} />
        </>
      )}
    </div>
  )
}

function BackdropVideo({ stream, style }: { stream: MediaStream; style: CSSProperties }): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.srcObject = stream
    void v.play().catch(() => undefined)
    return () => {
      v.srcObject = null
    }
  }, [stream])
  return <video ref={ref} muted playsInline disablePictureInPicture style={style} />
}
