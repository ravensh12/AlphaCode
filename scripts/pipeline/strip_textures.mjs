// strip_textures.mjs — make a Blender-importable ANIM SOURCE from a Meshy clip
// GLB whose textures are KTX2/BasisU (Blender's glTF importer rejects the
// KHR_texture_basisu extension). Drops every texture/image and clears the
// material texture slots but KEEPS mesh + skin + animation, so Blender still
// reconstructs the armature and the rest-delta baker can sample the clip.
//
//   node scripts/pipeline/strip_textures.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) {
  console.error('usage: node strip_textures.mjs in.glb out.glb')
  process.exit(1)
}

await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(inPath)
const root = doc.getRoot()
for (const material of root.listMaterials()) {
  material.setBaseColorTexture(null)
  material.setNormalTexture(null)
  material.setMetallicRoughnessTexture(null)
  material.setOcclusionTexture(null)
  material.setEmissiveTexture(null)
}
for (const texture of root.listTextures()) texture.dispose()
// Buffers were decoded at read time — drop the compression/texture extensions
// so the output is written PLAIN (no meshopt encoder needed, no basisu left).
for (const ext of root.listExtensionsUsed()) {
  if (
    ext.extensionName === 'EXT_meshopt_compression' ||
    ext.extensionName === 'KHR_texture_basisu' ||
    ext.extensionName === 'KHR_draco_mesh_compression'
  ) {
    ext.dispose()
  }
}
await doc.transform(prune())
await io.write(outPath, doc)
console.log(`[strip_textures] ${inPath} -> ${outPath}`)
