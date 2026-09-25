import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, net, protocol } from 'electron'

export const SOUND_SCHEME = 'reminder-sound'
const ALLOWED = new Set(['.mp3', '.wav', '.ogg'])
const MAX_BYTES = 10 * 1024 * 1024

export function soundsDir(): string {
  return path.join(app.getPath('userData'), 'sounds')
}

/** Must run before app ready. */
export function registerSoundScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SOUND_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
  ])
}

/** Serves only plain file names from userData/sounds with an allowed extension. */
export function handleSoundScheme(): void {
  protocol.handle(SOUND_SCHEME, (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ''))
    if (!isSafeName(name)) return new Response('Not found', { status: 404 })
    const file = path.join(soundsDir(), name)
    if (!fs.existsSync(file)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

export function isSafeName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 200 &&
    name === path.basename(name) &&
    !name.includes('..') &&
    /^[\w\-. ()]+$/.test(name) &&
    ALLOWED.has(path.extname(name).toLowerCase())
  )
}

export function soundUrl(name: string): string {
  return `${SOUND_SCHEME}://sound/${encodeURIComponent(name)}`
}

/** Copies a user-picked file into userData/sounds and removes older custom sounds. */
export function importSound(src: string): string {
  const ext = path.extname(src).toLowerCase()
  if (!ALLOWED.has(ext)) throw new Error('soundType')
  const st = fs.statSync(src)
  if (!st.isFile() || st.size > MAX_BYTES) throw new Error('soundSize')
  const base = path
    .basename(src, path.extname(src))
    .replace(/[^\w\-. ()]/g, '_')
    .slice(0, 80) || 'sound'
  const name = `${base}${ext}`
  const dir = soundsDir()
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${name}.tmp`)
  fs.copyFileSync(src, tmp)
  for (const f of fs.readdirSync(dir)) if (f !== path.basename(tmp)) fs.rmSync(path.join(dir, f), { force: true })
  fs.renameSync(tmp, path.join(dir, name))
  return name
}
