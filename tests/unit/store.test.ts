import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Store } from '../../src/main/store'
import { defaultState } from '../../src/shared/model'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-store-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('Store', () => {
  it('starts with defaults when there is no file', () => {
    const r = new Store(dir).load()
    expect(r.error).toBeNull()
    expect(r.state.categories.map((c) => c.name)).toEqual(['Work', 'Health', 'Personal'])
  })

  it('round-trips and keeps the previous version as .bak', () => {
    const st = new Store(dir)
    const a = defaultState()
    a.settings.theme = 'clay'
    st.saveNow(a)
    const b = defaultState()
    b.settings.theme = 'graphite'
    st.saveNow(b)
    expect(st.load().state.settings.theme).toBe('graphite')
    expect(JSON.parse(fs.readFileSync(st.bak, 'utf8')).settings.theme).toBe('clay')
    expect(fs.existsSync(`${st.file}.tmp`)).toBe(false)
  })

  it('falls back to the backup when the main file is broken', () => {
    const st = new Store(dir)
    const a = defaultState()
    a.settings.opacity = 55
    st.saveNow(a)
    st.saveNow(a)
    fs.writeFileSync(st.file, '{ broken')
    const r = st.load()
    expect(r.fromBackup).toBe(true)
    expect(r.state.settings.opacity).toBe(55)
  })

  it('reports an error when both files are unusable, and does not back up a broken file', () => {
    const st = new Store(dir)
    fs.writeFileSync(st.file, '{"version":1}')
    fs.writeFileSync(st.bak, 'nope')
    const r = st.load()
    expect(r.error).toMatch(/reminder-data\.json/)
    expect(st.quarantine()).toMatch(/broken-/)
    expect(fs.existsSync(st.file)).toBe(false)
  })

  it('rejects data that does not match the schema', () => {
    const st = new Store(dir)
    const bad = defaultState() as unknown as { settings: { opacity: number } }
    bad.settings.opacity = 5
    expect(() => st.saveNow(bad as never)).toThrow()
  })
})
