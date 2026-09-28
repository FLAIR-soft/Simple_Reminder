# Launch checklist — Reminder
Profile: production · desktop tool (Windows, Electron) · personal · private · no personal data · no accounts · EN (en-GB, 24 h) · desktop only
Updated: 2026-09-28

| Module | Item | Status | Note |
|---|---|---|---|
| A Base | Design system: Ivory / Clay / Graphite, tokens, Manrope / Inter / JetBrains Mono, Tabler icons | done | Checked against `claude-plus-files/mockups/index.html`, screenshots in `test-results/shots` |
| A Base | Screen states: empty, normal, data error with Retry, pending, missed, snoozed, paused, archive | done | |
| A Base | Statuses with icon + word | done | Waiting for Done, Missed, Snoozed, Paused, Done n of n, Archived by you |
| A Base | Keyboard N / E / Esc / Ctrl+S, visible focus, reduced motion | done | Shortcuts never fire while typing |
| A Base | Hold-to-delete 1.2 s, no confirm dialogs | done | Events and categories |
| A Base | Custom scrollbars in all themes | done | `src/renderer/src/scrollbar.css` (added on request) |
| A Base | Blurred see-through window as in the mockup | done | Custom 14 px blur (`src/main/backdrop.ts`): one live video stream (≤ 12 fps, half resolution) of the display under the window, drawn blurred under the opacity layer; ≈1.5 % CPU. Switch «Blur the background» in Settings; while on, the window is hidden from screenshots and screen sharing. Dropped: Windows Acrylic / blur-behind (fixed heavy blur, square corners, flicker) and repeated screenshots (system-wide micro-freeze on every capture) |
| A Base | Manual pass: tray menu, click-through, always on top, edge resize, multi-monitor, sleep/resume | needs Roman | Not automatable here; 5 minutes after installing |
| B Prototype extras | — | n/a | production mode |
| C Legal (public website) | — | n/a | not a website, not public |
| D Cookies and tracking | — | n/a | no cookies, no tracking, no network |
| E Forms and personal data | — | n/a | forms only store reminders locally; nothing is sent anywhere |
| F Sales | — | n/a | no sales |
| G Accounts | — | n/a | no login |
| H Data and hosting | — | n/a | no personal data, no hosting; data stays in `%APPDATA%\Reminder` |
| I Security | Quick audit | done | `docs/security-audit.md` — risk low, 1 fixed |
| I Security | Code signing of the installer | needs Roman | Unsigned → SmartScreen warning; certificate is a paid decision |
| I Security | Full audit before the first production release | needs Roman | Plan asked for the quick audit; say if the full one is wanted |
| J Speed and SEO | — | n/a | not a website |
| K Monitoring | Error logging and alerts | n/a | offline personal tool without telemetry by design; errors are shown in the UI (banner, toast) |
| L Licenses | Fonts (SIL OFL), Tabler Icons (MIT), Electron / React / i18next / zod (MIT) | done | all allow the use |
| M Environments and rollback | Test data separate from real data | done | tests use a temp `REMINDER_USER_DATA`; rollback = install the previous `Reminder Setup x.y.z.exe`, data file is kept |
| N Languages | Translation structure | done | i18next, `src/renderer/src/locales/en.json`, en-GB formats |
| O Testing | Unit tests (scheduler, store) | done | 42 green, `TZ=Europe/Berlin` |
| O Testing | Playwright `_electron` smoke and stress tests | done | 6 green, `docs/stress-test.md` |
| O Testing | Installer: install → start → uninstall | needs Roman | `release/Reminder Setup 1.0.0.exe` built; packaged app starts and creates its data file |
| P Onboarding | Empty screens explain the next step | done | «No events yet — Create a reminder…», form hints, click-through hint |
| Q Feedback | — | n/a | personal tool, the only user is Roman |

Release gate: no legal blockers (C, D, F n/a) · security audit: no high items · stress test: no open high items, all automated tests green.
