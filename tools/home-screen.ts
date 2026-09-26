// Makes each org build installable on a phone's home screen: a web app manifest, PNG icons
// and the <head> tags iOS and Android look for. Everything is generated from src/orgs.ts —
// the icon is drawn here (a double-yellow-dot squash ball on the org's colour), so there
// are no image files to keep in step with the three builds.
import { deflateSync } from 'node:zlib'
import type { Plugin } from 'vite'
import { ORGS, type OrgConfig, type OrgKey } from '../src/orgs.ts'

/** Page background, as in index.css, for the splash screen while the app starts. */
const BACKGROUND = '#f7f6f3'

export function homeScreen(): Plugin {
  let org: OrgConfig = ORGS.ksf

  const files = (): Record<string, { type: string; body: Buffer | string }> => ({
    'manifest.webmanifest': {
      type: 'application/manifest+json',
      body: JSON.stringify(
        {
          name: org.title,
          short_name: org.shortName,
          description: org.subtitle,
          // Relative to the manifest, so a build served from a sub-folder still works.
          start_url: '.',
          scope: '.',
          display: 'standalone',
          background_color: BACKGROUND,
          theme_color: org.accent,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        null,
        2,
      ),
    },
    'icon-192.png': { type: 'image/png', body: drawIcon(192, org.accent) },
    'icon-512.png': { type: 'image/png', body: drawIcon(512, org.accent) },
    'apple-touch-icon.png': { type: 'image/png', body: drawIcon(180, org.accent) },
  })

  return {
    name: 'home-screen',
    configResolved(config) {
      const key = config.env.VITE_ORG as OrgKey | undefined
      org = (key && ORGS[key]) || ORGS.ksf
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].split('/').pop() ?? ''
        const file = files()[name]
        if (!file) return next()
        res.setHeader('Content-Type', file.type)
        res.end(file.body)
      })
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(files())) {
        this.emitFile({ type: 'asset', fileName, source: file.body })
      }
    },
    transformIndexHtml(html) {
      return {
        html: html.replace(/<title>.*<\/title>/, `<title>${org.title}</title>`),
        tags: [
          { tag: 'link', attrs: { rel: 'manifest', href: 'manifest.webmanifest' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', href: 'apple-touch-icon.png' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'theme-color', content: org.accent }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: org.shortName }, injectTo: 'head' },
        ],
      }
    },
  }
}

// --- Icon ---------------------------------------------------------------------

type RGB = [number, number, number]
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * A squash ball (with the two yellow dots of a competition ball) on a full-bleed square of the
 * org colour. The ball stays inside the central 80% so maskable crops never cut it.
 * Each pixel is supersampled 4×4 for smooth edges.
 */
function drawIcon(size: number, accent: string): Buffer {
  const bg = hex(accent)
  const ball: RGB = [22, 22, 26]
  const dot: RGB = [247, 209, 23]
  const shapes: { cx: number; cy: number; r: number; color: RGB }[] = [
    { cx: 0.5, cy: 0.5, r: 0.3, color: ball },
    { cx: 0.455, cy: 0.27, r: 0.028, color: dot },
    { cx: 0.545, cy: 0.27, r: 0.028, color: dot },
  ]
  const S = 4
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size
          const v = (y + (sy + 0.5) / S) / size
          let c = bg
          for (const s of shapes) if ((u - s.cx) ** 2 + (v - s.cy) ** 2 <= s.r ** 2) c = s.color
          acc[0] += c[0]
          acc[1] += c[1]
          acc[2] += c[2]
        }
      }
      const i = (y * size + x) * 4
      rgba[i] = Math.round(acc[0] / (S * S))
      rgba[i + 1] = Math.round(acc[1] / (S * S))
      rgba[i + 2] = Math.round(acc[2] / (S * S))
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, size, rgba)
}

// Minimal PNG encoder: 8-bit RGBA, no filtering, one IDAT chunk.
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
