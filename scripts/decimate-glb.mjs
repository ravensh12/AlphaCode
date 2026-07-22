// Decimate a (skinned) GLB for crowd rendering: weld + meshopt-simplify while
// preserving JOINTS/WEIGHTS, then re-compress. The horde renders up to 90
// instances × 4 passes (camera + shadow cascades) — full-detail Meshy rigs
// (~20k tris) are 5M+ vertices PER DRAW at that multiplier; the crowd copies
// live in public/assets/models/ at ~1/3 the triangles.
//
//   node scripts/decimate-glb.mjs <in.glb> <out.glb> [ratio=0.34]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { simplify, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const [input, output, ratioArg] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/decimate-glb.mjs <in.glb> <out.glb> [ratio]')
  process.exit(1)
}
const ratio = Number(ratioArg ?? '0.34')

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

const doc = await io.read(input)
let before = 0
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    before += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3
  }
}
await doc.transform(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }))
let after = 0
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    after += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3
  }
}
await io.write(output, doc)
console.log(`${input}: ${Math.round(before)} tris → ${Math.round(after)} tris (${output})`)
