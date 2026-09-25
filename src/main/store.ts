import fs from 'node:fs'
import path from 'node:path'
import { AppStateSchema, defaultState, type AppState } from '../shared/model'

export interface LoadResult {
  state: AppState
  /** Human-readable problem, set only when neither the file nor the backup could be used. */
  error: string | null
  /** The main file was broken and the backup was used. */
  fromBackup: boolean
}

function readValid(file: string): { ok: true; state: AppState } | { ok: false; missing: boolean; error: string } {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    return { ok: false, missing: code === 'ENOENT', error: `Cannot read ${path.basename(file)} (${code ?? 'error'})` }
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, missing: false, error: `${path.basename(file)} is not valid JSON` }
  }
  const parsed = AppStateSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, missing: false, error: `${path.basename(file)}: ${issue?.path.join('.') || 'root'} — ${issue?.message ?? 'invalid'}` }
  }
  return { ok: true, state: parsed.data }
}

/** JSON file in userData, written atomically (temp file + rename) with a `.bak` copy of the previous version. */
export class Store {
  readonly file: string
  readonly bak: string
  private timer: NodeJS.Timeout | null = null
  private pending: AppState | null = null

  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, 'reminder-data.json')
    this.bak = `${this.file}.bak`
  }

  load(): LoadResult {
    const main = readValid(this.file)
    if (main.ok) return { state: main.state, error: null, fromBackup: false }
    const bak = readValid(this.bak)
    if (bak.ok) return { state: bak.state, error: null, fromBackup: true }
    if (main.missing && bak.missing) return { state: defaultState(), error: null, fromBackup: false }
    return { state: defaultState(), error: main.error, fromBackup: false }
  }

  /** Writes now. Throws if the disk write fails. */
  saveNow(state: AppState): void {
    this.cancel()
    const data = JSON.stringify(AppStateSchema.parse(state), null, 2)
    const tmp = `${this.file}.tmp`
    const fd = fs.openSync(tmp, 'w')
    try {
      fs.writeFileSync(fd, data, 'utf8')
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    if (fs.existsSync(this.file) && readValid(this.file).ok) fs.copyFileSync(this.file, this.bak)
    let lastErr: unknown
    for (let i = 0; i < 5; i++) {
      try {
        fs.renameSync(tmp, this.file)
        return
      } catch (e) {
        lastErr = e // Windows: file briefly locked by an indexer or antivirus
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
      }
    }
    throw lastErr
  }

  /** Debounced save. */
  save(state: AppState, delay = 250): void {
    this.pending = state
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      const s = this.pending
      this.pending = null
      if (s) {
        try {
          this.saveNow(s)
        } catch (e) {
          console.error('Save failed', e)
        }
      }
    }, delay)
  }

  flush(): void {
    const s = this.pending
    this.cancel()
    if (s) this.saveNow(s)
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }

  /** Moves a broken file aside (never deletes it) so the app can start with empty data. */
  quarantine(): string | null {
    if (!fs.existsSync(this.file)) return null
    const target = `${this.file}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`
    fs.renameSync(this.file, target)
    return target
  }
}
