import type { Interval, Schedule } from './model'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** Absolute length of an interval (1 month = 30 days). */
export function intervalMs(i: Interval): number {
  return ((i.months * 30 + i.weeks * 7 + i.days) * 24 + i.hours) * HOUR + i.minutes * MINUTE
}

/** Timers of 1 day or more count calendar time; shorter timers run only inside active hours. */
export function isLongInterval(i: Interval): boolean {
  return intervalMs(i) >= DAY
}

/**
 * Calendar addition: whole days keep the local wall-clock time (safe across DST),
 * hours and minutes are added as absolute time.
 */
export function addInterval(from: number, i: Interval): number {
  const d = new Date(from)
  d.setDate(d.getDate() + i.months * 30 + i.weeks * 7 + i.days)
  return d.getTime() + i.hours * HOUR + i.minutes * MINUTE
}

export function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

/** 0 = Monday … 6 = Sunday */
export function weekday(t: number): number {
  return (new Date(t).getDay() + 6) % 7
}

/** Length of the daily window in minutes (overnight windows wrap). */
export function windowMinutes(s: Schedule): number {
  if (s.allDay) return 24 * 60
  const a = parseHM(s.start)
  const b = parseHM(s.end)
  return b > a ? b - a : b + 24 * 60 - a
}

export interface Win {
  start: number
  end: number
}

/** Local-time windows for `dayCount` days starting at the local day of `from - 1 day`, merged when adjacent. */
export function windowsAround(s: Schedule, from: number, dayCount = 10): Win[] {
  const base = new Date(from)
  const y = base.getFullYear()
  const m = base.getMonth()
  const d0 = base.getDate() - 1
  const sm = parseHM(s.start)
  const em = parseHM(s.end)
  const raw: Win[] = []
  for (let k = 0; k < dayCount; k++) {
    const dayStart = new Date(y, m, d0 + k)
    if (!s.days.includes(weekday(dayStart.getTime()))) continue
    let start: number
    let end: number
    if (s.allDay) {
      start = dayStart.getTime()
      end = new Date(y, m, d0 + k + 1).getTime()
    } else {
      start = new Date(y, m, d0 + k, Math.floor(sm / 60), sm % 60).getTime()
      end =
        em > sm
          ? new Date(y, m, d0 + k, Math.floor(em / 60), em % 60).getTime()
          : new Date(y, m, d0 + k + 1, Math.floor(em / 60), em % 60).getTime()
    }
    if (end > start) raw.push({ start, end })
  }
  raw.sort((a, b) => a.start - b.start)
  const merged: Win[] = []
  for (const w of raw) {
    const last = merged[merged.length - 1]
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end)
    else merged.push({ ...w })
  }
  return merged
}

/** The window containing `t`, or the first one starting after `t`. */
export function windowAtOrAfter(s: Schedule, t: number): Win | null {
  if (s.days.length === 0) return null
  for (const w of windowsAround(s, t)) {
    if (w.end > t) return w
  }
  return null
}

export function inWindow(s: Schedule, t: number): boolean {
  const w = windowAtOrAfter(s, t)
  return !!w && w.start <= t
}

export type IntervalProblem = 'empty' | 'noDays' | 'sameHours' | 'longerThanWindow' | null

/** Validation shared by the form and the main process. */
export function intervalProblem(i: Interval, s: Schedule): IntervalProblem {
  const ms = intervalMs(i)
  if (ms <= 0) return 'empty'
  if (s.days.length === 0) return 'noDays'
  if (!s.allDay && s.start === s.end) return 'sameHours'
  if (ms < DAY && ms > windowMinutes(s) * MINUTE) return 'longerThanWindow'
  return null
}
