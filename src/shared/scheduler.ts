/**
 * Scheduler — pure functions (state, now) → state.
 * The main process calls `tick` once per second with the system clock.
 */
import type { AppState, EventInput, ReminderEvent } from './model'
import { addInterval, intervalMs, isLongInterval, windowAtOrAfter, MINUTE } from './time'

/** A wall-clock gap larger than this between two ticks means sleep, shutdown or a clock jump forward. */
export const GAP_MS = 90_000

export class SchedulerError extends Error {}

/** When a cycle that started at `anchor` fires. */
export function computeDue(ev: Pick<ReminderEvent, 'interval' | 'schedule'>, anchor: number): number {
  const ms = intervalMs(ev.interval)
  if (isLongInterval(ev.interval)) {
    const raw = addInterval(anchor, ev.interval)
    const w = windowAtOrAfter(ev.schedule, raw)
    if (!w) return raw
    return w.start <= raw ? raw : w.start
  }
  const w = windowAtOrAfter(ev.schedule, anchor)
  if (!w) return anchor + ms
  if (w.start <= anchor) {
    const cand = anchor + ms
    if (cand <= w.end) return cand
    // Paused at the end of the window, restarts with the full interval when the next one begins.
    const next = windowAtOrAfter(ev.schedule, w.end)
    return (next ? next.start : w.end) + ms
  }
  return w.start + ms
}

/** Start of the running segment that ends at `dueAt` (for progress and the paused state). */
export function segmentStart(ev: ReminderEvent): number {
  if (isLongInterval(ev.interval)) return ev.anchor
  return Math.max(ev.anchor, ev.dueAt - intervalMs(ev.interval))
}

export type View =
  | { kind: 'running'; remaining: number; progress: number; dueAt: number }
  | { kind: 'paused'; remaining: number; startsAt: number; dueAt: number }
  | { kind: 'pending'; firedAt: number }
  | { kind: 'snoozed'; until: number }
  | { kind: 'missed'; firedAt: number }

/** What the card shows at `now`. */
export function viewOf(ev: ReminderEvent, now: number): View {
  if (ev.phase === 'pending') return { kind: 'pending', firedAt: ev.firedAt ?? ev.dueAt }
  if (ev.phase === 'missed') return { kind: 'missed', firedAt: ev.firedAt ?? ev.dueAt }
  if (ev.phase === 'snoozed') return { kind: 'snoozed', until: ev.snoozeUntil ?? now }
  const seg = segmentStart(ev)
  if (!isLongInterval(ev.interval) && now < seg) {
    return { kind: 'paused', remaining: ev.dueAt - seg, startsAt: seg, dueAt: ev.dueAt }
  }
  const total = Math.max(1, ev.dueAt - seg)
  const remaining = Math.max(0, ev.dueAt - now)
  return { kind: 'running', remaining, progress: Math.min(1, Math.max(0, (now - seg) / total)), dueAt: ev.dueAt }
}

function trigger(ev: ReminderEvent): number | null {
  if (ev.status !== 'active') return null
  if (ev.phase === 'running') return ev.dueAt
  if (ev.phase === 'snoozed') return ev.snoozeUntil
  return null
}

function clone(s: AppState): AppState {
  return structuredClone(s)
}

function find(s: AppState, id: string): ReminderEvent {
  const ev = s.events.find((e) => e.id === id)
  if (!ev) throw new SchedulerError(`Unknown event ${id}`)
  return ev
}

function dropFromQueue(s: AppState, id: string): void {
  s.queue = s.queue.filter((q) => q !== id)
}

function clearMissedSince(s: AppState): void {
  if (!s.events.some((e) => e.status === 'active' && e.phase === 'missed')) s.missedSince = null
}

function restart(ev: ReminderEvent, now: number): void {
  ev.phase = 'running'
  ev.anchor = now
  ev.dueAt = computeDue(ev, now)
  ev.firedAt = null
  ev.snoozeUntil = null
  ev.snoozeMs = null
}

export interface TickResult {
  state: AppState
  /** Something besides lastSeenAt changed. */
  changed: boolean
  /** Ids that just became pending, in queue order. */
  fired: string[]
}

export function tick(prev: AppState, now: number): TickResult {
  const s = clone(prev)
  let changed = false
  const last = s.lastSeenAt

  // Clock moved back: cycles that "started in the future" restart now, snoozes are capped.
  if (last !== null && now < last - GAP_MS) {
    for (const ev of s.events) {
      if (ev.status !== 'active') continue
      if (ev.phase === 'running' && ev.anchor > now) {
        restart(ev, now)
        changed = true
      } else if (ev.phase === 'snoozed' && ev.snoozeUntil !== null && ev.snoozeMs !== null && ev.snoozeUntil > now + ev.snoozeMs) {
        ev.snoozeUntil = now + ev.snoozeMs
        changed = true
      }
    }
  }

  // Sleep, shutdown or a jump forward: everything due in the gap goes to the missed summary, once per event.
  if (last !== null && now - last > GAP_MS) {
    for (const ev of s.events) {
      const t = trigger(ev)
      if (t !== null && t <= now) {
        ev.phase = 'missed'
        ev.firedAt = t
        ev.snoozeUntil = null
        ev.snoozeMs = null
        changed = true
        if (s.missedSince === null) s.missedSince = last
      }
    }
  }

  // Normal firing: FIFO by trigger time.
  const due = s.events
    .map((ev) => ({ ev, t: trigger(ev) }))
    .filter((x): x is { ev: ReminderEvent; t: number } => x.t !== null && x.t <= now)
    .sort((a, b) => a.t - b.t || a.ev.createdAt - b.ev.createdAt)
  const fired: string[] = []
  for (const { ev, t } of due) {
    ev.phase = 'pending'
    ev.firedAt = t
    ev.snoozeUntil = null
    ev.snoozeMs = null
    if (!s.queue.includes(ev.id)) s.queue.push(ev.id)
    fired.push(ev.id)
    changed = true
  }

  // Keep the queue consistent with the events.
  const q = s.queue.filter((id) => s.events.some((e) => e.id === id && e.status === 'active' && e.phase === 'pending'))
  if (q.length !== s.queue.length) {
    s.queue = q
    changed = true
  }

  s.lastSeenAt = now
  return { state: s, changed, fired }
}

/** The notification currently shown, if any. The missed summary goes first. */
export function currentNotification(s: AppState): ReminderEvent | null {
  if (hasMissed(s)) return null
  const id = s.queue[0]
  return id ? (s.events.find((e) => e.id === id) ?? null) : null
}

export function hasMissed(s: AppState): boolean {
  return s.events.some((e) => e.status === 'active' && e.phase === 'missed')
}

export function missedEvents(s: AppState): ReminderEvent[] {
  return s.events
    .filter((e) => e.status === 'active' && e.phase === 'missed')
    .sort((a, b) => (a.firedAt ?? 0) - (b.firedAt ?? 0))
}

export function createEvent(prev: AppState, input: EventInput, now: number, id: string): AppState {
  const s = clone(prev)
  const ev: ReminderEvent = {
    id,
    title: input.title.trim(),
    description: input.description,
    categoryId: input.categoryId,
    interval: input.interval,
    schedule: input.schedule,
    repeat: input.repeat,
    doneCount: 0,
    status: 'active',
    phase: 'running',
    anchor: now,
    dueAt: 0,
    firedAt: null,
    snoozeUntil: null,
    snoozeMs: null,
    archivedAt: null,
    archivedReason: null,
    createdAt: now,
    updatedAt: now
  }
  ev.dueAt = computeDue(ev, now)
  s.events.push(ev)
  return s
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Text or category only → timer untouched. Interval, schedule or repeat → timer restarts. */
export function updateEvent(prev: AppState, id: string, input: EventInput, now: number): AppState {
  const s = clone(prev)
  const ev = find(s, id)
  const timerChanged = !same(ev.interval, input.interval) || !same(ev.schedule, input.schedule) || !same(ev.repeat, input.repeat)
  const repeatChanged = !same(ev.repeat, input.repeat)
  ev.title = input.title.trim()
  ev.description = input.description
  ev.categoryId = input.categoryId
  ev.interval = input.interval
  ev.schedule = input.schedule
  ev.repeat = input.repeat
  ev.updatedAt = now
  if (timerChanged && ev.status === 'active') {
    if (repeatChanged) ev.doneCount = 0
    restart(ev, now)
    dropFromQueue(s, id)
    clearMissedSince(s)
  }
  return s
}

function archiveInPlace(s: AppState, ev: ReminderEvent, now: number, reason: 'done' | 'manual'): void {
  ev.status = 'archived'
  ev.archivedAt = now
  ev.archivedReason = reason
  ev.phase = 'running'
  ev.firedAt = null
  ev.snoozeUntil = null
  ev.snoozeMs = null
  dropFromQueue(s, ev.id)
}

/** Total count for "3 of 6": a one-off event counts as 1 of 1. */
export function repeatTotal(ev: ReminderEvent): number | null {
  if (!ev.repeat.enabled) return 1
  return ev.repeat.times
}

/** Done: counts towards the repeat total; the next cycle starts now; the last Done archives. */
export function markDone(prev: AppState, id: string, now: number): AppState {
  const s = clone(prev)
  const ev = find(s, id)
  if (ev.status !== 'active') return s
  ev.doneCount += 1
  ev.updatedAt = now
  const total = repeatTotal(ev)
  if (total !== null && ev.doneCount >= total) {
    archiveInPlace(s, ev, now, 'done')
  } else {
    restart(ev, now)
    dropFromQueue(s, id)
  }
  clearMissedSince(s)
  return s
}

export function markAllMissedDone(prev: AppState, now: number): AppState {
  let s = prev
  for (const ev of missedEvents(prev)) s = markDone(s, ev.id, now)
  return s
}

/** Snooze: does not count towards the repeat total. */
export function snooze(prev: AppState, id: string, minutes: number, now: number): AppState {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new SchedulerError('Snooze minutes out of range')
  const s = clone(prev)
  const ev = find(s, id)
  if (ev.status !== 'active' || ev.phase !== 'pending') return s
  ev.phase = 'snoozed'
  ev.snoozeMs = minutes * MINUTE
  ev.snoozeUntil = now + ev.snoozeMs
  ev.updatedAt = now
  dropFromQueue(s, id)
  return s
}

export function archiveEvent(prev: AppState, id: string, now: number): AppState {
  const s = clone(prev)
  const ev = find(s, id)
  if (ev.status === 'active') archiveInPlace(s, ev, now, 'manual')
  clearMissedSince(s)
  return s
}

/** Restore with the previous timer: same settings, repeat counter back to 0, cycle starts now. */
export function restoreEvent(prev: AppState, id: string, now: number, input?: EventInput): AppState {
  let s = clone(prev)
  if (input) s = updateEvent(s, id, input, now)
  const ev = find(s, id)
  ev.status = 'active'
  ev.archivedAt = null
  ev.archivedReason = null
  ev.doneCount = 0
  ev.updatedAt = now
  restart(ev, now)
  return s
}

export function deleteEvent(prev: AppState, id: string): AppState {
  const s = clone(prev)
  s.events = s.events.filter((e) => e.id !== id)
  dropFromQueue(s, id)
  clearMissedSince(s)
  return s
}
