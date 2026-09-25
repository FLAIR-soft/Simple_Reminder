import type { Result, Snapshot } from '../shared/api'
import type { AppState, Bounds } from '../shared/model'
import { defaultState } from '../shared/model'
import { tick } from '../shared/scheduler'
import { Store } from './store'

const PERSIST_EVERY = 30_000

/** Owns the state in the main process: applies commands, runs the tick, saves and notifies. */
export class Controller {
  state: AppState = defaultState()
  loadError: string | null = null
  private lastPersist = 0
  private listeners = new Set<(s: Snapshot) => void>()

  constructor(readonly store: Store) {}

  load(): void {
    const r = this.store.load()
    this.state = r.state
    this.loadError = r.error
    if (r.fromBackup) console.warn('Data file was broken, restored from backup')
  }

  snapshot(now = Date.now()): Snapshot {
    return { state: this.state, loadError: this.loadError, dataPath: this.store.file, now }
  }

  onChange(cb: (s: Snapshot) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const l of this.listeners) l(snap)
  }

  /** Runs a pure state transition, saves and broadcasts. Blocked while the data file is unreadable. */
  apply(fn: (s: AppState, now: number) => AppState): Result {
    if (this.loadError) return { ok: false, error: 'dataUnavailable' }
    try {
      const now = Date.now()
      this.state = fn(this.state, now)
      this.store.save(this.state)
      this.lastPersist = now
      this.emit()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** One scheduler step on the system clock. Returns ids that just fired. */
  tick(now = Date.now()): string[] {
    if (this.loadError) return []
    const r = tick(this.state, now)
    this.state = r.state
    if (r.changed) {
      this.store.save(this.state)
      this.lastPersist = now
      this.emit()
    } else if (now - this.lastPersist >= PERSIST_EVERY || now < this.lastPersist) {
      // lastSeenAt every 30 s, so the missed summary knows when the PC went off.
      this.store.save(this.state)
      this.lastPersist = now
    }
    return r.fired
  }

  setBounds(b: Bounds): void {
    if (this.loadError) return
    this.state = { ...this.state, settings: { ...this.state.settings, bounds: b } }
    this.store.save(this.state, 1000)
  }

  retry(): Result {
    this.load()
    this.emit()
    return this.loadError ? { ok: false, error: this.loadError } : { ok: true }
  }

  /** Keeps the broken file next to the new one and starts with empty data. */
  reset(): Result {
    try {
      this.store.quarantine()
      this.state = defaultState()
      this.loadError = null
      this.store.saveNow(this.state)
      this.emit()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  shutdown(now = Date.now()): void {
    if (this.loadError) return
    this.state = { ...this.state, lastSeenAt: now }
    try {
      this.store.saveNow(this.state)
    } catch (e) {
      console.error('Final save failed', e)
    }
  }
}
