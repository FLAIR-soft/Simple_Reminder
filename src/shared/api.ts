import type { AppState, CategoryInput, EventInput, SettingsPatch } from './model'

export interface Snapshot {
  state: AppState
  /** Set when the data file could not be read. Saving is blocked until Retry succeeds. */
  loadError: string | null
  dataPath: string
  /** Time of the main process when the snapshot was taken (the system clock). */
  now: number
}

export type Result = { ok: true } | { ok: false; error: string }

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type NavigateTarget = 'new-event' | 'list'

/** Exposed by the preload as `window.reminder`. */
export interface ReminderApi {
  getSnapshot(): Promise<Snapshot>
  onSnapshot(cb: (s: Snapshot) => void): () => void
  onNavigate(cb: (target: NavigateTarget) => void): () => void
  onPlaySound(cb: (url: string) => void): () => void

  createEvent(input: EventInput): Promise<Result>
  updateEvent(id: string, input: EventInput): Promise<Result>
  deleteEvent(id: string): Promise<Result>
  archiveEvent(id: string): Promise<Result>
  restoreEvent(id: string, input: EventInput | null): Promise<Result>
  done(id: string): Promise<Result>
  snooze(id: string, minutes: number): Promise<Result>
  doneAllMissed(): Promise<Result>

  createCategory(input: CategoryInput): Promise<Result>
  updateCategory(id: string, input: CategoryInput): Promise<Result>
  deleteCategory(id: string): Promise<Result>

  updateSettings(patch: SettingsPatch): Promise<Result>
  chooseSound(): Promise<Result>
  testSound(): Promise<Result>

  retryLoad(): Promise<Result>
  resetData(): Promise<Result>

  hideWindow(): Promise<void>
  resizeStart(edge: ResizeEdge): Promise<void>
  resizeEnd(): Promise<void>
  overlaySize(width: number, height: number): Promise<void>
}

export const CH = {
  snapshot: 'state:snapshot',
  getSnapshot: 'state:get',
  navigate: 'ui:navigate',
  playSound: 'sound:play',
  createEvent: 'event:create',
  updateEvent: 'event:update',
  deleteEvent: 'event:delete',
  archiveEvent: 'event:archive',
  restoreEvent: 'event:restore',
  done: 'event:done',
  snooze: 'event:snooze',
  doneAllMissed: 'missed:done-all',
  createCategory: 'category:create',
  updateCategory: 'category:update',
  deleteCategory: 'category:delete',
  updateSettings: 'settings:update',
  chooseSound: 'sound:choose',
  testSound: 'sound:test',
  retryLoad: 'data:retry',
  resetData: 'data:reset',
  hideWindow: 'window:hide',
  resizeStart: 'window:resize-start',
  resizeEnd: 'window:resize-end',
  overlaySize: 'overlay:size'
} as const
