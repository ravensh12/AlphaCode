// Fetch the pinned CC0 starter asset set into assets-raw/ (Phase 1, Living
// Code City). Idempotent: existing files are skipped. Raw sources are NOT
// shipped — run `npm run assets:optimize` afterwards to produce the
// compressed runtime set in public/assets/.
//
//   node scripts/fetch-starter-assets.mjs [--force]
//
// Sources (all CC0 1.0, see THIRD_PARTY_CONTENT.md):
//   - PolyHaven HDRIs (2K .hdr): one day sky + one night sky
//   - PolyHaven PBR texture sets (1K .jpg: diffuse / normal GL / ARM)
//   - Quaternius "Robot Expressive" GLB staged from the in-repo copy
//
// If the network is unavailable, run the optimizer with --placeholders to
// synthesize stand-in textures instead (manifest entries flip to
// placeholder: true via assetSizes.generated.json).
import { createWriteStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'assets-raw')
const FORCE = process.argv.includes('--force')

const API = 'https://api.polyhaven.com'

/** Pinned PolyHaven HDRIs: id → local name. 2K keeps it under ~7 MB.
 *  (moonless_golf night HDRI cut July 2026 — the CPU bake lights the night.) */
const HDRIS = [{ asset: 'kloofendal_48d_partly_cloudy_puresky', out: 'city-day-2k.hdr' }]

/**
 * Pinned PolyHaven texture sets at 1K. `maps` lists the PolyHaven map keys we
 * pull; the optimizer keys its encode settings off the local filename suffix
 * (_diff → sRGB color, _nor → normal map, _arm → linear AO/rough/metal).
 */
const TEXTURE_SETS = [
  { asset: 'asphalt_02', out: 'asphalt' },
  { asset: 'concrete_wall_004', out: 'concrete' },
  { asset: 'red_brick_03', out: 'brick' },
  { asset: 'park_dirt', out: 'ground' },
]
const TEXTURE_MAPS = [
  { key: 'Diffuse', suffix: 'diff' },
  { key: 'nor_gl', suffix: 'nor' },
  { key: 'arm', suffix: 'arm' },
]

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

async function download(url, dest) {
  if (!FORCE && existsSync(dest) && statSync(dest).size > 0) {
    console.log(`skip (exists)  ${dest.replace(ROOT + '/', '')}`)
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  const kb = (statSync(dest).size / 1024).toFixed(0)
  console.log(`downloaded     ${dest.replace(ROOT + '/', '')} (${kb} KB)`)
}

async function main() {
  console.log('Fetching CC0 starter assets into assets-raw/ …')

  for (const { asset, out } of HDRIS) {
    const files = await fetchJson(`${API}/files/${asset}`)
    const file = files.hdri?.['2k']?.hdr
    if (!file?.url) throw new Error(`No 2k hdr for ${asset}`)
    await download(file.url, join(RAW, 'hdri', out))
  }

  for (const { asset, out } of TEXTURE_SETS) {
    const files = await fetchJson(`${API}/files/${asset}`)
    for (const map of TEXTURE_MAPS) {
      const file = files[map.key]?.['1k']?.jpg ?? files[map.key]?.['1k']?.png
      if (!file?.url) throw new Error(`No 1k ${map.key} for ${asset}`)
      const ext = file.url.endsWith('.png') ? 'png' : 'jpg'
      await download(file.url, join(RAW, 'textures', out, `${out}_${map.suffix}.${ext}`))
    }
  }

  // Quaternius CC0 robot — already vendored in public/models; stage a copy so
  // the optimizer demonstrates the full GLB path (meshopt + KTX2).
  const robotSrc = join(ROOT, 'public', 'models', 'RobotExpressive.glb')
  const robotDest = join(RAW, 'models', 'robot-sentinel.glb')
  if (existsSync(robotSrc) && (FORCE || !existsSync(robotDest))) {
    mkdirSync(dirname(robotDest), { recursive: true })
    copyFileSync(robotSrc, robotDest)
    console.log(`staged         ${robotDest.replace(ROOT + '/', '')}`)
  }

  console.log('Done. Now run: npm run assets:optimize')
}

main().catch((err) => {
  console.error(String(err))
  console.error('Network unavailable? Generate placeholders instead:')
  console.error('  node scripts/optimize-assets.mjs --placeholders')
  process.exit(1)
})
