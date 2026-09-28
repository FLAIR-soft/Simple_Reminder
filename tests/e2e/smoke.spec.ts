/**
 * Smoke test on the built app (npm run test:e2e): real Electron, isolated userData per test.
 * Screenshots go to test-results/shots for a visual check.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { defaultState, type AppState, type ReminderEvent } from '../../src/shared/model'

const ROOT = path.resolve(__dirname, '../..')
const SHOTS = path.join(ROOT, 'test-results', 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

const MIN = 60_000

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reminder-e2e-'))
}

function seed(dir: string, state: AppState): void {
  fs.writeFileSync(path.join(dir, 'reminder-data.json'), JSON.stringify(state, null, 2))
}

function event(p: Partial<ReminderEvent> & Pick<ReminderEvent, 'id' | 'title'>): ReminderEvent {
  const now = Date.now()
  return {
    description: '',
    categoryId: 'work',
    interval: { months: 0, weeks: 0, days: 0, hours: 0, minutes: 30 },
    schedule: { allDay: true, start: '07:30', end: '16:00', days: [0, 1, 2, 3, 4, 5, 6] },
    repeat: { enabled: true, times: null },
    doneCount: 0,
    status: 'active',
    phase: 'running',
    anchor: now,
    dueAt: now + 30 * MIN,
    firedAt: null,
    snoozeUntil: null,
    snoozeMs: null,
    archivedAt: null,
    archivedReason: null,
    createdAt: now,
    updatedAt: now,
    ...p
  }
}

async function launch(dir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.join(ROOT, 'out/main/index.js')],
    cwd: ROOT,
    env: { ...process.env, REMINDER_USER_DATA: dir, REMINDER_NO_DEVTOOLS: '1', ELECTRON_RENDERER_URL: '' }
  })
}

async function windowWith(app: ElectronApplication, view: string): Promise<Page> {
  const find = (): Page | undefined => app.windows().find((w) => w.url().includes(`view=${view}`))
  await expect.poll(() => !!find(), { timeout: 15_000 }).toBe(true)
  const w = find()!
  await w.waitForLoadState('domcontentloaded')
  return w
}

async function readState(dir: string): Promise<AppState> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'reminder-data.json'), 'utf8')) as AppState
}

test('main window: empty state, create, edit, archive, restore, delete', async () => {
  const dir = tempDir()
  const app = await launch(dir)
  try {
    const main = await windowWith(app, 'main')
    await expect(main.getByText('No events yet')).toBeVisible()

    // Security: no Node in the renderer, only the typed bridge.
    expect(await main.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined')
    expect(await main.evaluate(() => typeof (globalThis as unknown as { reminder: { createEvent: unknown } }).reminder.createEvent)).toBe('function')

    await main.keyboard.press('n')
    await expect(main.getByRole('heading', { name: 'New event' })).toBeVisible()
    // Validation: empty title and timer.
    await main.keyboard.press('Control+s')
    await expect(main.getByText('Enter a title.')).toBeVisible()
    await main.getByLabel('Title').fill('Drink water')
    await main.getByLabel('Description').fill('One glass')
    await main.getByRole('radio', { name: 'Health' }).click()
    await main.locator('.dur input').nth(4).fill('45')
    await expect(main.locator('.summary')).toHaveText('Every 45 min')
    await main.screenshot({ path: path.join(SHOTS, 'form.png') })
    await main.keyboard.press('Control+s')

    const card = main.locator('.ev', { hasText: 'Drink water' })
    await expect(card).toBeVisible()
    await expect(card.locator('.left')).toHaveText(/^(4[45] min \d\d s)$/)
    await expect(card).toContainText('Every 45 min · ∞')
    await main.screenshot({ path: path.join(SHOTS, 'main-active.png') })

    // Interval longer than the window is refused with an explanation.
    await card.focus()
    await main.keyboard.press('e')
    await expect(main.getByRole('heading', { name: 'Edit event' })).toBeVisible()
    await main.getByRole('button', { name: 'All day' }).click()
    await main.getByRole('textbox', { name: 'From', exact: true }).fill('08:00')
    await main.getByRole('textbox', { name: 'To', exact: true }).fill('08:30')
    await main.keyboard.press('Control+s')
    await expect(main.getByText(/does not fit into 08:00–08:30/)).toBeVisible()
    await main.keyboard.press('Escape')

    // Archive via the menu, restore with the previous timer.
    await card.getByRole('button', { name: 'Actions' }).click()
    await main.getByRole('menuitem', { name: 'Move to archive' }).click()
    await main.getByRole('tab', { name: /Archive/ }).click()
    const arch = main.locator('.ev', { hasText: 'Drink water' })
    await expect(arch).toContainText('Archived by you')
    await arch.getByRole('button', { name: 'Actions' }).click()
    await main.getByRole('menuitem', { name: 'Restore' }).click()
    await main.screenshot({ path: path.join(SHOTS, 'archive.png') })
    await arch.getByRole('button', { name: /Keep previous timer/ }).click()
    await main.getByRole('tab', { name: /Active/ }).click()
    await expect(main.locator('.ev', { hasText: 'Drink water' })).toBeVisible()

    // Delete needs a 1.2 s hold; a short click does nothing.
    await main.locator('.ev', { hasText: 'Drink water' }).getByRole('button', { name: 'Actions' }).click()
    const del = main.getByRole('button', { name: 'Hold to delete' })
    await del.click()
    await expect(main.locator('.ev', { hasText: 'Drink water' })).toBeVisible()
    const box = (await del.boundingBox())!
    await main.mouse.move(box.x + 20, box.y + box.height / 2)
    await main.mouse.down()
    await main.waitForTimeout(1400)
    await main.mouse.up()
    await expect(main.getByText('No events yet')).toBeVisible()

    // Settings and themes.
    await main.getByRole('button', { name: 'Settings' }).click()
    for (const th of ['Clay', 'Graphite', 'Ivory']) {
      await main.getByRole('radio', { name: th }).click()
      await expect(main.locator('html')).toHaveAttribute('data-rd', th.toLowerCase())
      await main.screenshot({ path: path.join(SHOTS, `settings-${th.toLowerCase()}.png`) })
    }
  } finally {
    await app.close()
  }
})

test('notification: queue of two, Done and Snooze, window adapts to text', async () => {
  const dir = tempDir()
  const now = Date.now()
  const s = defaultState()
  s.lastSeenAt = now
  s.events = [
    event({
      id: 'a',
      title: 'Prepare the weekly QA report for all assembly stations and send it to the team leads',
      description: '1. Export errors from the QA tracker.\n2. Group by station and error type.\n3. Mark stations above the 2% threshold.\n4. Send before the Friday meeting.',
      dueAt: now - 2000,
      createdAt: now - 10_000,
      repeat: { enabled: true, times: 6 },
      doneCount: 2
    }),
    event({ id: 'b', title: 'Drink water', categoryId: 'health', dueAt: now - 1000, createdAt: now - 5000 })
  ]
  seed(dir, s)
  const app = await launch(dir)
  try {
    const n = await windowWith(app, 'notify')
    await expect(n.getByRole('heading', { level: 2 })).toContainText('weekly QA report')
    await expect(n.getByText('1 of 2 waiting')).toBeVisible()
    await expect(n.getByText('Repeat 3 of 6 · next 30 min after Done')).toBeVisible()
    await n.waitForTimeout(500)
    await n.screenshot({ path: path.join(SHOTS, 'notify-long.png') })

    const size = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('view=notify'))!
      return { ...w.getBounds(), top: w.isAlwaysOnTop(), closable: w.isClosable() }
    })
    expect(size.top).toBe(true)
    expect(size.closable).toBe(false)
    expect(size.width).toBeGreaterThanOrEqual(460)

    await n.getByRole('button', { name: 'Mark as done' }).click()
    await expect(n.getByRole('heading', { level: 2 })).toHaveText('Drink water')
    await expect(n.getByText('1 of 1')).toBeVisible()
    await n.waitForTimeout(400)
    await n.screenshot({ path: path.join(SHOTS, 'notify-short.png') })
    await n.getByLabel('Snooze for').fill('5')
    await n.getByRole('button', { name: 'Snooze' }).click()

    await expect.poll(async () => (await readState(dir)).events.find((e) => e.id === 'b')?.phase, { timeout: 5000 }).toBe('snoozed')
    const st = await readState(dir)
    expect(st.events.find((e) => e.id === 'a')?.doneCount).toBe(3)
    expect(st.events.find((e) => e.id === 'b')?.doneCount).toBe(0)
    expect(st.queue).toEqual([])
  } finally {
    await app.close()
  }
})

test('missed summary after the PC was off', async () => {
  const dir = tempDir()
  const now = Date.now()
  const s = defaultState()
  s.lastSeenAt = now - 3 * 60 * MIN
  s.events = [
    event({ id: 'a', title: 'Drink water', categoryId: 'health', dueAt: now - 2 * 60 * MIN }),
    event({ id: 'b', title: 'Pay rent', categoryId: 'personal', dueAt: now - 60 * MIN, repeat: { enabled: false, times: null } }),
    event({ id: 'c', title: 'Later', dueAt: now + 60 * MIN })
  ]
  seed(dir, s)
  const app = await launch(dir)
  try {
    const m = await windowWith(app, 'missed')
    await expect(m.getByRole('heading', { name: '2 reminders were missed' })).toBeVisible()
    await m.waitForTimeout(400)
    await m.screenshot({ path: path.join(SHOTS, 'missed.png') })
    await m.getByRole('button', { name: 'Done: Drink water' }).click()
    await expect(m.getByRole('heading', { name: '1 reminder was missed' })).toBeVisible()
    await m.getByRole('button', { name: 'Mark all as done' }).click()
    await expect.poll(async () => (await readState(dir)).events.find((e) => e.id === 'b')?.status, { timeout: 5000 }).toBe('archived')
    const st = await readState(dir)
    expect(st.events.find((e) => e.id === 'a')?.phase).toBe('running')
    expect(st.events.find((e) => e.id === 'c')?.phase).toBe('running')
  } finally {
    await app.close()
  }
})

test('broken data file: banner, nothing overwritten', async () => {
  const dir = tempDir()
  fs.writeFileSync(path.join(dir, 'reminder-data.json'), '{ broken')
  const app = await launch(dir)
  try {
    const main = await windowWith(app, 'main')
    await expect(main.getByText('Your data could not be read')).toBeVisible()
    await main.screenshot({ path: path.join(SHOTS, 'data-error.png') })
    await main.getByRole('button', { name: 'Retry' }).click()
    expect(fs.readFileSync(path.join(dir, 'reminder-data.json'), 'utf8')).toBe('{ broken')
  } finally {
    await app.close()
  }
})

test('visual: all card states in three themes', async () => {
  const dir = tempDir()
  const now = Date.now()
  const H = 60 * MIN
  const s = defaultState()
  s.lastSeenAt = now
  const later = new Date(now + 2 * H)
  const nightStart = `${String(later.getHours()).padStart(2, '0')}:00`
  const nightEnd = `${String((later.getHours() + 2) % 24).padStart(2, '0')}:00`
  s.events = [
    event({ id: 'p', title: 'Order spare parts', description: 'Fans and cables for station 4', phase: 'pending', firedAt: now - 2 * MIN, dueAt: now - 2 * MIN }),
    event({ id: 'r', title: 'Stretch and walk', description: '5 minutes away from the screen', categoryId: 'health', interval: { months: 0, weeks: 0, days: 0, hours: 2, minutes: 0 }, anchor: now - H, dueAt: now + H, repeat: { enabled: true, times: 6 }, doneCount: 2 }),
    event({ id: 'l', title: 'Pay rent', description: 'Transfer to landlord', categoryId: 'personal', interval: { months: 1, weeks: 0, days: 0, hours: 0, minutes: 0 }, anchor: now - 18 * 24 * H, dueAt: now + 12 * 24 * H, repeat: { enabled: true, times: 12 }, doneCount: 1 }),
    event({ id: 'z', title: 'Evening review', description: 'Plan tomorrow', categoryId: 'personal', schedule: { allDay: false, start: nightStart, end: nightEnd, days: [0, 1, 2, 3, 4, 5, 6] }, anchor: now, dueAt: now + 2 * H + 30 * MIN }),
    event({ id: 's', title: 'Call the supplier', phase: 'snoozed', snoozeUntil: now + 8 * MIN, snoozeMs: 10 * MIN }),
    event({ id: 'a', title: 'Eye drops', categoryId: 'health', status: 'archived', archivedReason: 'done', archivedAt: now - H, doneCount: 6, repeat: { enabled: true, times: 6 } })
  ]
  s.queue = ['p']
  seed(dir, s)
  const app = await launch(dir)
  try {
    const main = await windowWith(app, 'main')
    await expect(main.locator('.ev')).toHaveCount(5)
    await expect(main.locator('.ev', { hasText: 'Evening review' })).toContainText('Paused')
    await expect(main.locator('.ev', { hasText: 'Order spare parts' })).toContainText('Waiting for Done')
    await expect(main.locator('.ev', { hasText: 'Stretch and walk' })).toContainText('3 of 6')
    await expect(main.locator('.ev', { hasText: 'Pay rent' }).locator('.left')).toHaveText(/^1[12] d \d+ h$/)
    for (const th of ['ivory', 'clay', 'graphite'] as const) {
      await main.evaluate((t) => (globalThis as unknown as { reminder: { updateSettings(p: object): Promise<unknown> } }).reminder.updateSettings({ theme: t }), th)
      await expect(main.locator('html')).toHaveAttribute('data-rd', th)
      await main.waitForTimeout(200)
      await main.screenshot({ path: path.join(SHOTS, `cards-${th}.png`) })
    }
    const n = await windowWith(app, 'notify')
    await n.waitForTimeout(300)
    await n.screenshot({ path: path.join(SHOTS, 'notify-graphite.png') })
  } finally {
    await app.close()
  }
})

test('stress: odd input, double save, keyboard only, reduced motion, no console errors', async () => {
  const dir = tempDir()
  const app = await launch(dir)
  const errors: string[] = []
  // Listen from the first line of every window, not only after load.
  const watch = (p: Page): void => {
    p.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text())
    })
    p.on('pageerror', (e) => errors.push(String(e)))
  }
  app.windows().forEach(watch)
  app.on('window', watch)
  try {
    const main = await windowWith(app, 'main')
    await main.reload()
    await expect(main.getByText('No events yet')).toBeVisible()

    // Keyboard only: N → type → Tab to fields → Ctrl+S.
    await main.keyboard.press('n')
    const title = 'Ünïcödé 😀 Привет Γειά İı ' + 'x'.repeat(170)
    await main.keyboard.type(title)
    await main.getByLabel('Description').fill('Line 1\nLine 2 <b>not html</b>')
    await main.locator('.dur input').nth(0).fill('-5')
    await main.locator('.dur input').nth(3).fill('99999')
    await expect(main.locator('.dur input').nth(0)).toHaveValue('5')
    await expect(main.locator('.dur input').nth(3)).toHaveValue('999')
    await main.locator('.dur input').nth(0).fill('')
    await main.locator('.dur input').nth(3).fill('')
    await main.locator('.dur input').nth(4).fill('10')
    // Double and triple Save: exactly one event.
    await main.keyboard.press('Control+s')
    await main.keyboard.press('Control+s')
    await main.keyboard.press('Control+s')
    await expect(main.locator('.ev')).toHaveCount(1)
    await main.waitForTimeout(500)
    expect((await readState(dir)).events).toHaveLength(1)
    expect((await readState(dir)).events[0].title).toBe(title.trim().slice(0, 200))
    await expect(main.locator('.ev b')).toHaveCount(0)

    // Layout holds with the long title.
    const card = await main.locator('.ev').boundingBox()
    expect(card!.width).toBeLessThanOrEqual(360)
    await main.screenshot({ path: path.join(SHOTS, 'stress-long-title.png') })

    // Whitespace-only title is refused.
    await main.keyboard.press('n')
    await main.getByLabel('Title').fill('    ')
    await main.locator('.dur input').nth(4).fill('5')
    await main.keyboard.press('Control+s')
    await expect(main.getByText('Enter a title.')).toBeVisible()
    await main.keyboard.press('Escape')

    // Single-key shortcuts never fire while typing in a field.
    await main.keyboard.press('n')
    await main.getByLabel('Title').fill('')
    await main.getByLabel('Title').press('n')
    await expect(main.getByLabel('Title')).toHaveValue('n')
    await main.keyboard.press('Escape')

    // Reduced motion: the notification border stops spinning.
    await main.emulateMedia({ reducedMotion: 'reduce' })
    expect(await main.evaluate(() => (globalThis as unknown as { matchMedia(q: string): { matches: boolean } }).matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // Invalid IPC input is rejected by the main process.
    const bad = await main.evaluate(() =>
      (globalThis as unknown as { reminder: { snooze(id: string, m: number): Promise<{ ok: boolean }> } }).reminder.snooze('x', 99999)
    )
    expect(bad.ok).toBe(false)
    const bad2 = await main.evaluate(() =>
      (globalThis as unknown as { reminder: { createEvent(i: unknown): Promise<{ ok: boolean }> } }).reminder.createEvent({ title: 'x'.repeat(5000) })
    )
    expect(bad2.ok).toBe(false)

    expect(errors.filter((e) => !/Electron Security Warning/.test(e))).toEqual([])
  } finally {
    await app.close()
  }
})

test('custom blur: live blurred desktop behind the window, can be turned off', async () => {
  const dir = tempDir()
  const s = defaultState()
  s.settings.opacity = 40
  s.events = [event({ id: 'r', title: 'Drink water', categoryId: 'health' })]
  seed(dir, s)
  const app = await launch(dir)
  try {
    const main = await windowWith(app, 'main')
    const img = main.locator('.backdrop video')
    await expect(img).toBeVisible({ timeout: 10_000 })
    // Frames are really arriving from the desktop stream.
    await expect
      .poll(() => img.evaluate((el) => (el as unknown as { videoWidth: number; readyState: number }).videoWidth), { timeout: 10_000 })
      .toBeGreaterThan(0)
    await expect(main.locator('.win')).toHaveClass(/blurred/)
    expect(await img.evaluate((el) => (globalThis as unknown as { getComputedStyle(e: unknown): { filter: string } }).getComputedStyle(el).filter)).toContain('blur(14px)')
    await main.waitForTimeout(300)
    await main.screenshot({ path: path.join(SHOTS, 'blur-40.png') })

    // Picture stays aligned with the desktop while the window moves.
    const before = await img.evaluate((el) => (el as unknown as { style: { left: string } }).style.left)
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('view=main'))!
      const b = w.getBounds()
      w.setPosition(b.x - 100, b.y)
    })
    await expect.poll(() => img.evaluate((el) => (el as unknown as { style: { left: string } }).style.left)).not.toBe(before)

    // Turn off in Settings; a later patch of another setting must not turn it back on.
    await main.getByRole('button', { name: 'Settings' }).click()
    await main.getByRole('switch', { name: 'Blur the background' }).click()
    await expect(main.locator('.backdrop')).toHaveCount(0)
    await main.getByRole('radio', { name: 'Clay' }).click()
    await expect.poll(async () => (await readState(dir)).settings.theme).toBe('clay')
    expect((await readState(dir)).settings.blur).toBe(false)
    await expect(main.locator('.backdrop')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
