// Retarget the Meshy hero's expressive clips onto the three.js Soldier rig and
// bake them into ONE small side-loaded GLB (bones + clips, no skinned mesh) so
// the Soldier — the restored default player — can play the full movement set
// (sprint / jump / crouch / dash / slash / shoot / hit / victory) instead of
// just its own Idle/Walk/Run mocap.
//
//   node scripts/bake-soldier-anims.mjs
//
// WHY a custom retarget (not SkeletonUtils.retargetClip):
//   The two rigs share a near-identical humanoid topology and bone NAMES
//   (Meshy `Spine01/Spine02/neck` ↔ mixamorig `Spine1/Spine2/Neck`, everything
//   else 1:1), which makes a clean transfer possible — but their armature roots
//   differ (Soldier carries a −90°X Z-up→Y-up root; the Meshy root is
//   identity). Both SCENES render Y-up, so we transfer each bone's rotation as
//   a SCENE-WORLD delta from its own bind pose (a frame both rigs agree on) and
//   re-express it in the Soldier's local bone space. Rotation only: the
//   ThirdPersonController owns all translation (jump height, dash lunge, …), so
//   baking root motion would double it.
//
// Output: public/assets/models/soldier-anims.glb  (quaternion tracks only)
import { readFileSync, writeFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { MeshoptDecoder } from 'meshoptimizer'

// three's GLTFExporter finalizes a binary GLB through the browser FileReader
// API. Node 22 ships Blob but not FileReader — shim the two methods the
// exporter uses (readAsArrayBuffer / readAsDataURL) over Blob.arrayBuffer().
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

const SOLDIER = 'public/models/Soldier.glb'
const HERO_DIR = 'public/assets/meshy/character'
// Phase-2 clips are raw-only (no shipped per-clip GLB — they exist solely as
// retarget sources; see scripts/meshy-hero-clips2.mjs). Read them from the
// raw download dir instead of the optimized library.
const RAW_DIR = 'assets-src/meshy/raw'
const OUT = 'public/assets/models/soldier-anims.glb'
const BAKE_FPS = 30

// state name → { file (hero-a clip), loop, dir? (defaults to HERO_DIR) }.
const CLIPS = [
  { name: 'sprint', file: 'character-hero-a-sprint.glb', loop: true },
  { name: 'jump', file: 'character-hero-a-jump.glb', loop: false },
  { name: 'crouch', file: 'character-hero-a-crouch.glb', loop: true },
  { name: 'dash', file: 'character-hero-a-dash.glb', loop: false },
  { name: 'slash', file: 'character-hero-a-slash.glb', loop: false },
  { name: 'shoot', file: 'character-hero-a-shoot.glb', loop: true },
  { name: 'hit', file: 'character-hero-a-hit.glb', loop: false },
  { name: 'victory', file: 'character-hero-a-victory.glb', loop: false },
  // Phase-2 run-and-gun / turn set (raw-only sources, action id in comment):
  { name: 'sprint-shoot', file: 'character-hero-a-sprint-shoot.glb', loop: true, dir: RAW_DIR }, // 98 Run and Shoot
  { name: 'strafe-left', file: 'character-hero-a-strafe-left.glb', loop: true, dir: RAW_DIR }, // 630 ForwardLeft Run Fight (inplace)
  { name: 'strafe-right', file: 'character-hero-a-strafe-right.glb', loop: true, dir: RAW_DIR }, // 631 ForwardRight Run Fight (inplace)
  { name: 'shoot-back', file: 'character-hero-a-shoot-back.glb', loop: true, dir: RAW_DIR }, // 680 Walk Backward While Shooting (inplace)
  { name: 'turn-left', file: 'character-hero-a-turn-left.glb', loop: false, dir: RAW_DIR }, // 576 Idle Turn Left
  { name: 'turn-right', file: 'character-hero-a-turn-right.glb', loop: false, dir: RAW_DIR }, // 586 Idle Turn Right
  // Phase-3 motion fixes (raw-only sources). The old `dash`/`jump`/
  // `sprint-shoot` names stay untouched; these are drop-in alternates the
  // controller can switch to by name without a re-bake:
  { name: 'vault', file: 'character-hero-a-vault.glb', loop: false, dir: RAW_DIR }, // 428 Unarmed Vault
  { name: 'hurdle', file: 'character-hero-a-hurdle.glb', loop: false, dir: RAW_DIR }, // 471 Jump Over Obstacle (640 inplace variant errors server-side; bake strips root motion anyway)
  { name: 'dash-burst', file: 'character-hero-a-dash-burst.glb', loop: true, dir: RAW_DIR }, // 673 Standard Forward Charge (inplace)
  { name: 'dash-slide', file: 'character-hero-a-dash-slide.glb', loop: false, dir: RAW_DIR }, // 516 Slide Light
  { name: 'jump-run', file: 'character-hero-a-jump-run.glb', loop: false, dir: RAW_DIR }, // 463 Run and Jump
  { name: 'sprint-aim', file: 'character-hero-a-sprint-aim.glb', loop: true, dir: RAW_DIR }, // 654 Rifle Charge (inplace)
]

// Soldier (sanitized) bone → Meshy hero bone. 22 shared humanoid joints; the
// Soldier's finger bones and the hero's head_end/headfront have no counterpart
// and are simply left at their bind pose.
const BONE_MAP = {
  mixamorigHips: 'Hips',
  mixamorigSpine: 'Spine',
  mixamorigSpine1: 'Spine01',
  mixamorigSpine2: 'Spine02',
  mixamorigNeck: 'neck',
  mixamorigHead: 'Head',
  mixamorigLeftShoulder: 'LeftShoulder',
  mixamorigLeftArm: 'LeftArm',
  mixamorigLeftForeArm: 'LeftForeArm',
  mixamorigLeftHand: 'LeftHand',
  mixamorigRightShoulder: 'RightShoulder',
  mixamorigRightArm: 'RightArm',
  mixamorigRightForeArm: 'RightForeArm',
  mixamorigRightHand: 'RightHand',
  mixamorigLeftUpLeg: 'LeftUpLeg',
  mixamorigLeftLeg: 'LeftLeg',
  mixamorigLeftFoot: 'LeftFoot',
  mixamorigLeftToeBase: 'LeftToeBase',
  mixamorigRightUpLeg: 'RightUpLeg',
  mixamorigRightLeg: 'RightLeg',
  mixamorigRightFoot: 'RightFoot',
  mixamorigRightToeBase: 'RightToeBase',
}

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
const parse = (arraybuf) =>
  new Promise((res, rej) => loader.parse(arraybuf, '', res, rej))

function firstSkinned(scene) {
  let sk = null
  scene.traverse((o) => {
    if (o.isSkinnedMesh && !sk) sk = o
  })
  return sk
}

function worldQuatMap(scene) {
  scene.updateMatrixWorld(true)
  const m = new Map()
  scene.traverse((o) => {
    if (o.isBone) {
      const q = new THREE.Quaternion()
      o.getWorldQuaternion(q)
      m.set(o.name, q)
    }
  })
  return m
}

/* --------------------------------------------------------------- Soldier ---- */
const soldierGltf = await parse(loadGlbStripped(SOLDIER))
const soldierScene = soldierGltf.scene
const soldierSkinned = firstSkinned(soldierScene)
const soldierBones = new Map(soldierSkinned.skeleton.bones.map((b) => [b.name, b]))
// Bind (rest) scene-world orientations for the Soldier — captured before any
// clip touches the rig.
const targetBind = worldQuatMap(soldierScene)
// The Hips' parent (the "Character" root) is never animated, so its world
// orientation is our fixed frame for the Hips' local rotation.
const hipsParentWorld = new THREE.Quaternion()
soldierBones.get('mixamorigHips').parent.getWorldQuaternion(hipsParentWorld)

// Parent (mapped) bone name for each Soldier bone we drive — every mapped bone
// except the Hips has a mapped bone as its scene-graph parent.
const parentMapped = new Map()
for (const targetName of Object.keys(BONE_MAP)) {
  const bone = soldierBones.get(targetName)
  const p = bone.parent
  parentMapped.set(targetName, p?.isBone && BONE_MAP[p.name] ? p.name : null)
}

const q0 = new THREE.Quaternion()
const q1 = new THREE.Quaternion()
const q2 = new THREE.Quaternion()

const bakedClips = []
const report = []

for (const spec of CLIPS) {
  const heroGltf = await parse(loadGlbStripped(`${spec.dir ?? HERO_DIR}/${spec.file}`))
  const heroScene = heroGltf.scene
  const heroBones = new Map(firstSkinned(heroScene).skeleton.bones.map((b) => [b.name, b]))
  const clip = heroGltf.animations[0]
  if (!clip) throw new Error(`${spec.file}: no animation`)

  // Bind (rest) scene-world orientations for the hero, before the clip plays.
  const sourceBind = worldQuatMap(heroScene)

  const mixer = new THREE.AnimationMixer(heroScene)
  mixer.clipAction(clip).play()

  const duration = clip.duration
  const frames = Math.max(2, Math.round(duration * BAKE_FPS) + 1)
  const dt = duration / (frames - 1)
  const times = new Float32Array(frames)
  // Per target bone: flat quaternion buffer (frames * 4).
  const values = new Map()
  for (const targetName of Object.keys(BONE_MAP)) {
    values.set(targetName, new Float32Array(frames * 4))
  }

  // Scratch: this frame's DESIRED scene-world quat per target bone.
  const desired = new Map()
  let maxAngleDeg = 0

  mixer.setTime(0)
  for (let f = 0; f < frames; f++) {
    const t = Math.min(duration - 1e-4, f * dt)
    mixer.setTime(t)
    heroScene.updateMatrixWorld(true)
    times[f] = f * dt

    // 1) Desired world orientation per mapped bone = (source world delta from
    //    its bind) applied to the Soldier's bind world orientation.
    for (const [targetName, sourceName] of Object.entries(BONE_MAP)) {
      const srcBone = heroBones.get(sourceName)
      srcBone.getWorldQuaternion(q0) // source current world
      const srcBind = sourceBind.get(sourceName)
      // delta = srcCur * srcBind⁻¹  (scene-world rotation since bind)
      q1.copy(srcBind).invert()
      q0.multiply(q1) // q0 = delta
      // desiredWorld = delta * targetBind
      q0.multiply(targetBind.get(targetName))
      desired.set(targetName, q0.clone())
    }

    // 2) Convert each desired world orientation into the Soldier's LOCAL bone
    //    space (relative to the parent's DESIRED world so the chain rebuilds
    //    exactly at runtime).
    for (const targetName of Object.keys(BONE_MAP)) {
      const parentName = parentMapped.get(targetName)
      const parentWorld = parentName ? desired.get(parentName) : hipsParentWorld
      q2.copy(parentWorld).invert().multiply(desired.get(targetName))
      q2.toArray(values.get(targetName), f * 4)
      if (f > 0) {
        // rough motion magnitude (sanity: a dead clip → ~0°).
        q1.fromArray(values.get(targetName), (f - 1) * 4)
        const ang = 2 * Math.acos(Math.min(1, Math.abs(q1.dot(q2))))
        maxAngleDeg = Math.max(maxAngleDeg, (ang * 180) / Math.PI)
      }
    }
  }

  const tracks = []
  for (const targetName of Object.keys(BONE_MAP)) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, times, values.get(targetName)),
    )
  }
  const baked = new THREE.AnimationClip(spec.name, duration, tracks)
  bakedClips.push(baked)
  report.push(
    `  ${spec.name.padEnd(8)} ← ${spec.file.replace('character-hero-a-', '').padEnd(11)} ` +
      `frames=${String(frames).padStart(3)} dur=${duration.toFixed(2)}s peakΔ/frame≈${maxAngleDeg.toFixed(1)}°`,
  )
}

console.log(`\nRetargeted ${bakedClips.length} clips onto the Soldier rig:`)
console.log(report.join('\n'))

/* ----------------------------------------------------------------- export -- */
// Export bones + clips only (drop the skinned meshes to keep the file tiny —
// the runtime binds these clips onto the real Soldier mesh by bone name).
const exportRoot = soldierScene
const toRemove = []
exportRoot.traverse((o) => {
  if (o.isSkinnedMesh || o.isMesh) toRemove.push(o)
})
for (const m of toRemove) m.parent?.remove(m)

const exporter = new GLTFExporter()
const glb = await new Promise((res, rej) =>
  exporter.parse(
    exportRoot,
    (result) => res(result),
    (err) => rej(err),
    { binary: true, animations: bakedClips, onlyVisible: false, trs: true },
  ),
)
const buf = Buffer.from(glb)
writeFileSync(OUT, buf)
console.log(`\nwrote ${OUT}: ${(buf.length / 1024).toFixed(1)} KB (${bakedClips.length} clips, bones-only)`)
