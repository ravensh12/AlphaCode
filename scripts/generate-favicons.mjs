/**
 * Rasterizes the brand mark in `public/favicon.svg` into the PNG/ICO fallbacks
 * that browsers and iOS need. Run after editing the SVG:
 *
 *   node scripts/generate-favicons.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const PRIMARY = '#6d4afe'

// iOS composites apple-touch-icons onto an opaque tile and applies its own
// corner mask, so this variant drops the transparency, border and drop shadow
// and scales the `>_` glyph up to fill the safe area.
const appleTouchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
  <rect width="180" height="180" fill="${PRIMARY}" />
  <g
    transform="translate(16.56 17.76) scale(2.4)"
    fill="none"
    stroke="#ffffff"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M11 17.5 L25.5 30 L11 42.5" stroke-width="7.5" />
    <path d="M32 43 L50.5 43" stroke-width="7" />
  </g>
</svg>`

/** Wraps PNG bytes in a single-image ICO container (Vista+ reads PNG payloads). */
function pngToIco(png, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // image count

  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2) // palette
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, png])
}

async function main() {
  await mkdir(publicDir, { recursive: true })
  const source = await readFile(join(publicDir, 'favicon.svg'))

  const png32 = await sharp(source, { density: 512 }).resize(32, 32).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(join(publicDir, 'favicon-32.png'), png32)

  const apple = await sharp(Buffer.from(appleTouchSvg), { density: 512 })
    .resize(180, 180)
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(join(publicDir, 'apple-touch-icon.png'), apple)

  await writeFile(join(publicDir, 'favicon.ico'), pngToIco(png32, 32))

  console.log(
    `favicon-32.png ${png32.length}B · apple-touch-icon.png ${apple.length}B · favicon.ico ${png32.length + 22}B`,
  )
}

await main()
