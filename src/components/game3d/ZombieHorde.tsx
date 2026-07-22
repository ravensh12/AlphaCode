import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import { SIM } from './simulation'
import { radialGlowTexture } from './proceduralTextures'
import { configureAssetLoaders } from './decoderConfig'
import { extendGltfLoader } from './assetLoaders'
import {
  VARIANTS,
  VAR_NORMAL,
  VAR_RUNNER,
  VAR_BRUTE,
  VAR_MUTANT,
  VAR_GLITCH,
  SPAWN_RISE,
  DEATH_FALL,
  DEREZ_TIME,
  SPIT_WINDUP,
  SLAM_WINDUP,
  type ZombieSlot,
} from './zombieTypes'

/* ============================================================================
   THE HORDE, FOR REAL — crowd-skinned zombies in a handful of draw calls.

   Real rigged characters (Quaternius, CC0) with their actual motion clips
   (Walk/Run/Idle/attacks/HitReact/Death) for all 90 zombies at once:

   - scripts/bake-zombie-anim.mjs bakes each model's BONE MATRICES per clip
     (the exact matrices three's skinning shader would compute, pre-folded)
     into a small RGBA32F texture.
   - The vertex shader does true 4-bone skinning per vertex by fetching two
     adjacent frames from that texture and blending — REAL skinned animation
     with zero AnimationMixers and zero per-zombie draw calls.
   - TWO rigs for breed identity: the standard zombie body for most breeds and
     a hulking enemy body for brutes. Each rig is ONE InstancedMesh (+ its
     shadow-depth twin), so the whole horde is 2 body draws + 2 shadow draws
     + 1 blob-shadow draw.
   - Real sun shadows: a custom depth material runs the same baked-bone
     skinning, so the shadow silhouettes actually walk.
   - Per-instance attributes drive the rest: clip row/length/phase (aAnim),
     de-rez dissolve / hit flash / telegraph glow (aFx), breed tint + per-body
     brightness variation (instanceColor).
   - The CombatSystem's simulation is untouched: this component only READS the
     zombie slots each frame and derives clips + poses from sim state, so
     gameplay cannot drift.
   ========================================================================== */

const RIG_DEFS = [
  {
    model: '/models/Zombie.glb',
    anim: '/models/ZombieAnim.bin',
    /** World height (m) a scale-1.0 breed should stand. */
    targetHeight: 1.64,
  },
  {
    model: '/models/ZombieBrute.glb',
    anim: '/models/ZombieBruteAnim.bin',
    targetHeight: 1.7, // × brute breed scale (1.55) ≈ a 2.6m monster
  },
] as const

/** Realism rebuild — wave-2.1 ORGANIC Meshy zombie rigs (undead shambler +
 *  undead brute hulk; the earlier android/secbot pair read as robots), baked
 *  into the SAME bone-matrix bank format via scripts/bake-meshy-crowd.mjs.
 *  The horde renders DECIMATED crowd copies (scripts/decimate-glb.mjs, ~10k
 *  tris — the full 20k rigs at 90 instances × 4 passes were 44M verts/frame). */
const MESHY_RIG_DEFS = [
  {
    model: '/assets/models/zombie-flesh-crowd.glb',
    anim: '/assets/models/zombie-flesh.bin',
    targetHeight: 1.68,
  },
  {
    model: '/assets/models/zombie-hulk-crowd.glb',
    anim: '/assets/models/zombie-hulk.bin',
    targetHeight: 1.72, // × brute breed scale (1.55) ≈ a 2.65m monster
  },
] as const

/** Which rig each breed renders with (index into the rig defs): the smooth
 *  shambler body for most breeds, the chunky armored hulk for brutes. */
const VARIANT_RIG = [0, 0, 1, 0, 0, 0]

/** The organic Meshy rigs ARE the horde. The wave-1 RIG_DEFS above stay
 *  solely as a manual fallback switch if the meshy banks ever have to be
 *  pulled. */
const USE_MESHY_HORDE = true
const ACTIVE_RIG_DEFS = USE_MESHY_HORDE ? MESHY_RIG_DEFS : RIG_DEFS

// Self-hosted decoder paths must be set before the first loader is created.
// Only the wave-1 GLBs are preloaded — drei's preload builds a loader WITHOUT
// the KTX2 transcoder, which would poison the cache for the Meshy rigs (their
// component load attaches the transcoder itself).
configureAssetLoaders()
if (!USE_MESHY_HORDE) for (const def of RIG_DEFS) useGLTF.preload(def.model)

/** Locomotion reference speeds: the ground speed (m/s) at which each cycle
 *  plays at 1× so the feet plant instead of skating. Clip-intrinsic (authored
 *  stride speed) — deliberately NOT scaled with the global -12% pace pass:
 *  rate = sim speed / REF already tracks the slower breeds 1:1, so feet stay
 *  planted at the new velocities (scaling the refs would over-stride ~13%). */
const WALK_REF = 1.5
const RUN_REF = 4.4
const RATE_MIN = 0.55
const RATE_MAX = 2.7
/** Seconds the HitReact clip owns the body after a non-fatal hit. */
const HIT_PLAY = 0.3
/** Contact deaths: the corpse throws one last punch, then de-rezzes fast. */
const CONTACT_PUNCH = 0.5
/** Dash deaths: sliced — no fall, just a fast de-rez from the live pose. */
const DASH_DEREZ = 0.3

type ClipMeta = { name: string; row: number; frames: number; fps: number; duration: number; loop: boolean }
type AnimBank = {
  tex: THREE.DataTexture
  clips: Record<string, ClipMeta>
  restHeight: number
}

/** Parse a bake: [u32 headerLen][JSON][Float32 RGBA texels]. */
function parseAnimBank(buf: ArrayBuffer): AnimBank {
  const headerLen = new DataView(buf).getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen))) as {
    width: number
    height: number
    restHeight?: number
    clips: ClipMeta[]
  }
  const data = new Float32Array(buf, 4 + headerLen)
  const tex = new THREE.DataTexture(data, header.width, header.height, THREE.RGBAFormat, THREE.FloatType)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  const clips: Record<string, ClipMeta> = {}
  for (const c of header.clips) clips[c.name] = c
  return { tex, clips, restHeight: header.restHeight ?? 1.2 }
}

/* ------------------------------------------------------------------ shader */

const VERT_PARS = /* glsl */ `
uniform sampler2D uBoneTex;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec4 aAnim;   // x=row start, y=frame count, z=phase (frames), w=unused
attribute vec4 aFx;     // x=dissolve, y=hit flash, z=telegraph glow, w=unused
mat4 zBoneMat( const in float j, const in int row ) {
  int x = int( j ) * 4;
  return mat4(
    texelFetch( uBoneTex, ivec2( x, row ), 0 ),
    texelFetch( uBoneTex, ivec2( x + 1, row ), 0 ),
    texelFetch( uBoneTex, ivec2( x + 2, row ), 0 ),
    texelFetch( uBoneTex, ivec2( x + 3, row ), 0 ) );
}
mat4 zSkinMat() {
  float zFrames = max( aAnim.y - 1.0, 0.0 );
  float zF = clamp( aAnim.z, 0.0, zFrames - 0.0005 );
  int zRowA = int( aAnim.x + floor( zF ) );
  int zRowB = int( aAnim.x + min( floor( zF ) + 1.0, zFrames ) );
  float zT = fract( zF );
  return (
    zBoneMat( skinIndex.x, zRowA ) * skinWeight.x
    + zBoneMat( skinIndex.y, zRowA ) * skinWeight.y
    + zBoneMat( skinIndex.z, zRowA ) * skinWeight.z
    + zBoneMat( skinIndex.w, zRowA ) * skinWeight.w ) * ( 1.0 - zT )
    + (
    zBoneMat( skinIndex.x, zRowB ) * skinWeight.x
    + zBoneMat( skinIndex.y, zRowB ) * skinWeight.y
    + zBoneMat( skinIndex.z, zRowB ) * skinWeight.z
    + zBoneMat( skinIndex.w, zRowB ) * skinWeight.w ) * zT;
}
`

// Lit material: skin the normal first (beginnormal runs before begin_vertex),
// reuse the same matrix for the position, and carry fx varyings to the fragment.
const VERT_NORMAL_LIT = /* glsl */ `
mat4 zSkin = zSkinMat();
vec3 objectNormal = normalize( mat3( zSkin ) * vec3( normal ) );
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`

const VERT_POS_LIT = /* glsl */ `
vec3 transformed = ( zSkin * vec4( position, 1.0 ) ).xyz;
vZLocal = transformed;
vZFx = aFx;
`

// Depth (shadow) material: no normals needed — skin the position only, so the
// shadow silhouette follows the exact same animation as the lit body.
const VERT_POS_DEPTH = /* glsl */ `
vec3 transformed = ( zSkinMat() * vec4( position, 1.0 ) ).xyz;
`

const FRAG_PARS = /* glsl */ `
uniform float uSimNight;
uniform float uAoTop;
varying vec4 vZFx;
varying vec3 vZLocal;
float zHash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}
`

// Hit flash + telegraph glow ride the emissive term so they read in any light.
const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
{
  totalEmissiveRadiance += vec3( 1.6, 0.35, 0.18 ) * vZFx.y;
  #ifdef USE_COLOR
    totalEmissiveRadiance += vColor * vZFx.z * 0.85;
  #endif
}
`

// De-rez dissolve (chunky discard + chromatic edge burst — the Living
// Simulation's death language), grounded-contact AO and a day/night rim.
const FRAG_DISSOLVE = /* glsl */ `
if ( vZFx.x > 0.001 ) {
  float zH = zHash13( floor( vZLocal * 9.0 ) + 0.5 );
  if ( zH < vZFx.x ) discard;
  float zEr = 1.0 - smoothstep( 0.0, 0.24, zH - vZFx.x );
  float zEg = 1.0 - smoothstep( 0.0, 0.12, zH - vZFx.x );
  float zEb = 1.0 - smoothstep( 0.0, 0.34, zH - vZFx.x );
  float zBurst = sin( min( vZFx.x * 2.2, 1.0 ) * 3.14159 );
  vec3 zEdge = mix( vec3( zEr * 1.2, zEg * 2.4, zEb * 2.8 ),
    vec3( zEr * 2.8, zEg * 0.9, zEb * 1.6 ), uSimNight );
  outgoingLight += zEdge * zBurst;
}
{
  // Contact AO: bodies darken toward the feet so the crowd sits IN the street
  // instead of floating on it.
  outgoingLight *= mix( 0.78, 1.0, smoothstep( 0.0, uAoTop, vZLocal.y ) );
  // Rim light: cool simulation-cyan by day, blood-red under corruption night.
  vec3 zRimCol = mix( vec3( 0.45, 0.85, 1.0 ), vec3( 1.0, 0.16, 0.2 ), uSimNight );
  float zRim = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 3.0 );
  outgoingLight += zRimCol * zRim * ( 0.28 + uSimNight * 0.5 );
}
#include <opaque_fragment>
`

function makeZombieMaterial(
  map: THREE.Texture,
  boneTex: THREE.DataTexture,
  aoTop: number,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0.0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBoneTex = { value: boneTex }
    shader.uniforms.uSimNight = SIM.night
    shader.uniforms.uAoTop = { value: aoTop }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\nvarying vec4 vZFx;\nvarying vec3 vZLocal;`)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL_LIT)
      .replace('#include <begin_vertex>', VERT_POS_LIT)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
      .replace('#include <opaque_fragment>', FRAG_DISSOLVE)
  }
  mat.customProgramCacheKey = () => 'zombie-vat-v2'
  return mat
}

/** Shadow-pass twin: the SAME baked-bone skinning, depth-only. Without this,
 *  shadow maps would render the bind pose (a T-posing shadow under a walking
 *  zombie). */
function makeZombieDepthMaterial(boneTex: THREE.DataTexture): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBoneTex = { value: boneTex }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', VERT_POS_DEPTH)
  }
  mat.customProgramCacheKey = () => 'zombie-vat-depth-v2'
  return mat
}

/* ------------------------------------------------------------ clip control */

type AnimState = {
  clip: ClipMeta | null
  phase: number
  /** bornAt of the slot generation this state belongs to (detects reuse). */
  gen: number
  rig: number
  px: number
  pz: number
  speed: number
  /** Smoothed forward/backward sign of travel vs facing (backpedal detect). */
  fwd: number
}

// Grounded per-breed tints multiplied over each rig's atlas — close to 1.0 so
// the painted texture carries the look, with just enough shift to read breed
// identity at a glance. Per-body brightness jitter is layered on top.
const TINTS = [
  new THREE.Color(0.8, 1.02, 0.78), // shambler — sickly necrotic green
  new THREE.Color(1.2, 1.12, 0.76), // runner — jaundiced, drained
  new THREE.Color(1.1, 0.62, 0.55), // brute — blood-flushed hulk
  new THREE.Color(0.74, 1.26, 0.72), // mutant — toxic saturation
  new THREE.Color(1.0, 0.8, 1.24), // spitter — bruised violet
  new THREE.Color(0.6, 1.4, 1.5), // glitch — simulation cyan
]
const FLASH_TINT = new THREE.Color(1.6, 0.6, 0.5)
const SPIT_GLOW = new THREE.Color(1.5, 1.7, 0.5)
const SLAM_GLOW = new THREE.Color(1.8, 0.9, 0.3)
const GLITCH_GLOW = new THREE.Color(0.5, 1.7, 1.8)

type Rig = {
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
  depthMaterial: THREE.MeshDepthMaterial
  bank: AnimBank
  /** Final uniform scale for breed scale 1.0. */
  baseScale: number
  anim: THREE.InstancedBufferAttribute
  fx: THREE.InstancedBufferAttribute
}

export const ZombieHorde = memo(function ZombieHorde({
  zombies,
  paused,
  shadows = true,
  nearShadowOnly = false,
}: {
  zombies: ZombieSlot[]
  paused: boolean
  /** Real sun shadows for the crowd (two skinned depth passes) — HIGH tier
   *  only; weaker GPUs keep the cheap blob shadows. */
  shadows?: boolean
  /** Overworld (cascaded sun): cast into the crisp near cascade ONLY — the
   *  outer cascades skip the horde's skinned depth passes entirely. Arenas
   *  (single shadow light) leave this off. */
  nearShadowOnly?: boolean
}) {
  const gl = useThree((s) => s.gl)
  const gltfs = useGLTF(
    ACTIVE_RIG_DEFS.map((d) => d.model),
    true,
    true,
    // The Meshy rigs carry KTX2 textures; the wave-1 GLBs ignore the hook.
    extendGltfLoader(gl),
  )
  const animBufs = useLoader(
    THREE.FileLoader,
    ACTIVE_RIG_DEFS.map((d) => d.anim),
    (l) => {
      ;(l as THREE.FileLoader).setResponseType('arraybuffer')
    },
  ) as unknown as ArrayBuffer[]

  const count = zombies.length

  const rigs = useMemo<Rig[]>(() => {
    return ACTIVE_RIG_DEFS.map((def, ri) => {
      const bank = parseAnimBank(animBufs[ri])
      const geos: THREE.BufferGeometry[] = []
      let map: THREE.Texture | null = null
      gltfs[ri].scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh
        if (!m.isSkinnedMesh) return
        geos.push(m.geometry)
        const src = m.material as THREE.MeshStandardMaterial
        if (src.map) map = src.map
      })
      const geometry = geos.length > 1 ? mergeGeometries(geos, false)! : geos[0].clone()
      geometry.computeBoundingSphere()
      const atlas = map! as THREE.Texture
      atlas.colorSpace = THREE.SRGBColorSpace
      const material = makeZombieMaterial(atlas, bank.tex, bank.restHeight * 0.4)
      const depthMaterial = makeZombieDepthMaterial(bank.tex)
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4)
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4)
      anim.setUsage(THREE.DynamicDrawUsage)
      fx.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('aAnim', anim)
      geometry.setAttribute('aFx', fx)
      return {
        geometry,
        material,
        depthMaterial,
        bank,
        baseScale: def.targetHeight / bank.restHeight,
        anim,
        fx,
      }
    })
  }, [gltfs, animBufs, count])

  useEffect(
    () => () => {
      for (const r of rigs) {
        r.geometry.dispose()
        r.material.dispose()
        r.depthMaterial.dispose()
        r.bank.tex.dispose()
      }
    },
    [rigs],
  )

  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([])
  const shadowMesh = useRef<THREE.InstancedMesh>(null)

  const shadowAssets = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.62, 20)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.26,
      alphaMap: radialGlowTexture(),
      depthWrite: false,
      fog: false,
    })
    return { geo, mat }
  }, [])
  useEffect(
    () => () => {
      shadowAssets.geo.dispose()
      shadowAssets.mat.dispose()
    },
    [shadowAssets],
  )

  const anims = useMemo<AnimState[]>(
    () =>
      Array.from({ length: count }, () => ({
        clip: null,
        phase: 0,
        gen: -1,
        rig: 0,
        px: 0,
        pz: 0,
        speed: 0,
        fwd: 1,
      })),
    [count],
  )

  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      col: new THREE.Color(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
    }),
    [],
  )

  // Hide every instance up front and seed instance colours so the color buffer
  // exists before the first visible frame (no mid-game shader recompile).
  useEffect(() => {
    const sh = shadowMesh.current
    for (let ri = 0; ri < rigs.length; ri++) {
      const m = meshRefs.current[ri]
      if (!m) continue
      for (let i = 0; i < count; i++) {
        m.setMatrixAt(i, scratch.hidden)
        m.setColorAt(i, TINTS[0])
      }
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
    if (sh) {
      for (let i = 0; i < count; i++) sh.setMatrixAt(i, scratch.hidden)
      sh.instanceMatrix.needsUpdate = true
    }
  }, [count, scratch, rigs])

  // Highest live slot per rig (persisted across frames so a de-rezzing corpse
  // in a high slot keeps its tail until it fully hides).
  const liveTail = useRef<[number, number]>([-1, -1])

  useFrame((state, dtRaw) => {
    const sh = shadowMesh.current
    if (!sh) return
    for (let ri = 0; ri < rigs.length; ri++) if (!meshRefs.current[ri]) return
    const now = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const { o, col, hidden } = scratch
    liveTail.current[0] = -1
    liveTail.current[1] = -1

    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i]
      const a = anims[i]
      if (!z.active) {
        if (a.gen !== -1) {
          a.gen = -1
          for (let ri = 0; ri < rigs.length; ri++) meshRefs.current[ri]!.setMatrixAt(i, hidden)
          sh.setMatrixAt(i, hidden)
          const fxArr = rigs[a.rig].fx.array as Float32Array
          fxArr[i * 4] = 0
        }
        continue
      }

      // Slot (re)spawned → reset the visual state for the new zombie.
      if (a.gen !== z.bornAt) {
        a.gen = z.bornAt
        a.clip = null
        a.phase = z.seed * 7.3 // desync pack gaits
        a.px = z.pos.x
        a.pz = z.pos.z
        a.speed = 0
        a.fwd = 1
        const nextRig = VARIANT_RIG[z.variant] ?? 0
        if (nextRig !== a.rig) {
          meshRefs.current[a.rig]!.setMatrixAt(i, hidden)
          a.rig = nextRig
        }
      }

      const rig = rigs[a.rig]
      const mesh = meshRefs.current[a.rig]!
      const { clips } = rig.bank
      if (i > liveTail.current[a.rig]) liveTail.current[a.rig] = i

      // Measured ground speed (drives locomotion clip + rate, feet don't skate).
      if (!paused && dt > 0) {
        const vx = (z.pos.x - a.px) / dt
        const vz = (z.pos.z - a.pz) / dt
        const raw = Math.min(14, Math.hypot(vx, vz))
        a.speed += (raw - a.speed) * Math.min(1, dt * 10)
        // Retreating spitters keep facing the player while backing away — play
        // the cycle in reverse so the feet agree with the travel direction.
        const dot = vx * Math.sin(z.facing) + vz * Math.cos(z.facing)
        a.fwd += ((dot >= -0.15 ? 1 : -1) - a.fwd) * Math.min(1, dt * 8)
      }
      a.px = z.pos.x
      a.pz = z.pos.z

      const vdef = VARIANTS[z.variant]
      const dying = z.state === 'die'
      const sinceDie = now - z.dieAt
      const casting = !dying && z.castAt > 0
      const sinceHit = now - z.hitAt

      // ---- Clip selection (visual-only mapping of sim state) --------------
      let want: ClipMeta
      let rate = 1
      let loop = true
      if (dying) {
        if (z.dieHow === 'contact') {
          // One last lunge-punch at the player, then de-rez.
          want = clips.Punch
          rate = clips.Punch.duration / CONTACT_PUNCH
        } else if (z.dieHow === 'dash') {
          // Sliced: freeze the live pose (keep current clip, phase stops below).
          want = a.clip ?? clips.Walk
          rate = 0
        } else {
          want = clips.Death
          rate = (clips.Death.duration / DEATH_FALL) * 0.92
        }
        loop = false
      } else if (casting) {
        if (z.variant === VAR_BRUTE) {
          want = clips.Punch
          rate = clips.Punch.duration / SLAM_WINDUP
        } else {
          want = clips.Idle_Attack
          rate = (clips.Idle_Attack.duration / SPIT_WINDUP) * 0.42
        }
        loop = false
      } else if (sinceHit >= 0 && sinceHit < HIT_PLAY) {
        want = clips.HitReact
        rate = clips.HitReact.duration / HIT_PLAY
        loop = false
      } else {
        const runner = z.variant === VAR_RUNNER || z.variant === VAR_MUTANT
        if (a.speed < 0.25) {
          want = clips.Idle
          rate = 0.9 + (z.seed % 1) * 0.25
        } else if (runner || a.speed > 3.4) {
          want = clips.Run
          rate = THREE.MathUtils.clamp(a.speed / RUN_REF, RATE_MIN, RATE_MAX)
        } else {
          want = clips.Walk
          rate = THREE.MathUtils.clamp(a.speed / WALK_REF, RATE_MIN, RATE_MAX)
        }
        // Gait personality: every corpse keeps its own cadence.
        rate *= 0.9 + (0.5 + 0.5 * Math.sin(z.seed * 12.9898)) * 0.22
      }

      if (a.clip !== want) {
        a.clip = want
        // One-shots start at the top; loops keep the desynced phase. A dash
        // death keeps the exact pose it was sliced in (rate 0, no reset).
        if (!(dying && z.dieHow === 'dash')) {
          a.phase = loop ? a.phase % Math.max(1, want.frames - 1) : 0
        }
      }
      if (!paused && rate > 0) {
        const dir = loop && (want === clips.Walk || want === clips.Run) ? (a.fwd >= 0 ? 1 : -1) : 1
        a.phase += dir * rate * want.fps * dt
        const maxF = want.frames - 1
        if (loop) a.phase = ((a.phase % maxF) + maxF) % maxF
        else if (a.phase > maxF) a.phase = maxF
      }

      // ---- Root matrix ------------------------------------------------------
      const rise = THREE.MathUtils.clamp((now - z.bornAt) / SPAWN_RISE, 0, 1)
      let dissolve: number
      let bodyY = 0
      if (dying) {
        const derezStart = z.dieHow === 'dash' ? 0 : z.dieHow === 'contact' ? CONTACT_PUNCH : DEATH_FALL
        const derezLen = z.dieHow === 'dash' ? DASH_DEREZ : DEREZ_TIME
        dissolve = THREE.MathUtils.clamp((sinceDie - derezStart) / derezLen, 0, 1)
      } else {
        // Spawn = compile-in: the body de-rezzes INTO existence while rising.
        dissolve = 1 - rise
        bodyY = (rise - 1) * 0.42
      }

      const pop = sinceHit >= 0 && sinceHit < 0.2 && !dying ? Math.sin((sinceHit / 0.2) * Math.PI) : 0
      const castP = casting
        ? THREE.MathUtils.clamp((now - z.castAt) / (z.variant === VAR_BRUTE ? SLAM_WINDUP : SPIT_WINDUP), 0, 1)
        : 0
      const windScale = casting ? (z.variant === VAR_BRUTE ? 1 + 0.2 * castP : 1 + 0.1 * Math.sin(castP * Math.PI)) : 1
      const vscale = rig.baseScale * vdef.scale * windScale
      o.position.set(z.pos.x, bodyY, z.pos.z)
      o.rotation.set(0, z.facing, 0)
      o.scale.set(vscale * (1 + pop * 0.16), vscale * (1 - pop * 0.13), vscale * (1 + pop * 0.16))
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)

      // Soft contact blob under the real shadow — keeps bodies grounded at
      // night when the sun (and its shadow map) fades out.
      const shFade = (1 - dissolve) * (dying ? 1 : rise)
      o.position.set(z.pos.x, 0.03, z.pos.z)
      o.rotation.set(0, 0, 0)
      o.scale.set(vscale * shFade, 1, vscale * shFade)
      o.updateMatrix()
      sh.setMatrixAt(i, o.matrix)

      // ---- Per-instance attributes -----------------------------------------
      const base = i * 4
      const animArr = rig.anim.array as Float32Array
      const fxArr = rig.fx.array as Float32Array
      animArr[base] = a.clip.row
      animArr[base + 1] = a.clip.frames
      animArr[base + 2] = a.phase
      animArr[base + 3] = 0

      const flash = sinceHit >= 0 && sinceHit < 0.18 && !dying ? 1 - sinceHit / 0.18 : 0
      const teleAmt = casting ? (0.35 + 0.5 * Math.abs(Math.sin(now * 16))) * castP : 0
      const glitchAmt = z.variant === VAR_GLITCH && !dying ? 0.3 + 0.45 * Math.abs(Math.sin(now * 6 + z.seed)) : 0
      fxArr[base] = dissolve
      fxArr[base + 1] = flash
      fxArr[base + 2] = Math.max(teleAmt, glitchAmt * 0.8)
      fxArr[base + 3] = 0

      // ---- Tint: breed colour × per-body brightness, plus event glows -------
      col.copy(TINTS[z.variant] ?? TINTS[VAR_NORMAL])
      // Individual variation: each corpse is a little paler / grimier than its
      // neighbours so a pack never reads as copy-paste.
      const jitter = 0.86 + (0.5 + 0.5 * Math.sin(z.seed * 41.7)) * 0.26
      col.multiplyScalar(jitter)
      if (flash > 0) col.lerp(FLASH_TINT, flash * 0.7)
      if (teleAmt > 0) col.lerp(z.variant === VAR_BRUTE ? SLAM_GLOW : SPIT_GLOW, teleAmt)
      if (glitchAmt > 0) col.lerp(GLITCH_GLOW, glitchAmt)
      mesh.setColorAt(i, col)
    }

    for (let ri = 0; ri < rigs.length; ri++) {
      const m = meshRefs.current[ri]!
      m.instanceMatrix.needsUpdate = true
      rigs[ri].anim.needsUpdate = true
      rigs[ri].fx.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      // Vertex-budget guard: scale-0 "hidden" instances still run the skinned
      // vertex shader (13k verts each × camera + every shadow cascade). Trim
      // the instanced draw to the live slot tail so an empty daytime horde
      // costs ~zero and combat pays only for what's on the field.
      m.count = liveTail.current[ri] + 1
    }
    sh.instanceMatrix.needsUpdate = true
    sh.count = Math.max(liveTail.current[0], liveTail.current[1]) + 1
  })

  return (
    <>
      {/* Instances roam the whole map while the base bounds sit at the origin —
          culling would blink the crowd out as the camera turns. */}
      {rigs.map((rig, ri) => (
        <instancedMesh
          key={ri}
          ref={(el) => {
            meshRefs.current[ri] = el
            if (el && nearShadowOnly) {
              // 90 skinned instances × every cascade's depth pass was the
              // top vertex line item. Outer cascades (tagged by
              // CascadedSunlight) skip the horde: zero-count draws are
              // free, and the crisp near cascade still carries the shadows
              // that actually read on screen.
              el.onBeforeShadow = (_r, _s, _c, shadowCamera) => {
                if (shadowCamera.userData.outerCascade) {
                  el.userData.savedCount = el.count
                  el.count = 0
                }
              }
              el.onAfterShadow = (_r, _s, _c, shadowCamera) => {
                if (shadowCamera.userData.outerCascade) {
                  el.count = (el.userData.savedCount as number) ?? el.count
                }
              }
            }
          }}
          args={[rig.geometry, rig.material, count]}
          customDepthMaterial={rig.depthMaterial}
          frustumCulled={false}
          castShadow={shadows}
          receiveShadow
        />
      ))}
      <instancedMesh
        ref={shadowMesh}
        args={[shadowAssets.geo, shadowAssets.mat, count]}
        frustumCulled={false}
        renderOrder={1}
      />
    </>
  )
})
