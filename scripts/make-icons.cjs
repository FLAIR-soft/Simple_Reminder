// Renders resources/roman-mark.svg to PNG sizes and build/icon.ico.
// Run: npx electron scripts/make-icons.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const svg = fs.readFileSync(path.join(root, 'resources', 'roman-mark.svg'), 'utf8')
const sizes = [16, 20, 24, 32, 40, 48, 64, 256]

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const pngs = {}
  // One window, every size laid out left to right at 1:1 device pixels.
  const W = sizes.reduce((a, b) => a + b + 8, 8)
  const win = new BrowserWindow({ width: W, height: 272, show: false, frame: false, transparent: true, useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: 1 } })
  let x = 8
  const pos = {}
  const items = sizes.map((size) => {
    pos[size] = x
    const el = `<div style="position:absolute;left:${x}px;top:8px;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`
    x += size + 8
    return el
  }).join('')
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${items}</body></html>`))
  await new Promise((r) => setTimeout(r, 500))
  const full = await win.webContents.capturePage()
  const scale = full.getSize().width / W
  for (const size of sizes) {
    const crop = full.crop({ x: Math.round(pos[size] * scale), y: Math.round(8 * scale), width: Math.round(size * scale), height: Math.round(size * scale) })
    const png = crop.resize({ width: size, height: size, quality: 'best' }).toPNG()
    pngs[size] = png
    fs.writeFileSync(path.join(root, 'resources', `icon-${size}.png`), png)
  }
  win.destroy()
  fs.copyFileSync(path.join(root, 'resources', 'icon-256.png'), path.join(root, 'resources', 'icon.png'))

  const icoSizes = [16, 24, 32, 48, 64, 256]
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(icoSizes.length, 4)
  const entries = []
  let offset = 6 + 16 * icoSizes.length
  for (const s of icoSizes) {
    const e = Buffer.alloc(16)
    e.writeUInt8(s === 256 ? 0 : s, 0)
    e.writeUInt8(s === 256 ? 0 : s, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(pngs[s].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += pngs[s].length
    entries.push(e)
  }
  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([header, ...entries, ...icoSizes.map((s) => pngs[s])]))
  fs.copyFileSync(path.join(root, 'build', 'icon.ico'), path.join(root, 'resources', 'icon.ico'))
  console.log('icons written')
  app.quit()
})
