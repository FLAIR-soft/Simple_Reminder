# Security audits — Reminder

## Security audit — 2026-09-28 — quick — main @ b796add + uncommitted UI (stage 7)
Result: 13 ok · 1 fixed · 1 needs Roman · risk: low

Profile: personal offline desktop app (Electron), no accounts, no server, no network access, data only in `%APPDATA%\Reminder\reminder-data.json`. Blocks 1, 2, 4 and 6 run; block 5 checked as a bonus.

| Block | Check | Status | Risk | Note |
|---|---|---|---|---|
| 4 Config | DevTools in the installed app | fixed | low | `devTools: !app.isPackaged` in `src/main/windows.ts` |
| 4 Config | Code signing | needs Roman | low | Installer is not signed → SmartScreen warning on first start. A certificate costs money; fine for personal use |
| 1 Secrets | Git history scan | ok | — | gitleaks not installed; fallback `git log -p --all \| grep` for keys/tokens/passwords: only design «tokens» matches, no secrets. The app uses no keys at all |
| 1 Secrets | `.env*` in `.gitignore`, never committed | ok | — | `.env`, `.env.*` ignored; `git log --all -- .env .env.local` empty |
| 2 Access | Renderer isolation | ok | — | `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`, no `allowRunningInsecureContent`; e2e checks `require` is undefined |
| 2 Access | IPC: who may call | ok | — | Every handler checks the sender is one of our windows and the frame URL is the app; typed preload exposes only `window.reminder` |
| 2 Access | IPC: input validation | ok | — | Every argument parsed with zod (`EventInputSchema`, `IdSchema`, `SettingsPatchSchema`, ranges); extra arguments rejected; e2e sends bad input and gets `ok: false` |
| 4 Config | Content Security Policy | ok | — | `default-src 'none'`, `script-src 'self'` (no `unsafe-inline` in production), `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`; assets no longer inlined as `data:`; `frame-ancestors` removed (ignored in a `<meta>` CSP and logged an error; framing is impossible anyway — navigation and webviews are blocked) |
| 4 Config | Navigation, new windows, webviews, permissions | ok | — | `will-navigate`/`will-redirect` blocked outside the app, `window.open` denied, `<webview>` blocked, all permission requests denied |
| 4 Config | Electron fuses | ok | — | `runAsNode` off, `NODE_OPTIONS` and `--inspect` off, only load app from asar, asar integrity validation on, cookie encryption on |
| 4 Config | Source maps, debug output | ok | — | `sourcemap: false` for main, preload, renderer; no `.map` in `out/`; logs only «save failed / restored from backup» |
| 3 Input (bonus) | XSS | ok | — | No `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML`; user text rendered by React as text |
| 3 Input (bonus) | Sound file import | ok | — | Only `.mp3/.wav/.ogg`, ≤ 10 MB, copied into `userData/sounds`; custom `reminder-sound://` protocol serves only safe file names from that folder |
| 5 Deps (bonus) | `npm audit --omit=dev` | ok | — | 0 vulnerabilities |
| 2 Access | Screen capture for the custom blur (added 2026-09-28) | ok | low | Only exception to «deny all permissions»: `media` with no audio, from the app URL, from the main window, and only while blur is on. The video stream stays in the renderer, is never recorded, stored or sent. Window uses content protection while blur is on. Can be turned off in Settings |
| 6 Data and logs | Personal data in logs / backups | ok | — | No personal data collected; no telemetry; atomic writes + `.bak`; a broken file is kept as `.broken-<date>`, never deleted |

Not applicable: rate limits, CORS, HTTP headers, Supabase/RLS, exposed web files — there is no server and no network use.
