import { z } from 'zod'

/** Colour slot from the design system: series-1 … series-5. */
export const SeriesSchema = z.number().int().min(1).max(5)

export const CategorySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  color: SeriesSchema
})
export type Category = z.infer<typeof CategorySchema>

const part = z.number().int().min(0).max(999)
export const IntervalSchema = z.object({
  months: part,
  weeks: part,
  days: part,
  hours: part,
  minutes: part
})
export type Interval = z.infer<typeof IntervalSchema>

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const ScheduleSchema = z.object({
  allDay: z.boolean(),
  start: hm,
  end: hm,
  /** 0 = Monday … 6 = Sunday */
  days: z.array(z.number().int().min(0).max(6)).max(7)
})
export type Schedule = z.infer<typeof ScheduleSchema>

export const RepeatSchema = z.object({
  enabled: z.boolean(),
  /** null = until I stop */
  times: z.number().int().min(1).max(9999).nullable()
})
export type Repeat = z.infer<typeof RepeatSchema>

export const PhaseSchema = z.enum(['running', 'pending', 'snoozed', 'missed'])
export type Phase = z.infer<typeof PhaseSchema>

const ts = z.number().int().nonnegative()

export const EventSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200),
  description: z.string().max(5000),
  categoryId: z.string().max(64),
  interval: IntervalSchema,
  schedule: ScheduleSchema,
  repeat: RepeatSchema,
  doneCount: z.number().int().min(0),
  status: z.enum(['active', 'archived']),
  phase: PhaseSchema,
  /** Start of the current cycle (creation, last Done, restart). */
  anchor: ts,
  /** When the current cycle fires. */
  dueAt: ts,
  /** When the event became pending / missed. */
  firedAt: ts.nullable(),
  snoozeUntil: ts.nullable(),
  snoozeMs: ts.nullable(),
  archivedAt: ts.nullable(),
  archivedReason: z.enum(['done', 'manual']).nullable(),
  createdAt: ts,
  updatedAt: ts
})
export type ReminderEvent = z.infer<typeof EventSchema>

export const ThemeSchema = z.enum(['ivory', 'clay', 'graphite'])
export type Theme = z.infer<typeof ThemeSchema>

export const BoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(200).max(10000),
  height: z.number().int().min(200).max(10000)
})
export type Bounds = z.infer<typeof BoundsSchema>

export const SettingsSchema = z.object({
  theme: ThemeSchema,
  /** Window background opacity, 40–100 (%). */
  opacity: z.number().int().min(40).max(100),
  alwaysOnTop: z.boolean(),
  lockPosition: z.boolean(),
  clickThrough: z.boolean(),
  startWithWindows: z.boolean(),
  sound: z.object({
    mode: z.enum(['system', 'custom']),
    /** File name inside userData/sounds. */
    file: z.string().max(200).nullable()
  }),
  snoozeMinutes: z.number().int().min(1).max(1440),
  bounds: BoundsSchema.nullable()
})
export type Settings = z.infer<typeof SettingsSchema>

export const AppStateSchema = z.object({
  version: z.literal(1),
  events: z.array(EventSchema),
  categories: z.array(CategorySchema),
  settings: SettingsSchema,
  /** FIFO of pending event ids. */
  queue: z.array(z.string()),
  lastSeenAt: ts.nullable(),
  /** Start of the gap shown in the missed summary. */
  missedSince: ts.nullable()
})
export type AppState = z.infer<typeof AppStateSchema>

// ---------- Inputs coming over IPC ----------

export const EventInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  categoryId: z.string().max(64),
  interval: IntervalSchema,
  schedule: ScheduleSchema,
  repeat: RepeatSchema
})
export type EventInput = z.infer<typeof EventInputSchema>

export const IdSchema = z.string().min(1).max(64)

export const SettingsPatchSchema = SettingsSchema.omit({ bounds: true }).partial()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export const CategoryInputSchema = CategorySchema.omit({ id: true })
export type CategoryInput = z.infer<typeof CategoryInputSchema>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'ivory',
  opacity: 82,
  alwaysOnTop: true,
  lockPosition: false,
  clickThrough: false,
  startWithWindows: false,
  sound: { mode: 'system', file: null },
  snoozeMinutes: 10,
  bounds: null
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'work', name: 'Work', color: 1 },
  { id: 'health', name: 'Health', color: 2 },
  { id: 'personal', name: 'Personal', color: 4 }
]

export function defaultState(): AppState {
  return {
    version: 1,
    events: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    settings: structuredClone(DEFAULT_SETTINGS),
    queue: [],
    lastSeenAt: null,
    missedSince: null
  }
}
