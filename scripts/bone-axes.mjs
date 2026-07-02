// Dev-only: compose the Soldier T-pose transform chain for key bones and
// print each bone's local axes in world space (to orient weapon attachments).
import { readFileSync } from 'node:fs'
import * as THREE from 'three'

const buf = readFileSync(process.argv[2] ?? 'public/models/Soldier.glb')
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

const nodes = json.nodes
const parents = new Map()
nodes.forEach((n, i) => n.children?.forEach((c) => parents.set(c, i)))

function worldMatrix(i) {
  const chain = []
  for (let k = i; k != null; k = parents.get(k)) chain.unshift(k)
  const m = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const t = new THREE.Vector3()
  const s = new THREE.Vector3(1, 1, 1)
  for (const k of chain) {
    const n = nodes[k]
    q.set(...(n.rotation ?? [0, 0, 0, 1]))
    t.set(...(n.translation ?? [0, 0, 0]))
    s.set(...(n.scale ?? [1, 1, 1]))
    local.compose(t, q, s)
    m.multiply(local)
  }
  return m
}

const names = Object.fromEntries(nodes.map((n, i) => [n.name, i]))
for (const name of [
  'mixamorig:Hips',
  'mixamorig:Spine2',
  'mixamorig:Head',
  'mixamorig:RightShoulder',
  'mixamorig:RightArm',
  'mixamorig:RightForeArm',
  'mixamorig:RightHand',
  'mixamorig:LeftShoulder',
  'mixamorig:LeftArm',
  'mixamorig:LeftForeArm',
  'mixamorig:LeftHand',
  'mixamorig:RightUpLeg',
  'mixamorig:RightLeg',
  'mixamorig:RightFoot',
  'mixamorig:HeadTop_End',
]) {
  const m = worldMatrix(names[name])
  const p = new THREE.Vector3().setFromMatrixPosition(m)
  const x = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize()
  const y = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize()
  const z = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize()
  const f = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`
  console.log(`${name}\n  pos=${f(p)}  +X=${f(x)}  +Y=${f(y)}  +Z=${f(z)}`)
}
