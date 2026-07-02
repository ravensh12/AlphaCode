// Dev-only: dump a GLB's JSON chunk highlights (nodes, animations, meshes).
import { readFileSync } from 'node:fs'

const path = process.argv[2]
const buf = readFileSync(path)
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

console.log('== scenes/nodes ==')
console.log('scene roots:', json.scenes?.[0]?.nodes)
json.nodes?.forEach((n, i) => {
  const bits = []
  if (n.mesh != null) bits.push(`mesh=${n.mesh}`)
  if (n.skin != null) bits.push(`skin=${n.skin}`)
  if (n.rotation) bits.push(`rot=[${n.rotation.map((v) => v.toFixed(2)).join(',')}]`)
  if (n.scale) bits.push(`scale=[${n.scale.map((v) => v.toFixed(3)).join(',')}]`)
  if (n.translation) bits.push(`t=[${n.translation.map((v) => v.toFixed(2)).join(',')}]`)
  console.log(`  [${i}] ${n.name ?? '?'} ${bits.join(' ')}${n.children ? ' kids=' + JSON.stringify(n.children) : ''}`)
})
console.log('== meshes ==')
json.meshes?.forEach((m, i) =>
  console.log(`  [${i}] ${m.name} prims=${m.primitives.length} mat=${m.primitives.map((p) => p.material)}`),
)
console.log('== materials ==')
json.materials?.forEach((m, i) => console.log(`  [${i}] ${m.name}`))
console.log('== animations ==')
json.animations?.forEach((a, i) => {
  console.log(`  [${i}] ${a.name} channels=${a.channels.length}`)
})
console.log('== skins ==')
json.skins?.forEach((s, i) => console.log(`  [${i}] ${s.name ?? ''} joints=${s.joints.length}`))
console.log('== accessor 0 count (verts hint) ==', json.accessors?.[0]?.count)
