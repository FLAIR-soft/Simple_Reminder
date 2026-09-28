import type { Interval, ReminderEvent, Schedule } from '@shared/model'
import { repeatTotal } from '@shared/scheduler'
import { t } from './i18n'

const LOCALE = 'en-GB'
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
// Fixed three-letter months as in the mockup (newer ICU writes "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number): string => String(n).padStart(2, '0')

/** 24-hour HH:MM. */
export function hm(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function sameDay(a: number, b: number): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

/** "Fri 26 Sep, 08:54" */
export function dayTime(ts: number): string {
  const d = new Date(ts)
  return `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${hm(ts)}`
}

/** "14:30" today, otherwise "Fri 26 Sep, 08:54". */
export function when(ts: number, now: number): string {
  return sameDay(ts, now) ? hm(ts) : dayTime(ts)
}

/** "24 Sep, 15:40" (year added when it is not the current one). */
export function dateTime(ts: number, now: number): string {
  const d = new Date(ts)
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${hm(ts)}`
}

/** Monday-first short weekday names: Mon … Sun. */
export const WEEKDAYS: string[] = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2024, 0, 1 + i)))

/** Countdown text as in the mockup: "12 min 48 s", "1 h 04 min", "12 d 6 h". */
export function countdown(ms: number, withSeconds = true): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return h > 0 ? `${t('units.dShort', { count: d })} ${t('units.h', { count: h })}` : t('units.dShort', { count: d })
  if (h > 0) return m > 0 ? `${t('units.h', { count: h })} ${pad(m)} min` : t('units.h', { count: h })
  if (!withSeconds) return t('units.min', { count: Math.max(1, Math.round(total / 60)) })
  if (m > 0) return `${t('units.min', { count: m })} ${pad(s)} s`
  return t('units.s', { count: s })
}

/** "2 h", "1 month 2 weeks", "45 min". */
export function intervalText(i: Interval): string {
  const parts: string[] = []
  if (i.months) parts.push(t('units.month', { count: i.months }))
  if (i.weeks) parts.push(t('units.week', { count: i.weeks }))
  if (i.days) parts.push(t('units.day', { count: i.days }))
  if (i.hours) parts.push(t('units.h', { count: i.hours }))
  if (i.minutes) parts.push(t('units.min', { count: i.minutes }))
  return parts.join(' ')
}

/** "Mon–Fri", "Every day", "Mon, Wed, Fri". */
export function daysText(days: number[]): string {
  const ds = [...new Set(days)].sort((a, b) => a - b)
  if (ds.length === 0) return t('days.none')
  if (ds.length === 7) return t('days.everyDay')
  const contiguous = ds.every((d, i) => i === 0 || d === ds[i - 1] + 1)
  if (contiguous && ds.length >= 3) return `${WEEKDAYS[ds[0]]}–${WEEKDAYS[ds[ds.length - 1]]}`
  return ds.map((d) => WEEKDAYS[d]).join(', ')
}

export function hoursText(s: Schedule): string {
  return s.allDay ? t('days.allDay') : `${s.start}–${s.end}`
}

/** "Mon–Fri · 07:30–16:00" */
export function scheduleText(s: Schedule): string {
  return `${daysText(s.days)} · ${hoursText(s)}`
}

/** "Every 2 h · 3 of 6", "Every 45 min · ∞", "Once · 2 h". */
export function repeatText(ev: ReminderEvent): string {
  const every = t('repeat.every', { interval: intervalText(ev.interval) })
  if (!ev.repeat.enabled) return `${t('repeat.once')} · ${intervalText(ev.interval)}`
  const total = repeatTotal(ev)
  if (total === null) return `${every} · ${t('repeat.infinite')}`
  return `${every} · ${t('repeat.of', { n: Math.min(ev.doneCount + 1, total), total })}`
}

/** Restore hint: "Every 3 h · 6 times · Mon–Fri 07:30–16:00". */
export function timerSummary(ev: ReminderEvent): string {
  const iv = intervalText(ev.interval)
  const parts = [ev.repeat.enabled ? t('repeat.every', { interval: iv }) : `${t('repeat.once')} · ${iv}`]
  if (ev.repeat.enabled) parts.push(ev.repeat.times === null ? t('form.untilStop') : `${ev.repeat.times} ${t('form.times')}`)
  const s = ev.schedule
  parts.push(s.allDay ? `${daysText(s.days)}, ${t('days.allDay').toLowerCase()}` : `${daysText(s.days)} ${s.start}–${s.end}`)
  return parts.join(' · ')
}

/** Translates an error code from the main process or the form. */
export function errorText(code: string, vars: Record<string, string> = {}): string {
  const key = `errors.${code}`
  return i18nHas(key) ? t(key, vars) : t('errors.generic', { code })
}

function i18nHas(key: string): boolean {
  return t(key) !== key
}
