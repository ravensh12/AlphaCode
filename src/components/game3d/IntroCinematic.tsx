import { Suspense, memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, SMAA, Noise } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { SimulationDriver } from './SimulationDriver'
import { SIM } from './simulation'
import { RainSystem } from './weather/RainSystem'
import { ZombieHorde } from './ZombieHorde'
import { VAR_NORMAL, VAR_BRUTE, type ZombieSlot } from './zombieTypes'
import { HERO_GUN_NODE, HERO_GUN_MUZZLE_LOCAL } from './heroGunSeat'
import { playShot } from '../../lib/soundFx'

/**
 * A self-contained, AUTO-PLAYING 3D opening cinematic — "Code City has fallen".
 *
 * This is NOT the interactive game. It runs a fully scripted timeline driven by
 * a clock captured on the first frame, so it replays identically every mount.
 *
 * PREMIUM PASS (owner direction, July 2026 — "make the new cut unmistakable"):
 *  - RAIN. The whole intro plays under a neon-lit night rain: GPU rain streaks
 *    + ground splashes (shared RainSystem), wet reflective streets (shared
 *    applyWetResponse — the puddles drink the IBL), neon signage and lit-window
 *    towers replacing the old dead black boxes.
 *  - THE CAMERA ACKNOWLEDGES THE COMPILE. The hologram-resolve punctuation is
 *    now a full shot: at ~3.4s the camera racks off the hero and CRANES UP the
 *    first tower as the compile front climbs it, then widens to frame the trio
 *    finishing — each completion fires a sky beam + roof shock ring + beacon.
 *  - A GRIP CLOSEUP BEAT (~12–13.6s): low tight push on the hero's hands while
 *    firing — the calibrated gun seat is meant to be SEEN. Tracer bolts spawn
 *    from the true muzzle of the calibrated gun (heroGunSeat.ts), not from a
 *    guessed offset next to the hip.
 *  - Cinematic language: scripted FOV ramps (crane compress → action wide →
 *    44mm closeup), handheld shake in the action beat, richer grade (deeper
 *    blue night, hotter bloom, magenta/cyan/amber neon palette).
 *
 * Kept intact from the cut the owner liked: the SOLID established skyline
 * opening (no whole-city build-in), the narrative beats/captions, the horde
 * mow-down, the slow-mo multi-kill re-shimmer, and the end card timing.
 *
 * R3F discipline: everything animates in `useFrame`, scaled by delta; per-frame
 * data lives in refs; projectiles + zombies are pooled; scratch vectors are
 * hoisted (no per-frame allocations).
 */

/** Heroic cyan-lime so the hero pops against the rotting-green horde. */
const HERO_ACCENT = '#5ef0c4'

const MAX_ZOMBIES = 22
const MAX_BOLTS = 18
/** Slot lifetime after a kill — matches the horde renderer's Death fall
 *  (DEATH_FALL 0.72) + de-rez (DEREZ_TIME 0.38) so the slot frees the moment
 *  the body finishes dissolving. */
const DIE_DURATION = 1.1
const BOLT_SPEED = 62
const BOLT_LIFE = 1.5
const HIT_R = 1.7
const HERO_Z = 2

/** Total scripted runtime in seconds (the page auto-advances a beat after this). */
export const CINEMATIC_DURATION = 18

/** The horde renders through the game's own <ZombieHorde> (the updated
 *  ORGANIC Meshy rigs — same models, clips, tints and death language the
 *  player fights in the overworld), driven by the cinematic's scripted sim
 *  writing the shared ZombieSlot contract. IMPORTANT: the horde renderer
 *  compares bornAt/dieAt/hitAt against the RAW canvas clock, so the slots
 *  carry raw clock times (rawT), never cinematic-relative time.
 *  Each slot keeps a cinematic-only shamble speed on the side. */
type CineZombieSlot = ZombieSlot & { speed: number }

type BoltSlot = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  target: number
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/* ----------------------------------------------------------------- Bolt */

const BoltMesh = memo(function BoltMesh({ slot }: { slot: BoltSlot }) {
  const root = useRef<THREE.Group>(null)
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const g = root.current
    if (!g) return
    if (!slot.active) {
      if (g.visible) g.visible = false
      return
    }
    g.visible = true
    g.position.copy(slot.pos)
    dir.copy(slot.vel).normalize()
    q.setFromUnitVectors(up, dir)
    g.quaternion.copy(q)
  })

  return (
    <group ref={root} visible={false}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.55, 8]} />
        <meshBasicMaterial color="#d6fbff" toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#eafdff" toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 0, -0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.9, 8]} />
        <meshBasicMaterial color="#46d6ff" transparent opacity={0.4} toneMapped={false} fog={false} />
      </mesh>
    </group>
  )
})

/* ------------------------------------------------------- Resolve towers */

/** Accent for the hologram-resolve punctuation (Living Simulation cyan). */
const RESOLVE_ACCENT = '#4dd2ff'

/** The three hero towers that COMPILE IN as the cinematic's punctuation
 *  moment. Placed in gaps of the deterministic skyline (no box overlap),
 *  staggered in depth and in time so the compile front reads as a wave
 *  rolling down the street. The camera racks to tower 1 at ~3.4s and cranes
 *  up its compile front, so the first reveal window is the "hero" one. */
const RESOLVE_TOWERS = [
  { x: -10.5, z: -24, w: 5, d: 5, h: 40, revealStart: 3.9, revealEnd: 6.2 },
  { x: 10, z: -38, w: 6, d: 6, h: 52, revealStart: 4.8, revealEnd: 7.2 },
  { x: -19, z: -39, w: 7, d: 7, h: 50, revealStart: 5.5, revealEnd: 7.9 },
] as const

const RESOLVE_GHOST_VERT = /* glsl */ `
varying vec3 vWPos;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWPos = wp.xyz;
  vNrm = normalize( normalMatrix * normal );
  vec4 mv = viewMatrix * wp;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const RESOLVE_GHOST_FRAG = /* glsl */ `
uniform float uFront;
uniform float uGhost;
uniform float uGlitch;
uniform float uTime;
uniform vec3 uAccent;
varying vec3 vWPos;
varying vec3 vNrm;
varying vec3 vView;
void main() {
  float above = step( uFront, vWPos.y );
  float mask = above * uGhost + ( 1.0 - above ) * uGlitch;
  if ( mask < 0.004 ) discard;
  float scan = 0.55 + 0.45 * sin( vWPos.y * 2.6 - uTime * 3.2 );
  // Horizontal scanline slats: the ghost is structured light, not blue glass.
  float slat = 0.35 + 0.65 * step( 0.45, fract( vWPos.y * 0.9 ) );
  float tick = step( 0.94, fract( vWPos.y * 0.14 - uTime * 0.25 + vWPos.x * 0.01 ) );
  float fres = pow( 1.0 - abs( dot( normalize( vNrm ), normalize( vView ) ) ), 1.6 );
  float a = mask * slat * ( 0.10 + 0.30 * fres + 0.10 * scan + 0.22 * tick );
  gl_FragColor = vec4( uAccent * ( 0.7 + 0.5 * scan ), a );
}
`

/** One compiling tower: a solid PBR pass clipped below the compile front
 *  (with procedural lit windows popping on behind it and a bright shimmer
 *  band at the front) + an additive ghost-hologram pass above the front,
 *  PLUS the premium-pass punctuation FX the camera now looks straight at:
 *  a scan ring riding the compile front, and a completion beat (sky beam +
 *  roof shock ring + persistent blinking beacon). All driven per frame from
 *  the shared cinematic clock — no React state, no allocations. */
const ResolveTower = memo(function ResolveTower({
  spec,
  startRef,
}: {
  spec: (typeof RESOLVE_TOWERS)[number]
  startRef: React.MutableRefObject<number>
}) {
  const uFront = useMemo(() => ({ value: -1 }), [])
  const uGhost = useMemo(() => ({ value: 0 }), [])
  const uGlitch = useMemo(() => ({ value: 0 }), [])
  const accent = useMemo(() => new THREE.Color(RESOLVE_ACCENT), [])

  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const beam = useRef<THREE.Mesh>(null)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null)
  const shock = useRef<THREE.Mesh>(null)
  const shockMat = useRef<THREE.MeshBasicMaterial>(null)
  const beacon = useRef<THREE.Mesh>(null)
  const beaconMat = useRef<THREE.MeshBasicMaterial>(null)

  const solidMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#1a1f2e',
      roughness: 0.78,
      metalness: 0.14,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFront = uFront
      shader.uniforms.uTime = SIM.time
      shader.uniforms.uAccent = { value: accent }
      shader.uniforms.uTowerH = { value: spec.h }
      shader.uniforms.uTowerSeed = { value: spec.x * 7.31 + spec.z * 3.17 }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;',
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `#include <project_vertex>
vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vObjPos = position;
vObjNrm = normal;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
varying vec3 vWPos;
varying vec3 vObjPos;
varying vec3 vObjNrm;
uniform float uFront;
uniform float uTime;
uniform float uTowerH;
uniform float uTowerSeed;
uniform vec3 uAccent;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
{
  // Procedural office grid: bays 1.4m, floors 2.6m, only on the walls.
  if ( abs( vObjNrm.y ) < 0.5 ) {
    float u = abs( vObjNrm.x ) > 0.5 ? vObjPos.z : vObjPos.x;
    float yUp = vObjPos.y + uTowerH * 0.5;
    vec2 cell = vec2( floor( u / 1.4 ), floor( yUp / 2.6 ) );
    // Seed is PER CELL (plus a per-tower constant) — any fragment-varying
    // term here dissolves the windows into noise.
    float seed = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) + uTowerSeed ) * 43758.5453 );
    float winU = smoothstep( 0.16, 0.26, fract( u / 1.4 ) ) * ( 1.0 - smoothstep( 0.74, 0.84, fract( u / 1.4 ) ) );
    float winV = smoothstep( 0.22, 0.32, fract( yUp / 2.6 ) ) * ( 1.0 - smoothstep( 0.68, 0.78, fract( yUp / 2.6 ) ) );
    // Windows pop on with a per-cell stagger AFTER the compile front passes.
    float on = step( seed, 0.6 ) * smoothstep( 0.0, 2.0 + seed * 2.6, uFront - vWPos.y );
    vec3 warm = mix( vec3( 1.0, 0.82, 0.5 ), vec3( 0.62, 0.86, 1.0 ), step( 0.72, fract( seed * 7.31 ) ) );
    totalEmissiveRadiance += warm * winU * winV * on * 1.35;
  }
}`,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
if ( vWPos.y > uFront ) discard;
{
  // Bright materialize band right at the compile front — the money read.
  float band = 1.0 - smoothstep( 0.0, 3.4, uFront - vWPos.y );
  float shimmer = 0.8 + 0.2 * sin( uTime * 11.0 + vWPos.y * 3.1 );
  outgoingLight += uAccent * band * shimmer * 3.2;
}
#include <opaque_fragment>`,
        )
    }
    mat.customProgramCacheKey = () => 'intro-resolve-solid-v2'
    return mat
  }, [uFront, accent, spec.h, spec.x, spec.z])

  const ghostMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RESOLVE_GHOST_VERT,
        fragmentShader: RESOLVE_GHOST_FRAG,
        uniforms: {
          uFront,
          uGhost,
          uGlitch,
          uTime: SIM.time,
          uAccent: { value: accent },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [uFront, uGhost, uGlitch, accent],
  )

  useEffect(
    () => () => {
      solidMat.dispose()
      ghostMat.dispose()
    },
    [solidMat, ghostMat],
  )

  const halfDiag = Math.hypot(spec.w, spec.d) * 0.5

  useFrame((state) => {
    if (startRef.current < 0) return
    const rawT = state.clock.elapsedTime
    const t = rawT - startRef.current
    // Ghost fades in during the opening push (the skyline is solid; these
    // three slots are "still being written"), then the compile front sweeps
    // bottom → top across the reveal window.
    const r = smoothstep(spec.revealStart, spec.revealEnd, t)
    const front = -1 + r * (spec.h + 4)
    uFront.value = front
    uGhost.value = smoothstep(1.1, 2.3, t)
    // Slow-mo multi-kill beat: the resolved towers re-glitch for a breath —
    // the Living Simulation flexing under the fight.
    const gl1 = t > 9.5 && t < 10.4 ? Math.sin(((t - 9.5) / 0.9) * Math.PI) : 0
    uGlitch.value = gl1 * 0.34

    // --- Scan ring rides the compile front up the tower (group is centered
    //     at y = h/2, so children work in local offsets from that center).
    const compiling = r > 0.002 && r < 0.998
    if (ring.current && ringMat.current) {
      ring.current.visible = compiling
      if (compiling) {
        ring.current.position.y = THREE.MathUtils.clamp(front, 0.6, spec.h) - spec.h / 2
        const pulse = 1 + Math.sin(rawT * 9) * 0.045
        ring.current.scale.set(pulse, pulse, pulse)
        ringMat.current.opacity = 0.55 + 0.35 * Math.sin(rawT * 12)
      }
    }
    // --- Completion beat: sky beam + roof shock ring, then a blinking beacon.
    const p = (t - spec.revealEnd) / 1.1
    const bursting = p >= 0 && p < 1
    if (beam.current && beamMat.current) {
      beam.current.visible = bursting
      if (bursting) beamMat.current.opacity = Math.sin(p * Math.PI) * 0.62
    }
    if (shock.current && shockMat.current) {
      shock.current.visible = bursting
      if (bursting) {
        const s = 1 + p * 3.2
        shock.current.scale.set(s, s, s)
        shockMat.current.opacity = (1 - p) * 0.9
      }
    }
    if (beacon.current && beaconMat.current) {
      const done = t >= spec.revealEnd
      beacon.current.visible = done
      if (done) beaconMat.current.opacity = 0.55 + 0.45 * Math.sin(rawT * 3.5 + spec.x)
    }
  })

  return (
    <group position={[spec.x, spec.h / 2, spec.z]}>
      <mesh material={solidMat} castShadow>
        <boxGeometry args={[spec.w, spec.h, spec.d]} />
      </mesh>
      <mesh material={ghostMat} scale={1.004}>
        <boxGeometry args={[spec.w, spec.h, spec.d]} />
      </mesh>

      {/* Scan ring riding the compile front. */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[halfDiag + 0.35, halfDiag + 0.95, 36]} />
        <meshBasicMaterial
          ref={ringMat}
          color={RESOLVE_ACCENT}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {/* Compile-complete sky beam. */}
      <mesh ref={beam} position={[0, spec.h / 2 + 15, 0]} visible={false}>
        <cylinderGeometry args={[0.5, 1.15, 30, 12, 1, true]} />
        <meshBasicMaterial
          ref={beamMat}
          color="#bdefff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {/* Roof shock ring on completion. */}
      <mesh ref={shock} position={[0, spec.h / 2 + 0.4, 0]} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[halfDiag * 0.7, halfDiag * 0.98, 32]} />
        <meshBasicMaterial
          ref={shockMat}
          color="#eaffff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {/* Persistent roof beacon once compiled. */}
      <mesh ref={beacon} position={[0, spec.h / 2 + 1.1, 0]} visible={false}>
        <sphereGeometry args={[0.42, 10, 10]} />
        <meshBasicMaterial
          ref={beaconMat}
          color={RESOLVE_ACCENT}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  )
})

/* --------------------------------------------------------------- Environment */

/** Neon sign palette for the flanking towers (classic night-city trio). */
const NEON_COLORS = ['#45e0ff', '#ff4fd8', '#ffb54a', HERO_ACCENT] as const

/** Per-tower lit-window material: the same procedural office grid the resolve
 *  towers use, minus the compile-front gating (these are ALREADY compiled —
 *  the established city). One shader program shared across every tower (the
 *  cache key is constant; only uniform VALUES differ per material). */
function makeTowerWindowMat(h: number, seedv: number, litFrac: number) {
  const mat = new THREE.MeshStandardMaterial({ color: '#151a28', roughness: 0.82, metalness: 0.12 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SIM.time
    shader.uniforms.uTowerH = { value: h }
    shader.uniforms.uTowerSeed = { value: seedv }
    shader.uniforms.uLitFrac = { value: litFrac }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvObjPos = position;\nvObjNrm = normal;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNrm;
uniform float uTime;
uniform float uTowerH;
uniform float uTowerSeed;
uniform float uLitFrac;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
{
  if ( abs( vObjNrm.y ) < 0.5 ) {
    float u = abs( vObjNrm.x ) > 0.5 ? vObjPos.z : vObjPos.x;
    float yUp = vObjPos.y + uTowerH * 0.5;
    vec2 cell = vec2( floor( u / 1.4 ), floor( yUp / 2.6 ) );
    float seed = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) + uTowerSeed ) * 43758.5453 );
    float winU = smoothstep( 0.16, 0.26, fract( u / 1.4 ) ) * ( 1.0 - smoothstep( 0.74, 0.84, fract( u / 1.4 ) ) );
    float winV = smoothstep( 0.22, 0.32, fract( yUp / 2.6 ) ) * ( 1.0 - smoothstep( 0.68, 0.78, fract( yUp / 2.6 ) ) );
    float on = step( seed, uLitFrac );
    // A few offices toggle over the cinematic so the skyline breathes.
    on *= 0.72 + 0.28 * step( 0.3, fract( seed * 51.7 + uTime * ( 0.02 + seed * 0.05 ) ) );
    vec3 warm = mix( vec3( 1.0, 0.80, 0.48 ), vec3( 0.60, 0.85, 1.0 ), step( 0.7, fract( seed * 7.31 ) ) );
    totalEmissiveRadiance += warm * winU * winV * on * 0.95;
  }
}`,
      )
  }
  mat.customProgramCacheKey = () => 'intro-city-windows-v1'
  return mat
}

/** INTRO-LOCAL wet streets. The shared applyWetResponse pools ~14m lakes
 *  (overworld scale) which read as giant dark blotches on this tight street —
 *  this local twin uses a ~3m puddle pattern, gentler darkening, and keeps a
 *  soft sheen so the neon reflections carry without black mirror pools. */
function applyIntroWet<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimRain = SIM.rain
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWetPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWetPos;\nuniform float uSimRain;',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
{
  if ( uSimRain > 0.001 ) {
    vec2 xz = vWetPos.xz;
    float pud = sin( xz.x * 1.1 + sin( xz.y * 0.83 ) * 1.7 )
      * sin( xz.y * 0.97 + sin( xz.x * 0.71 ) * 1.3 );
    float wet = uSimRain * ( 0.62 + 0.38 * smoothstep( -0.3, 0.8, pud ) );
    float pool = uSimRain * smoothstep( 0.55, 0.9, pud );
    diffuseColor.rgb *= 1.0 - 0.22 * wet;
    roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.55, wet );
    roughnessFactor = mix( roughnessFactor, 0.2, pool );
  }
}`,
      )
  }
  mat.customProgramCacheKey = () => 'intro-wet-v1'
  return mat
}

/** Distant-skyline gradient backdrop: deep night up top, a cool city-glow
 *  horizon with a magenta breath low down (replaces the dead flat plane).
 *  Kept BARELY above the fog color so it reads as air, not a wall. */
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  vec3 top = vec3( 0.004, 0.006, 0.014 );
  vec3 hor = vec3( 0.022, 0.038, 0.075 );
  vec3 col = mix( hor, top, smoothstep( 0.0, 0.42, vUv.y ) );
  col += vec3( 0.035, 0.010, 0.032 ) * ( 1.0 - smoothstep( 0.0, 0.22, vUv.y ) );
  gl_FragColor = vec4( col, 1.0 );
}
`

type TowerSpec = {
  x: number
  z: number
  w: number
  d: number
  h: number
  litFrac: number
}

function CodeCity() {
  // Stylized low-poly skyscraper silhouettes flanking a central street that
  // runs along -Z. Deterministic layout so the skyline reads the same each
  // run. PREMIUM PASS: every tower now carries the procedural lit-window
  // grid (mixed density — a lived-in night skyline instead of black slabs).
  const towers = useMemo(() => {
    const out: TowerSpec[] = []
    let seed = 1337
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 9; i++) {
        const z = 4 - i * 7 - rnd() * 2
        const x = side * (10 + rnd() * 8)
        const w = 4 + rnd() * 4
        const d = 4 + rnd() * 4
        const h = 10 + rnd() * 34
        // Old `lit` coin-flip becomes a density: sleepy vs busy towers.
        out.push({ x, z, w, d, h, litFrac: rnd() < 0.5 ? 0.42 : 0.16 })
      }
    }
    return out
  }, [])

  const towerMats = useMemo(
    () => towers.map((t) => makeTowerWindowMat(t.h, t.x * 7.31 + t.z * 3.17, t.litFrac)),
    [towers],
  )

  // Wet night streets: the shared wet-response patch keys off SIM.rain (the
  // intro drives it to ~0.9), darkening the asphalt and pooling near-mirror
  // puddles that drink from the IBL — the single biggest "premium" read.
  const groundMat = useMemo(
    () =>
      applyIntroWet(
        new THREE.MeshStandardMaterial({
          color: '#0d1017',
          roughness: 0.92,
          metalness: 0.05,
          envMapIntensity: 0.55,
        }),
      ),
    [],
  )
  const streetMat = useMemo(
    () =>
      applyIntroWet(
        new THREE.MeshStandardMaterial({
          color: '#151824',
          roughness: 0.85,
          metalness: 0.06,
          envMapIntensity: 0.6,
        }),
      ),
    [],
  )
  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        fog: false,
        depthWrite: true,
      }),
    [],
  )

  useEffect(
    () => () => {
      for (const m of towerMats) m.dispose()
      groundMat.dispose()
      streetMat.dispose()
      glowMat.dispose()
    },
    [towerMats, groundMat, streetMat, glowMat],
  )

  // Neon signage on the street-facing walls of the closer flanking towers.
  const signs = useMemo(() => {
    const out: {
      pos: [number, number, number]
      rotY: number
      size: [number, number]
      color: string
    }[] = []
    let n = 0
    for (const t of towers) {
      if (Math.abs(t.x) > 17 || t.z < -44 || t.h < 16) continue
      const side = Math.sign(t.x)
      const x = t.x - side * (t.w / 2 + 0.06)
      const vertical = n % 3 !== 2
      out.push({
        pos: [x, 5 + (n % 4) * 2.6, t.z + (n % 2 ? 1 : -1) * 0.8],
        rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        size: vertical ? [0.85, 4.6] : [3.6, 1.15],
        color: NEON_COLORS[n % NEON_COLORS.length],
      })
      n++
      if (n >= 8) break
    }
    return out
  }, [towers])

  // Rooftop aviation beacons on the tall towers — two shared materials,
  // opposite blink phases, driven imperatively (no per-mesh material churn).
  const beaconMats = useMemo(
    () => [
      new THREE.MeshBasicMaterial({ color: '#ff4545', transparent: true, opacity: 0.6, toneMapped: false, fog: false }),
      new THREE.MeshBasicMaterial({ color: '#ff4545', transparent: true, opacity: 0.6, toneMapped: false, fog: false }),
    ],
    [],
  )
  useEffect(
    () => () => {
      for (const m of beaconMats) m.dispose()
    },
    [beaconMats],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    beaconMats[0].opacity = 0.2 + 0.8 * Math.max(0, Math.sin(t * 1.9))
    beaconMats[1].opacity = 0.2 + 0.8 * Math.max(0, Math.sin(t * 1.9 + 2.4))
  })
  const tallTowers = useMemo(() => towers.filter((t) => t.h > 25), [towers])

  return (
    <group>
      {/* Asphalt ground + central street strip (wet, reflective). */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -22]} receiveShadow material={groundMat}>
        <planeGeometry args={[160, 160]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -18]} receiveShadow material={streetMat}>
        <planeGeometry args={[14, 130]} />
      </mesh>
      {/* Lane dashes glowing faintly. */}
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.02, 4 - i * 6]}>
          <planeGeometry args={[0.4, 2.4]} />
          <meshBasicMaterial color="#46586a" toneMapped={false} fog={false} />
        </mesh>
      ))}

      {towers.map((t, i) => (
        <mesh key={i} position={[t.x, t.h / 2, t.z]} castShadow material={towerMats[i]}>
          <boxGeometry args={[t.w, t.h, t.d]} />
        </mesh>
      ))}

      {/* Neon signs (bloom picks these up — the night-city color language). */}
      {signs.map((s, i) => (
        <mesh key={`s${i}`} position={s.pos} rotation-y={s.rotY}>
          <planeGeometry args={s.size} />
          <meshBasicMaterial color={s.color} toneMapped={false} fog={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Rooftop aviation beacons, two blink phases. */}
      {tallTowers.map((t, i) => (
        <mesh key={`b${i}`} position={[t.x, t.h + 0.4, t.z]} material={beaconMats[i % 2]}>
          <sphereGeometry args={[0.22, 8, 8]} />
        </mesh>
      ))}

      {/* Street lamps under the flickering point lights: pole + head + a
          volumetric-looking glow cone into the rain. */}
      {(
        [
          [6, -6],
          [-6, -16],
        ] as const
      ).map(([lx, lz], i) => (
        <group key={`l${i}`} position={[lx, 0, lz]}>
          <mesh position={[0, 2.7, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.1, 5.4, 8]} />
            <meshStandardMaterial color="#20242f" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 5.45, 0]}>
            <boxGeometry args={[0.5, 0.18, 0.5]} />
            <meshStandardMaterial color="#ffc984" emissive="#ffab52" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
          {/* Kept faint on purpose — at 0.045/r1.8 these read as solid orange
              teepees from the street-level action shots. */}
          <mesh position={[0, 2.8, 0]} visible={false}>
            <coneGeometry args={[1.3, 5.3, 20, 1, true]} />
            <meshBasicMaterial
              color="#ffb46a"
              transparent
              opacity={0.022}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
              fog={false}
            />
          </mesh>
        </group>
      ))}

      {/* Distant skyline gradient backdrop (city glow, not a black wall). */}
      <mesh position={[0, 18, -58]} material={glowMat}>
        <planeGeometry args={[170, 70]} />
      </mesh>
    </group>
  )
}

/* ----------------------------------------------------------------- Scene */

const CinematicScene = memo(function CinematicScene() {
  const { camera } = useThree()

  const start = useRef(-1)
  const heroPos = useRef(new THREE.Vector3(0, 0, HERO_Z))
  const heroGroup = useRef<THREE.Group>(null)
  const fireRef = useRef(0)
  const fireTimer = useRef(0)
  const spawnTimer = useRef(0)
  const [anim, setAnim] = useState<AvatarAnim>('idle')
  const animRef = useRef<AvatarAnim>('idle')

  const muzzleLight = useRef<THREE.PointLight>(null)
  const closeupKey = useRef<THREE.PointLight>(null)
  const rimLight = useRef<THREE.DirectionalLight>(null)
  const lampA = useRef<THREE.PointLight>(null)
  const lampB = useRef<THREE.PointLight>(null)

  // Smoothed camera state (kept in refs, no re-renders).
  const camPos = useRef(new THREE.Vector3(3.0, 9.8, 31))
  const camLook = useRef(new THREE.Vector3(-1, 6.4, -34))
  const fovCur = useRef(56)
  const lastShot = useRef(0)

  // Scratch — hoisted, reused every frame.
  const dPos = useRef(new THREE.Vector3())
  const dLook = useRef(new THREE.Vector3())
  const muzzle = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())

  const zombies = useMemo<CineZombieSlot[]>(
    () =>
      Array.from({ length: MAX_ZOMBIES }, () => ({
        active: false,
        state: 'walk' as const,
        pos: new THREE.Vector3(),
        facing: 0,
        hp: 1,
        dieAt: 0,
        dieHow: 'shot' as const,
        hitAt: -100,
        kbX: 0,
        kbZ: 0,
        bornAt: 0,
        seed: 0,
        variant: VAR_NORMAL,
        cd: 0,
        castAt: 0,
        speed: 2,
      })),
    [],
  )
  const bolts = useMemo<BoltSlot[]>(
    () =>
      Array.from({ length: MAX_BOLTS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        target: -1,
      })),
    [],
  )

  // Deterministic spawner state.
  const spawnRnd = useRef(98765)
  const rand = () => {
    spawnRnd.current = (spawnRnd.current * 1664525 + 1013904223) >>> 0
    return spawnRnd.current / 4294967296
  }
  const initialized = useRef(false)

  /** `nowRaw` is the RAW canvas clock — the ZombieHorde renderer compares
   *  bornAt/dieAt/hitAt against it (shared contract with the game sim). */
  function spawnZombie(nowRaw: number, far: boolean) {
    const z = zombies.find((s) => !s.active)
    if (!z) return
    z.active = true
    z.state = 'walk'
    // "Far" spawns arrive close enough to keep the kill ring FED through the
    // whole action beat (the old -36..-48 band left the street empty by ~10s).
    z.pos.set((rand() * 2 - 1) * 6, 0, (far ? -22 - rand() * 10 : -14 - rand() * 22))
    z.facing = 0
    z.bornAt = nowRaw
    z.dieAt = 0
    z.hitAt = -100
    z.castAt = 0
    // Mostly baseline shamblers with the occasional hulking brute so the
    // horde reads with real silhouette variety (same breeds as gameplay).
    z.variant = rand() < 0.12 ? VAR_BRUTE : VAR_NORMAL
    z.speed = 1.8 + rand() * 1.0
    z.seed = rand() * 10
  }

  function nearestWalking(): number {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i]
      if (!z.active || z.state !== 'walk') continue
      const d = z.pos.z // closest to hero = largest z (least negative); want max z
      if (-d < bestD && z.pos.z < heroPos.current.z - 2) {
        bestD = -d
        best = i
      }
    }
    return best
  }

  // target = -1 fires a suppression bolt straight down the street: the grip
  // closeup MUST keep the burst (and with it the locked aim pose) alive even
  // if the kill ring happens to be momentarily empty — the one time firing
  // lapsed there, the aim overlay faded and the closeup framed an idle hand.
  function fireAt(target: number, rawT: number) {
    // Refresh the "is firing" window FIRST: even if the bolt pool is briefly
    // exhausted (suppression bolts live long), the aim overlay must not lapse
    // mid-closeup — a one-frame pose collapse there reads as a dropped gun.
    fireRef.current = rawT
    const b = bolts.find((x) => !x.active)
    if (!b) return
    const z = target >= 0 ? zombies[target] : null
    // Spawn the tracer from the TRUE muzzle of the calibrated gun (the same
    // seat gameplay uses — heroGunSeat.ts). While the Meshy rig is still
    // streaming (fallback hero), fall back to a fixed offset near the grip.
    const hg = heroGroup.current
    const gun = hg ? hg.getObjectByName(HERO_GUN_NODE) : null
    if (gun) {
      muzzle.current.copy(HERO_GUN_MUZZLE_LOCAL)
      gun.updateWorldMatrix(true, false)
      gun.localToWorld(muzzle.current)
    } else {
      // Hero faces -Z (rotation π), so the right (gun) hand sits at +x.
      muzzle.current.set(heroPos.current.x + 0.25, 1.25, heroPos.current.z - 0.9)
    }
    b.active = true
    b.life = BOLT_LIFE
    b.target = target
    b.pos.copy(muzzle.current)
    if (z) {
      tmpDir.current.set(z.pos.x - muzzle.current.x, 1.1 - muzzle.current.y, z.pos.z - muzzle.current.z)
    } else {
      tmpDir.current.set(0, 1.1 - muzzle.current.y, -30 - muzzle.current.z)
    }
    tmpDir.current.normalize()
    b.vel.copy(tmpDir.current).multiplyScalar(BOLT_SPEED)
    playShot()
  }

  function setAnimSafe(a: AvatarAnim) {
    if (animRef.current !== a) {
      animRef.current = a
      setAnim(a)
    }
  }

  useFrame((state, dtRaw) => {
    if (start.current < 0) start.current = state.clock.elapsedTime
    const rawT = state.clock.elapsedTime
    const t = rawT - start.current
    const dt = Math.min(dtRaw, 0.05)

    // First-frame prespawn of a shambling crowd down the far street.
    if (!initialized.current) {
      initialized.current = true
      for (let i = 0; i < 14; i++) spawnZombie(rawT, false)
      // Spread them across the street depth.
      let k = 0
      for (const z of zombies) {
        if (!z.active) continue
        z.pos.set((rand() * 2 - 1) * 6, 0, -12 - k * 2.4 - rand() * 4)
        z.bornAt = -1 // already risen (raw-clock past → rise clamps to done)
        k++
      }
    }

    // Brief slow-mo on a big multi-kill mid-action.
    const slow = t > 9.5 && t < 10.3 ? 0.4 : 1
    const adt = dt * slow

    /* ---------------------------------------------------- Hero scripting */
    const strafeAmp = smoothstep(7.2, 8, t) * (1 - smoothstep(10.7, 11.5, t)) * 2.3
    heroPos.current.x = Math.sin((t - 7.2) * 1.7) * strafeAmp
    heroPos.current.z = HERO_Z

    // Beats: hold through the establishing + compile showcase, run-and-gun
    // through the action orbit, LOCKED STANDING FIRE for the grip closeup
    // (the 'shoot' state pins the calibrated aim pose), then the wave-off.
    // The closeup starts at 11.5 (not 12) so it plays out CLEAN before the
    // end-card overlay — which the owner likes where it is — fades in over
    // center frame at ~12.6.
    if (t < 7.2) setAnimSafe('idle')
    else if (t < 11.5) setAnimSafe('run')
    else if (t < 13.0) setAnimSafe('shoot')
    else setAnimSafe('wave')

    const hg = heroGroup.current
    if (hg) {
      hg.position.copy(heroPos.current)
      hg.rotation.y = Math.PI // face down the street (-Z), gun forward
    }

    /* ---------------------------------------------------- Spawning */
    spawnTimer.current += dt
    if (t < 12.5 && spawnTimer.current > 0.55) {
      spawnTimer.current = 0
      spawnZombie(rawT, true)
      if (t > 7 && t < 11.5) spawnZombie(rawT, true)
    }

    /* ---------------------------------------------------- Hero firing */
    // Fire cadence rides the action beats. Every cadence sits BELOW the
    // rig's 0.45s "is firing" window, so the aim overlay never flaps between
    // shots — the gun stays seated in the locked aim pose the whole burst.
    let cadence = Infinity
    if (t >= 7.3 && t < 11.5) cadence = 0.3
    else if (t >= 11.6 && t < 12.8) cadence = 0.4
    fireTimer.current -= dt
    if (cadence !== Infinity && fireTimer.current <= 0) {
      const target = nearestWalking()
      if (target >= 0) {
        fireTimer.current = cadence
        fireAt(target, rawT)
      } else if (t >= 11.5 && t < 13.0) {
        // Closeup beat: never let the burst lapse (see fireAt).
        fireTimer.current = cadence
        fireAt(-1, rawT)
      } else {
        fireTimer.current = 0.15
      }
    }

    /* ---------------------------------------------------- Zombies */
    for (const z of zombies) {
      if (!z.active) continue
      if (z.state === 'die') {
        if (rawT - z.dieAt > DIE_DURATION) z.active = false
        continue
      }
      const dx = heroPos.current.x - z.pos.x
      const dz = heroPos.current.z - z.pos.z
      const dist = Math.hypot(dx, dz) || 1
      z.facing = Math.atan2(dx, dz)
      // Shamble toward the hero but stop short so they crowd the street.
      if (dist > 4.5) {
        const step = (z.speed * adt) / dist
        z.pos.x += dx * step
        z.pos.z += dz * step
      }
    }

    /* ---------------------------------------------------- Bolts + impacts */
    for (const b of bolts) {
      if (!b.active) continue
      b.life -= adt
      b.pos.addScaledVector(b.vel, adt)
      const z = b.target >= 0 ? zombies[b.target] : null
      if (z && z.active && z.state === 'walk') {
        const hx = z.pos.x - b.pos.x
        const hy = z.pos.y + 1.1 - b.pos.y
        const hz = z.pos.z - b.pos.z
        if (hx * hx + hy * hy + hz * hz < HIT_R * HIT_R) {
          z.state = 'die'
          z.dieAt = rawT
          z.dieHow = 'shot' // Death-clip fall + de-rez (the game's language)
          b.active = false
          continue
        }
      }
      if (b.life <= 0 || b.pos.z < -60) b.active = false
    }

    /* ---------------------------------------------------- Muzzle flash light */
    const closeupK = smoothstep(11.5, 11.8, t) * (1 - smoothstep(12.8, 13.0, t))
    if (muzzleLight.current) {
      const kick = THREE.MathUtils.clamp(1 - (rawT - fireRef.current) / 0.12, 0, 1)
      // In the closeup the flash punch is HALVED: at 14 the bloom around the
      // muzzle swallowed the whole fore-end and chrome arm (v3 QA note) — the
      // grip has to stay legible mid-burst at 44mm.
      muzzleLight.current.intensity = kick * (14 - closeupK * 8)
      // The light rides the LAST true muzzle position (updated per shot).
      muzzleLight.current.position.copy(muzzle.current)
    }
    // Dedicated closeup key: the muzzle fill sat DOWNRANGE of the gun, so the
    // camera-facing surfaces (receiver rear, grip hand) stayed pitch black and
    // silhouetted as a floating slab (v3 QA blocker). This key hangs above the
    // camera's shoulder line and throws light AT those surfaces instead.
    if (closeupKey.current) {
      // 8 (was 5): the camera now looks DOWN at the receiver top, a surface
      // the street lamps never reach — at 5 it still silhouetted near-black.
      closeupKey.current.intensity = closeupK * 8
      // Over the closeup camera's shoulder (behind-right of the hero), high
      // enough to rake the receiver TOP + grip hand facing the lens.
      closeupKey.current.position.set(heroPos.current.x + 1.4, 2.6, heroPos.current.z + 1.2)
    }

    /* ---------------------------------------------------- Lights mood */
    // Flickering street lamps.
    if (lampA.current) lampA.current.intensity = 5 + Math.sin(rawT * 31) * 1.6 * (Math.sin(rawT * 7) > -0.6 ? 1 : 0.2)
    if (lampB.current) lampB.current.intensity = 4 + Math.sin(rawT * 23 + 2) * 1.4
    // Heroic accent rim light swells in the final beat (kept restrained —
    // at the old 3.1x the whole frame washed lime).
    if (rimLight.current) {
      const swell = 1 + smoothstep(12.5, 15.5, t) * 1.1
      rimLight.current.intensity = 0.8 * swell
    }

    /* ---------------------------------------------------- Camera scripting */
    const hx = heroPos.current.x
    const hz = heroPos.current.z
    if (t < 3.4) {
      // Rainy crane establishing shot: high over the neon street, descending
      // from the skyline down to street level as the title lands.
      const k = smoothstep(0, 3.4, t)
      dPos.current.set(3.0 - k * 1.8, 9.8 - k * 5.6, 31 - k * 11)
      dLook.current.set(-1 + k, 6.4 - k * 4.6, -34 + k * 16)
    } else if (t < 5.8) {
      // THE COMPILE SHOT — rack off the hero to tower 1 and CRANE UP with the
      // compile front as it climbs ("every district is a coding pattern").
      const climb = smoothstep(3.9, 6.2, t)
      dPos.current.set(0.6, 5.2 + climb * 2.6, 6.5)
      dLook.current.set(-10.5, 3 + climb * 27, -24)
    } else if (t < 7.6) {
      // Widen high to frame the trio finishing down the street.
      dPos.current.set(3.2, 9.2, 9.5)
      dLook.current.set(-5, 17, -34)
    } else if (t < 11.5) {
      // Action: swing across the hero's BACK hemisphere (never to his front),
      // so every frame reads hero + muzzle line + horde + compiled towers.
      const a = 0.55 - (t - 7.6) * 0.3
      const R = 6.4
      dPos.current.set(hx + Math.sin(a) * R, 2.9 + Math.sin((t - 7.6) * 0.8) * 0.5, hz + Math.cos(a) * R)
      dLook.current.set(hx, 1.5, hz - 5.5)
    } else if (t < 13.0) {
      // GRIP CLOSEUP — low OTS INSERT over the hero's right shoulder, tight
      // on the weapon and looking DOWN the street. Constraints (verified
      // numerically with the pose probe): the rig has NO finger bones, so a
      // palm can never visibly curl — the sell is the CONNECTED line of
      // shoulder → forearm → hand → receiver with the barrel carrying into
      // the muzzle flash. From behind-right the receiver occludes the open
      // palm, the chrome left arm reads as a targeting gesture thrown toward
      // the horde, and — critically — the BACKGROUND is the street: horde,
      // tracers, rain and the freshly compiled towers. (The front-left
      // profile trial framed the weapon fine but faced the camera up the
      // EMPTY end of the street — a black void behind the hero.) The v3
      // blockers from this family of angle are fixed upstream: the closeup
      // key lights the receiver rear (no floating-slab silhouette) and the
      // muzzle punch is halved (no bloom washout of the fore-end).
      // Camera rides ABOVE the weapon line (y 1.55 vs the gun's 1.23) looking
      // DOWN at it: from below, the belly-mounted energy cell hung between
      // the palm and the receiver and read as a gap ("hand holding a floating
      // green box" — v9 QA blocker). From above, the receiver visually
      // overlaps the hand, the cell tucks behind it, and the barrel carries
      // up-right into the muzzle flash + tracers toward the horde.
      const k3 = smoothstep(11.5, 12.9, t)
      dPos.current.set(hx + 1.05 - k3 * 0.07, 1.55 + k3 * 0.03, hz + 0.85 - k3 * 0.15)
      dLook.current.set(hx + 0.3, 1.1, hz - 1.8)
      // HARD CUT into the closeup — a lerp from the orbit's end pose would
      // sweep the camera straight through the hero's chest.
      if (lastShot.current < 11.5) {
        camPos.current.copy(dPos.current)
        camLook.current.copy(dLook.current)
        fovCur.current = 44
      }
    } else if (t < 16) {
      // Heroic low angle pushing in, looking up at the hero.
      const k4 = smoothstep(13.0, 15.6, t)
      dPos.current.set(hx + 1.7 - k4 * 0.5, 1.45, hz + 6.4 - k4 * 1.6)
      dLook.current.set(hx, 2.0, hz - 1.5)
    } else {
      // Settle for the title card.
      dPos.current.set(hx + 1.0, 1.7, hz + 6.0)
      dLook.current.set(hx, 2.0, hz - 1)
    }

    lastShot.current = t

    // Framerate-independent smoothing toward the desired pose.
    const posRate = t < 3.4 ? 1.4 : t < 7.6 ? 3.0 : t < 11.5 ? 4.0 : t < 13.0 ? 3.2 : 2.4
    const kp = 1 - Math.exp(-dt * posRate)
    const kl = 1 - Math.exp(-dt * (posRate + 1))
    camPos.current.lerp(dPos.current, kp)
    camLook.current.lerp(dLook.current, kl)
    camera.position.copy(camPos.current)

    // Handheld energy in the action beat, a whisper of it in the closeup.
    let shake = 0
    if (t >= 7.6 && t < 11.5) shake = 0.05 * slow
    else if (t >= 11.5 && t < 13.0) shake = 0.015
    if (shake > 0) {
      camera.position.x += Math.sin(rawT * 13.7) * shake
      camera.position.y += Math.sin(rawT * 9.3 + 1.7) * shake * 0.7
    }
    camera.lookAt(camLook.current)

    // Scripted FOV: crane compress → tower showcase → action wide → 44mm
    // closeup → settle. Eased, projection updated only when it moves.
    const fovT = t < 3.4 ? 56 - smoothstep(0, 3.4, t) * 6 : t < 7.6 ? 48 : t < 11.5 ? 52 : t < 13.0 ? 44 : 50
    fovCur.current += (fovT - fovCur.current) * Math.min(1, dt * 2.2)
    const pc = camera as THREE.PerspectiveCamera
    if (Math.abs(pc.fov - fovCur.current) > 0.01) {
      pc.fov = fovCur.current
      pc.updateProjectionMatrix()
    }
  })

  return (
    <group>
      <CodeCity />

      {/* Hologram-resolve punctuation: three hero towers compile in under
          the "every district is a coding pattern" beat — and the camera
          racks over to WATCH them do it. */}
      {RESOLVE_TOWERS.map((spec, i) => (
        <ResolveTower key={`rt${i}`} spec={spec} startRef={start} />
      ))}

      <group ref={heroGroup}>
        <Avatar anim={anim} accent={HERO_ACCENT} fireRef={fireRef} />
      </group>

      {/* The horde — the SAME updated organic Meshy zombie rigs the game
          fights (crowd GLBs + baked bone banks, instanced skinning, Death
          clip + de-rez), driven by the cinematic's scripted slots. Suspense
          holds it while the ~1MB of crowd assets stream; the opening beats
          frame the skyline, so a late-arriving crowd never shows. */}
      <Suspense fallback={null}>
        <ZombieHorde zombies={zombies} paused={false} shadows />
      </Suspense>
      {bolts.map((b, i) => (
        <BoltMesh key={`b${i}`} slot={b} />
      ))}

      {/* Muzzle flash punch light (driven imperatively). */}
      <pointLight ref={muzzleLight} color="#bdfcff" intensity={0} distance={16} decay={2} />
      {/* Grip-closeup key (warm, from over the camera's shoulder — see loop). */}
      <pointLight ref={closeupKey} color="#ffe0b8" intensity={0} distance={7} decay={2} />
      {/* Flickering street lamps either side. */}
      <pointLight ref={lampA} color="#ffba6a" position={[6, 5.5, -6]} intensity={5} distance={26} decay={2} />
      <pointLight ref={lampB} color="#ff8a5a" position={[-6, 5, -16]} intensity={4} distance={26} decay={2} />
      {/* Heroic accent rim light from down the street — the ref is HERE so
          the climax swell in the frame loop actually drives it. */}
      <directionalLight ref={rimLight} position={[4, 6, -24]} intensity={0.9} color={HERO_ACCENT} />
    </group>
  )
})

/* --------------------------------------------------------------- Component */

export function IntroCinematic() {
  // Rain target for the shared SIM uniform (the driver eases toward it).
  // Prewarm on mount so the rain reads from the very first frame, and hand
  // the uniform back dry on unmount (the overworld owns it afterwards).
  const rainTarget = useRef(0.9)
  useEffect(() => {
    SIM.rain.value = 0.65
    return () => {
      SIM.rain.value = 0
    }
  }, [])

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      // SMAA (below) handles edge AA inside the composer, so the default
      // framebuffer doesn't need its own (wasted) multisampling.
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      camera={{ position: [3.0, 9.8, 31], fov: 56, near: 0.1, far: 170 }}
    >
      <color attach="background" args={['#060810']} />
      <fog attach="fog" args={['#0a0e1d', 14, 80]} />

      {/* Ticks the shared simulation clock + eases SIM.rain to the storm. */}
      <SimulationDriver rainTargetRef={rainTarget} />

      {/* Neon night rain: GPU streaks + ground splash rings following the
          scripted camera. The wet streets below reflect through it. */}
      <RainSystem count={2400} />

      {/* M8 — baked IBL: a cold moon sheet + neon street bounce so the hero's
          armor and the rain-slick street pick up real reflections. */}
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={0.4} color="#131a30" scale={[40, 40, 1]} position={[0, 0, -18]} />
        <Lightformer form="rect" intensity={2.6} color="#a8c4ff" scale={[10, 12, 1]} position={[-8, 14, 6]} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.8} color={HERO_ACCENT} scale={[8, 4, 1]} position={[4, 4, -20]} target={[0, 1, 0]} />
        {/* Magenta neon bounce — the puddles drink this. */}
        <Lightformer form="rect" intensity={1.3} color="#ff4fd8" scale={[7, 5, 1]} position={[9, 7, -32]} target={[0, 0.5, -18]} />
      </Environment>
      {/* Dark night base. */}
      <hemisphereLight args={['#2a3350', '#05060a', 0.32]} />
      <ambientLight intensity={0.13} />
      {/* Cool moonlight key with shadows. */}
      <directionalLight
        position={[-10, 22, 6]}
        intensity={0.7}
        color="#8fb4ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={2}
        shadow-camera-far={70}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <CinematicScene />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.62} luminanceSmoothing={0.22} />
        <Vignette eskil={false} offset={0.24} darkness={0.76} />
        <Noise opacity={0.05} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  )
}
