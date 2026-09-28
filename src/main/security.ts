import { app, session, shell, type WebContents } from 'electron'

/** The only origin our windows may show. */
export function isAppUrl(url: string, rendererUrl: string | undefined): boolean {
  if (rendererUrl) return url.startsWith(rendererUrl)
  return url.startsWith('file://')
}

/**
 * @param mayCaptureScreen the only exception to "deny all permissions": the main window's renderer may
 *   open a video-only desktop stream for the custom blur while it is on.
 */
export function hardenApp(rendererUrl: string | undefined, mayCaptureScreen: (wc: WebContents | null) => boolean = () => false): void {
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
    const desktopVideoOnly = (perm: string, details: { mediaTypes?: string[]; requestingUrl?: string }): boolean =>
      perm === 'media' &&
      // Desktop capture comes with no media types; microphone would add 'audio' and is refused.
      (details.mediaTypes ?? []).every((t) => t === 'video') &&
      isAppUrl(details.requestingUrl ?? '', rendererUrl)
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
      return (
      cb(desktopVideoOnly(perm, details as { mediaTypes?: string[]; requestingUrl?: string }) && mayCaptureScreen(wc))
      )
    })
    session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => {
      return perm === 'media' && isAppUrl(origin, rendererUrl) && mayCaptureScreen(wc)
    })
  })
}
