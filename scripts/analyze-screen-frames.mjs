/* Pixel stability over a series of screen captures of one region (issue #173).
 *
 * Reads the 32 bpp BMP frames capture-screen-region.ps1 writes and prints, for
 * every pixel row, how many frames each column strays from its most common
 * colour: '.' never, 1-9 that many frames, '#' ten or more. Pixels that change
 * on every tick (digits, a spinning loader) read '#'; a leftover speck reads as
 * a rare deviation where the row is otherwise '.', and those are listed with
 * the frames they appear in.
 *
 *   node scripts/analyze-screen-frames.mjs <frames dir> [threshold=24] [rare=5]
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const threshold = Number(process.argv[3] ?? 24)
const rareMax = Number(process.argv[4] ?? 5)

if (!dir) {
  console.error('usage: node scripts/analyze-screen-frames.mjs <frames dir> [threshold] [rare]')
  process.exit(2)
}

/** Pixels of a 32 or 24 bpp BMP as [r, g, b], addressed from the top-left. */
function readBmp(path) {
  const b = readFileSync(path)
  const offset = b.readUInt32LE(10)
  const width = b.readInt32LE(18)
  const signed = b.readInt32LE(22)
  const height = Math.abs(signed)
  const bpp = b.readUInt16LE(28) / 8
  const stride = Math.ceil((width * bpp) / 4) * 4
  const px = (x, y) => {
    const row = signed > 0 ? height - 1 - y : y
    const i = offset + row * stride + x * bpp
    return [b[i + 2], b[i + 1], b[i]]
  }
  return { width, height, px }
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.bmp'))
  .sort()
const frames = files.map((f) => readBmp(join(dir, f)))
const { width, height } = frames[0]
const far = (p, q) => Math.max(...p.map((v, c) => Math.abs(v - q[c]))) > threshold

const strays = []
const rare = []
for (let y = 0; y < height; y++) {
  const line = []
  for (let x = 0; x < width; x++) {
    const counts = new Map()
    for (const fr of frames) {
      const k = fr.px(x, y).join(',')
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const mode = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])[0][0]
      .split(',')
      .map(Number)
    const hits = []
    frames.forEach((fr, i) => {
      if (far(fr.px(x, y), mode)) hits.push(i)
    })
    line.push(hits.length)
    if (hits.length > 0 && hits.length <= rareMax) {
      rare.push({ x, y, mode, frames: hits.map((i) => files[i]) })
    }
  }
  strays.push(line)
}

console.log(`${frames.length} frames, ${width}x${height}, threshold ${threshold}`)
for (let y = 0; y < height; y++) {
  const s = strays[y].map((n) => (n === 0 ? '.' : n < 10 ? String(n) : '#')).join('')
  console.log(String(y).padStart(3), s)
}
console.log(`\nrare deviations (1..${rareMax} frames): ${rare.length}`)
for (const r of rare) console.log(JSON.stringify(r))
