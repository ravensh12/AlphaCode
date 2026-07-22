// Meshy library smoke test — validates every optimized GLB parses and
// reports geometry/skin/animation stats. Exit 1 on any unreadable file or
// if a character clip is missing its skin/animation.
//
//   node scripts/meshy-verify.mjs

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/assets/meshy')

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith('.glb')) out.push(p)
  }
  return out
}

function countTriangles(doc) {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue
      const indices = prim.getIndices()
      tris += Math.floor((indices ? indices.getCount() : prim.getAttribute('POSITION')?.getCount() ?? 0) / 3)
    }
  }
  return tris
}

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
})

const files = walk(OUT_DIR).sort()
if (files.length === 0) {
  console.error(`No GLBs under ${relative(ROOT, OUT_DIR)} — run meshy:optimize first.`)
  process.exit(1)
}

let failed = 0
let total = 0
for (const file of files) {
  const rel = relative(ROOT, file)
  const bytes = statSync(file).size
  total += bytes
  try {
    const doc = await io.read(file)
    const root = doc.getRoot()
    const skins = root.listSkins().length
    const anims = root.listAnimations().length
    const tris = countTriangles(doc)
    const isCharacterClip = /character\/.*-(walk|idle)\.glb$/.test(rel)
    let note = ''
    if (isCharacterClip && (skins === 0 || anims === 0)) {
      note = '  ← MISSING SKIN/ANIMATION'
      failed++
    }
    console.log(
      `ok   ${rel}  ${(bytes / 1024 / 1024).toFixed(2)} MB, ${tris} tris` +
      `${skins ? `, ${skins} skin(s)` : ''}${anims ? `, ${anims} clip(s)` : ''}${note}`,
    )
  } catch (err) {
    failed++
    console.error(`FAIL ${rel}: ${err.message}`)
  }
}

console.log(`\n${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB total — ${failed ? `${failed} problem(s)` : 'all readable'}`)
if (failed) process.exit(1)
