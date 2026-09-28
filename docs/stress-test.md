# Stress tests — Reminder

## Stress test — 2026-09-28 — main @ b796add + uncommitted UI (stage 7) — local build, Windows 11 Pro 26200
Mode: quick check (section 1a) + automated tests (section 5).
Result: 14 ok · 2 fixed · 3 needs Roman · severity: medium (fixed)

| Area | What happened | Steps to reproduce | Severity | Status | Test |
|---|---|---|---|---|---|
| F Fragile code | Small font subsets (Cyrillic, Greek, Vietnamese…) were inlined as `data:` URLs by Vite and blocked by the CSP (`font-src 'self'`); text in those scripts fell back to Segoe UI, 20+ console errors | Build → open main window → type «Привет Γειά» → console | medium | fixed (`assetsInlineLimit: 0`, CSP unchanged) | `stress: odd input … no console errors` |
| F Fragile code | CSP `frame-ancestors` in a `<meta>` tag is ignored and logged a console error on every start; the stress test missed it because it listened only after load | Start app → console | low | fixed (directive removed, test now listens from the first line) | `stress: …` |
| A Performance | Custom blur via repeated screenshots froze the whole system for a moment on every capture (reported by Roman) | Blur on → watch any animation | medium | fixed (one live low-fps stream instead) | `custom blur: …` |
| I Config | DevTools were available in the installed app | Packaged app → Ctrl+Shift+I | low | fixed (`devTools: !app.isPackaged`) | — (checked in security audit) |
| A Users | Double and triple Ctrl+S on the form | Form → Ctrl+S ×3 fast | — | ok, exactly one event | `stress: …` |
| A Users | Unusual input: umlauts, emoji, Cyrillic, Greek, Turkish İ ı, 200-char title, HTML in description, `-5`, `99999`, only spaces | New event form | — | ok: numbers clamped to digits/3 chars, spaces-only title refused, HTML shown as text, layout holds | `stress: …` |
| A Users | Interval longer than active hours | 45 min timer, hours 08:00–08:30 | — | ok, clear message, not saved | `main window: …` |
| A Users | Single-key shortcuts while typing | Type «n» in Title | — | ok, no shortcut fired | `stress: …` |
| A Users | Delete without a hold | Click Delete once | — | ok, nothing deleted; 1.2 s hold deletes | `main window: …` |
| B Data file | Broken data file on start | Write `{ broken` into `reminder-data.json` → start | — | ok: banner with Retry, file untouched, saving blocked | `broken data file: …` |
| B IPC | Invalid input from the renderer (snooze 99999, 5000-char event without fields) | `window.reminder.*` from the page | — | ok, rejected by zod in main | `stress: …` |
| C Data | Empty state, one event, queue of two, archive | Seeded states | — | ok | `main window`, `notification`, `visual` |
| E Time | DST Europe/Berlin, manual clock change, Friday → Monday, sleep gap, overnight windows | Unit tests with `TZ=Europe/Berlin` | — | ok | `tests/unit/scheduler.test.ts` (37) |
| E Time | Missed while the PC was off: each event once, Done counts as usual | lastSeenAt 3 h ago | — | ok | `missed summary …` |
| G Accessibility | Keyboard: N, E, Esc, Ctrl+S, Tab through form; visible focus ring | Keyboard only | — | ok | `main window`, `stress` |
| G Accessibility | Reduced motion | `prefers-reduced-motion: reduce` | — | ok: tokens shorten all motion, notification border becomes solid accent | `stress` (media query) + CSS rule |
| A Themes | Ivory, Clay, Graphite: main list, all card states, settings, notification | Screenshots in `test-results/shots` | — | ok, matches the mockup | `visual: …` |
| A Layout | Long notification text: card grows to 80 % width, description scrolls; short text → compact card | Seeded long/short events | — | ok | `notification: …` |
| Packaged app | `release/win-unpacked/Reminder.exe` starts and creates its data file | Start with temp `REMINDER_USER_DATA` | — | ok | manual |
| Not automated | Tray menu, click-through, always-on-top against other apps, edge resize, multi-monitor, real sleep/resume | — | medium | needs Roman: 5-minute manual pass after install | — |
| Not automated | Installer run (install → start → uninstall) | `release/Reminder Setup 1.0.0.exe` | medium | needs Roman | — |
| Not automated | axe accessibility scan (`@axe-core/playwright` not installed) | — | low | needs Roman: approve adding the dev dependency | — |

Not applicable for this app: phone, Safari, slow network/offline (the app has no network), light load (single user, local), Lighthouse (not a website).

Commands: `npm test` (unit), `npm run test:e2e` (build + Playwright `_electron`).
