// Quick rig inspector for Meshy character GLBs: bone names, clip names,
// durations, mesh bounds. Usage: node scripts/inspect-rig.mjs <glb> [glb...]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

for (const path of process.argv.slice(2)) {
  const doc = await io.read(path)
  const root = doc.getRoot()
  const skins = root.listSkins()
  const anims = root.listAnimations()
  const meshes = root.listMeshes()
  console.log(`\n=== ${path}`)
  console.log(
    'meshes:',
    meshes.map((m) => `${m.getName()}(${m.listPrimitives().length} prim)`).join(', '),
  )
  for (const skin of skins) {
    const joints = skin.listJoints().map((j) => j.getName())
    console.log(`skin joints (${joints.length}):`, joints.join(', '))
  }
  for (const anim of anims) {
    const channels = anim.listChannels()
    let maxT = 0
    for (const ch of channels) {
      const input = ch.getSampler()?.getInput()
      if (input) {
        const arr = input.getArray()
        if (arr && arr.length) maxT = Math.max(maxT, arr[arr.length - 1])
      }
    }
    console.log(
      `anim "${anim.getName()}": ${channels.length} channels, ~${maxT.toFixed(2)}s`,
    )
  }
  // Rough bind-pose bounds from POSITION accessors (raw units).
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const pmin = pos.getMin([])
      const pmax = pos.getMax([])
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], pmin[i])
        max[i] = Math.max(max[i], pmax[i])
      }
    }
  }
  console.log('raw position bounds:', min.map((v) => v.toFixed(3)), '→', max.map((v) => v.toFixed(3)))
  const scenes = root.listScenes()
  for (const scene of scenes) {
    for (const node of scene.listChildren()) {
      console.log(
        `root node "${node.getName()}" scale=${node.getScale().map((v) => v.toFixed(4))} rot=${node
          .getRotation()
          .map((v) => v.toFixed(3))}`,
      )
    }
  }
}
