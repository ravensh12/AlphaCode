// extract_static_mesh.mjs — produce a STATIC textured GLB (no skin, no
// animations, no joint nodes) from a rigged character GLB. The skinned mesh's
// vertex buffer is already stored in bind pose, so dropping the skin yields
// the bind-pose statue Meshy's rigging API wants (textured humanoid, facing
// +Z per glTF convention).
//
//   node scripts/pipeline/extract_static_mesh.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) {
  console.error('usage: node extract_static_mesh.mjs in.glb out.glb')
  process.exit(1)
}

await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(inPath)
const root = doc.getRoot()

for (const anim of root.listAnimations()) anim.dispose()
for (const skin of root.listSkins()) skin.dispose()

// Drop joint hierarchies: keep only nodes that carry a mesh (re-parented to
// the scene root with their world transform intact is unnecessary — Meshy
// rigged characters keep mesh nodes at the armature root with a uniform
// scale, so preserve each mesh node's own TRS chain by flattening it).
const scene = root.listScenes()[0]
const meshNodes = []
for (const node of root.listNodes()) {
  if (node.getMesh()) meshNodes.push(node)
}
// Compute world matrices before we detach anything.
const worldOf = new Map()
for (const node of meshNodes) {
  worldOf.set(node, node.getWorldMatrix())
}
for (const child of scene.listChildren()) scene.removeChild(child)
for (const node of meshNodes) {
  const m = worldOf.get(node)
  for (const child of node.listChildren()) node.removeChild(child)
  node.setMatrix(m)
  scene.addChild(node)
}

// Remove skinning attributes (JOINTS_*/WEIGHTS_*) so validators are happy.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const semantic of prim.listSemantics()) {
      if (semantic.startsWith('JOINTS_') || semantic.startsWith('WEIGHTS_')) {
        prim.setAttribute(semantic, null)
      }
    }
  }
}

for (const ext of root.listExtensionsUsed()) {
  if (
    ext.extensionName === 'EXT_meshopt_compression' ||
    ext.extensionName === 'KHR_draco_mesh_compression'
  ) {
    ext.dispose()
  }
}

await doc.transform(prune())
await io.write(outPath, doc)
console.log(`[extract_static_mesh] ${inPath} -> ${outPath}`)
