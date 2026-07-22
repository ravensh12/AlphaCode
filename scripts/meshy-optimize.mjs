// Meshy asset optimizer — Living Code City.
//
//   node scripts/meshy-optimize.mjs [--only=id,id] [--jobs=N] [--no-manifest]
//
// Input:  assets-src/meshy/raw/<id>.glb            (from meshy-generate.mjs)
//         assets-src/meshy/raw/<id>.walk|idle.glb  (Tier-3 character clips)
// Output: public/assets/meshy/<category>/<file>.glb
//         src/content/assets/meshyManifest.ts      (generated, typed)
//
// Per file: dedup → prune → weld → simplify (≤15k tris props / ≤40k hero,
// skinned meshes skipped) → PNG/JPEG → KTX2 (1024px props / 2048px hero
// color; normal/ARM capped at 1024) → meshopt compression. If a file lands
// over its byte budget (props 2.5 MB, hero 6 MB) it is re-encoded from the
// raw source at halved texture resolution until it fits (floor 256px).
//
// --jobs=N shards the file work across N child processes (KTX2 encoding is
// CPU-bound); the parent then rescans the output dir and writes the manifest.
// Normal maps use UASTC *without* RDO — RDO costs minutes per texture for a
// few % size win, which the per-file budget retry loop absorbs anyway.
//
// Deliberately standalone from scripts/optimize-assets.mjs (owned by the
// starter-asset pipeline) — this one only touches the Meshy library.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { encodeToKTX2 } from 'ktx2-encoder'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import {
  dedup, prune, weld, simplify, resample, meshopt, listTextureSlots,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer'
import { MESHY_CATALOG, BYTE_BUDGET, TRIANGLE_BUDGET, TEXTURE_BUDGET, LIBRARY_BUDGET } from './meshy-catalog.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW_DIR = join(ROOT, 'assets-src/meshy/raw')
const OUT_DIR = join(ROOT, 'public/assets/meshy')
const MANIFEST_PATH = join(ROOT, 'src/content/assets/meshyManifest.ts')

function flagValue(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=').slice(1).join('=') : fallback
}
const ONLY = flagValue('only', null)?.split(',').map((s) => s.trim()).filter(Boolean)
const JOBS = Math.max(1, Math.min(Number(flagValue('jobs', 1)) || 1, cpus().length))
const NO_MANIFEST = process.argv.includes('--no-manifest')

/* -------------------------------------------------------------- helpers */

const relOut = (abs) => abs.replace(ROOT + '/', '').replace(/^public\//, '')
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

async function makeIO() {
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  await MeshoptSimplifier.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
}

/** Rendered triangle count across all mesh primitives. */
function countTriangles(doc) {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue // TRIANGLES
      const indices = prim.getIndices()
      const position = prim.getAttribute('POSITION')
      tris += Math.floor((indices ? indices.getCount() : position?.getCount() ?? 0) / 3)
    }
  }
  return tris
}

const decodeToRGBA = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data: new Uint8Array(data) }
}
const imageDecoder = (buffer) => decodeToRGBA(buffer)

/** KTX2 options per texture kind — mirrors the repo's starter pipeline. */
function ktx2Options(kind) {
  if (kind === 'normal') {
    // No RDO: it costs minutes/texture at these sizes for a few % size win.
    return {
      isUASTC: true, isNormalMap: true, needSupercompression: true,
      isPerceptual: false, isSetKTX2SRGBTransferFunc: false,
      generateMipmap: true, imageDecoder,
    }
  }
  if (kind === 'arm') {
    return {
      isUASTC: false, qualityLevel: 160, compressionLevel: 1,
      isPerceptual: false, isSetKTX2SRGBTransferFunc: false,
      generateMipmap: true, imageDecoder,
    }
  }
  return {
    isUASTC: false, qualityLevel: 185, compressionLevel: 1,
    isPerceptual: true, isSetKTX2SRGBTransferFunc: true,
    generateMipmap: true, imageDecoder,
  }
}

/**
 * Resize + KTX2-encode every PNG/JPEG texture in the document.
 * Base color gets the full edge budget; normal/ARM/emission carry less
 * perceptual weight per pixel and take `dataMax` (512 props / 1024 hero) —
 * the normal map is UASTC and would otherwise dominate file size.
 */
async function texturesToKTX2(doc, colorMax, dataMax) {
  let converted = 0
  for (const texture of doc.getRoot().listTextures()) {
    const mime = texture.getMimeType()
    if (mime !== 'image/png' && mime !== 'image/jpeg') continue
    const image = texture.getImage()
    if (!image) continue
    const slots = listTextureSlots(texture)
    const isNormal = slots.some((s) => /normal/i.test(s))
    const isBaseColor = slots.some((s) => /baseColor|diffuse|sheenColor|specularColor/i.test(s))
    const isEmissive = slots.some((s) => /emissive/i.test(s))
    const kind = isNormal ? 'normal' : isBaseColor || isEmissive ? 'color' : 'arm'
    const max = isBaseColor ? colorMax : dataMax
    const started = Date.now()
    const resized = await sharp(Buffer.from(image))
      .resize(max, max, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    const ktx2 = await encodeToKTX2(new Uint8Array(resized), ktx2Options(kind))
    console.log(
      `     ktx2 ${(isEmissive && !isBaseColor ? 'emiss' : kind).padEnd(6)} ` +
      `${(image.byteLength / 1024).toFixed(0)} KB → ${(ktx2.length / 1024).toFixed(0)} KB ` +
      `(≤${max}px, ${((Date.now() - started) / 1000).toFixed(0)}s)`,
    )
    texture.setImage(ktx2).setMimeType('image/ktx2')
    const uri = texture.getURI()
    if (uri) texture.setURI(uri.replace(/\.(png|jpe?g)$/i, '.ktx2'))
    converted++
  }
  if (converted > 0) doc.createExtension(KHRTextureBasisu).setRequired(true)
  return converted
}

/* ------------------------------------------------------------- pipeline */

/**
 * One optimization attempt at a given color-texture edge. Returns
 * { bytes, triangles, skinned, animations } and writes the output file.
 */
async function optimizeOnce(io, srcPath, destPath, entry, colorMax) {
  const doc = await io.read(srcPath)
  const skinned = doc.getRoot().listSkins().length > 0
  const animations = doc.getRoot().listAnimations().length

  await doc.transform(dedup(), prune())
  if (animations > 0) await doc.transform(resample())

  if (!skinned) {
    const before = countTriangles(doc)
    const target = TRIANGLE_BUDGET[entry.sizeClass]
    if (before > target) {
      await doc.transform(
        weld(),
        simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error: 0.001 }),
      )
    }
  }
  const triangles = countTriangles(doc)

  const dataMax = Math.min(Math.floor(colorMax / 2), 1024)
  await texturesToKTX2(doc, colorMax, dataMax)
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

  const bytes = await io.writeBinary(doc)
  mkdirSync(dirname(destPath), { recursive: true })
  writeFileSync(destPath, bytes)
  return { bytes: bytes.length, triangles, skinned, animations }
}

/** Optimize with byte-budget enforcement (halve textures until it fits). */
async function optimizeFile(io, srcPath, destPath, entry) {
  const budget = BYTE_BUDGET[entry.sizeClass]
  let colorMax = TEXTURE_BUDGET[entry.sizeClass]
  for (;;) {
    const result = await optimizeOnce(io, srcPath, destPath, entry, colorMax)
    const srcBytes = statSync(srcPath).size
    console.log(
      `glb  [${entry.sizeClass.padEnd(4)}] ${relOut(destPath)} ` +
      `${mb(srcBytes)} → ${mb(result.bytes)} | ${result.triangles} tris @ ${colorMax}px` +
      `${result.skinned ? ` | skinned, ${result.animations} clip(s)` : ''}`,
    )
    if (result.bytes <= budget) return result
    if (colorMax <= 256) {
      throw new Error(`${relOut(destPath)} is ${mb(result.bytes)} — over ${mb(budget)} even at 256px textures`)
    }
    colorMax = Math.floor(colorMax / 2)
    console.log(`     over ${mb(budget)} budget — retrying at ${colorMax}px`)
  }
}

/* ------------------------------------------------------------- manifest */

function generateManifest(outputs) {
  const CATEGORIES = [...new Set(MESHY_CATALOG.map((e) => e.category))]
  const rows = outputs
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((o) =>
      `  {\n` +
      `    id: ${JSON.stringify(o.id)},\n` +
      `    url: ${JSON.stringify(o.url)},\n` +
      `    category: ${JSON.stringify(o.category)},\n` +
      `    approxTriangles: ${o.triangles},\n` +
      `    bytes: ${o.bytes},\n` +
      `    license: MESHY_LICENSE,\n` +
      `    placementHint: ${JSON.stringify(o.placementHint)},\n` +
      `  },`,
    )
    .join('\n')

  const ts = `/* eslint-disable */
// GENERATED FILE — written by \`npm run meshy:optimize\` (scripts/meshy-optimize.mjs).
// Do not edit by hand; re-run the optimizer after regenerating Meshy assets.
//
// Staging manifest for Meshy-AI-generated assets under public/assets/meshy/.
// Deliberately separate from assetManifest.ts (CC0 starter pipeline) — scene
// integration decides later which of these ship in district bundles.

/** Provenance/license block attached to every Meshy-generated asset. */
export interface MeshyAssetLicense {
  source: 'meshy-ai-generated'
  holder: string
  url: string
}

export type MeshyAssetCategory = ${CATEGORIES.map((c) => JSON.stringify(c)).join(' | ')}

export interface MeshyAssetEntry {
  /** Stable id — catalog id, with a clip suffix for character animations. */
  id: string
  /** Site-root-relative URL (prefix with import.meta.env.BASE_URL). */
  url: string
  category: MeshyAssetCategory
  /** Rendered triangles after optimization (approximate). */
  approxTriangles: number
  /** Exact size on disk of the shipped (optimized) file. */
  bytes: number
  license: MeshyAssetLicense
  /** Where scenes are expected to place this asset. */
  placementHint: string
}

export const MESHY_LICENSE: MeshyAssetLicense = {
  source: 'meshy-ai-generated',
  holder: 'project-owned (Meshy paid-plan generated asset)',
  url: 'https://www.meshy.ai',
}

export const MESHY_ASSETS: MeshyAssetEntry[] = [
${rows}
]

export const MESHY_MANIFEST: Record<string, MeshyAssetEntry> = Object.fromEntries(
  MESHY_ASSETS.map((entry) => [entry.id, entry]),
)

export function meshyAsset(id: string): MeshyAssetEntry | undefined {
  return MESHY_MANIFEST[id]
}

export function meshyAssetsByCategory(category: MeshyAssetCategory): MeshyAssetEntry[] {
  return MESHY_ASSETS.filter((entry) => entry.category === category)
}

/** Total bytes of the optimized Meshy library (budget-checked in CI). */
export const MESHY_TOTAL_BYTES = MESHY_ASSETS.reduce((sum, entry) => sum + entry.bytes, 0)
`
  writeFileSync(MANIFEST_PATH, ts)
  console.log(`\nManifest: ${outputs.length} entries → ${MANIFEST_PATH.replace(ROOT + '/', '')}`)
}

/* ------------------------------------------------------------- variants */

/**
 * Files a catalog entry ships. Characters ship their animated clips when
 * rigging succeeded; the static refine output is the mannequin fallback.
 */
function variantsFor(entry, rawFiles) {
  const variants = []
  if (entry.rig && rawFiles.has(`${entry.id}.walk.glb`)) {
    variants.push({ suffix: '-walk', file: `${entry.id}.walk.glb`, hint: `${entry.placementHint} Walk clip.` })
    if (rawFiles.has(`${entry.id}.idle.glb`)) {
      variants.push({ suffix: '-idle', file: `${entry.id}.idle.glb`, hint: `${entry.placementHint} Idle clip.` })
    }
  } else if (rawFiles.has(`${entry.id}.glb`)) {
    variants.push({ suffix: '', file: `${entry.id}.glb`, hint: entry.placementHint })
  }
  return variants
}

/** Rescan every shipped output on disk → manifest rows (fresh tri counts). */
async function scanOutputs(io) {
  const outputs = []
  for (const entry of MESHY_CATALOG) {
    const hints = { '': entry.placementHint, '-walk': `${entry.placementHint} Walk clip.`, '-idle': `${entry.placementHint} Idle clip.` }
    for (const suffix of ['', '-walk', '-idle']) {
      const destPath = join(OUT_DIR, entry.category, `${entry.id}${suffix}.glb`)
      if (!existsSync(destPath)) continue
      const doc = await io.read(destPath)
      outputs.push({
        id: `${entry.id}${suffix}`,
        url: relOut(destPath),
        category: entry.category,
        triangles: countTriangles(doc),
        bytes: statSync(destPath).size,
        placementHint: hints[suffix],
      })
    }
  }
  return outputs
}

/* ----------------------------------------------------------------- main */

/** Shard the selected ids across N child processes (KTX2 is CPU-bound). */
async function runSharded(ids) {
  const shards = Array.from({ length: JOBS }, () => [])
  ids.forEach((id, i) => shards[i % JOBS].push(id))
  const script = fileURLToPath(import.meta.url)
  const children = shards
    .filter((shard) => shard.length > 0)
    .map((shard) =>
      new Promise((resolve) => {
        const child = spawn(
          process.execPath,
          [script, `--only=${shard.join(',')}`, '--no-manifest'],
          { stdio: 'inherit' },
        )
        child.on('exit', (code) => resolve(code ?? 1))
      }),
    )
  const codes = await Promise.all(children)
  return codes.every((c) => c === 0)
}

async function main() {
  if (!existsSync(RAW_DIR)) {
    console.error(`No ${RAW_DIR} — run \`npm run meshy:generate\` first.`)
    process.exit(1)
  }
  const rawFiles = new Set(readdirSync(RAW_DIR).filter((f) => f.endsWith('.glb')))
  const selected = MESHY_CATALOG.filter((e) => !ONLY || ONLY.includes(e.id))
  const failures = []
  let ok = true

  if (JOBS > 1) {
    console.log(`Sharding ${selected.length} entries across ${JOBS} jobs …`)
    ok = await runSharded(selected.map((e) => e.id))
  } else {
    const io = await makeIO()
    for (const entry of selected) {
      const variants = variantsFor(entry, rawFiles)
      if (variants.length === 0) {
        console.log(`skip [none ] ${entry.id} — no raw GLB downloaded`)
        continue
      }
      for (const variant of variants) {
        const srcPath = join(RAW_DIR, variant.file)
        const destPath = join(OUT_DIR, entry.category, `${entry.id}${variant.suffix}.glb`)
        try {
          await optimizeFile(io, srcPath, destPath, entry)
        } catch (err) {
          failures.push({ id: `${entry.id}${variant.suffix}.glb`, error: String(err.message ?? err) })
          console.error(`FAIL ${entry.id}${variant.suffix}.glb: ${err.message}`)
        }
      }
    }
  }

  if (!NO_MANIFEST) {
    const io = await makeIO()
    const outputs = await scanOutputs(io)
    if (outputs.length === 0) {
      console.error('No optimized outputs found — nothing to put in the manifest.')
      process.exit(1)
    }
    generateManifest(outputs)
    const total = outputs.reduce((sum, o) => sum + o.bytes, 0)
    console.log(`Library total: ${mb(total)} of ${mb(LIBRARY_BUDGET)} budget`)
    if (total > LIBRARY_BUDGET) {
      console.error('MESHY LIBRARY BUDGET EXCEEDED')
      process.exitCode = 1
    }
  }

  if (!ok || failures.length) {
    if (failures.length) {
      console.error(`\n${failures.length} file(s) failed:`)
      for (const f of failures) console.error(`  ${f.id}: ${f.error}`)
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
