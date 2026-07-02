// Dev-only: sanity-check proposed bone-local aim/crouch rotations by
// composing the T-pose chain with overrides and printing key joint positions.
import { readFileSync } from 'node:fs'
import * as THREE from 'three'

const buf = readFileSync('public/models/Soldier.glb')
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
const nodes = json.nodes
const parents = new Map()
nodes.forEach((n, i) => n.children?.forEach((c) => parents.set(c, i)))
const idx = Object.fromEntries(nodes.map((n, i) => [n.name, i]))

function worldMatrix(i, overrides = {}) {
  const chain = []
  for (let k = i; k != null; k = parents.get(k)) chain.unshift(k)
  const m = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const extra = new THREE.Quaternion()
  const t = new THREE.Vector3()
  const s = new THREE.Vector3()
  for (const k of chain) {
    const n = nodes[k]
    q.set(...(n.rotation ?? [0, 0, 0, 1]))
    const ov = overrides[n.name]
    if (ov) {
      extra.setFromEuler(new THREE.Euler(ov[0], ov[1], ov[2], 'XYZ'))
      q.multiply(extra) // same as bone.rotateX/Y/Z after the clip pose
    }
    t.set(...(n.translation ?? [0, 0, 0]))
    s.set(...(n.scale ?? [1, 1, 1]))
    local.compose(t, q, s)
    m.multiply(local)
  }
  return m
}

const f = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`
function report(label, overrides, boneNames) {
  console.log(`-- ${label}`)
  for (const name of boneNames) {
    const m = worldMatrix(idx[name], overrides)
    const p = new THREE.Vector3().setFromMatrixPosition(m)
    const y = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize()
    console.log(`   ${name.replace('mixamorig:', '')} pos=${f(p)} boneY(dir)=${f(y)}`)
  }
}

// Model faces -Z. "Forward" for the character = -Z here.
report('T-pose baseline', {}, ['mixamorig:RightHand', 'mixamorig:LeftHand', 'mixamorig:RightFoot'])

report(
  'AIM two-handed (want hands ~(±0.15, 1.25, -0.35), boneY toward -Z)',
  {
    'mixamorig:RightArm': [1.25, -0.35, 0],
    'mixamorig:RightForeArm': [0.45, 0, 0],
    'mixamorig:LeftArm': [-1.25, 0.35, 0],
    'mixamorig:LeftForeArm': [-0.55, 0, 0],
  },
  ['mixamorig:RightHand', 'mixamorig:LeftHand'],
)

report(
  'CROUCH (want foot near ground, knee forward, hips dropped)',
  {
    'mixamorig:RightUpLeg': [-0.9, 0, 0],
    'mixamorig:RightLeg': [1.15, 0, 0],
    'mixamorig:RightFoot': [-0.35, 0, 0],
  },
  ['mixamorig:RightLeg', 'mixamorig:RightFoot', 'mixamorig:RightToeBase'],
)

report(
  'JUMP tuck (thighs forward, shins back)',
  {
    'mixamorig:RightUpLeg': [-0.55, 0, 0],
    'mixamorig:RightLeg': [0.85, 0, 0],
  },
  ['mixamorig:RightFoot'],
)

report(
  'WAVE (left arm up, want hand ~(-0.3, 1.8, 0))',
  { 'mixamorig:LeftArm': [0, 0, -1.9] },
  ['mixamorig:LeftHand'],
)
