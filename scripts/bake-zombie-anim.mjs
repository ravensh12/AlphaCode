// Bake a rigged GLB's skeleton animation into a compact bone-matrix texture
// (crowd-skinning / "VAT bones"): for each clip, at BAKE_FPS, we store every
// joint's final skinning matrix (bindMatrixInverse * boneWorld * boneInverse *
// bindMatrix — i.e. exactly what three's skinning shader computes, pre-folded)
// as 4 RGBA32F texels. The game then plays REAL skinned animation on a single
// InstancedMesh: the vertex shader fetches 2 frames of 4 joint matrices and
// blends — zero AnimationMixers, zero per-zombie draw calls.
//
// Output: [u32 headerLen][headerLen bytes JSON][Float32 texture data]
// Header: { width, height, joints, restHeight,
//           clips: [{ name, row, frames, fps, duration, loop }] }
//
// Usage:
//   node scripts/bake-zombie-anim.mjs                     # both zombie models
//   node scripts/bake-zombie-anim.mjs <src.glb> <out.bin> # one model
import { readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const BAKE_FPS = 24

// Canonical clip set the game uses. Each bakes from the first present
// candidate (matched against the segment after the last '|' in the clip name),
// so differently-authored rigs (Zombie vs the enemy-pack brute) map onto the
// same names.
const CLIPS = [
  { name: 'Idle', candidates: ['Idle'], loop: true },
  { name: 'Walk', candidates: ['Walk'], loop: true },
  { name: 'Run', candidates: ['Run'], loop: true },
  { name: 'Idle_Attack', candidates: ['Idle_Attack', 'Attack'], loop: false }, // spitter wind-up
  { name: 'Punch', candidates: ['Punch', 'Attack'], loop: false }, // slam / contact attack
  { name: 'HitReact', candidates: ['HitReact', 'HitRecieve'], loop: false },
  { name: 'Death', candidates: ['Death'], loop: false },
]

// ---------------------------------------------------------------- load GLB
// Strip images/textures from the JSON chunk so GLTFLoader never touches
// browser-only image decoding — the bake only needs geometry + skeleton + clips.
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
  const binChunk = buf.subarray(20 + jsonLen) // includes its own chunk header
  const total = 12 + 8 + jsonBuf.length + binChunk.length
  const out = Buffer.alloc(total)
  buf.copy(out, 0, 0, 12) // glb header
  out.writeUInt32LE(total, 8)
  out.writeUInt32LE(jsonBuf.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16) // 'JSON'
  jsonBuf.copy(out, 20)
  binChunk.copy(out, 20 + jsonBuf.length)
  return out
}

async function bake(SRC, OUT) {
  console.log(`\n=== ${SRC} → ${OUT} ===`)
  const glb = loadGlbStripped(SRC)
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '', resolve, reject)
  })

  const scene = gltf.scene
  scene.updateMatrixWorld(true)

  const meshes = []
  scene.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o)
  })
  // Largest skinned mesh anchors the bake (all share the skeleton in practice).
  const mesh = meshes.reduce((a, b) =>
    (b.geometry.attributes.position?.count ?? 0) > (a.geometry.attributes.position?.count ?? 0) ? b : a,
  )
  const skeleton = mesh.skeleton
  const joints = skeleton.bones.length
  console.log(`meshes: ${meshes.map((m) => m.name).join(', ')} | joints: ${joints}`)

  const bbox = new THREE.Box3().setFromObject(scene)
  const restHeight = bbox.max.y - Math.min(0, bbox.min.y)
  console.log(
    `rest bbox: y ${bbox.min.y.toFixed(2)}..${bbox.max.y.toFixed(2)} (h=${restHeight.toFixed(2)}m) z ${bbox.min.z.toFixed(2)}..${bbox.max.z.toFixed(2)}`,
  )

  // ------------------------------------------------------------------- bake
  const mixer = new THREE.AnimationMixer(scene)
  const lastSegment = (n) => n.split('|').pop()
  const findClip = (candidates) => {
    for (const want of candidates) {
      const c = gltf.animations.find((a) => lastSegment(a.name) === want)
      if (c) return c
    }
    return null
  }

  const clipMeta = []
  let totalFrames = 0
  for (const c of CLIPS) {
    const clip = findClip(c.candidates)
    if (!clip) throw new Error(`no candidate found for ${c.name}`)
    const frames = Math.max(2, Math.round(clip.duration * BAKE_FPS) + 1)
    clipMeta.push({ name: c.name, loop: c.loop, clip, duration: clip.duration, frames, row: totalFrames, fps: BAKE_FPS })
    totalFrames += frames
  }

  const width = joints * 4 // 4 RGBA texels per mat4 (column-major)
  const height = totalFrames
  const data = new Float32Array(width * height * 4)

  // Skinning chain exactly as three's shader composes it (skinning_vertex.glsl):
  //   world = meshWorld * bindMatrixInverse * (Σ w * boneWorld * boneInverse) * bindMatrix * pos
  // Fold the constant outer terms so the runtime shader does ONE mat4 per joint.
  const pre = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
  const tmp = new THREE.Matrix4()

  for (const meta of clipMeta) {
    const action = mixer.clipAction(meta.clip)
    mixer.stopAllAction()
    action.reset().play()
    for (let f = 0; f < meta.frames; f++) {
      const t = Math.min(meta.duration - 1e-4, f / BAKE_FPS)
      mixer.setTime(t)
      scene.updateMatrixWorld(true)
      for (let j = 0; j < joints; j++) {
        tmp
          .copy(pre)
          .multiply(skeleton.bones[j].matrixWorld)
          .multiply(skeleton.boneInverses[j])
          .multiply(mesh.bindMatrix)
        const row = meta.row + f
        const off = (row * width + j * 4) * 4
        const e = tmp.elements
        for (let k = 0; k < 16; k++) data[off + k] = e[k]
      }
    }
    console.log(
      `baked ${meta.name.padEnd(12)} ← ${lastSegment(meta.clip.name).padEnd(12)} frames=${String(meta.frames).padStart(3)} dur=${meta.duration.toFixed(2)}s`,
    )
  }

  // ------------------------------------------------------------- validation
  // Reconstruct skinned world positions from the baked matrices and compare to
  // three's own CPU skinning. Max error must be ~0 for every skinned mesh that
  // will render with this bake.
  {
    const meta = clipMeta.find((c) => c.name === 'Walk')
    const f = Math.floor(meta.frames / 2)
    mixer.stopAllAction()
    const action = mixer.clipAction(meta.clip)
    action.reset().play()
    mixer.setTime(f / BAKE_FPS)
    scene.updateMatrixWorld(true)

    let maxErr = 0
    const ref = new THREE.Vector3()
    const acc = new THREE.Vector3()
    const tv = new THREE.Vector3()
    const m = new THREE.Matrix4()
    const row = meta.row + f
    for (const sm of meshes) {
      const pos = sm.geometry.attributes.position
      const sIdx = sm.geometry.attributes.skinIndex
      const sWgt = sm.geometry.attributes.skinWeight
      for (let i = 0; i < pos.count; i += 13) {
        acc.set(0, 0, 0)
        for (let k = 0; k < 4; k++) {
          const j = sIdx.getComponent(i, k)
          const w = sWgt.getComponent(i, k)
          if (w === 0) continue
          const off = (row * width + j * 4) * 4
          m.fromArray(data, off)
          tv.fromBufferAttribute(pos, i).applyMatrix4(m).multiplyScalar(w)
          acc.add(tv)
        }
        sm.getVertexPosition(i, ref)
        sm.localToWorld(ref)
        maxErr = Math.max(maxErr, ref.distanceTo(acc))
      }
    }
    console.log(`validation vs three CPU skinning: maxErr=${maxErr.toFixed(6)}m ${maxErr < 1e-3 ? 'OK' : 'FAIL'}`)
    if (maxErr >= 1e-3) process.exit(1)
  }

  // ------------------------------------------------------------------ write
  let headerJson = JSON.stringify({
    width,
    height,
    joints,
    fps: BAKE_FPS,
    restHeight: +restHeight.toFixed(4),
    clips: clipMeta.map(({ name, row, frames, fps, duration, loop }) => ({ name, row, frames, fps, duration, loop })),
  })
  // Pad so the Float32 payload lands 4-byte aligned (typed-array view requirement).
  while ((4 + headerJson.length) % 4 !== 0) headerJson += ' '
  const header = Buffer.from(headerJson, 'utf8')
  const out = Buffer.alloc(4 + header.length + data.byteLength)
  out.writeUInt32LE(header.length, 0)
  header.copy(out, 4)
  Buffer.from(data.buffer).copy(out, 4 + header.length)
  writeFileSync(OUT, out)
  console.log(`wrote ${OUT}: ${(out.length / 1024).toFixed(0)}KB (${width}x${height} RGBA32F)`)
}

const [srcArg, outArg] = process.argv.slice(2)
if (srcArg && outArg) {
  await bake(srcArg, outArg)
} else {
  await bake('public/models/Zombie.glb', 'public/models/ZombieAnim.bin')
  await bake('public/models/ZombieBrute.glb', 'public/models/ZombieBruteAnim.bin')
}
