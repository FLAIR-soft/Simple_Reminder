import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Strict CSP. Dev adds only what Vite HMR needs (inline React refresh preamble + websocket). */
function csp(): Plugin {
  let dev = false
  return {
    name: 'reminder-csp',
    configResolved(c) {
      dev = c.command === 'serve'
    },
    transformIndexHtml(html) {
      const policy = [
        "default-src 'none'",
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:",
        "media-src 'self' reminder-sound:",
        dev ? "connect-src 'self' ws://localhost:*" : "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
        "object-src 'none'"
      ].join('; ')
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}">`)
    }
  }
}

export default defineConfig({
  main: {
    build: { sourcemap: false },
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    build: { sourcemap: false }
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react(), csp()],
    build: { sourcemap: false }
  }
})
