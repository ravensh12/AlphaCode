// Pop-in diff: absolute per-pixel difference between burst frames, reported
// as % of pixels changed beyond a small tolerance, plus a heatmap PNG.
// Moving actors (player/zombies/traffic) and window-flicker cause small
// scattered diffs; late-arriving STATIC geometry shows as large solid blobs.
//   node scripts/diff-pop-burst.mjs <a.png> <b.png> <heatmap.png>
import sharp from 'sharp'

const [a, b, out] = process.argv.slice(2)
const load = (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const [ia, ib] = await Promise.all([load(a), load(b)])
if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) {
  console.error('size mismatch')
  process.exit(2)
}
const { width, height } = ia.info
const heat = Buffer.alloc(width * height * 3)
let changed = 0
const TOL = 26 // ignore dithering/noise/grain (the HIGH post adds film grain)
for (let i = 0; i < width * height; i++) {
  const o = i * 4
  const d =
    Math.abs(ia.data[o] - ib.data[o]) +
    Math.abs(ia.data[o + 1] - ib.data[o + 1]) +
    Math.abs(ia.data[o + 2] - ib.data[o + 2])
  if (d > TOL * 3) {
    changed++
    heat[i * 3] = 255
  } else {
    const g = Math.min(255, Math.round(d / 3))
    heat[i * 3] = g
    heat[i * 3 + 1] = g
    heat[i * 3 + 2] = g
  }
}
const pct = (changed / (width * height)) * 100
console.log(`${a} vs ${b}: ${pct.toFixed(2)}% pixels changed (tol ${TOL})`)
if (out) {
  await sharp(heat, { raw: { width, height, channels: 3 } }).png().toFile(out)
  console.log('heatmap:', out)
}
