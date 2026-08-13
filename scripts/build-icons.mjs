/**
 * Draw the app icon, at every size the home screen wants.
 *
 *   node scripts/build-icons.mjs
 *
 * Written as shape maths and a minimal PNG encoder rather than exported from a
 * drawing tool, so the icon is source that can be edited and re-rendered rather
 * than a binary nobody can change. Node has zlib, and a flat-colour image needs
 * nothing else.
 *
 * The design is the game's own: a mown pitch, a gold crest, one star. It is
 * meant to be replaced the moment there is real artwork — but a placeholder
 * that looks like the thing it opens is worth more than a grey square.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const PITCH_DARK = [20, 83, 45]
const PITCH_STRIPE = [22, 101, 52]
const GOLD = [251, 191, 36]

/** Even-odd ray casting, so a star drawn as ten points fills correctly. */
function inPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function starPoints(cx, cy, r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const radius = i % 2 === 0 ? r : r * 0.42
    pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
  }
  return pts
}

function pixels(size) {
  const S = size
  const cx = S / 2
  const shieldTop = S * 0.17
  const shieldHalfWidth = S * 0.31
  const shoulder = S * 0.55
  const tip = S * 0.86
  const bandTop = S * 0.4
  const bandBottom = S * 0.57
  const star = starPoints(cx, S * 0.485, S * 0.085)

  // The shield: a rectangle down to the shoulder, then half an ellipse to the tip.
  const inShield = (x, y) => {
    if (y < shieldTop || y > tip) return false
    if (Math.abs(x - cx) > shieldHalfWidth) return false
    if (y <= shoulder) return true
    const ry = tip - shoulder
    const dx = (x - cx) / shieldHalfWidth
    const dy = (y - shoulder) / ry
    return dx * dx + dy * dy <= 1
  }

  const rgba = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Mown stripes, the same motif the pitch uses in a match.
      let colour = Math.floor(x / (S / 8)) % 2 === 0 ? PITCH_DARK : PITCH_STRIPE
      if (inShield(x, y)) {
        colour = GOLD
        if (y >= bandTop && y <= bandBottom) colour = PITCH_DARK
        if (inPolygon(x, y, star)) colour = GOLD
      }
      const at = (y * S + x) * 4
      rgba[at] = colour[0]
      rgba[at + 1] = colour[1]
      rgba[at + 2] = colour[2]
      rgba[at + 3] = 255
    }
  }
  return rgba
}

// --- a minimal PNG encoder ------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // Each scanline is prefixed with a filter byte; 0 means "none", which costs a
  // little size and keeps this readable.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [512, 192, 180]) {
  const file = `public/icon-${size}.png`
  writeFileSync(file, png(size, pixels(size)))
  console.log(`wrote ${file}`)
}
