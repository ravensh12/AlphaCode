// Asset compression pipeline (Phase 1, Living Code City).
//
//   node scripts/optimize-assets.mjs [--placeholders] [--in assets-raw] [--out public/assets]
//
// Input (assets-raw/, produced by scripts/fetch-starter-assets.mjs):
//   hdri/*.hdr                 → copied as-is (RGBE is already compact)
//   textures/<set>/<name>.{jpg,png}
//                              → resized to ≤1K and encoded to KTX2:
//                                 *_diff  ETC1S, sRGB   (albedo)
//                                 *_nor   UASTC + RDO + zstd, linear (normals)
//                                 *_arm   ETC1S, linear (AO/roughness/metal)
//   models/*.glb               → glTF Transform: dedup/prune/resample +
//                                meshopt geometry (EXT_meshopt_compression) +
//                                KTX2 textures (KHR_texture_basisu)
//
// Output: public/assets/** plus src/content/assets/assetSizes.generated.json,
// which the typed manifest (assetManifest.ts) imports for exact byte sizes.
// Tests assert the manifest matches the files on disk — re-run this script
// whenever the raw set or encoder settings change.
//
// --placeholders: no network / no raw set needed. Synthesizes deterministic
// procedural stand-ins for every expected asset (flagged in the generated
// JSON so manifest entries read `placeholder: true`) — real CC0 sources can
// drop in later without touching any code.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { encodeToKTX2 } from 'ktx2-encoder'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import { dedup, prune, resample, meshopt, listTextureSlots } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const PLACEHOLDERS = process.argv.includes('--placeholders')
/** Re-inventory public/assets (sizes JSON) without re-encoding anything —
 *  used after out-of-band additions like the citizen VAT bake. */
const SIZES_ONLY = process.argv.includes('--sizes-only')
const RAW = join(ROOT, argValue('--in', 'assets-raw'))
const OUT = join(ROOT, argValue('--out', 'public/assets'))
const SIZES_JSON = join(ROOT, 'src/content/assets/assetSizes.generated.json')

/**
 * CC0-pipeline budget (bytes) — mirrors ASSET_TOTAL_BUDGET_BYTES. This ledger
 * covers ONLY this pipeline's own outputs: public/assets/meshy/ (the Meshy AI
 * library, produced and budgeted by scripts/meshy-optimize.mjs via
 * meshyManifest.ts) is excluded. The GLOBAL shipping gate over everything
 * under public/assets is scripts/check-asset-budget.mjs (80 MB), which CI runs.
 */
const TOTAL_BUDGET = 24 * 1024 * 1024

/** Directory (relative to OUT) whose contents this pipeline does not own. */
const MESHY_DIR = join(OUT, 'meshy')

/** Texture map kinds keyed by filename suffix. */
const MAP_KINDS = [
  { suffix: '_diff', kind: 'color' },
  { suffix: '_nor', kind: 'normal' },
  { suffix: '_arm', kind: 'arm' },
]

const MAX_TEXTURE_SIZE = 1024

/** Expected sets — used by --placeholders to synthesize the full inventory. */
const EXPECTED_TEXTURE_SETS = ['asphalt', 'concrete', 'brick', 'ground']
// city-night-2k.hdr was cut July 2026 — the night dome lights from the CPU
// corruption bake (SimulationSky), so the file was dead shipping weight.
const EXPECTED_HDRIS = ['city-day-2k.hdr']

/* --------------------------------------------------------------- helpers */

const relOut = (abs) => abs.replace(ROOT + '/', '').replace(/^public\//, '')

function ensureDir(p) {
  mkdirSync(dirname(p), { recursive: true })
}

/** sharp buffer → raw RGBA for the basis encoder. */
async function decodeToRGBA(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data: new Uint8Array(data) }
}

const imageDecoder = (buffer) => decodeToRGBA(buffer)

/** Encode settings per texture kind. Perceptual/sRGB only for color maps. */
function ktx2Options(kind) {
  if (kind === 'normal') {
    return {
      isUASTC: true,
      isNormalMap: true,
      needSupercompression: true,
      enableRDO: true,
      rdoQualityLevel: 2.0,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
      generateMipmap: true,
      imageDecoder,
    }
  }
  if (kind === 'arm') {
    return {
      isUASTC: false,
      qualityLevel: 160,
      compressionLevel: 2,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
      generateMipmap: true,
      imageDecoder,
    }
  }
  return {
    isUASTC: false,
    qualityLevel: 185,
    compressionLevel: 2,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
    generateMipmap: true,
    imageDecoder,
  }
}

function kindForFile(name) {
  const stem = basename(name, extname(name))
  for (const { suffix, kind } of MAP_KINDS) if (stem.endsWith(suffix)) return kind
  return 'color'
}

async function encodeImageFileToKTX2(srcPath, destPath, kind) {
  const resized = await sharp(readFileSync(srcPath))
    .resize(MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  const ktx2 = await encodeToKTX2(new Uint8Array(resized), ktx2Options(kind))
  ensureDir(destPath)
  writeFileSync(destPath, ktx2)
  console.log(
    `ktx2 [${kind.padEnd(6)}] ${relOut(destPath)} (${(ktx2.length / 1024).toFixed(0)} KB)`,
  )
}

/* ------------------------------------------------------------- textures */

async function processTextures() {
  const dir = join(RAW, 'textures')
  if (!existsSync(dir)) return
  for (const set of readdirSync(dir)) {
    const setDir = join(dir, set)
    if (!statSync(setDir).isDirectory()) continue
    for (const file of readdirSync(setDir)) {
      if (!/\.(jpe?g|png|webp)$/i.test(file)) continue
      const kind = kindForFile(file)
      const stem = basename(file, extname(file))
      await encodeImageFileToKTX2(
        join(setDir, file),
        join(OUT, 'textures', set, `${stem}.ktx2`),
        kind,
      )
    }
  }
}

/* ---------------------------------------------------------------- HDRIs */

function processHdris() {
  const dir = join(RAW, 'hdri')
  if (!existsSync(dir)) return
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.hdr')) continue
    const dest = join(OUT, 'hdri', file)
    ensureDir(dest)
    copyFileSync(join(dir, file), dest)
    console.log(`hdr  [copy  ] ${relOut(dest)} (${(statSync(dest).size / 1024).toFixed(0)} KB)`)
  }
}

/* --------------------------------------------------------------- models */

/** Convert a glTF Transform document's PNG/JPEG textures to KTX2 in place. */
async function documentTexturesToKTX2(doc) {
  const textures = doc.getRoot().listTextures()
  let converted = 0
  for (const texture of textures) {
    const mime = texture.getMimeType()
    if (mime !== 'image/png' && mime !== 'image/jpeg') continue
    const slots = listTextureSlots(texture)
    const isNormal = slots.some((s) => /normal/i.test(s))
    const isColor = slots.some((s) => /baseColor|emissive|diffuse|sheenColor|specularColor/i.test(s))
    const kind = isNormal ? 'normal' : isColor ? 'color' : 'arm'
    const image = texture.getImage()
    if (!image) continue
    const ktx2 = await encodeToKTX2(new Uint8Array(image), ktx2Options(kind))
    texture.setImage(ktx2).setMimeType('image/ktx2')
    const uri = texture.getURI()
    if (uri) texture.setURI(uri.replace(/\.(png|jpe?g)$/i, '.ktx2'))
    converted++
  }
  if (converted > 0) doc.createExtension(KHRTextureBasisu).setRequired(true)
  return converted
}

async function processModels() {
  const dir = join(RAW, 'models')
  if (!existsSync(dir)) return
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.glb')) continue
    const src = join(dir, file)
    const doc = await io.read(src)
    await doc.transform(dedup(), resample(), prune())
    await documentTexturesToKTX2(doc)
    // Meshopt geometry/animation compression — decoded at runtime by the
    // MeshoptDecoder drei already wires into every GLTFLoader.
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
    const dest = join(OUT, 'models', file)
    ensureDir(dest)
    const bytes = await io.writeBinary(doc)
    writeFileSync(dest, bytes)
    const before = statSync(src).size
    console.log(
      `glb  [meshopt] ${relOut(dest)} (${(before / 1024).toFixed(0)} KB → ${(bytes.length / 1024).toFixed(0)} KB)`,
    )
  }
}

/* --------------------------------------------------------- placeholders */

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic 512² RGBA noise placeholder in the set's rough palette. */
function placeholderRGBA(set, kind, seed) {
  const size = 512
  const rnd = mulberry32(seed)
  const base = {
    asphalt: [52, 54, 58],
    concrete: [128, 124, 118],
    brick: [146, 74, 58],
    ground: [92, 78, 56],
  }[set] ?? [110, 110, 110]
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const n = (rnd() - 0.5) * 34
    if (kind === 'normal') {
      data[i * 4] = 128 + (rnd() - 0.5) * 14
      data[i * 4 + 1] = 128 + (rnd() - 0.5) * 14
      data[i * 4 + 2] = 255
    } else if (kind === 'arm') {
      data[i * 4] = 255 // AO
      data[i * 4 + 1] = 190 + n // roughness
      data[i * 4 + 2] = 0 // metalness
    } else {
      data[i * 4] = base[0] + n
      data[i * 4 + 1] = base[1] + n
      data[i * 4 + 2] = base[2] + n
    }
    data[i * 4 + 3] = 255
  }
  return { data, size }
}

/** Tiny valid Radiance .hdr (uncompressed RGBE scanlines): a sky gradient. */
function placeholderHdr(night) {
  const w = 128
  const h = 64
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`
  const pixels = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // exponent 128 → mantissa/256 range; day = blue sky, night = deep navy
      pixels[i] = night ? 8 : Math.round(90 + 60 * t)
      pixels[i + 1] = night ? 10 : Math.round(130 + 50 * t)
      pixels[i + 2] = night ? 26 : Math.round(200 - 30 * t)
      pixels[i + 3] = 128
    }
  }
  return Buffer.concat([Buffer.from(header, 'ascii'), pixels])
}

async function generatePlaceholders() {
  console.log('Generating deterministic placeholder assets (no network) …')
  let seed = 20260711
  for (const set of EXPECTED_TEXTURE_SETS) {
    for (const { suffix, kind } of MAP_KINDS) {
      const { data, size } = placeholderRGBA(set, kind, seed++)
      const png = await sharp(Buffer.from(data), {
        raw: { width: size, height: size, channels: 4 },
      })
        .png()
        .toBuffer()
      const dest = join(OUT, 'textures', set, `${set}${suffix}.ktx2`)
      const ktx2 = await encodeToKTX2(new Uint8Array(png), ktx2Options(kind))
      ensureDir(dest)
      writeFileSync(dest, ktx2)
      console.log(`ktx2 [placeholder] ${relOut(dest)} (${(ktx2.length / 1024).toFixed(0)} KB)`)
    }
  }
  for (const name of EXPECTED_HDRIS) {
    const dest = join(OUT, 'hdri', name)
    ensureDir(dest)
    writeFileSync(dest, placeholderHdr(name.includes('night')))
    console.log(`hdr  [placeholder] ${relOut(dest)}`)
  }
  // The robot GLB is vendored in-repo, so the real model pipeline still runs.
  const robotSrc = join(ROOT, 'public/models/RobotExpressive.glb')
  if (existsSync(robotSrc)) {
    mkdirSync(join(RAW, 'models'), { recursive: true })
    copyFileSync(robotSrc, join(RAW, 'models', 'robot-sentinel.glb'))
    await processModels()
  }
}

/* -------------------------------------------------------------- manifest */

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  // Meshy AI assets are staged/optimized by their own frozen pipeline and
  // carry their own byte ledger (meshyManifest.ts); the global 80 MB shipping
  // gate over public/assets (Meshy included) is scripts/check-asset-budget.mjs.
  if (dir === MESHY_DIR) return out
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else out.push(p)
  }
  return out
}

function writeSizesJson() {
  const files = walkFiles(OUT).sort()
  const bytes = {}
  let total = 0
  for (const f of files) {
    const size = statSync(f).size
    bytes[relOut(f)] = size
    total += size
  }
  ensureDir(SIZES_JSON)
  writeFileSync(
    SIZES_JSON,
    JSON.stringify({ placeholders: PLACEHOLDERS, totalBytes: total, bytes }, null, 2) + '\n',
  )
  console.log(
    `\nInventory (CC0 pipeline, excludes assets/meshy): ${files.length} files, ` +
      `${(total / 1024 / 1024).toFixed(2)} MB → ${relOut(SIZES_JSON)}`,
  )
  if (total > TOTAL_BUDGET) {
    console.error(
      `BUDGET EXCEEDED: ${(total / 1024 / 1024).toFixed(2)} MB > ${(TOTAL_BUDGET / 1024 / 1024).toFixed(0)} MB (CC0 pipeline ledger; the global public/assets gate is scripts/check-asset-budget.mjs)`,
    )
    process.exitCode = 1
  }
}

async function main() {
  if (SIZES_ONLY) {
    writeSizesJson()
    return
  }
  if (PLACEHOLDERS) {
    await generatePlaceholders()
  } else {
    if (!existsSync(RAW)) {
      console.error(`No ${RAW} — run \`npm run assets:fetch\` first (or use --placeholders).`)
      process.exit(1)
    }
    await processTextures()
    processHdris()
    await processModels()
  }
  writeSizesJson()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
