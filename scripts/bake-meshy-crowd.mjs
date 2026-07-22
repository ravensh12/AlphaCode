// Bake a MESHY-rigged character (one clip per GLB — the wave-2 shipping
// format) into the bone-matrix bank ZombieHorde consumes (same output format
// as bake-zombie-anim.mjs: [u32 headerLen][JSON header][Float32 RGBA texels]).
//
// Two differences from the wave-1 bakes, both handled here:
// 1. Clips ship one-per-file on an IDENTICAL armature → clips retarget onto
//    the base file's skeleton by node name.
// 2. Meshy GLBs are meshopt-quantized (KHR_mesh_quantization): the position
//    attribute reads as normalized [-1,1] in the shader, with the real scale
//    on the mesh node. We fold the mesh's bind matrix INTO the baked joint
//    matrices (M_j = boneWorld × boneInverse × bindMatrix), so the horde's
//    vertex shader maps raw quantized positions straight to armature-world
//    meters. (The wave-1 bakes used bindInv·…·bind — identical when the mesh
//    node is identity, which theirs was.)
//
//   node scripts/bake-meshy-crowd.mjs <base-noext|baseFile.glb> <clip-prefix?> <out.bin> Clip=suffix [...]
//   node scripts/bake-meshy-crowd.mjs \
//     public/assets/models/zombie-android-crowd.glb \
//     public/assets/meshy/character/character-zombie-android \
//     public/assets/models/zombie-android.bin \
//     Idle=idle Walk=shamble Run=walk Idle_Attack=attack Punch=attack \
//     HitReact=idle Death=attack
//
// When the first arg is a .glb FILE, its skeleton/bind (e.g. the decimated
// crowd copy the runtime actually renders) anchors the bake, and the clips
// resolve against the second arg's prefix. A clip whose file is missing
// aliases the first present clip's rows.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'meshoptimizer'

const BAKE_FPS = 24
const LOOPING = new Set(['Idle', 'Walk', 'Run', 'Wave'])

function loadGlbStripped(path) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  delete json.images
  delete json.textures
  delete json.samplers
  for (const m of json.materials ?? []) {
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture
      delete m.pbrMetallicRoughness.metallicRoughnessTexture
    }
    delete m.normalTexture
    delete m.emissiveTexture
    delete m.occlusionTexture
  }
  let jsonStr = JSON.stringify(json)
  while (jsonStr.length % 4 !== 0) jsonStr += ' '
  const jsonBuf = Buffer.from(jsonStr, 'utf8')
  const binChunk = buf.subarray(20 + jsonLen)
  const total = 12 + 8 + jsonBuf.length + binChunk.length
  const out = Buffer.alloc(total)
  buf.copy(out, 0, 0, 12)
  out.writeUInt32LE(total, 8)
  out.writeUInt32LE(jsonBuf.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16)
  jsonBuf.copy(out, 20)
  binChunk.copy(out, 20 + jsonBuf.length)
  return out
}

async function parseGlb(path) {
  const glb = loadGlbStripped(path)
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return new Promise((resolve, reject) => {
    loader.parse(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
      '',
      resolve,
      reject,
    )
  })
}

const rawArgs = process.argv.slice(2)
let baseFile = null
let baseNoExt
let OUT
let clipArgs
if (rawArgs[0]?.endsWith('.glb')) {
  baseFile = rawArgs[0]
  baseNoExt = rawArgs[1]
  OUT = rawArgs[2]
  clipArgs = rawArgs.slice(3)
} else {
  baseNoExt = rawArgs[0]
  OUT = rawArgs[1]
  clipArgs = rawArgs.slice(2)
}
if (!baseNoExt || !OUT || clipArgs.length === 0) {
  console.error('usage: node scripts/bake-meshy-crowd.mjs [base.glb] <clip-prefix> <out.bin> Clip=suffix [...]')
  process.exit(1)
}

const clipFiles = clipArgs.map((arg) => {
  const [name, suffix] = arg.split('=')
  return { name, path: `${baseNoExt}-${suffix}.glb` }
})
const present = clipFiles.filter((c) => existsSync(c.path))
if (present.length === 0) {
  console.error('no clip files found — nothing to bake')
  process.exit(1)
}

const baseGltf = await parseGlb(baseFile ?? present[0].path)
const scene = baseGltf.scene
scene.updateMatrixWorld(true)

const skinnedMeshes = []
scene.traverse((o) => {
  if (o.isSkinnedMesh) skinnedMeshes.push(o)
})
if (skinnedMeshes.length === 0) throw new Error('no skinned mesh in base GLB')
const mesh = skinnedMeshes[0]
const skeleton = mesh.skeleton
const joints = skeleton.bones
console.log(`base: ${present[0].path} — ${joints.length} joints, ${mesh.geometry.attributes.position.count} verts`)

// Rest height from the settled bind pose (skinned bounds, armature-world).
mesh.computeBoundingBox()
const bindBox = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld)
const restHeight = bindBox.max.y - Math.min(0, bindBox.min.y)
console.log(`rest height ${restHeight.toFixed(2)}m`)

// Clips retargeted by node name (identical armatures across the clip files).
const clips = []
for (const spec of clipFiles) {
  if (!existsSync(spec.path)) {
    clips.push({ name: spec.name, clip: null })
    console.warn(`  (missing ${spec.path} — ${spec.name} will alias)`)
    continue
  }
  const gltf = spec.path === present[0].path ? baseGltf : await parseGlb(spec.path)
  const clip = gltf.animations[0]
  if (!clip) throw new Error(`${spec.path} has no animation`)
  clips.push({ name: spec.name, clip })
}

const mixer = new THREE.AnimationMixer(scene)
const clipMeta = []
let totalFrames = 0
for (const c of clips) {
  if (!c.clip) {
    clipMeta.push({ name: c.name, loop: LOOPING.has(c.name), clip: null, duration: 0, frames: 0, row: 0, fps: BAKE_FPS })
    continue
  }
  const frames = Math.max(2, Math.round(c.clip.duration * BAKE_FPS) + 1)
  clipMeta.push({
    name: c.name,
    loop: LOOPING.has(c.name),
    clip: c.clip,
    duration: c.clip.duration,
    frames,
    row: totalFrames,
    fps: BAKE_FPS,
  })
  totalFrames += frames
}

const width = joints.length * 4
const height = totalFrames
const tex = new Float32Array(width * height * 4)
const jointMat = new THREE.Matrix4()
const bindMatrix = mesh.bindMatrix

for (const meta of clipMeta) {
  if (!meta.clip) continue
  const action = mixer.clipAction(meta.clip)
  mixer.stopAllAction()
  action.reset().play()
  for (let f = 0; f < meta.frames; f++) {
    mixer.setTime(Math.min(meta.duration - 1e-4, f / BAKE_FPS))
    scene.updateMatrixWorld(true)
    for (let j = 0; j < joints.length; j++) {
      // boneWorld × boneInverse × bindMatrix: raw (quantized) mesh-space
      // position → armature-world meters, dequantization folded in.
      jointMat
        .copy(joints[j].matrixWorld)
        .multiply(skeleton.boneInverses[j])
        .multiply(bindMatrix)
      const e = jointMat.elements
      const off = ((meta.row + f) * width + j * 4) * 4
      for (let k = 0; k < 16; k++) tex[off + k] = e[k]
    }
  }
  console.log(
    `baked ${meta.name.padEnd(11)} ← ${String(meta.clip.name).split('|')[1] ?? meta.clip.name} frames=${String(meta.frames).padStart(3)} dur=${meta.duration.toFixed(2)}s${meta.loop ? ' loop' : ''}`,
  )
}
// Alias missing clips onto the first baked clip's rows.
const fallbackMeta = clipMeta.find((m) => m.clip)
for (const meta of clipMeta) {
  if (meta.clip) continue
  meta.row = fallbackMeta.row
  meta.frames = fallbackMeta.frames
  meta.duration = fallbackMeta.duration
  console.log(`alias ${meta.name} → ${fallbackMeta.name}`)
}

/* -------------------------------------------------------------- validate */
{
  const meta = clipMeta.find((c) => c.name === 'Walk' && c.clip) ?? fallbackMeta
  const f = Math.floor(meta.frames / 2)
  mixer.stopAllAction()
  mixer.clipAction(meta.clip).reset().play()
  mixer.setTime(f / BAKE_FPS)
  scene.updateMatrixWorld(true)
  const m = new THREE.Matrix4()
  const rec = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const ref = new THREE.Vector3()
  const pos = mesh.geometry.attributes.position
  const sIdx = mesh.geometry.attributes.skinIndex
  const sWgt = mesh.geometry.attributes.skinWeight
  let maxErr = 0
  for (let i = 0; i < pos.count; i += 13) {
    rec.set(0, 0, 0)
    for (let k = 0; k < 4; k++) {
      const j = sIdx.getComponent(i, k)
      const w = sWgt.getComponent(i, k)
      if (w === 0) continue
      const off = ((meta.row + f) * width + j * 4) * 4
      m.fromArray(tex, off)
      // getX/getY/getZ de-normalize the quantized storage — exactly what the
      // GPU's normalized attribute fetch feeds the shader.
      tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m)
      rec.addScaledVector(tmp, w)
    }
    mesh.getVertexPosition(i, ref)
    mesh.localToWorld(ref)
    maxErr = Math.max(maxErr, rec.distanceTo(ref))
  }
  console.log(`validation vs three: maxErr=${maxErr.toFixed(5)}m ${maxErr < 5e-3 ? 'OK' : 'FAIL'}`)
  if (maxErr >= 5e-3) process.exit(1)
}

/* ------------------------------------------------------------------ write */
let headerJson = JSON.stringify({
  width,
  height,
  joints: joints.length,
  restHeight: +restHeight.toFixed(4),
  clips: clipMeta.map(({ name, row, frames, fps, duration, loop }) => ({ name, row, frames, fps, duration, loop })),
})
while ((4 + headerJson.length) % 4 !== 0) headerJson += ' '
const header = Buffer.from(headerJson, 'utf8')
const texB = Buffer.from(tex.buffer)
const out = Buffer.alloc(4 + header.length + texB.length)
out.writeUInt32LE(header.length, 0)
header.copy(out, 4)
texB.copy(out, 4 + header.length)
writeFileSync(OUT, out)
console.log(`wrote ${OUT}: ${(out.length / 1024).toFixed(0)}KB (${width}x${height} RGBA32F)`)
