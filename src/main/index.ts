import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, powerMonitor, shell, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { CH, type Result } from '../shared/api'
import {
  CategoryInputSchema,
  EventInputSchema,
  IdSchema,
  SettingsPatchSchema,
  type AppState,
  type Settings
} from '../shared/model'
import {
  archiveEvent,
  createEvent,
  currentNotification,
  deleteEvent,
  hasMissed,
  markAllMissedDone,
  markDone,
  restoreEvent,
  snooze,
  updateEvent
} from '../shared/scheduler'
import { intervalProblem } from '../shared/time'
import { Backdrop } from './backdrop'
import { Controller } from './controller'
import { hardenApp, isAppUrl } from './security'
import { handleSoundScheme, importSound, registerSoundScheme, soundUrl } from './sound'
import { Store } from './store'
import { AppTray } from './tray'
import { createMainWindow, createOverlay, fitOverlay, Resizer } from './windows'

// Tests and portable runs can point userData elsewhere.
if (process.env.REMINDER_USER_DATA) app.setPath('userData', process.env.REMINDER_USER_DATA)

app.setAppUserModelId('de.roman.reminder')
registerSoundScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  main()
}

function main(): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  let backdrop: Backdrop | null = null
  hardenApp(rendererUrl, (wc) => !!backdrop?.owns(wc))

  let controller: Controller
  let mainWin: BrowserWindow | null = null
  let notifyWin: BrowserWindow | null = null
  let missedWin: BrowserWindow | null = null
  let tray: AppTray | null = null
  let quitting = false
  let shownNotifyId: string | null = null
  let missedShown = false
  const resizer = new Resizer()

  app.on('second-instance', () => showMain())

  function showMain(): void {
    if (!mainWin || mainWin.isDestroyed()) return
    mainWin.show()
    mainWin.focus()
  }

  // ---------- Sound ----------
  function playSound(target: BrowserWindow | null): void {
    const s = controller.state.settings.sound
    if (s.mode === 'custom' && s.file && target && !target.isDestroyed()) {
      target.webContents.send(CH.playSound, soundUrl(s.file))
    } else {
      shell.beep()
    }
  }

  // ---------- Overlays: missed summary first, then the FIFO queue one by one ----------
  function syncOverlays(): void {
    const st = controller.state
    if (hasMissed(st)) {
      closeOverlay('notify')
      if (!missedWin || missedWin.isDestroyed()) {
        missedWin = createOverlay('missed')
        missedShown = false
        missedWin.once('ready-to-show', () => {
          if (!missedShown) {
            missedShown = true
            playSound(missedWin)
          }
        })
      }
      return
    }
    closeOverlay('missed')
    const cur = currentNotification(st)
    if (!cur) {
      closeOverlay('notify')
      shownNotifyId = null
      return
    }
    if (!notifyWin || notifyWin.isDestroyed()) {
      notifyWin = createOverlay('notify')
      shownNotifyId = null
      notifyWin.once('ready-to-show', () => syncOverlays())
      return
    }
    if (shownNotifyId !== cur.id) {
      shownNotifyId = cur.id
      playSound(notifyWin)
      if (notifyWin.isVisible()) {
        notifyWin.moveTop()
        notifyWin.focus()
      }
    }
  }

  function closeOverlay(kind: 'notify' | 'missed'): void {
    const w = kind === 'notify' ? notifyWin : missedWin
    if (w && !w.isDestroyed()) {
      w.setClosable(true)
      w.destroy()
    }
    if (kind === 'notify') notifyWin = null
    else missedWin = null
  }

  // ---------- Window behaviour from settings ----------
  function applyWindowSettings(s: Settings): void {
    // Native menus (tray) follow the app theme.
    nativeTheme.themeSource = s.theme === 'graphite' ? 'dark' : 'light'
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.setAlwaysOnTop(s.alwaysOnTop, 'floating')
      mainWin.setMovable(!s.lockPosition)
      if (s.clickThrough) mainWin.setIgnoreMouseEvents(true, { forward: true })
      else mainWin.setIgnoreMouseEvents(false)
      backdrop?.setEnabled(s.blur)
    }
    if (app.isPackaged) {
      const cur = app.getLoginItemSettings().openAtLogin
      if (cur !== s.startWithWindows) app.setLoginItemSettings({ openAtLogin: s.startWithWindows })
    }
    tray?.update(s)
  }

  // ---------- IPC ----------
  function fromOurWindow(e: IpcMainInvokeEvent): boolean {
    const url = e.senderFrame?.url ?? ''
    const win = BrowserWindow.fromWebContents(e.sender)
    return !!win && [mainWin, notifyWin, missedWin].includes(win) && isAppUrl(url, rendererUrl)
  }

  function handle<A extends z.ZodTypeAny[]>(channel: string, schemas: [...A], fn: (e: IpcMainInvokeEvent, ...args: { [K in keyof A]: z.infer<A[K]> }) => Result | Promise<Result> | void | Promise<void>): void {
    ipcMain.handle(channel, async (e, ...raw: unknown[]) => {
      if (!fromOurWindow(e)) return { ok: false, error: 'forbidden' }
      if (raw.length > schemas.length) return { ok: false, error: 'invalid' }
      const parsed: unknown[] = []
      for (let i = 0; i < schemas.length; i++) {
        const r = schemas[i].safeParse(raw[i])
        if (!r.success) return { ok: false, error: 'invalid' }
        parsed.push(r.data)
      }
      return fn(e, ...(parsed as { [K in keyof A]: z.infer<A[K]> }))
    })
  }

  const cmd = (fn: (s: AppState, now: number) => AppState): Result => {
    const r = controller.apply(fn)
    syncOverlays()
    return r
  }

  const checkInput = (input: z.infer<typeof EventInputSchema>, s: AppState): void => {
    const p = intervalProblem(input.interval, input.schedule)
    if (p) throw new Error(p)
    if (!s.categories.some((c) => c.id === input.categoryId)) throw new Error('unknownCategory')
  }

  let idSeq = 0
  const newId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

  const noArgs: [] = []
  handle(CH.getSnapshot, noArgs, () => controller.snapshot() as never)
  handle(CH.createEvent, [EventInputSchema], (_e, input) =>
    cmd((s, now) => {
      checkInput(input, s)
      return createEvent(s, input, now, newId('e'))
    })
  )
  handle(CH.updateEvent, [IdSchema, EventInputSchema], (_e, id, input) =>
    cmd((s, now) => {
      checkInput(input, s)
      return updateEvent(s, id, input, now)
    })
  )
  handle(CH.deleteEvent, [IdSchema], (_e, id) => cmd((s) => deleteEvent(s, id)))
  handle(CH.archiveEvent, [IdSchema], (_e, id) => cmd((s, now) => archiveEvent(s, id, now)))
  handle(CH.restoreEvent, [IdSchema, EventInputSchema.nullable()], (_e, id, input) =>
    cmd((s, now) => {
      if (input) checkInput(input, s)
      return restoreEvent(s, id, now, input ?? undefined)
    })
  )
  handle(CH.done, [IdSchema], (_e, id) => cmd((s, now) => markDone(s, id, now)))
  handle(CH.snooze, [IdSchema, z.number().int().min(1).max(1440)], (_e, id, min) => cmd((s, now) => snooze(s, id, min, now)))
  handle(CH.doneAllMissed, noArgs, () => cmd((s, now) => markAllMissedDone(s, now)))

  handle(CH.createCategory, [CategoryInputSchema], (_e, input) =>
    cmd((s) => {
      if (s.categories.length >= 20) throw new Error('tooManyCategories')
      return { ...s, categories: [...s.categories, { id: newId('c'), ...input }] }
    })
  )
  handle(CH.updateCategory, [IdSchema, CategoryInputSchema], (_e, id, input) =>
    cmd((s) => {
      if (!s.categories.some((c) => c.id === id)) throw new Error('unknownCategory')
      return { ...s, categories: s.categories.map((c) => (c.id === id ? { id, ...input } : c)) }
    })
  )
  handle(CH.deleteCategory, [IdSchema], (_e, id) =>
    cmd((s) => {
      if (s.events.some((ev) => ev.categoryId === id)) throw new Error('categoryInUse')
      if (s.categories.length <= 1) throw new Error('lastCategory')
      return { ...s, categories: s.categories.filter((c) => c.id !== id) }
    })
  )

  handle(CH.updateSettings, [SettingsPatchSchema], (_e, patch) => {
    const r = cmd((s) => ({ ...s, settings: { ...s.settings, ...patch, sound: patch.sound ?? s.settings.sound } }))
    applyWindowSettings(controller.state.settings)
    return r
  })
  handle(CH.chooseSound, noArgs, async () => {
    const parent = mainWin && !mainWin.isDestroyed() ? mainWin : undefined
    const opts = { title: 'Choose sound', properties: ['openFile' as const], filters: [{ name: 'Sound', extensions: ['mp3', 'wav', 'ogg'] }] }
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return { ok: false, error: 'canceled' }
    try {
      const file = importSound(res.filePaths[0])
      return cmd((s) => ({ ...s, settings: { ...s.settings, sound: { mode: 'custom', file } } }))
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'soundError' }
    }
  })
  handle(CH.testSound, noArgs, () => {
    playSound(mainWin)
    return { ok: true }
  })
  handle(CH.retryLoad, noArgs, () => {
    const r = controller.retry()
    afterLoad()
    return r
  })
  handle(CH.resetData, noArgs, () => {
    const r = controller.reset()
    afterLoad()
    return r
  })

  handle(CH.hideWindow, noArgs, () => {
    mainWin?.hide()
  })
  handle(CH.resizeStart, [z.enum(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])], (e, edge) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || win !== mainWin || controller.state.settings.lockPosition) return
    resizer.start(win, edge, (b) => controller.setBounds(b))
  })
  handle(CH.resizeEnd, noArgs, () => resizer.stop())
  handle(CH.overlaySize, [z.number().min(1).max(20000), z.number().min(1).max(20000)], (e, w, h) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win && (win === notifyWin || win === missedWin)) fitOverlay(win, w, h)
  })

  function afterLoad(): void {
    applyWindowSettings(controller.state.settings)
    controller.tick()
    syncOverlays()
  }

  // ---------- Start ----------
  app.whenReady().then(() => {
    handleSoundScheme()
    controller = new Controller(new Store(app.getPath('userData')))
    controller.load()
    controller.onChange((snap) => {
      for (const w of [mainWin, notifyWin, missedWin]) if (w && !w.isDestroyed()) w.webContents.send(CH.snapshot, snap)
    })

    mainWin = createMainWindow(controller.state.settings)
    backdrop = new Backdrop(mainWin)
    mainWin.once('ready-to-show', () => {
      if (!process.argv.includes('--hidden')) mainWin?.show()
    })
    mainWin.on('close', (e) => {
      if (!quitting) {
        e.preventDefault()
        mainWin?.hide()
      }
    })
    let boundsTimer: NodeJS.Timeout | null = null
    const saveBounds = (): void => {
      if (boundsTimer) clearTimeout(boundsTimer)
      boundsTimer = setTimeout(() => {
        if (mainWin && !mainWin.isDestroyed()) controller.setBounds(mainWin.getBounds())
      }, 400)
    }
    mainWin.on('moved', saveBounds)
    mainWin.on('resized', saveBounds)

    tray = new AppTray({
      show: showMain,
      newEvent: () => {
        showMain()
        mainWin?.webContents.send(CH.navigate, 'new-event')
      },
      toggle: (key, value) => {
        cmd((s) => ({ ...s, settings: { ...s.settings, [key]: value } }))
        applyWindowSettings(controller.state.settings)
      },
      quit: () => {
        quitting = true
        app.quit()
      }
    })

    afterLoad()

    // Scheduler: one tick per second on the system clock.
    setInterval(() => {
      const fired = controller.tick()
      if (fired.length || hasMissed(controller.state) || notifyWin || missedWin) syncOverlays()
    }, 1000)

    // Sleep / wake and clock changes: recompute right away.
    powerMonitor.on('resume', () => {
      controller.tick()
      syncOverlays()
    })
    powerMonitor.on('unlock-screen', () => {
      controller.tick()
      syncOverlays()
    })
  })

  app.on('before-quit', () => {
    quitting = true
    resizer.stop()
    backdrop?.stop()
    controller?.shutdown()
    tray?.destroy()
    for (const w of [notifyWin, missedWin]) if (w && !w.isDestroyed()) w.setClosable(true)
  })

  // Tray app: closing windows never quits.
  app.on('window-all-closed', () => {
    /* keep running in the tray */
  })
}

export const RESOURCES = path.join(__dirname, '../../resources')
