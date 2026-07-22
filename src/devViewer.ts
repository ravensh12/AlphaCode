/* ============================================================================
   Dev-only standalone model viewer (viewer.html) — visual QA for GLBs and
   animation clips outside the game. NOT part of the production build (vite
   only bundles index.html). Query params:

     ?model=/assets/meshy/character/character-hero-a-idle.glb
     &anims=/assets/models/soldier-anims.glb   side-load clips from another GLB
     &clip=0            play animations[0] (index, clip NAME, or 'none' = bind)
     &t=0.5             sample the clip at this time (seconds)
     &angle=30          orbit azimuth in degrees (0 = front, +z toward camera)
     &height=1.76       normalize model height to this (meters; 0 = raw)
     &dist=2.6          camera distance multiple of model height
     &ground=1          draw the ground grid

   The page sets window.__viewerReady = true once the frame is rendered, so
   the screenshot harness (scripts/view-model.mjs) knows when to capture.
   ========================================================================== */
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getKTX2Loader, getDRACOLoader } from './components/game3d/assetLoaders'
import { MeshoptDecoder } from 'three-stdlib'

declare global {
  interface Window {
    __viewerReady?: boolean
    __viewerError?: string
  }
}

const params = new URLSearchParams(location.search)
const modelUrl = params.get('model') ?? '/assets/meshy/character/character-hero-a-idle.glb'
const animsUrl = params.get('anims')
const clipIndex = params.get('clip') ?? '0'
const clipTime = Number(params.get('t') ?? '0')
const angleDeg = Number(params.get('angle') ?? '30')
const targetHeight = Number(params.get('height') ?? '0')
const distMul = Number(params.get('dist') ?? '2.4')
const ground = params.get('ground') !== '0'
// Optional gun-in-hand QA: ?gun=/world/weapons/...glb&hand=RightHand — attaches
// the gun to the named bone (mirrors MeshyHero's runtime hand-attach). GUN_TUNE
// mirrors the constants in MeshyHero.tsx so what you see here is what ships.
const gunUrl = params.get('gun')
const handBone = params.get('hand') ?? 'RightHand'
const GUN_TUNE = {
  position: [0.02, -0.03, 0.06] as [number, number, number],
  rotation: [0, Math.PI, 0] as [number, number, number],
  scale: 0.85,
}

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(1)
renderer.shadowMap.enabled = true
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#3a4148')
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 200)

scene.add(new THREE.HemisphereLight('#eef2ff', '#3d4238', 0.85))
const sun = new THREE.DirectionalLight('#fff0d8', 2.4)
sun.position.set(3, 6, 4)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
scene.add(sun)
scene.add(new THREE.DirectionalLight('#9fc2ff', 0.5).translateX(-4).translateY(3).translateZ(-3))

if (ground) {
  const mat = new THREE.MeshStandardMaterial({ color: '#4a525b', roughness: 0.95 })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat)
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  scene.add(plane)
  const grid = new THREE.GridHelper(40, 40, 0x666e78, 0x555c66)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.4
  scene.add(grid)
}

const info = document.getElementById('info')!

async function main() {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getDRACOLoader())
  loader.setKTX2Loader(getKTX2Loader(renderer))
  loader.setMeshoptDecoder(
    typeof MeshoptDecoder === 'function' ? (MeshoptDecoder as unknown as () => unknown)() : MeshoptDecoder,
  )
  const gltf = await loader.loadAsync(modelUrl)
  const root = cloneSkeleton(gltf.scene)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh || (mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) {
      mesh.castShadow = true
      mesh.frustumCulled = false
    }
  })
  scene.add(root)

  // Animation sample. Clips come from the model itself, or a side-loaded GLB
  // (e.g. the retargeted Soldier clips) whose tracks bind onto `root` by bone
  // name. `clip` may be an index OR a clip name.
  const clips = animsUrl ? (await loader.loadAsync(animsUrl)).animations : gltf.animations
  const mixer = new THREE.AnimationMixer(root)
  let clipName = 'none'
  if (clipIndex !== 'none' && clips.length > 0) {
    const byName = clips.find((c) => c.name === clipIndex)
    const clip = byName ?? clips[Math.min(clips.length - 1, Number(clipIndex) || 0)]
    clipName = clip.name
    const action = mixer.clipAction(clip)
    action.play()
    mixer.setTime(Math.min(clipTime, Math.max(0, clip.duration - 1e-3)))
  }
  root.updateMatrixWorld(true)

  // Measure bounds (skinned-aware) for normalization + framing.
  const union = new THREE.Box3()
  const local = new THREE.Box3()
  let any = false
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh && !(mesh as unknown as THREE.Mesh).isMesh) return
    const g = (mesh as THREE.Mesh).geometry
    if (!g) return
    if (mesh.isSkinnedMesh) mesh.computeBoundingBox()
    else g.computeBoundingBox()
    const box = mesh.isSkinnedMesh ? mesh.boundingBox : g.boundingBox
    if (!box) return
    local.copy(box).applyMatrix4(mesh.matrixWorld)
    union.union(local)
    any = true
  })
  if (!any) union.setFromObject(root)
  const size = union.max.clone().sub(union.min)
  let scale = 1
  if (targetHeight > 0 && size.y > 1e-3) scale = targetHeight / size.y
  root.scale.setScalar(scale)
  // Recentre: feet on ground at origin.
  root.position.set(
    -((union.min.x + union.max.x) / 2) * scale,
    -union.min.y * scale,
    -((union.min.z + union.max.z) / 2) * scale,
  )
  root.updateMatrixWorld(true)

  // Optional: attach a gun to a hand bone (QA mirror of MeshyHero runtime).
  // Done AFTER scale/reposition so bounds aren't skewed and the bone's world
  // scale (which we cancel) already includes root.scale → offsets are metres.
  if (gunUrl) {
    const gunScene = cloneSkeleton((await loader.loadAsync(gunUrl)).scene)
    gunScene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.frustumCulled = false
      }
    })
    const bone = root.getObjectByName(handBone)
    if (bone) {
      root.updateMatrixWorld(true)
      const holder = new THREE.Group()
      bone.add(holder)
      const bs = new THREE.Vector3()
      bone.getWorldScale(bs)
      holder.scale.setScalar(1 / (bs.x || 1)) // cancel bone world scale → metres
      gunScene.position.set(...GUN_TUNE.position)
      gunScene.rotation.set(...GUN_TUNE.rotation)
      gunScene.scale.setScalar(GUN_TUNE.scale)
      holder.add(gunScene)
      root.updateMatrixWorld(true)
    } else {
      info.textContent = `WARN: hand bone '${handBone}' not found`
    }
  }

  const h = size.y * scale
  const rad = (angleDeg * Math.PI) / 180
  const d = Math.max(0.8, h * distMul)
  camera.position.set(Math.sin(rad) * d, h * 0.62, Math.cos(rad) * d)
  camera.lookAt(0, h * 0.48, 0)

  info.textContent = [
    modelUrl,
    `clips: ${clips.map((a) => a.name).join(' | ') || '(none)'}`,
    `playing: ${clipName} @ t=${clipTime}s  angle=${angleDeg}°  raw h=${size.y.toFixed(2)} scale=${scale.toFixed(3)}`,
  ].join('\n')

  renderer.render(scene, camera)
  window.__viewerReady = true
}

main().catch((err) => {
  window.__viewerError = String(err)
  info.textContent = `ERROR: ${String(err)}`
})
