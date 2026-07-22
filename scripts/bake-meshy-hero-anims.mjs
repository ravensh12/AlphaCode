// Consolidate the Meshy hero-a movement set into ONE small side-loaded GLB
// (bones + clips, no skinned mesh) so the native Meshy player can play its
// FULL moveset from a single fetch.
//
//   node scripts/bake-meshy-hero-anims.mjs
//
// WHY this exists (root-cause fix, not a retarget):
//   The old pipeline RETARGETED these Meshy clips onto the legacy three.js
//   Soldier rig (scripts/bake-soldier-anims.mjs). That cross-rig transfer is
//   lossy — different bind pose + bone roll turned the vault into a crumpled
//   cower, flattened the run-and-gun arms, etc. (see e2e-shots/cmp-*). EVERY
//   clip we need already exists NATIVELY on the SAME 24-joint hero-a armature
//   (verified: scripts/inspect-rig.mjs shows identical joints for the shipped
//   idle GLB and the phase-2/3 raw sources). So here we simply COPY each
//   clip's tracks verbatim onto the hero-a skeleton — no delta math, no
//   retarget — and bake them into public/assets/meshy/character/
//   character-hero-a-anims.glb. Playing these on their own rig is pixel-exact
//   to how Meshy authored them.
//
// Root motion: the ThirdPersonController owns ALL horizontal travel, so Hips
// X/Z translation is zeroed (the vertical bob is kept). Everything else is
// left untouched.
import { readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { MeshoptDecoder } from 'meshoptimizer'

// Node 22 has Blob but not FileReader — shim the two methods GLTFExporter uses.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf
        this.onloadend?.()
      })
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`
        this.onloadend?.()
      })
    }
  }
}

const SHIPPED = 'public/assets/meshy/character'
const RAW = 'assets-src/meshy/raw'
const RIG_SRC = `${SHIPPED}/character-hero-a-idle.glb`
const OUT = `${SHIPPED}/character-hero-a-anims.glb`

// clip key (played by MeshyHero) → { file, dir }. All sources share the hero-a
// 24-joint armature, so their tracks bind onto the rig by bone name 1:1.
const CLIPS = [
  { name: 'idle', file: 'character-hero-a-idle.glb', dir: SHIPPED },
  { name: 'walk', file: 'character-hero-a-walk.glb', dir: SHIPPED },
  { name: 'run', file: 'character-hero-a-run.glb', dir: SHIPPED },
  { name: 'sprint', file: 'character-hero-a-sprint.glb', dir: SHIPPED },
  { name: 'jump', file: 'character-hero-a-jump.glb', dir: SHIPPED },
  { name: 'crouch', file: 'character-hero-a-crouch.glb', dir: SHIPPED },
  { name: 'dash', file: 'character-hero-a-dash.glb', dir: SHIPPED },
  { name: 'shoot', file: 'character-hero-a-shoot.glb', dir: SHIPPED },
  { name: 'slash', file: 'character-hero-a-slash.glb', dir: SHIPPED },
  { name: 'hit', file: 'character-hero-a-hit.glb', dir: SHIPPED },
  { name: 'victory', file: 'character-hero-a-victory.glb', dir: SHIPPED },
  // Phase-2/3 directional + traversal set (raw-only native sources).
  { name: 'vault', file: 'character-hero-a-vault.glb', dir: RAW },
  { name: 'strafeL', file: 'character-hero-a-strafe-left.glb', dir: RAW },
  { name: 'strafeR', file: 'character-hero-a-strafe-right.glb', dir: RAW },
  { name: 'back', file: 'character-hero-a-shoot-back.glb', dir: RAW },
  { name: 'sprintAim', file: 'character-hero-a-sprint-aim.glb', dir: RAW },
  { name: 'turnL', file: 'character-hero-a-turn-left.glb', dir: RAW },
  { name: 'turnR', file: 'character-hero-a-turn-right.glb', dir: RAW },
]

/** Strip images/textures so the Node GLTFLoader never touches image decode. */
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
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
}

await MeshoptDecoder.ready
const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const parse = (arraybuf) => new Promise((res, rej) => loader.parse(arraybuf, '', res, rej))

/**
 * Trim a clip to what actually drives the pose: every bone's ROTATION plus the
 * Hips VERTICAL bob. Meshy exports full T/R/S tracks per joint, but scale is
 * constant and only the Hips translates — dropping the rest is pose-identical
 * and roughly thirds the file. The Hips X/Z are zeroed (the controller owns all
 * horizontal travel); the Y bob is kept.
 */
function trimClip(clip) {
  const tracks = []
  for (const track of clip.tracks) {
    if (track.name.endsWith('.quaternion')) {
      tracks.push(track)
    } else if (track.name.endsWith('Hips.position')) {
      const v = track.values
      const x0 = v[0]
      const z0 = v[2]
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0
        v[i + 2] = z0
      }
      tracks.push(track)
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}

/* --------------------------------------------------------------- rig base -- */
const rigGltf = await parse(loadGlbStripped(RIG_SRC))
const rigScene = rigGltf.scene

const bakedClips = []
const report = []
for (const spec of CLIPS) {
  const gltf = await parse(loadGlbStripped(`${spec.dir}/${spec.file}`))
  const src = gltf.animations[0]
  if (!src) throw new Error(`${spec.file}: no animation`)
  const clip = trimClip(src.clone())
  clip.name = spec.name
  bakedClips.push(clip)
  report.push(
    `  ${spec.name.padEnd(10)} ← ${spec.file.replace('character-hero-a-', '').padEnd(20)} ` +
      `tracks=${String(clip.tracks.length).padStart(3)} dur=${clip.duration.toFixed(2)}s`,
  )
}

console.log(`\nCopied ${bakedClips.length} native hero-a clips (NO retarget):`)
console.log(report.join('\n'))

/* ----------------------------------------------------------------- export -- */
// Bones only (drop the skinned mesh — the runtime binds these clips onto the
// cloned idle mesh by bone name).
const toRemove = []
rigScene.traverse((o) => {
  if (o.isSkinnedMesh || o.isMesh) toRemove.push(o)
})
for (const m of toRemove) m.parent?.remove(m)

const exporter = new GLTFExporter()
const glb = await new Promise((res, rej) =>
  exporter.parse(
    rigScene,
    (result) => res(result),
    (err) => rej(err),
    { binary: true, animations: bakedClips, onlyVisible: false, trs: true },
  ),
)
const buf = Buffer.from(glb)
writeFileSync(OUT, buf)
console.log(`\nwrote ${OUT}: ${(buf.length / 1024).toFixed(1)} KB (${bakedClips.length} clips, bones-only)`)
