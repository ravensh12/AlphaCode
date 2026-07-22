// Bake a CITIZEN rig into a single self-contained crowd bundle (Phase 3,
// Living Code City) — an extension of the bake-zombie-anim.mjs bone-matrix
// pipeline that also handles RIGID-JOINTED rigs like Quaternius' Robot
// Expressive (CC0), whose body parts are meshes parented to bones rather
// than skinned vertices.
//
// Every mesh part is folded into ONE merged geometry expressed in the space
// of a single "carrier" bone (rigid parts: their parent bone; skinned parts:
// their dominant-weight joint), so the runtime vertex shader plays REAL
// animation with a single texel-fetched bone matrix per vertex — no
// AnimationMixers, one InstancedMesh for the whole crowd.
//
// Output (single .bin, 4-byte aligned sections):
//   [u32 headerLen][JSON header][pos f32×3][normal f32×3][color f32×3]
//   [bone f32×1][index u32][bone-matrix texture f32 RGBA]
// Header: { version, width, height, carriers, restHeight, vertexCount,
//           indexCount, clips: [{ name, row, frames, fps, duration, loop }] }
//
// Usage:
//   node scripts/bake-citizen-anim.mjs                                # robot
//   node scripts/bake-citizen-anim.mjs <src.glb> <out.bin>            # custom
import { readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const BAKE_FPS = 24

// Citizen clip set: strolling + a greeting. Candidates map differently-named
// source clips (Robot Expressive uses Walking/Running) onto canonical names.
const CLIPS = [
  { name: 'Idle', candidates: ['Idle'], loop: true },
  { name: 'Walk', candidates: ['Walk', 'Walking'], loop: true },
  { name: 'Run', candidates: ['Run', 'Running'], loop: true },
  { name: 'Wave', candidates: ['Wave'], loop: true },
]

/** Strip images/textures so GLTFLoader never touches browser image decode. */
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

  /* ---------------------------------------------------- carrier discovery */
  // parts: { mesh, carrier(Bone), toCarrier(Matrix4 rest transform), skinned }
  const parts = []
  const carrierSet = new Set()

  scene.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return
    if (o.isSkinnedMesh) {
      // Dominant joint by total skin weight — fingers ride the palm rigidly.
      const w = o.geometry.attributes.skinWeight
      const idx = o.geometry.attributes.skinIndex
      const totals = new Float64Array(o.skeleton.bones.length)
      for (let i = 0; i < idx.count; i++) {
        for (let k = 0; k < 4; k++) totals[idx.getComponent(i, k)] += w.getComponent(i, k)
      }
      let best = 0
      for (let j = 1; j < totals.length; j++) if (totals[j] > totals[best]) best = j
      const carrier = o.skeleton.bones[best]
      carrierSet.add(carrier)
      parts.push({ mesh: o, carrier, skinned: true })
    } else {
      let carrier = o.parent
      while (carrier && !carrier.isBone) carrier = carrier.parent
      if (!carrier) {
        console.warn(`  (skip: ${o.name} has no bone ancestor)`)
        return
      }
      carrierSet.add(carrier)
      parts.push({ mesh: o, carrier, skinned: false })
    }
  })
  if (parts.length === 0) throw new Error('no mesh parts found')
  const carriers = [...carrierSet]
  const carrierIndex = new Map(carriers.map((c, i) => [c, i]))
  console.log(`parts: ${parts.length} (skinned ${parts.filter((p) => p.skinned).length}) carriers: ${carriers.length}`)

  /* ------------------------------------------------------- merge geometry */
  const positions = []
  const normals = []
  const colors = []
  const bones = []
  const indices = []
  const inv = new THREE.Matrix4()
  const nrm = new THREE.Matrix3()
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const col = new THREE.Color()

  const bboxMin = new THREE.Vector3(Infinity, Infinity, Infinity)
  const bboxMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity)

  for (const part of parts) {
    const { mesh, carrier } = part
    const geo = mesh.geometry
    const pos = geo.attributes.position
    const nor = geo.attributes.normal
    const base = positions.length / 3
    inv.copy(carrier.matrixWorld).invert()
    // World rest normal → carrier space (rigid: exact; skinned: rest approx).
    nrm.getNormalMatrix(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld))
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    col.copy(mat?.color ?? new THREE.Color('#cfd2d8'))
    const ci = carrierIndex.get(carrier)

    for (let i = 0; i < pos.count; i++) {
      // getVertexPosition applies skinning (rest pose) for SkinnedMesh and is
      // the raw attribute for plain meshes.
      mesh.getVertexPosition(i, v)
      mesh.localToWorld(v)
      bboxMin.min(v)
      bboxMax.max(v)
      v.applyMatrix4(inv) // world → carrier space
      positions.push(v.x, v.y, v.z)
      n.fromBufferAttribute(nor, i).applyMatrix3(nrm).normalize()
      normals.push(n.x, n.y, n.z)
      colors.push(col.r, col.g, col.b)
      bones.push(ci)
    }
    const idx = geo.index
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i))
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(base + i)
    }
  }
  const restHeight = bboxMax.y - Math.min(0, bboxMin.y)
  console.log(`merged: ${positions.length / 3} verts, ${indices.length / 3} tris, rest height ${restHeight.toFixed(2)}m`)

  /* ------------------------------------------------------------ bake anim */
  const mixer = new THREE.AnimationMixer(scene)
  const lastSegment = (name) => name.split('|').pop()
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

  const width = carriers.length * 4
  const height = totalFrames
  const tex = new Float32Array(width * height * 4)
  for (const meta of clipMeta) {
    const action = mixer.clipAction(meta.clip)
    mixer.stopAllAction()
    action.reset().play()
    for (let f = 0; f < meta.frames; f++) {
      mixer.setTime(Math.min(meta.duration - 1e-4, f / BAKE_FPS))
      scene.updateMatrixWorld(true)
      for (let j = 0; j < carriers.length; j++) {
        const e = carriers[j].matrixWorld.elements
        const off = ((meta.row + f) * width + j * 4) * 4
        for (let k = 0; k < 16; k++) tex[off + k] = e[k]
      }
    }
    console.log(
      `baked ${meta.name.padEnd(6)} ← ${lastSegment(meta.clip.name).padEnd(10)} frames=${String(meta.frames).padStart(3)} dur=${meta.duration.toFixed(2)}s`,
    )
  }

  /* ------------------------------------------------------------ validate */
  {
    const meta = clipMeta.find((c) => c.name === 'Walk')
    const f = Math.floor(meta.frames / 2)
    mixer.stopAllAction()
    mixer.clipAction(meta.clip).reset().play()
    mixer.setTime(f / BAKE_FPS)
    scene.updateMatrixWorld(true)

    const m = new THREE.Matrix4()
    const rec = new THREE.Vector3()
    const ref = new THREE.Vector3()
    let maxRigid = 0
    let maxSkinned = 0
    let cursor = 0
    for (const part of parts) {
      const count = part.mesh.geometry.attributes.position.count
      const ci = carrierIndex.get(part.carrier)
      const off = ((meta.row + f) * width + ci * 4) * 4
      m.fromArray(tex, off)
      for (let i = 0; i < count; i += 11) {
        const b = (cursor + i) * 3
        rec.set(positions[b], positions[b + 1], positions[b + 2]).applyMatrix4(m)
        part.mesh.getVertexPosition(i, ref)
        part.mesh.localToWorld(ref)
        const err = rec.distanceTo(ref)
        if (part.skinned) maxSkinned = Math.max(maxSkinned, err)
        else maxRigid = Math.max(maxRigid, err)
      }
      cursor += count
    }
    console.log(
      `validation vs three: rigid maxErr=${maxRigid.toFixed(6)}m ${maxRigid < 1e-3 ? 'OK' : 'FAIL'}; ` +
        `skinned(dominant-joint) maxErr=${maxSkinned.toFixed(4)}m ${maxSkinned < 0.08 ? 'OK' : 'FAIL'}`,
    )
    if (maxRigid >= 1e-3 || maxSkinned >= 0.08) process.exit(1)
  }

  /* --------------------------------------------------------------- write */
  let headerJson = JSON.stringify({
    version: 1,
    width,
    height,
    carriers: carriers.length,
    fps: BAKE_FPS,
    restHeight: +restHeight.toFixed(4),
    vertexCount: positions.length / 3,
    indexCount: indices.length,
    clips: clipMeta.map(({ name, row, frames, fps, duration, loop }) => ({ name, row, frames, fps, duration, loop })),
  })
  while ((4 + headerJson.length) % 4 !== 0) headerJson += ' '
  const header = Buffer.from(headerJson, 'utf8')
  const posB = Buffer.from(new Float32Array(positions).buffer)
  const norB = Buffer.from(new Float32Array(normals).buffer)
  const colB = Buffer.from(new Float32Array(colors).buffer)
  const bonB = Buffer.from(new Float32Array(bones).buffer)
  const idxB = Buffer.from(new Uint32Array(indices).buffer)
  const texB = Buffer.from(tex.buffer)
  const out = Buffer.alloc(4 + header.length + posB.length + norB.length + colB.length + bonB.length + idxB.length + texB.length)
  let o = 0
  out.writeUInt32LE(header.length, 0)
  o = 4
  for (const b of [header, posB, norB, colB, bonB, idxB, texB]) {
    b.copy(out, o)
    o += b.length
  }
  writeFileSync(OUT, out)
  console.log(`wrote ${OUT}: ${(out.length / 1024).toFixed(0)}KB (${width}x${height} RGBA32F + ${positions.length / 3} verts)`)
}

const [srcArg, outArg] = process.argv.slice(2)
if (srcArg && outArg) {
  await bake(srcArg, outArg)
} else {
  await bake('public/models/RobotExpressive.glb', 'public/assets/models/citizen-bot.bin')
}
