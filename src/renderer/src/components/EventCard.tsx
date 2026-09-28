import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAlertTriangle,
  IconArchive,
  IconBell,
  IconCalendar,
  IconCircleCheck,
  IconDots,
  IconEdit,
  IconPlayerPause,
  IconRepeat,
  IconRestore,
  IconTrash,
  IconZzz
} from '@tabler/icons-react'
import type { Category, ReminderEvent } from '@shared/model'
import { repeatTotal, viewOf } from '@shared/scheduler'
import { countdown, dateTime, daysText, hoursText, repeatText, scheduleText, timerSummary, when } from '../format'
import { HoldButton } from './HoldButton'

interface Props {
  ev: ReminderEvent
  category: Category | undefined
  now: number
  menuOpen: boolean
  restoreOpen: boolean
  onMenu(open: boolean): void
  onRestoreOpen(open: boolean): void
  onFocus(): void
  onEdit(): void
  onArchive(): void
  onDelete(): void
  onRestoreKeep(): void
  onRestoreNew(): void
}

const ICON = { size: 14, stroke: 1.75 }
const ICON_SM = { size: 16, stroke: 1.75 }

export function EventCard(p: Props): React.JSX.Element {
  const { t } = useTranslation()
  const { ev, now } = p
  const menuRef = useRef<HTMLDivElement>(null)
  const archived = ev.status === 'archived'
  const view = archived ? null : viewOf(ev, now)
  const cat = `var(--series-${p.category?.color ?? 1})`
  const hasMenu = (archived && !p.restoreOpen) || (view !== null && view.kind !== 'pending' && view.kind !== 'missed')

  // Close the menu on outside click; focus its first item when it opens.
  useEffect(() => {
    if (!p.menuOpen) return
    menuRef.current?.querySelector('button')?.focus()
    const h = (e: PointerEvent): void => {
      if (!(e.target as HTMLElement).closest(`[data-card="${ev.id}"]`)) p.onMenu(false)
    }
    window.addEventListener('pointerdown', h)
    return () => window.removeEventListener('pointerdown', h)
  }, [p.menuOpen])

  const menu = p.menuOpen && (
    <div className="menu" role="menu" ref={menuRef}>
      {archived ? (
        <button
          role="menuitem"
          onClick={() => {
            p.onMenu(false)
            p.onRestoreOpen(true)
          }}
        >
          <IconRestore {...ICON_SM} />
          {t('card.restore')}
        </button>
      ) : (
        <>
          <button role="menuitem" onClick={p.onEdit}>
            <IconEdit {...ICON_SM} />
            {t('card.edit')}
            <kbd>E</kbd>
          </button>
          <button role="menuitem" onClick={p.onArchive}>
            <IconArchive {...ICON_SM} />
            {t('card.archive')}
          </button>
        </>
      )}
      <hr />
      <HoldButton className="danger" onConfirm={p.onDelete} label={t('card.holdToDelete')}>
        <IconTrash {...ICON_SM} />
        {t('card.delete')}
        <span className="hint">{t('card.hold')}</span>
      </HoldButton>
    </div>
  )

  return (
    <article
      className={`ev raised ${view?.kind === 'paused' ? 'paused' : ''}`}
      style={{ ['--cat' as string]: cat }}
      data-card={ev.id}
      tabIndex={0}
      aria-label={ev.title}
      onFocus={p.onFocus}
    >
      <div className="top">
        <div className="txt">
          <h3>{ev.title}</h3>
          {ev.description && <div className="desc">{ev.description.split('\n')[0]}</div>}
        </div>
        {hasMenu && (
          <button
            className={`ibtn more ${p.menuOpen ? 'on' : ''}`}
            aria-label={t('card.actions')}
            aria-haspopup="menu"
            aria-expanded={p.menuOpen}
            onClick={() => p.onMenu(!p.menuOpen)}
          >
            <IconDots size={16} stroke={2} />
          </button>
        )}
      </div>
      {menu}

      {view && (view.kind === 'running' || view.kind === 'paused') && (
        <>
          <div className="time">
            <span className="left">{countdown(view.remaining, view.kind === 'running')}</span>
            <span className="hint mono">
              {view.kind === 'paused'
                ? t('card.starts', { time: when(view.startsAt, now) })
                : sameDayDue(view.dueAt, now)
                  ? t('card.due', { time: when(view.dueAt, now) })
                  : when(view.dueAt, now)}
            </span>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((view.kind === 'running' ? view.progress : 0) * 100)}>
            <i style={{ width: `${(view.kind === 'running' ? view.progress : 0) * 100}%` }} />
          </div>
          <div className="meta">
            {view.kind === 'paused' ? (
              <span className="badge neutral">
                <IconPlayerPause {...ICON} />
                {ev.schedule.allDay ? t('card.pausedDays', { days: daysText(ev.schedule.days) }) : t('card.pausedHours', { hours: hoursText(ev.schedule) })}
              </span>
            ) : (
              <>
                <span>
                  <IconRepeat {...ICON} />
                  {repeatText(ev)}
                </span>
                <span>
                  <IconCalendar {...ICON} />
                  {scheduleText(ev.schedule)}
                </span>
              </>
            )}
          </div>
        </>
      )}

      {view?.kind === 'pending' && (
        <div className="meta">
          <span className="badge wait">
            <IconBell {...ICON} />
            {t('card.waiting', { time: when(view.firedAt, now) })}
          </span>
        </div>
      )}
      {view?.kind === 'missed' && (
        <div className="meta">
          <span className="badge warn">
            <IconAlertTriangle {...ICON} />
            {t('card.missed', { time: when(view.firedAt, now) })}
          </span>
        </div>
      )}
      {view?.kind === 'snoozed' && (
        <div className="meta">
          <span className="badge neutral">
            <IconZzz {...ICON} />
            {t('card.snoozed', { time: when(view.until, now) })}
          </span>
          <span>
            <IconRepeat {...ICON} />
            {repeatText(ev)}
          </span>
        </div>
      )}

      {archived && (
        <>
          <div className="meta">
            {ev.archivedReason === 'done' ? (
              <span className="badge ok">
                <IconCircleCheck {...ICON} />
                {t('card.doneOf', { done: ev.doneCount, total: repeatTotal(ev) ?? ev.doneCount })}
              </span>
            ) : (
              <span className="badge neutral">
                <IconArchive {...ICON} />
                {t('card.archivedByYou')}
              </span>
            )}
            {ev.archivedAt !== null && <span className="mono">{dateTime(ev.archivedAt, now)}</span>}
          </div>
          {p.restoreOpen && (
            <div className="restore">
              <span className="label">{t('card.restore')}</span>
              <button className="opt" onClick={p.onRestoreKeep}>
                <IconRestore {...ICON_SM} />
                <div>
                  <b>{t('card.restoreKeep')}</b>
                  <span>{timerSummary(ev)}</span>
                </div>
              </button>
              <button className="opt" onClick={p.onRestoreNew}>
                <IconEdit {...ICON_SM} />
                <div>
                  <b>{t('card.restoreNew')}</b>
                  <span>{t('card.restoreNewHint')}</span>
                </div>
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}

function sameDayDue(due: number, now: number): boolean {
  return new Date(due).toDateString() === new Date(now).toDateString()
}
