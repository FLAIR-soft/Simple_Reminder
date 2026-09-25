import { describe, expect, it } from 'vitest'
import { defaultState, type AppState, type EventInput } from '../../src/shared/model'
import {
  computeDue,
  createEvent,
  currentNotification,
  markAllMissedDone,
  markDone,
  missedEvents,
  restoreEvent,
  snooze,
  tick,
  updateEvent,
  viewOf,
  archiveEvent
} from '../../src/shared/scheduler'
import { addInterval, intervalMs, intervalProblem, weekday, DAY, HOUR, MINUTE } from '../../src/shared/time'

/** Local time in Europe/Berlin (TZ set in vitest.config). */
const at = (y: number, mo: number, d: number, h = 0, mi = 0): number => new Date(y, mo - 1, d, h, mi).getTime()

const WORK = { allDay: false, start: '07:30', end: '16:00', days: [0, 1, 2, 3, 4] }
const ALWAYS = { allDay: true, start: '00:00', end: '00:00', days: [0, 1, 2, 3, 4, 5, 6] }
const iv = (p: Partial<EventInput['interval']>) => ({ months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, ...p })

function input(p: Partial<EventInput> = {}): EventInput {
  return {
    title: 'Test',
    description: '',
    categoryId: 'work',
    interval: iv({ minutes: 45 }),
    schedule: WORK,
    repeat: { enabled: true, times: null },
    ...p
  }
}

function withEvent(now: number, p: Partial<EventInput> = {}, id = 'e1', base?: AppState): AppState {
  const s = createEvent(base ?? { ...defaultState(), lastSeenAt: now }, input(p), now, id)
  return s
}

const ev = (s: AppState, id = 'e1') => s.events.find((e) => e.id === id)!

/** Ticks every 30 s from lastSeenAt up to `to` — the app running without a gap. */
function run(s: AppState, to: number): AppState {
  let t = (s.lastSeenAt ?? to) + 30_000
  while (t < to) {
    s = tick(s, t).state
    t += 30_000
  }
  return tick(s, to).state
}

describe('calendar sanity', () => {
  it('uses Monday-first weekdays', () => {
    expect(weekday(at(2026, 9, 21))).toBe(0) // Mon
    expect(weekday(at(2026, 9, 25))).toBe(4) // Fri
    expect(weekday(at(2026, 9, 27))).toBe(6) // Sun
  })
})

describe('short timer (< 1 day)', () => {
  it('runs inside the window', () => {
    const s = withEvent(at(2026, 9, 23, 10, 0))
    expect(ev(s).dueAt).toBe(at(2026, 9, 23, 10, 45))
  })

  it('pauses at the end of the window and restarts with the full interval', () => {
    const now = at(2026, 9, 23, 15, 30) // Wed
    const s = withEvent(now)
    expect(ev(s).dueAt).toBe(at(2026, 9, 24, 8, 15)) // Thu 07:30 + 45 min
    const v = viewOf(ev(s), at(2026, 9, 23, 17, 0))
    expect(v.kind).toBe('paused')
    if (v.kind === 'paused') {
      expect(v.startsAt).toBe(at(2026, 9, 24, 7, 30))
      expect(v.remaining).toBe(45 * MINUTE)
    }
  })

  it('starts at the beginning of the window when created before it', () => {
    const s = withEvent(at(2026, 9, 23, 6, 0))
    expect(ev(s).dueAt).toBe(at(2026, 9, 23, 8, 15))
  })

  it('fires exactly at the due time on tick', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    for (let t = at(2026, 9, 23, 10, 44); t < at(2026, 9, 23, 10, 45); t += 1000) {
      const r = tick(s, t)
      s = r.state
      expect(r.fired).toEqual([])
    }
    const r = tick(s, at(2026, 9, 23, 10, 45))
    expect(r.fired).toEqual(['e1'])
    expect(ev(r.state).phase).toBe('pending')
  })
})

describe('long timer (>= 1 day)', () => {
  it('counts calendar time and waits for the next window when due outside hours', () => {
    const s = withEvent(at(2026, 9, 23, 20, 0), { interval: iv({ days: 1 }) }) // Wed 20:00
    expect(ev(s).dueAt).toBe(at(2026, 9, 25, 7, 30)) // Thu 20:00 is outside → Fri 07:30
  })

  it('keeps the exact time when due inside hours', () => {
    const s = withEvent(at(2026, 9, 23, 9, 0), { interval: iv({ days: 1 }) })
    expect(ev(s).dueAt).toBe(at(2026, 9, 24, 9, 0))
  })
})

describe('Friday → Monday', () => {
  it('short timer paused over the weekend restarts on Monday', () => {
    const s = withEvent(at(2026, 9, 25, 15, 45), { interval: iv({ minutes: 30 }) }) // Fri
    expect(ev(s).dueAt).toBe(at(2026, 9, 28, 8, 0)) // Mon 07:30 + 30 min
  })

  it('long timer due on Saturday moves to Monday', () => {
    const s = withEvent(at(2026, 9, 25, 10, 0), { interval: iv({ days: 1 }) })
    expect(ev(s).dueAt).toBe(at(2026, 9, 28, 7, 30))
  })
})

describe('interval longer than the window', () => {
  it('is rejected for short timers', () => {
    expect(intervalProblem(iv({ hours: 9 }), WORK)).toBe('longerThanWindow') // window 8 h 30 min
    expect(intervalProblem(iv({ hours: 8, minutes: 30 }), WORK)).toBeNull()
  })
  it('does not apply to timers of 1 day or more', () => {
    expect(intervalProblem(iv({ days: 1 }), WORK)).toBeNull()
  })
  it('rejects empty timers, no days and equal hours', () => {
    expect(intervalProblem(iv({}), WORK)).toBe('empty')
    expect(intervalProblem(iv({ hours: 1 }), { ...WORK, days: [] })).toBe('noDays')
    expect(intervalProblem(iv({ hours: 1 }), { ...WORK, end: '07:30' })).toBe('sameHours')
  })
})

describe('composite interval', () => {
  it('treats 1 month as 30 days', () => {
    const i = iv({ months: 1, weeks: 1, days: 1, hours: 2, minutes: 5 })
    expect(intervalMs(i)).toBe(38 * DAY + 2 * HOUR + 5 * MINUTE)
    expect(addInterval(at(2026, 1, 10, 12, 0), i)).toBe(at(2026, 2, 17, 14, 5))
  })
  it('uses only the filled parts', () => {
    const s = withEvent(at(2026, 1, 10, 12, 0), { interval: iv({ months: 1 }), schedule: ALWAYS })
    expect(ev(s).dueAt).toBe(at(2026, 2, 9, 12, 0))
  })
})

describe('queue', () => {
  it('shows simultaneous reminders one by one in FIFO order while other timers keep running', () => {
    const t0 = at(2026, 9, 23, 10, 0)
    let s = withEvent(t0, { interval: iv({ minutes: 30 }) }, 'b')
    s = withEvent(t0 + 1000, { interval: iv({ minutes: 30 }) }, 'c', s)
    s = createEvent(s, input({ interval: iv({ minutes: 20 }) }), t0, 'a')
    s = createEvent(s, input({ interval: iv({ hours: 2 }) }), t0, 'far')

    s = run(s, at(2026, 9, 23, 10, 30) + 1000)
    expect(s.queue).toEqual(['a', 'b', 'c'])
    expect(currentNotification(s)?.id).toBe('a')
    expect(ev(s, 'far').phase).toBe('running')

    s = markDone(s, 'a', at(2026, 9, 23, 10, 31))
    expect(currentNotification(s)?.id).toBe('b')
    s = snooze(s, 'b', 5, at(2026, 9, 23, 10, 32))
    expect(currentNotification(s)?.id).toBe('c')
    expect(ev(s, 'far').dueAt).toBe(at(2026, 9, 23, 12, 0))
  })

  it('keeps a pending reminder after active hours end', () => {
    let s = withEvent(at(2026, 9, 23, 15, 0))
    s = run(s, at(2026, 9, 23, 16, 30))
    expect(ev(s).phase).toBe('pending')
    expect(s.queue).toEqual(['e1'])
  })
})

describe('snooze', () => {
  it('does not count towards repeats and fires again after N minutes', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0), { repeat: { enabled: true, times: 3 } })
    s = run(s, at(2026, 9, 23, 10, 45))
    s = snooze(s, 'e1', 10, at(2026, 9, 23, 10, 46))
    expect(ev(s).doneCount).toBe(0)
    expect(ev(s).phase).toBe('snoozed')
    expect(s.queue).toEqual([])
    s = run(s, at(2026, 9, 23, 10, 55))
    expect(ev(s).phase).toBe('snoozed')
    s = run(s, at(2026, 9, 23, 10, 56))
    expect(ev(s).phase).toBe('pending')
    expect(ev(s).doneCount).toBe(0)
  })
})

describe('Done and archive', () => {
  it('starts the next cycle from the Done press', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = run(s, at(2026, 9, 23, 10, 45))
    s = markDone(s, 'e1', at(2026, 9, 23, 11, 0))
    expect(ev(s).doneCount).toBe(1)
    expect(ev(s).dueAt).toBe(at(2026, 9, 23, 11, 45))
  })

  it('moves the event to Archive after the last Done', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0), { repeat: { enabled: true, times: 2 } })
    s = markDone(s, 'e1', at(2026, 9, 23, 10, 45))
    expect(ev(s).status).toBe('active')
    s = markDone(s, 'e1', at(2026, 9, 23, 11, 30))
    expect(ev(s).status).toBe('archived')
    expect(ev(s).archivedReason).toBe('done')
    expect(ev(s).doneCount).toBe(2)
  })

  it('archives a one-off event after its Done', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0), { repeat: { enabled: false, times: null } })
    s = markDone(s, 'e1', at(2026, 9, 23, 10, 45))
    expect(ev(s).status).toBe('archived')
  })

  it('never archives "Until I stop" events on Done', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    for (let k = 0; k < 20; k++) s = markDone(s, 'e1', at(2026, 9, 23, 10, 0) + k * 1000)
    expect(ev(s).status).toBe('active')
  })
})

describe('restore', () => {
  it('keep previous timer resets the repeat counter', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0), { repeat: { enabled: true, times: 1 } })
    s = markDone(s, 'e1', at(2026, 9, 23, 10, 45))
    expect(ev(s).status).toBe('archived')
    s = restoreEvent(s, 'e1', at(2026, 9, 24, 9, 0))
    expect(ev(s).status).toBe('active')
    expect(ev(s).doneCount).toBe(0)
    expect(ev(s).dueAt).toBe(at(2026, 9, 24, 9, 45))
  })

  it('set new timer applies the new settings', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = archiveEvent(s, 'e1', at(2026, 9, 23, 10, 5))
    expect(ev(s).archivedReason).toBe('manual')
    s = restoreEvent(s, 'e1', at(2026, 9, 24, 9, 0), input({ interval: iv({ hours: 2 }) }))
    expect(ev(s).dueAt).toBe(at(2026, 9, 24, 11, 0))
  })
})

describe('edit', () => {
  it('text or category only does not touch the timer', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = updateEvent(s, 'e1', input({ title: 'Renamed', categoryId: 'health' }), at(2026, 9, 23, 10, 30))
    expect(ev(s).dueAt).toBe(at(2026, 9, 23, 10, 45))
    expect(ev(s).title).toBe('Renamed')
  })
  it('interval, schedule or repeat restarts the timer', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = updateEvent(s, 'e1', input({ interval: iv({ minutes: 30 }) }), at(2026, 9, 23, 10, 30))
    expect(ev(s).dueAt).toBe(at(2026, 9, 23, 11, 0))
    s = updateEvent(s, 'e1', input({ interval: iv({ minutes: 30 }), schedule: { ...WORK, days: [2] } }), at(2026, 9, 23, 10, 40))
    expect(ev(s).dueAt).toBe(at(2026, 9, 23, 11, 10))
  })
})

describe('missed while the PC was off or asleep', () => {
  it('collects each event once and holds normal notifications until the summary is done', () => {
    const off = at(2026, 9, 23, 10, 0)
    let s = withEvent(off - 30 * MINUTE, { interval: iv({ minutes: 45 }) }, 'water')
    s = createEvent(s, input({ interval: iv({ days: 1 }) }), off - HOUR, 'qa')
    s = createEvent(s, input({ interval: iv({ hours: 8 }) }), off, 'later')
    s = { ...s, lastSeenAt: off }

    // PC off until Thu 12:00: water (due 10:15, would repeat many times) and qa (due Thu 09:00) were missed.
    const on = at(2026, 9, 24, 12, 0)
    s = tick(s, on).state
    expect(missedEvents(s).map((e) => e.id)).toEqual(['water', 'qa'])
    expect(s.missedSince).toBe(off)
    expect(ev(s, 'later').phase).toBe('running') // 8 h does not fit Wed 10:00–16:00 → Thu 07:30 + 8 h = 15:30
    expect(ev(s, 'later').dueAt).toBe(at(2026, 9, 24, 15, 30))
    expect(currentNotification(s)).toBeNull()

    s = markDone(s, 'water', on + 1000)
    expect(ev(s, 'water').doneCount).toBe(1)
    expect(ev(s, 'water').phase).toBe('running')
    s = markAllMissedDone(s, on + 2000)
    expect(missedEvents(s)).toEqual([])
    expect(s.missedSince).toBeNull()
  })

  it('treats a short restart (< 90 s) as normal firing', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = { ...s, lastSeenAt: at(2026, 9, 23, 10, 44) + 30_000 }
    const r = tick(s, at(2026, 9, 23, 10, 45) + 30_000)
    expect(r.fired).toEqual(['e1'])
    expect(ev(r.state).phase).toBe('pending')
  })

  it('keeps an already pending reminder in the queue across a restart', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = run(s, at(2026, 9, 23, 10, 45))
    s = tick(s, at(2026, 9, 23, 14, 0)).state // restart after 3 h
    expect(ev(s).phase).toBe('pending')
    expect(s.queue).toEqual(['e1'])
  })
})

describe('DST in Europe/Berlin', () => {
  it('daily timer keeps 09:00 across the spring change (23 h day)', () => {
    const s = withEvent(at(2026, 3, 28, 9, 0), { interval: iv({ days: 1 }), schedule: ALWAYS })
    expect(ev(s).dueAt).toBe(at(2026, 3, 29, 9, 0))
    expect(ev(s).dueAt - at(2026, 3, 28, 9, 0)).toBe(23 * HOUR)
  })

  it('weekly timer keeps 09:00 across the autumn change (25 h day)', () => {
    const s = withEvent(at(2026, 10, 20, 9, 0), { interval: iv({ weeks: 1 }), schedule: ALWAYS })
    expect(ev(s).dueAt).toBe(at(2026, 10, 27, 9, 0))
    expect(ev(s).dueAt - at(2026, 10, 20, 9, 0)).toBe(7 * DAY + HOUR)
  })

  it('short timer uses real minutes during the changeover night', () => {
    const night = { allDay: false, start: '01:00', end: '05:00', days: [6] }
    const s = withEvent(at(2026, 3, 29, 1, 30), { interval: iv({ hours: 1 }), schedule: night })
    expect(ev(s).dueAt).toBe(at(2026, 3, 29, 1, 30) + HOUR) // = 03:30 local, 02:xx does not exist
    expect(new Date(ev(s).dueAt).getHours()).toBe(3)
  })

  it('window boundaries follow local time on the change day', () => {
    const s = withEvent(at(2026, 10, 25, 6, 0), { interval: iv({ minutes: 30 }), schedule: { ...WORK, days: [6] } })
    expect(ev(s).dueAt).toBe(at(2026, 10, 25, 8, 0))
  })
})

describe('manual system time change', () => {
  it('clock moved back restarts cycles that started "in the future"', () => {
    const t = at(2026, 9, 23, 10, 0)
    let s = withEvent(t)
    s = { ...s, lastSeenAt: t + 10 * MINUTE }
    const back = at(2026, 9, 23, 8, 0)
    const r = tick(s, back)
    expect(ev(r.state).anchor).toBe(back)
    expect(ev(r.state).dueAt).toBe(at(2026, 9, 23, 8, 45))
    expect(r.fired).toEqual([])
  })

  it('clock moved back caps a snooze to its length', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = run(s, at(2026, 9, 23, 10, 45))
    s = snooze(s, 'e1', 10, at(2026, 9, 23, 10, 46))
    const back = at(2026, 9, 23, 9, 0)
    s = tick(s, back).state
    expect(ev(s).snoozeUntil).toBe(back + 10 * MINUTE)
  })

  it('clock moved forward counts due reminders once as missed', () => {
    let s = withEvent(at(2026, 9, 23, 10, 0))
    s = tick(s, at(2026, 9, 23, 10, 1)).state
    s = tick(s, at(2026, 9, 23, 15, 0)).state
    expect(missedEvents(s).map((e) => e.id)).toEqual(['e1'])
    s = tick(s, at(2026, 9, 23, 15, 0) + 1000).state
    expect(missedEvents(s)).toHaveLength(1)
  })
})

describe('computeDue', () => {
  it('handles overnight windows', () => {
    const night = { allDay: false, start: '22:00', end: '02:00', days: [0, 1, 2, 3, 4, 5, 6] }
    expect(computeDue({ interval: iv({ hours: 1 }), schedule: night }, at(2026, 9, 23, 23, 30))).toBe(at(2026, 9, 24, 0, 30))
    expect(computeDue({ interval: iv({ hours: 1 }), schedule: night }, at(2026, 9, 24, 1, 30))).toBe(at(2026, 9, 24, 23, 0))
  })
  it('all-day windows on consecutive days are continuous', () => {
    expect(computeDue({ interval: iv({ minutes: 45 }), schedule: ALWAYS }, at(2026, 9, 23, 23, 50))).toBe(at(2026, 9, 24, 0, 35))
  })
})
