import { app, session, shell, type WebContents } from 'electron'

/** The only origin our windows may show. */
export function isAppUrl(url: string, rendererUrl: string | undefined): boolean {
  if (rendererUrl) return url.startsWith(rendererUrl)
  return url.startsWith('file://')
}

export function hardenApp(rendererUrl: string | undefined): void {
  app.on('web-contents-created', (_e, contents: WebContents) => {
    contents.on('will-navigate', (ev, url) => {
      if (!isAppUrl(url, rendererUrl)) ev.preventDefault()
    })
    contents.on('will-redirect', (ev, url) => {
      if (!isAppUrl(url, rendererUrl)) ev.preventDefault()
    })
    contents.on('will-attach-webview', (ev) => ev.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      // No new windows. https links (none today) would open in the default browser.
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
  })
}
