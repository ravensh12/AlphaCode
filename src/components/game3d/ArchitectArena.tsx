import {
  Component,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { Architect3D, ARCHITECT_DEATH_DUR, type Architect3DProps, type ArchitectAnim, type ArchitectPhase } from './Architect3D'
import { genTowers, makeTowerMaps } from './nightTowerMaps'

// The real character-boss-architect rig streams lazily; the procedural
// Architect3D stays as the loading fallback AND the permanent one if the GLBs
// ever fail — a final boss always renders.
const MeshyArchitectBoss = lazy(() => import('./meshy/MeshyArchitectBoss'))

class BossBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** The Meshy Architect behind a boundary + suspense, procedural as fallback. */
function ArchitectSwitch(props: Architect3DProps) {
  const fallback = <Architect3D {...props} />
  return (
    <BossBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <MeshyArchitectBoss {...props} />
      </Suspense>
    </BossBoundary>
  )
}
import { useKeys } from './useKeys'
import {
  bossProjectileDamageScale,
  resolveEquippedWeapon,
  weaponPelletYaw,
} from './weaponProfile'
import {
  architectWardHint,
  ARCHITECT_SEALS,
  ARCHITECT_SIGILS,
  createMarkState,
  createSphinxState,
  createTwinKeyState,
  MARK,
  markDashTransfer,
  sphinxNextValue,
  sphinxStep,
  sphinxTileAt,
  tickMark,
  tickSphinx,
  tickTwinKey,
  twinStrike,
  WARD_CHIP_MUL,
  type MarkState,
  type MechEvent,
  type SphinxState,
  type TwinKeyState,
} from './bossMechanics'
import { playShot } from '../../lib/soundFx'
import {
  ARCHITECT_PHASE_TAUNTS,
  ARCHITECT_HIT_LINES,
} from '../../content/finalGauntletLore'
import {
  CinematicStage,
  CameraDirector,
  EmberField,
  SparkBurst,
  ShockwaveRing,
  GroundDecal,
  WeaponTrail,
  wetFloorProps,
  glossyFloorProps,
  useQuality,
  type QualityTier,
  type SparkBurstHandle,
  type ShockwaveRingHandle,
  type GroundDecalHandle,
  type WeaponTrailHandle,
} from './cinematic'
import {
  EnemyProjectiles,
  ImpactFlashes,
  type EnemyProjectilesHandle,
  type ImpactFlashesHandle,
} from './projectileFx'

/* ======================================================================
   THE APEX — the climactic final fight against THE ARCHITECT atop the Null
   Tower, in a lightning storm above a neon megacity.

   Built on the `cinematic` engine and the same proven combat scaffolding as
   CinematicBossArena, but DEEPER: 4 phases,
   200 boss HP / 14 player HP, a telekinesis/reality-editing roster (glyph-blades,
   debris hurl, lightning strikes, blink combo, force shockwaves, glyph-wall,
   reality-rewrite sweep, and a phase-4 glyph-storm ult),
   plus a storming rooftop that fractures as he loses. Ref-driven sim, pooled
   VFX, HUD via CinematicStage; no per-frame setState.
   ====================================================================== */

/* ------------------------------------------------------------- Tuning */

const WEAPON = resolveEquippedWeapon({ run: 'boss' })

const PLAYER_HP = 12
// ~100 HP per warded phase, with the finale weighted HEAVIEST (30%) — the
// Deletion-Mark endgame is the climax, not an 8-second victory lap (QA).
const BOSS_HP_MAX = 400
const P2_AT = Math.round(BOSS_HP_MAX * 0.76)
const P3_AT = Math.round(BOSS_HP_MAX * 0.53)
const P4_AT = Math.round(BOSS_HP_MAX * 0.3)

const BOUND = 24
const CAM_BACK = 8.2
const CAM_SIDE = 3.2
const CAM_HEIGHT = 4.6
const RUN_SPEED = 11.5
const HEADING_LERP = 0.22

const BOSS_SCALE = 1.34
const BOLT_HIT_R = 2.4

// Player physics
const GRAV = -30
const JUMP_V = 12.5

// Dash
const DASH_SPEED = 28
const DASH_TIME = 0.22
const DASH_CD = 0.5
const DASH_IFRAME = 0.18

// Roll
const ROLL_SPEED = 17
const ROLL_TIME = 0.36
const ROLL_CD = 0.7
const ROLL_IFRAME = 0.3

// Melee
const COMBO_WINDOW = 0.55
const MELEE_RANGE = 4.0
const MELEE_DMG = [5, 5, 9]
const LUNGE_SPEED = 19
const SLASH_TIME = 0.32

// Ranged
const LEGACY_BOLT_CD = 0.15
const BOSS_BOLT_DAMAGE_SCALE = bossProjectileDamageScale(LEGACY_BOLT_CD)
const BOLT_SPEED = WEAPON.boltSpeed
const BOLT_LIFE = 1.4
const BOLT_CD = WEAPON.cooldown
const BOLT_POOL = 48

// Boss projectiles
const ORB_POOL = 110
const ORB_LIFE = 6
const DEBRIS_POOL = 18
const PLAYER_HIT_R = 1.0

// VFX pools
const AFTER_POOL = 18
const DSHOCK_POOL = 4
const LBOLT_POOL = 6
const SLAB_POOL = 8

const ACCENT = '#8ea2ff'
const GLYPH = '#9fd0ff'
const HOT = '#ff7a4a'
const LIGHTNING = '#dCe8ff'

/** Boss entrance beat length (s) — hero shot + storm roar before the fight. */
const INTRO_DUR = 3.0

/* --------------------------- Phase wards (the mastery exam) ---------------
   Phases 2-4 guard the Architect's HP behind a TWISTED version of an earlier
   boss's kill mechanic (bossMechanics.ts); outside a broken ward damage is
   chip-only (WARD_CHIP_MUL):
     P1 — the opening: NO ward, just fight him down with melee/ranged.
     P2 — the Twin-Key seals: melee BOTH orbiting seals within the link.
     P3 — the Sphinx's sigils: cross 4 numbered sigils in ascending order.
     P4 — DELETION MARK (unique): he brands you; dash THROUGH him to return
          it before the fuse, detonating it on him.
   ------------------------------------------------------------------------ */

const WARD_HOT = '#ffd27a'
const WARD_GOOD = '#8dffb0'
const WARD_BAD = '#ff5a6a'

/** Crisp glyph texture for the sigil numbers (local twin of the arena helper).
 *  Dark backing disc keeps the digits readable over storm bloom (QA). */
function makeSigilTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128)
    ctx.fillStyle = 'rgba(4,6,12,0.72)'
    ctx.beginPath()
    ctx.arc(64, 64, 58, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(64, 64, 55, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = '900 76px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = color
    ctx.shadowBlur = 14
    ctx.fillStyle = color
    ctx.fillText(text, 64, 69)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, 64, 69)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 2
  return tex
}

type Phase = ArchitectPhase

type Bolt = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
}
type Orb = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number; mode: 0 | 1; lock: number }
type Debris = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3; life: number }
type After = { active: boolean; pos: THREE.Vector3; life: number }
type DShock = { active: boolean; x: number; z: number; t: number; dur: number; maxR: number; struck: boolean }
type LBolt = { active: boolean; x: number; z: number; t: number; struck: boolean }
type Slab = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler }
type Band = { active: boolean; z: number; dir: number; speed: number; gapX: number; gapHalf: number; struck: boolean; kind: 'wall' | 'sweep' }

/* ------------------------------------------------ Local Web-Audio SFX */
let _ac: AudioContext | null = null
let _mg: GainNode | null = null
let _nz: AudioBuffer | null = null
function ac(): AudioContext | null {
  try {
    if (!_ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      _ac = new AC()
      _mg = _ac.createGain()
      _mg.gain.value = 0.3
      _mg.connect(_ac.destination)
    }
    if (_ac.state === 'suspended') void _ac.resume()
    return _ac
  } catch {
    return null
  }
}
function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
  const c = ac()
  if (!c || !_mg) return
  const n = c.currentTime
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, n)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), n + dur)
  g.gain.setValueAtTime(0.0001, n)
  g.gain.linearRampToValueAtTime(vol, n + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, n + dur)
  o.connect(g).connect(_mg)
  o.start(n)
  o.stop(n + dur + 0.02)
}
function noise(dur: number, vol: number, hp: number) {
  const c = ac()
  if (!c || !_mg) return
  if (!_nz) {
    _nz = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate)
    const d = _nz.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const n = c.currentTime
  const src = c.createBufferSource()
  src.buffer = _nz
  const f = c.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = hp
  const g = c.createGain()
  g.gain.setValueAtTime(vol, n)
  g.gain.exponentialRampToValueAtTime(0.0001, n + dur)
  src.connect(f).connect(g).connect(_mg)
  src.start(n)
  src.stop(n + dur + 0.02)
}
const sfx = {
  slash: () => tone(1500, 320, 0.13, 'sawtooth', 0.1),
  hit: () => {
    tone(440, 70, 0.14, 'square', 0.16)
    noise(0.08, 0.12, 1600)
  },
  parry: () => {
    tone(2400, 900, 0.18, 'square', 0.17)
    noise(0.12, 0.16, 2400)
  },
  dash: () => tone(180, 620, 0.12, 'sine', 0.07),
  jump: () => tone(360, 720, 0.1, 'sine', 0.06),
  boom: () => {
    tone(140, 32, 0.55, 'sawtooth', 0.2)
    noise(0.45, 0.18, 200)
  },
  warn: () => tone(300, 320, 0.2, 'triangle', 0.05),
  thunder: () => {
    tone(70, 28, 1.2, 'sawtooth', 0.22)
    noise(1.1, 0.2, 120)
  },
  zap: () => {
    tone(1800, 200, 0.18, 'sawtooth', 0.14)
    noise(0.2, 0.16, 2000)
  },
}

/* ------------------------------------------------- Corruptible skyline */

/** Finale drive values, mutated by the scene every frame (no re-renders). */
interface CityStateRefs {
  /** 0..1 — how far the Null has eaten the city (phase-driven). */
  corrupt: MutableRefObject<number>
  /** 0..1 — the dawn that breaks over the city while the Architect dies. */
  dawn: MutableRefObject<number>
}

const C_WIN_BASE = new THREE.Color('#ffffff')
const C_WIN_NULL = new THREE.Color('#ff2438')
const C_WIN_DAWN = new THREE.Color('#ffca7a')

/**
 * The finale's city: the same lit-window skyline as everywhere else — until
 * the Architect starts LOSING. Window glow shifts blood-red in glitch waves,
 * a red wireframe ghost shell fades up over every block (the city de-rezzing
 * into the Null's source view), and in the last phase the outer towers
 * stutter-sink as whole blocks delete. When he falls, it all runs backwards
 * into a warm dawn. Two instanced draws + ~16 matrix writes per frame.
 */
const CorruptibleSkyline = memo(function CorruptibleSkyline({
  count,
  innerRadius,
  baseY,
  city,
}: {
  count: number
  innerRadius: number
  baseY: number
  city: CityStateRefs
}) {
  const winRef = useRef<THREE.InstancedMesh>(null)
  const wireRef = useRef<THREE.InstancedMesh>(null)
  const maps = useMemo(makeTowerMaps, [])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const winMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3a4257',
        map: maps.map,
        emissiveMap: maps.emissive,
        emissive: '#ffffff',
        emissiveIntensity: 0.8,
        roughness: 0.68,
        metalness: 0.25,
      }),
    [maps],
  )
  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ff3b4e',
        wireframe: true,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )
  const towers = useMemo(() => genTowers(count, innerRadius), [count, innerRadius])
  const dummy = useRef(new THREE.Object3D())
  useEffect(() => {
    const d = dummy.current
    for (const m of [winRef.current, wireRef.current]) {
      if (!m) continue
      for (let i = 0; i < towers.length; i++) {
        const t = towers[i]
        d.position.set(t.x, t.h / 2 + baseY, t.z)
        d.scale.set(t.w, t.h, t.d)
        d.rotation.set(0, (i * 0.61) % Math.PI, 0)
        d.updateMatrix()
        m.setMatrixAt(i, d.matrix)
      }
      m.count = towers.length
      m.instanceMatrix.needsUpdate = true
    }
  }, [towers, baseY])
  useEffect(
    () => () => {
      geo.dispose()
      winMat.dispose()
      wireMat.dispose()
      maps.map.dispose()
      maps.emissive.dispose()
    },
    [geo, winMat, wireMat, maps],
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const c = city.corrupt.current
    const dawn = city.dawn.current
    // Window tint: clean city → blood red with corruption → gold with dawn.
    winMat.emissive.copy(C_WIN_BASE).lerp(C_WIN_NULL, c).lerp(C_WIN_DAWN, dawn)
    // Glitch waves: corruption strobes whole-city brightness in rolling
    // square waves; dawn steadies and brightens everything.
    const wave = Math.sin(t * 9) > 0.65 || Math.sin(t * 23 + 4) > 0.9 ? 1 : 0
    winMat.emissiveIntensity =
      0.8 * (1 - c * 0.35) + c * wave * 0.9 + dawn * 0.9
    // Wireframe source-view shell (draw skipped entirely while clean).
    wireMat.opacity = c * (0.14 + 0.08 * Math.max(0, Math.sin(t * 3.2))) * (1 - dawn)
    if (wireRef.current) wireRef.current.visible = wireMat.opacity > 0.01
    // Last-phase de-rez: every 4th tower stutter-sinks as its block deletes.
    const win = winRef.current
    const wire = wireRef.current
    if (win && wire && (c > 0.75 || dawn > 0)) {
      const d = dummy.current
      const sinkK = Math.max(0, (c - 0.75) / 0.25) * (1 - dawn)
      for (let i = 0; i < towers.length; i += 4) {
        const tw = towers[i]
        // Quantized (stepped) sink — de-rez, not smooth submersion.
        const saw = Math.floor(((Math.sin(t * 1.1 + i * 2.7) + 1) / 2) * 5) / 5
        const s = 1 - sinkK * saw * 0.55
        d.position.set(tw.x, (tw.h * s) / 2 + baseY, tw.z)
        d.scale.set(tw.w, tw.h * s, tw.d)
        d.rotation.set(0, (i * 0.61) % Math.PI, 0)
        d.updateMatrix()
        win.setMatrixAt(i, d.matrix)
        wire.setMatrixAt(i, d.matrix)
      }
      win.instanceMatrix.needsUpdate = true
      wire.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group>
      <instancedMesh ref={winRef} args={[geo, winMat, count]} frustumCulled={false} />
      <instancedMesh ref={wireRef} args={[geo, wireMat, count]} frustumCulled={false} renderOrder={3} />
    </group>
  )
})

/* -------------------------------------------------------------- Sky dome */

/**
 * The finale sky. CinematicStage renders a "void" (flat dark clear color) —
 * which left a dead-black slab above the skyline (QA: "sky ~80% black, no
 * dawn"). This inverted gradient dome sits behind everything and is driven by
 * the same city refs: storm indigo in P1, a pulsing blood-red corruption
 * band as he wins the war on reality, then a warm dawn that breaks when he
 * falls. Fog-immune, depth-write-off, drawn first — a pure backdrop, one
 * draw call, uniforms updated once per frame.
 */
const FinaleSky = memo(function FinaleSky({ city }: { city: CityStateRefs }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uCorrupt: { value: 0 },
          uDawn: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPos;
          uniform float uCorrupt;
          uniform float uDawn;
          uniform float uTime;
          void main() {
            float h = clamp(vPos.y / 180.0 * 0.5 + 0.5, 0.0, 1.0);
            // P1 storm: deep indigo, lighter toward the horizon.
            vec3 storm = mix(vec3(0.02,0.03,0.07), vec3(0.05,0.07,0.16), pow(h, 0.8));
            // Corruption: near-black crown, blood-red horizon that pulses.
            float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
            vec3 corr = mix(vec3(0.28,0.02,0.05) * (0.6 + 0.4 * pulse), vec3(0.03,0.0,0.02), pow(h, 0.55));
            vec3 col = mix(storm, corr, uCorrupt);
            // Dawn: warm horizon rising into cool morning blue.
            vec3 dawn = mix(vec3(1.0,0.62,0.34), vec3(0.36,0.5,0.72), pow(h, 0.65));
            col = mix(col, dawn, uDawn);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [],
  )
  const geo = useMemo(() => new THREE.SphereGeometry(182, 32, 16), [])
  useEffect(
    () => () => {
      mat.dispose()
      geo.dispose()
    },
    [mat, geo],
  )
  useFrame((state) => {
    mat.uniforms.uCorrupt.value = city.corrupt.current
    mat.uniforms.uDawn.value = city.dawn.current
    mat.uniforms.uTime.value = state.clock.elapsedTime
  })
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={-100} />
})

/* ---------------------------------------------------------- Rooftop env */

function ApexRooftop({ accent, tier, count, city }: { accent: string; tier: QualityTier; count: number; city: CityStateRefs }): JSX.Element {
  return (
    <group>
      {/* Wet rooftop deck: real-time reflector on HIGH only; cheap glossy PBR
          (IBL reflections, no scene re-render) on MED/LOW. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[BOUND + 8, 64]} />
        {tier === 'high' ? (
          <MeshReflectorMaterial {...wetFloorProps} color="#0b0d16" />
        ) : (
          <meshStandardMaterial {...glossyFloorProps} color="#0b0d16" />
        )}
      </mesh>

      {/* Helipad H + landing circle. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[7.4, 8.0, 48]} />
        <meshBasicMaterial color="#e9f0ff" transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>
      {[-1.8, 1.8].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.03, 0]}>
          <planeGeometry args={[0.7, 7]} />
          <meshBasicMaterial color="#e9f0ff" transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <planeGeometry args={[3.6, 0.7]} />
        <meshBasicMaterial color="#e9f0ff" transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>

      {/* Edge boundary glow. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
        <ringGeometry args={[BOUND - 0.5, BOUND + 0.3, 72]} />
        <meshBasicMaterial color={accent} transparent opacity={0.45} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>

      {/* Railings + antennae + AC units around the rim (background — no shadow cast). */}
      {Array.from({ length: tier === 'low' ? 14 : 28 }).map((_, i) => {
        const n = tier === 'low' ? 14 : 28
        const a = (i / n) * Math.PI * 2
        const r = BOUND + 1.2
        return (
          <mesh key={`rail${i}`} position={[Math.cos(a) * r, 0.7, Math.sin(a) * r]}>
            <boxGeometry args={[0.12, 1.4, 0.12]} />
            <meshStandardMaterial color="#1a1e2c" roughness={0.6} metalness={0.6} />
          </mesh>
        )
      })}
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4
        const r = BOUND - 3
        return (
          <group key={`ac${i}`} position={[Math.cos(a) * r, 0, Math.sin(a) * r]}>
            <mesh position={[0, 0.6, 0]} receiveShadow>
              <boxGeometry args={[2.4, 1.2, 1.8]} />
              <meshStandardMaterial color="#12151f" roughness={0.7} metalness={0.4} />
            </mesh>
            <mesh position={[0, 2.6, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 3, 6]} />
              <meshStandardMaterial color="#222840" roughness={0.5} metalness={0.7} />
            </mesh>
            <mesh position={[0, 4.1, 0]}>
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshBasicMaterial color={HOT} toneMapped={false} fog={false} />
            </mesh>
          </group>
        )
      })}

      {/* Skyline — the same lit-window night city the other arenas stage,
          sunk below the rooftop deck… and wired into the finale: it corrupts
          phase by phase and breaks into dawn when the Architect falls. */}
      <CorruptibleSkyline count={count} innerRadius={BOUND + 36} baseY={-38} city={city} />
    </group>
  )
}

/* ------------------------------------------------------------- Rain */

function Rain({ count }: { count: number }): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const drops = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 70,
        y: Math.random() * 40,
        z: (Math.random() - 0.5) * 70,
        v: 36 + Math.random() * 24,
      })),
    [count],
  )
  const geo = useMemo(() => new THREE.BoxGeometry(0.02, 0.9, 0.02), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#aebfe0', transparent: true, opacity: 0.35, toneMapped: false, fog: false }), [])
  const dummy = useRef(new THREE.Object3D())
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])
  useFrame((state, dtRaw) => {
    const m = meshRef.current
    if (!m) return
    const dt = Math.min(dtRaw, 0.05)
    const cam = state.camera
    const d = dummy.current
    for (let i = 0; i < drops.length; i++) {
      const dr = drops[i]
      dr.y -= dr.v * dt
      if (dr.y < 0) {
        dr.y = 40
        dr.x = cam.position.x + (Math.random() - 0.5) * 70
        dr.z = cam.position.z + (Math.random() - 0.5) * 70
      }
      d.position.set(dr.x, dr.y, dr.z)
      d.scale.set(1, 1.6, 1)
      d.rotation.set(0.1, 0, 0.04)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />
}

/* ------------------------------------------------------------- Scene */

interface SceneProps {
  accent: string
  dead: boolean
  frozen: boolean
  /** Player HP hit 0 — drives the avatar's death collapse (presentation only). */
  playerDefeated: boolean
  phaseRef: MutableRefObject<Phase>
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
  staggerRef: MutableRefObject<number>
  phaseBreakRef: MutableRefObject<number>
  bossReadyRef: MutableRefObject<number>
  onCurtainUp: () => void
  onBossHit: (amount: number) => void
  onBossHeal: (amount: number) => void
  onPlayerHit: (amount: number) => void
  onBossAttack: () => void
  onTelegraph: (label: string | null, danger?: boolean) => void
  onMechFlash: (label: string | null, danger?: boolean) => void
  onCombo: (n: number) => void
  qaHooks: boolean
}

const ArchitectScene = memo(function ArchitectScene({
  accent,
  dead,
  frozen,
  playerDefeated,
  phaseRef,
  hitRef,
  attackRef,
  staggerRef,
  phaseBreakRef,
  bossReadyRef,
  onCurtainUp,
  onBossHit,
  onBossHeal,
  onPlayerHit,
  onBossAttack,
  onTelegraph,
  onMechFlash,
  onCombo,
  qaHooks,
}: SceneProps): JSX.Element {
  const { camera, gl } = useThree()
  const tier = useQuality()

  const dirRef = useRef<CameraDirector | null>(null)
  if (!dirRef.current) dirRef.current = new CameraDirector()

  // VFX handles.
  const sparks = useRef<SparkBurstHandle>(null)
  const shockFx = useRef<ShockwaveRingHandle>(null)
  const decals = useRef<GroundDecalHandle>(null)
  const playerTrail = useRef<WeaponTrailHandle>(null)

  // Storm.
  const lightningLight = useRef<THREE.DirectionalLight>(null)
  const skyFlash = useRef<THREE.Mesh>(null)
  const skyFlashMat = useRef<THREE.MeshBasicMaterial>(null)
  const flashT = useRef(-100)
  const nextAmbientBolt = useRef(3)
  const thunderDelay = useRef<number | null>(null)

  // Deck tilt (reality-rewrite).
  const deckTilt = useRef<THREE.Group>(null)

  // ---- FINALE STATE (all imperative — zero re-renders mid-fight) ----
  // Corruption eats the city as he loses; dawn takes it back when he dies.
  const corruptRef = useRef(0)
  const dawnRef = useRef(0)
  const city = useRef<CityStateRefs>({ corrupt: corruptRef, dawn: dawnRef }).current
  // The colossal sky projection (phase 2+): grows in behind the skyline and
  // mirrors his every gesture. Group scale is animated imperatively.
  const giantGrp = useRef<THREE.Group>(null)
  const giantScale = useRef(0)
  const giantAzimuth = useRef(Math.PI) // start upstage (behind the boss)
  // Reality-glitch shockwave shells (wireframe cylinders bursting outward).
  const glitchShells = useMemo(
    () => Array.from({ length: 3 }, () => ({ active: false, t: 0 })),
    [],
  )
  const glitchRefs = useRef<(THREE.Mesh | null)[]>([])
  const glitchMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const nextGlitchWave = useRef(6)
  // Corrupted data rings that ignite across the deck as the city falls.
  const deckRingMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  // Fog palette drift (mutates scene.fog — CinematicStage only sets initials).
  const fogColor = useRef(new THREE.Color('#070a14'))
  const fogTarget = useRef(new THREE.Color('#070a14'))

  // ---- Player ----
  const playerGroup = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 15))
  const velY = useRef(0)
  const grounded = useRef(true)
  const heading = useRef(Math.PI)
  const fireRef = useRef(0)
  const slashStart = useRef(-100)
  const playerAnimRef = useRef<AvatarAnim>('idle')

  const action = useRef<'none' | 'dash' | 'roll' | 'lunge'>('none')
  const actionT = useRef(0)
  const actionDir = useRef(new THREE.Vector3())
  const dashCd = useRef(0)
  const rollCd = useRef(0)
  const invuln = useRef(false)
  const afterTimer = useRef(0)

  const sliceActive = useRef(false)
  const sliceT = useRef(0)
  const sliceHit = useRef(false)
  const comboIndex = useRef(0)
  const comboTimer = useRef(0)

  // Input edges.
  const holdFire = useRef(false)
  const reqSlice = useRef(false)
  const reqDash = useRef(false)
  const reqRoll = useRef(false)
  const reqJump = useRef(false)
  const downSet = useRef<Set<string>>(new Set())

  // ---- Boss ----
  const bossGroup = useRef<THREE.Group>(null)
  const bossPos = useRef(new THREE.Vector3(0, 0, -3))
  const bossHeading = useRef(0)
  const vexAnimRef = useRef<ArchitectAnim>('idle')
  const cullFrames = useRef(0)

  // ---- Echo clones (the boss "splits into multiple") ----
  const cloneARef = useRef<THREE.Group>(null)
  const cloneBRef = useRef<THREE.Group>(null)
  const cloneAPos = useRef(new THREE.Vector3())
  const cloneBPos = useRef(new THREE.Vector3())
  const cloneCullA = useRef(0)
  const cloneCullB = useRef(0)

  const atkState = useRef<'gap' | 'tele' | 'active' | 'recover'>('gap')
  const atkName = useRef<string>('')
  const atkT = useRef(0)
  const gapT = useRef(1.4)
  const lastName = useRef('')
  const blinkStruck = useRef(false)
  const prevPhase = useRef<Phase>(1)
  const markPts = useRef<{ x: number; z: number }[]>([])
  const tiltT = useRef(0)

  // ---- Phase wards (twisted reprises of the realm mechanics) ----
  const seals = useRef<TwinKeyState>(createTwinKeyState(ARCHITECT_SEALS))
  const sigils = useRef<SphinxState | null>(null)
  const mark = useRef<MarkState>(createMarkState())
  const sealPosA = useRef(new THREE.Vector3())
  const sealPosB = useRef(new THREE.Vector3())
  const sealRefs = useRef<(THREE.Group | null)[]>([])
  const sealMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const sigilRefs = useRef<(THREE.Group | null)[]>([])
  const sigilDiskMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const sigilSpriteMats = useRef<(THREE.SpriteMaterial | null)[]>([])
  const sigilTexes = useRef<(THREE.CanvasTexture | null)[]>([])
  const markRingRef = useRef<THREE.Mesh>(null)
  const markRingMat = useRef<THREE.MeshBasicMaterial>(null)
  const markBeamRef = useRef<THREE.Mesh>(null)
  const markBeamMat = useRef<THREE.MeshBasicMaterial>(null)
  const sigilDwellIdx = useRef(-1)
  const sigilDwellT = useRef(0)
  const wardFlashHold = useRef(0)
  const lastWardFlash = useRef<string | null>('')
  const qaRec = useRef({
    variant: -1,
    open: false,
    fire: true,
    hold: false,
    keys: [] as string[],
    press: [] as string[],
  })
  useEffect(() => {
    const texes = sigilTexes.current
    return () => {
      for (const tx of texes) tx?.dispose()
    }
  }, [])
  const refreshSigilGlyphs = useCallback(() => {
    const s = sigils.current
    if (!s) return
    for (let i = 0; i < s.tiles.length; i++) {
      const mat = sigilSpriteMats.current[i]
      if (!mat) continue
      const tex = makeSigilTexture(String(s.tiles[i].value), WARD_HOT)
      sigilTexes.current[i]?.dispose()
      sigilTexes.current[i] = tex
      mat.map = tex
      mat.needsUpdate = true
    }
  }, [])

  /** Is the current phase's ward broken right now (full damage window)? */
  function wardBroken(phase: Phase): boolean {
    // P1 has no ward — the boss takes full damage the whole opening phase.
    if (phase === 1) return true
    if (phase === 2) return seals.current.windowT > 0
    if (phase === 3) return (sigils.current?.windowT ?? 0) > 0
    if (phase === 4) return mark.current.windowT > 0
    return false
  }

  /** Push a transient ward flash only when the text changes. */
  function wardFlash(label: string | null, danger = false, hold = 0) {
    if (label === lastWardFlash.current) return
    lastWardFlash.current = label
    onMechFlash(label, danger)
    if (hold > 0) wardFlashHold.current = hold
  }

  /** Route ward-mechanic events into damage/heals/VFX/prompts. */
  function applyWardEvents(events: readonly MechEvent[]) {
    if (events.length === 0) return
    const dir = dirRef.current
    for (const e of events) {
      switch (e.type) {
        case 'open':
          if (shockFx.current) {
            shockFx.current.fire(
              tmpDir.current.set(bossPos.current.x, 0.05, bossPos.current.z),
              7,
              WARD_GOOD,
            )
          }
          if (sparks.current) {
            sparks.current.burst(
              tmpTip.current.set(bossPos.current.x, 2, bossPos.current.z),
              WARD_GOOD,
              22,
            )
          }
          hitRef.current += 1
          dir?.shake(0.35)
          wardFlash('WARD BROKEN — UNLOAD!', false, 1.2)
          sfx.parry()
          break
        case 'close':
          wardFlash(null)
          break
        case 'heal':
          if (e.amount > 0) {
            onBossHeal(e.amount)
            if (sparks.current) {
              sparks.current.burst(
                tmpTip.current.set(bossPos.current.x, 2.2, bossPos.current.z),
                WARD_BAD,
                14,
              )
            }
          } else {
            // The returned Deletion Mark detonates ON HIM — raw, ungated damage.
            onBossHit(-e.amount)
            hitRef.current += 1
            if (dir) {
              dir.shake(0.55)
              dir.punch(0.6)
            }
            if (shockFx.current) {
              shockFx.current.fire(
                tmpDir.current.set(bossPos.current.x, 0.05, bossPos.current.z),
                9,
                WARD_BAD,
              )
            }
            sfx.boom()
          }
          break
        case 'zap':
          if (!invuln.current) onPlayerHit(e.amount)
          if (dir) {
            dir.shake(0.3)
            dir.punch(0.45)
          }
          break
        case 'shuffle':
          if (phaseRef.current === 2) {
            wardFlash(
              seals.current.phase === 'second'
                ? '◆ NOW THE OTHER SEAL — CROSS HIM! ◆'
                : 'A SEAL IGNITES — MELEE IT!',
              true,
              1.6,
            )
            sfx.warn()
          } else if (phaseRef.current === 3) {
            refreshSigilGlyphs()
          } else if (phaseRef.current === 4) {
            wardFlash('◆ YOU ARE MARKED — DASH THROUGH HIM ◆', true, 2.2)
            sfx.warn()
          }
          break
        case 'progress':
          if (sparks.current) {
            sparks.current.burst(
              tmpTip.current.set(pos.current.x, 1.4, pos.current.z),
              WARD_GOOD,
              8,
            )
          }
          sfx.slash()
          break
        case 'mistake':
          if (e.reason === 'link-broken') wardFlash('TOO SLOW — THE SEALS RESET, HE FEEDS', true, 1.8)
          else if (e.reason === 'wrong-lock') wardFlash('WRONG SEAL — THE IGNITED ONE FIRST. HE FEEDS', true, 1.8)
          else if (e.reason === 'too-early') wardFlash('THE SECOND SEAL STILL CHARGES — HE FEEDS', true, 1.8)
          else if (e.reason === 'wrong-order') wardFlash('WRONG SIGIL — LOWEST FIRST. HE FEEDS', true, 1.8)
          else if (e.reason === 'timeout') wardFlash('SIGILS RESHUFFLED — FASTER', true, 1.6)
          else if (e.reason === 'mark-detonated') wardFlash('THE MARK CONSUMED YOU', true, 1.8)
          dirRef.current?.shake(0.2)
          break
      }
    }
  }

  // Juice.
  const hitStop = useRef(0)
  const cutsceneT = useRef(0)
  const slowmoUntil = useRef(0)

  // Entrance beat: hero-shot sweep on the Architect (sim parked). Held
  // behind the black curtain until the real rig mounts (2.2s cap).
  const introT = useRef(0)
  const holdT = useRef(0)
  const curtainCalled = useRef(false)
  const introSnapped = useRef(false)
  const introRoared = useRef(false)

  const enabledRef = useRef(true)
  enabledRef.current = !frozen
  const keys = useKeys(enabledRef)

  // Pools.
  const bolts = useMemo<Bolt[]>(
    () =>
      Array.from({ length: BOLT_POOL }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: WEAPON.damage,
      })),
    [],
  )
  const orbs = useMemo<Orb[]>(() => Array.from({ length: ORB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, mode: 0 as const, lock: 0 })), [])
  const debris = useMemo<Debris[]>(() => Array.from({ length: DEBRIS_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 })), [])
  const afters = useMemo<After[]>(() => Array.from({ length: AFTER_POOL }, () => ({ active: false, pos: new THREE.Vector3(), life: 0 })), [])
  const dshocks = useMemo<DShock[]>(() => Array.from({ length: DSHOCK_POOL }, () => ({ active: false, x: 0, z: 0, t: 0, dur: 0.7, maxR: BOUND, struck: false })), [])
  const lbolts = useMemo<LBolt[]>(() => Array.from({ length: LBOLT_POOL }, () => ({ active: false, x: 0, z: 0, t: 0, struck: false })), [])
  const slabs = useMemo<Slab[]>(() => Array.from({ length: SLAB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler() })), [])
  const band = useRef<Band>({ active: false, z: 0, dir: 1, speed: 10, gapX: 0, gapHalf: 2.2, struck: false, kind: 'wall' })

  const boltsMesh = useRef<THREE.InstancedMesh>(null)
  const orbFx = useRef<EnemyProjectilesHandle>(null)
  const impactFx = useRef<ImpactFlashesHandle>(null)
  const debrisMesh = useRef<THREE.InstancedMesh>(null)
  const afterMesh = useRef<THREE.InstancedMesh>(null)
  const lboltRefs = useRef<(THREE.Mesh | null)[]>([])
  const lboltMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const slabRefs = useRef<(THREE.Mesh | null)[]>([])
  const wallARef = useRef<THREE.Mesh>(null)
  const wallBRef = useRef<THREE.Mesh>(null)
  const wallAMat = useRef<THREE.MeshBasicMaterial>(null)
  const wallBMat = useRef<THREE.MeshBasicMaterial>(null)
  const cooldown = useRef(0)

  // Scratch.
  const dObj = useRef(new THREE.Object3D())
  const tmpFwd = useRef(new THREE.Vector3())
  const tmpRight = useRef(new THREE.Vector3())
  const tmpMove = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())
  const tmpLook = useRef(new THREE.Vector3())
  const tmpFrom = useRef(new THREE.Vector3())
  const tmpTip = useRef(new THREE.Vector3())

  // Instanced geo/mat.
  const boltGeo = useMemo(() => new THREE.SphereGeometry(0.16, 8, 8), [])
  const boltMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, fog: false }), [accent])
  const debrisGeo = useMemo(() => new THREE.DodecahedronGeometry(0.5, 0), [])
  const debrisMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2e3c', roughness: 0.8, metalness: 0.3, flatShading: true }), [])
  const afterGeo = useMemo(() => new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), [])
  const afterMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, fog: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), [accent])
  useEffect(
    () => () => {
      boltGeo.dispose(); boltMat.dispose()
      debrisGeo.dispose(); debrisMat.dispose(); afterGeo.dispose(); afterMat.dispose()
    },
    [boltGeo, boltMat, debrisGeo, debrisMat, afterGeo, afterMat],
  )

  /* --- spawn helpers --- */
  function spawnOrb(x: number, y: number, z: number, vx: number, vy: number, vz: number, mode: 0 | 1, lock = 0): boolean {
    const o = orbs.find((q) => !q.active)
    if (!o) return false
    o.active = true
    o.life = ORB_LIFE
    o.pos.set(x, y, z)
    o.vel.set(vx, vy, vz)
    o.mode = mode
    o.lock = lock
    return true
  }
  function emitCloneFan(from: THREE.Vector3, phase: Phase) {
    const shots = phase >= 4 ? 7 : 5
    tmpDir.current.set(pos.current.x - from.x, 0, pos.current.z - from.z).normalize()
    const base = Math.atan2(tmpDir.current.x, tmpDir.current.z)
    for (let s = 0; s < shots; s++) {
      const ang = base + (s - (shots - 1) / 2) * 0.2
      spawnOrb(from.x, 1.5, from.z, Math.sin(ang) * 3, 0, Math.cos(ang) * 3, 0, 0.6)
    }
  }
  /** How many echo-clones are active this phase. */
  function cloneCountFor(phase: Phase): number {
    return phase >= 3 ? 2 : phase >= 2 ? 1 : 0
  }
  function spawnDebris(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const d = debris.find((q) => !q.active)
    if (!d) return
    d.active = true
    d.life = 4
    d.pos.set(x, y, z)
    d.vel.set(vx, vy, vz)
    d.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
  }
  function fireDShock(x: number, z: number, maxR: number) {
    const s = dshocks.find((q) => !q.active)
    if (s) {
      s.active = true
      s.x = x
      s.z = z
      s.t = 0
      s.dur = 0.7
      s.maxR = maxR
      s.struck = false
    }
    if (shockFx.current) shockFx.current.fire(tmpDir.current.set(x, 0.05, z), maxR, accent)
  }
  function strikeLightning(x: number, z: number) {
    const l = lbolts.find((q) => !q.active)
    if (l) {
      l.active = true
      l.x = x
      l.z = z
      l.t = 0
      l.struck = false
    }
    triggerFlash(0.9)
    sfx.zap()
    thunderDelay.current = 0.15
  }
  function triggerFlash(strength: number) {
    flashT.current = strengthClock()
    flashStrength.current = strength
  }
  const flashStrength = useRef(0)
  function strengthClock(): number {
    return performance.now() / 1000
  }
  function spawnSlabs(n: number) {
    for (let i = 0, c = 0; i < slabs.length && c < n; i++) {
      const s = slabs[i]
      if (s.active) continue
      c++
      s.active = true
      const a = Math.random() * Math.PI * 2
      const r = 6 + Math.random() * (BOUND - 8)
      s.pos.set(Math.cos(a) * r, 0.1, Math.sin(a) * r)
      s.vel.set((Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5)
      s.spin.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2)
      s.rot.set(0, Math.random() * Math.PI, 0)
    }
  }

  // Input listeners (identical kit to CinematicBossArena).
  useEffect(() => {
    const el = gl.domElement
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) holdFire.current = true
      else reqSlice.current = true
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) holdFire.current = false
    }
    const ctx = (e: Event) => e.preventDefault()
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const fresh = !downSet.current.has(k)
      downSet.current.add(k)
      if (k === 'f') holdFire.current = true
      if (k === 'q' && fresh) reqSlice.current = true
      if (k === 'shift' && fresh) reqDash.current = true
      if (k === 'k' && fresh) reqRoll.current = true
      if ((k === ' ' || e.code === 'Space') && fresh) {
        reqJump.current = true
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      downSet.current.delete(k)
      if (k === 'f') holdFire.current = false
    }
    const onBlur = () => {
      downSet.current.clear()
      holdFire.current = false
    }
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('contextmenu', ctx)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('contextmenu', ctx)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl])

  useEffect(() => {
    camera.position.set(CAM_SIDE, CAM_HEIGHT, 15 + CAM_BACK)
  }, [camera])

  /* ----------------------------- attack chooser ----------------------------- */
  function durs(name: string): [number, number, number] {
    switch (name) {
      case 'glyphFan': return [0.7, 0.9, 0.5]
      case 'debris': return [0.7, 0.6, 0.5]
      case 'lightning': return [1.0, 0.5, 0.5]
      case 'blink': return [0.45, 0.55, 0.6]
      case 'shockwave': return [0.7, 0.3, 0.5]
      case 'glyphWall': return [0.9, 1.4, 0.5]
      case 'rewrite': return [1.2, 2.0, 0.7]
      case 'ultimate': return [1.8, 1.6, 1.0]
      default: return [0.8, 0.5, 0.5]
    }
  }
  function telegraphLabel(name: string): [string, boolean] {
    switch (name) {
      case 'glyphFan': return ['GLYPH FAN — SIDESTEP', false]
      case 'debris': return ['DEBRIS HURL — DASH', false]
      case 'lightning': return ['LIGHTNING STRIKES — MOVE', false]
      case 'blink': return ['HE VANISHES — WATCH YOUR BACK', false]
      case 'shockwave': return ['FORCE WAVE — JUMP', false]
      case 'glyphWall': return ['GLYPH WALL — DASH THE GAP', false]
      case 'rewrite': return ['◆ REALITY REWRITE — DASH THE SWEEP ◆', true]
      case 'ultimate': return ['◆◆ DELETION PROTOCOL — SURVIVE ◆◆', true]
      default: return ['', false]
    }
  }
  function chooseAttack(phase: Phase) {
    // P1 is the open phase — no ward, so it's a straight dodge-and-punish mix.
    const p1 = ['glyphFan', 'debris', 'shockwave']
    const p2 = ['glyphFan', 'debris', 'shockwave', 'lightning', 'blink', 'glyphWall']
    const p3 = ['glyphFan', 'debris', 'shockwave', 'lightning', 'blink', 'glyphWall', 'rewrite']
    const p4 = ['glyphFan', 'debris', 'lightning', 'blink', 'glyphWall', 'rewrite', 'ultimate']
    const list = phase === 1 ? p1 : phase === 2 ? p2 : phase === 3 ? p3 : p4
    let name = list[Math.floor(Math.random() * list.length)]
    if (name === lastName.current) name = list[Math.floor(Math.random() * list.length)]
    lastName.current = name
    atkName.current = name
    atkState.current = 'tele'
    atkT.current = 0
    blinkStruck.current = false
    const [lab, danger] = telegraphLabel(name)
    onTelegraph(lab, danger)
    sfx.warn()

    if (name === 'lightning') {
      markPts.current = []
      const cnt = phase === 2 ? 4 : phase === 3 ? 6 : 8
      const dur = durs('lightning')[0]
      for (let i = 0; i < cnt; i++) {
        let x: number, z: number
        if (i === 0) {
          x = pos.current.x
          z = pos.current.z
        } else {
          const a = Math.random() * Math.PI * 2
          const rr = Math.random() * (BOUND - 3)
          x = Math.cos(a) * rr
          z = Math.sin(a) * rr
        }
        markPts.current.push({ x, z })
        if (decals.current) decals.current.show(tmpDir.current.set(x, 0.05, z), 2.6, LIGHTNING, dur)
      }
    } else if (name === 'glyphWall') {
      band.current.active = true
      band.current.kind = 'wall'
      band.current.z = -BOUND - 2
      band.current.dir = 1
      band.current.speed = phase >= 4 ? 17 : 14
      band.current.gapHalf = phase >= 4 ? 2.4 : 3.0
      band.current.gapX = THREE.MathUtils.clamp(pos.current.x + (Math.random() - 0.5) * 6, -BOUND + 4, BOUND - 4)
      band.current.struck = false
    } else if (name === 'rewrite') {
      band.current.active = true
      band.current.kind = 'sweep'
      band.current.z = -BOUND - 2
      band.current.dir = 1
      band.current.speed = 9
      band.current.gapHalf = 0
      band.current.gapX = 0
      band.current.struck = false
      tiltT.current = durs('rewrite')[0] + durs('rewrite')[1]
    } else if (name === 'blink') {
      // Reposition behind the player at the END of the telegraph (in execute).
    }
  }

  function executeAttack(phase: Phase) {
    const name = atkName.current
    onBossAttack()
    if (name === 'glyphFan') {
      const shots = phase === 1 ? 6 : phase === 2 ? 9 : phase === 3 ? 11 : 14
      tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z).normalize()
      const base = Math.atan2(tmpDir.current.x, tmpDir.current.z)
      for (let s = 0; s < shots; s++) {
        const ang = base + (s - (shots - 1) / 2) * 0.18
        // Slow drift first; homing lock fires them after ~0.6s.
        spawnOrb(bossPos.current.x, bossPos.current.y + 1.5, bossPos.current.z, Math.sin(ang) * 3, 0, Math.cos(ang) * 3, 0, 0.6)
      }
      // Muzzle flare — the fan visibly LEAVES the Architect's core.
      impactFx.current?.spawn(bossPos.current.x, bossPos.current.y + 1.5, bossPos.current.z, GLYPH, 1.1, 4)
      // Echo-clones loose their own fans, so volleys come from several directions.
      const cc = cloneCountFor(phase)
      if (cc >= 1) emitCloneFan(cloneAPos.current, phase)
      if (cc >= 2) emitCloneFan(cloneBPos.current, phase)
    } else if (name === 'debris') {
      const chunks = phase >= 3 ? 6 : 4
      tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z).normalize()
      const base = Math.atan2(tmpDir.current.x, tmpDir.current.z)
      const spd = phase >= 3 ? 20 : 16
      for (let s = 0; s < chunks; s++) {
        const ang = base + (s - (chunks - 1) / 2) * 0.12
        spawnDebris(bossPos.current.x, bossPos.current.y + 1.6, bossPos.current.z, Math.sin(ang) * spd, 1, Math.cos(ang) * spd)
      }
      sfx.boom()
    } else if (name === 'lightning') {
      for (const p of markPts.current) strikeLightning(p.x, p.z)
      if (dirRef.current) dirRef.current.shake(0.2)
    } else if (name === 'shockwave') {
      fireDShock(bossPos.current.x, bossPos.current.z, BOUND)
      if (phase >= 3) fireDShock(bossPos.current.x, bossPos.current.z, BOUND * 0.65)
      sfx.boom()
    } else if (name === 'blink') {
      // Teleport behind the player.
      tmpDir.current.set(bossPos.current.x - pos.current.x, 0, bossPos.current.z - pos.current.z).normalize()
      bossPos.current.set(pos.current.x - tmpDir.current.x * 3.2, 0, pos.current.z - tmpDir.current.z * 3.2)
      const br = Math.hypot(bossPos.current.x, bossPos.current.z)
      if (br > BOUND - 2) {
        bossPos.current.x *= (BOUND - 2) / br
        bossPos.current.z *= (BOUND - 2) / br
      }
      if (sparks.current) sparks.current.burst(tmpDir.current.set(bossPos.current.x, 1.2, bossPos.current.z), accent, 14)
      sfx.dash()
    } else if (name === 'ultimate') {
      const N = phase >= 4 ? 30 : 24
      for (let n = 0; n < N; n++) {
        const a = (n / N) * Math.PI * 2
        spawnOrb(bossPos.current.x, bossPos.current.y + 1.5, bossPos.current.z, Math.cos(a) * 15, 0, Math.sin(a) * 15, 1)
      }
      fireDShock(bossPos.current.x, bossPos.current.z, BOUND)
      // Clones add their own radial bursts to the deletion protocol.
      const ccu = cloneCountFor(phase)
      if (ccu >= 1) emitCloneFan(cloneAPos.current, phase)
      if (ccu >= 2) emitCloneFan(cloneBPos.current, phase)
      if (dirRef.current) dirRef.current.shake(0.7)
      triggerFlash(1.0)
      sfx.boom()
      sfx.thunder()
    }
    // 'glyphWall','rewrite' resolve via per-frame updates.
  }

  function activeAttack(_phase: Phase) {
    const name = atkName.current
    const dir = dirRef.current
    if (name === 'blink' && !blinkStruck.current) {
      if (atkT.current >= 0.3) {
        blinkStruck.current = true
        vexAnimRef.current = 'heavy'
        fireDShock(bossPos.current.x, bossPos.current.z, 3.5)
        const pd = Math.hypot(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
        if (pd < 3 && !invuln.current) onPlayerHit(2)
        if (dir) dir.shake(0.2)
        sfx.slash()
      }
    }
  }

  /* ----------------------------- main loop ----------------------------- */
  useFrame((state, dtRaw) => {
    const t = state.clock.elapsedTime
    const realDt = Math.min(dtRaw, 0.05)
    const dir = dirRef.current
    if (dir) dir.attach(camera)
    const now = performance.now()

    // Entrance beat parks the whole sim while the camera sweeps the boss.
    // The beat itself waits behind the curtain until the rig is resident.
    const bossReady = bossReadyRef.current > 0 || holdT.current >= 2.2
    if (!bossReady) holdT.current += realDt
    else if (introT.current < INTRO_DUR) introT.current += realDt
    if (bossReady && !curtainCalled.current) {
      curtainCalled.current = true
      onCurtainUp()
    }
    const intro = introT.current < INTRO_DUR

    const slow = now < slowmoUntil.current
    if (dir) dir.setTimeScale(slow ? 0.32 : 1)
    hitStop.current = Math.max(0, hitStop.current - realDt)
    cutsceneT.current = Math.max(0, cutsceneT.current - realDt)
    const simFrozen = frozen || intro || hitStop.current > 0 || cutsceneT.current > 0
    const dt = simFrozen ? 0 : (dir ? dir.scaledDelta(realDt) : realDt)
    const phase = phaseRef.current
    const k = simFrozen ? {} : keys.current

    // Phase transition beat — the fight's music-video moment: sim freezes for
    // the cutscene window, a glitch shell tears outward, the camera (below)
    // punches in on him while the city corrupts another step.
    if (phase !== prevPhase.current) {
      if (phase > prevPhase.current) {
        cutsceneT.current = 0.85
        atkState.current = 'gap'
        gapT.current = 0.7
        phaseBreakRef.current += 1
        spawnSlabs(phase === 2 ? 2 : phase === 3 ? 3 : 4)
        triggerFlash(0.9)
        const shell = glitchShells.find((q) => !q.active)
        if (shell) {
          shell.active = true
          shell.t = 0
        }
        if (dir) dir.shake(0.45)
        sfx.thunder()
        // Arm the new phase's ward fresh (each phase is its own exam).
        if (phase === 2) seals.current = createTwinKeyState(ARCHITECT_SEALS)
        if (phase === 3) {
          sigils.current = createSphinxState(Math.random, ARCHITECT_SIGILS)
          refreshSigilGlyphs()
        }
        if (phase === 4) mark.current = createMarkState()
        wardFlash(architectWardHint(phase), true, 3.2)
      }
      prevPhase.current = phase
    }

    /* ---- PHASE WARDS: the twisted realm mechanics that gate his HP ---- */
    if (!dead && !simFrozen) {
      wardFlashHold.current = Math.max(0, wardFlashHold.current - dt)
      // Transient flashes clear themselves once their hold runs out.
      if (wardFlashHold.current <= 0 && lastWardFlash.current) wardFlash(null)
      if (phase === 2) {
        applyWardEvents(tickTwinKey(seals.current, dt))
      } else if (phase === 3) {
        const s = sigils.current
        if (s) {
          applyWardEvents(tickSphinx(s, dt))
          if (s.windowT <= 0) {
            // A sigil registers only while PLANTED (standing still, no
            // action) — moving across any sigil is always safe, so a wrong
            // registration is always a deliberate mistake, never a route
            // accident (same exact-safety rule as the Sphinx).
            const ti = sphinxTileAt(s, pos.current.x, pos.current.z)
            const stationary =
              !(
                k['w'] || k['a'] || k['s'] || k['d'] ||
                k['arrowup'] || k['arrowdown'] || k['arrowleft'] || k['arrowright']
              ) && action.current === 'none'
            if (ti !== sigilDwellIdx.current) {
              sigilDwellIdx.current = ti
              sigilDwellT.current = 0
            } else if (ti >= 0 && stationary) {
              sigilDwellT.current += dt
              if (sigilDwellT.current >= 0.35) {
                sigilDwellT.current = 0
                sigilDwellIdx.current = -1
                applyWardEvents(sphinxStep(s, ti))
              }
            }
          }
        }
      } else if (phase === 4) {
        applyWardEvents(tickMark(mark.current, dt))
        // A dash that clips him returns the brand.
        if (mark.current.phase === 'branded' && action.current === 'dash') {
          const dm = Math.hypot(
            pos.current.x - bossPos.current.x,
            pos.current.z - bossPos.current.z,
          )
          const returned = markDashTransfer(mark.current, dm)
          if (returned.length > 0) {
            applyWardEvents(returned)
            wardFlash('MARK RETURNED — BRACE!', false, 1.2)
            if (sparks.current) {
              sparks.current.burst(
                tmpTip.current.set(bossPos.current.x, 2, bossPos.current.z),
                WARD_BAD,
                20,
              )
            }
          }
        }
      }
    }

    /* ---- ward prop visuals (imperative; a handful of objects) ---- */
    {
      const showWard = !dead && !frozen && !intro
      // Twin seals orbit him on opposite sides (phase 2, outside the window).
      const sealsVisible = showWard && phase === 2 && seals.current.windowT <= 0
      const sealAng = t * 0.55
      for (let si = 0; si < 2; si++) {
        const grp = sealRefs.current[si]
        const mat = sealMats.current[si]
        const p3 = si === 0 ? sealPosA.current : sealPosB.current
        const a = sealAng + (si === 0 ? 0 : Math.PI)
        p3.set(
          bossPos.current.x + Math.cos(a) * 5.4,
          1.6 + Math.sin(t * 2 + si * 1.3) * 0.2,
          bossPos.current.z + Math.sin(a) * 5.4,
        )
        const rr3 = Math.hypot(p3.x, p3.z)
        if (rr3 > BOUND - 1.5) {
          p3.x *= (BOUND - 1.5) / rr3
          p3.z *= (BOUND - 1.5) / rr3
        }
        if (!grp || !mat) continue
        grp.visible = sealsVisible
        if (!sealsVisible) continue
        grp.position.copy(p3)
        grp.rotation.y = t * 1.6
        const st = seals.current
        const mySide = si === 0 ? 'L' : 'R'
        const isFirst = st.firstSide === mySide
        if (st.phase === 'first' && isFirst) {
          // The seal to melee NOW.
          const pl = 1 + 0.2 * Math.sin(t * 13)
          grp.scale.set(pl, pl, pl)
          mat.opacity = 0.95
          mat.color.set(WARD_HOT)
        } else if (st.phase === 'charge' && !isFirst) {
          const chargeP = 1 - st.t / st.cfg.chargeDelay
          const sc = 0.75 + chargeP * 0.2
          grp.scale.set(sc, sc, sc)
          mat.opacity = 0.35 + chargeP * 0.45
          mat.color.set('#ffffff')
        } else if (st.phase === 'second' && !isFirst) {
          const pl = 1 + 0.24 * Math.sin(t * 15)
          grp.scale.set(pl, pl, pl)
          mat.opacity = 1
          mat.color.set('#ffffff')
        } else if ((st.phase === 'charge' || st.phase === 'second') && isFirst) {
          grp.scale.set(0.85, 0.85, 0.85)
          mat.opacity = 0.6
          mat.color.set(WARD_GOOD) // struck + locked in
        } else {
          grp.scale.set(0.7, 0.7, 0.7)
          mat.opacity = 0.28
          mat.color.set(GLYPH)
        }
      }
      // Sorted sigils (phase 3, outside the window).
      const sg = sigils.current
      for (let ti2 = 0; ti2 < 4; ti2++) {
        const grp = sigilRefs.current[ti2]
        if (!grp) continue
        const tile = sg?.tiles[ti2]
        const vis = showWard && phase === 3 && !!sg && sg.windowT <= 0 && !!tile
        grp.visible = vis
        if (!vis || !tile || !sg) continue
        grp.position.set(tile.x, 0, tile.z)
        const dmat = sigilDiskMats.current[ti2]
        const smat = sigilSpriteMats.current[ti2]
        const urgency = sg.timer < 4 ? 9 : 3
        if (dmat) {
          if (tile.done) {
            dmat.color.set(WARD_GOOD)
            dmat.opacity = 0.4
          } else {
            dmat.color.set(WARD_HOT)
            dmat.opacity = 0.18 + 0.12 * Math.sin(t * urgency + ti2)
          }
        }
        if (smat) smat.opacity = tile.done ? 0.25 : 1
      }
      // Deletion Mark brand — a hot ring chasing the player's feet (phase 4).
      const mr = markRingRef.current
      const mm = markRingMat.current
      const mb = markBeamRef.current
      const mbm = markBeamMat.current
      if (mr && mm && mb && mbm) {
        const branded = showWard && phase === 4 && mark.current.phase === 'branded'
        mr.visible = branded
        mb.visible = branded
        if (branded) {
          const fuseFrac = Math.max(0, mark.current.t / MARK.fuse)
          const pulse = 6 + (1 - fuseFrac) * 22
          mr.position.set(pos.current.x, 0.08 + pos.current.y, pos.current.z)
          mm.opacity = 0.55 + 0.4 * Math.sin(t * pulse)
          const sc = 2.0 + fuseFrac * 0.8
          mr.scale.set(sc, sc, sc)
          // The column burns brighter as the fuse runs out.
          mb.position.set(pos.current.x, 3.5 + pos.current.y, pos.current.z)
          mbm.opacity = 0.16 + (1 - fuseFrac) * 0.3 + 0.06 * Math.sin(t * pulse)
        }
      }
    }

    /* ---- ambient lightning (escalates per phase; dies at dawn) ---- */
    nextAmbientBolt.current -= realDt
    if (nextAmbientBolt.current <= 0 && dawnRef.current < 0.3) {
      // P1 a storm, P4 the sky tearing itself apart.
      const gap =
        phase === 1 ? 3.2 + Math.random() * 3 :
        phase === 2 ? 2.4 + Math.random() * 2.4 :
        phase === 3 ? 1.5 + Math.random() * 1.6 :
        0.9 + Math.random() * 1.1
      nextAmbientBolt.current = gap
      triggerFlash(0.6 + Math.random() * 0.35 + (phase - 1) * 0.08)
      thunderDelay.current = 0.4 + Math.random() * 0.8
    }

    /* ---- FINALE DRIVERS: the city falls with him ---- */
    {
      // Corruption chases the phase (P1 0 → P4 1); dawn overrides on death.
      const cTarget = dead ? 0 : (phase - 1) / 3
      corruptRef.current += (cTarget - corruptRef.current) * Math.min(1, realDt * 0.8)
      if (dead) dawnRef.current = Math.min(1, dawnRef.current + realDt / (ARCHITECT_DEATH_DUR * 0.9))
      const c = corruptRef.current
      const dawn = dawnRef.current

      // Storm tint: white lightning → Null red; dawn washes it out entirely.
      if (skyFlashMat.current) skyFlashMat.current.color.setRGB(0.9 + c * 0.1, 0.9 - c * 0.58, 1 - c * 0.62)
      if (lightningLight.current) lightningLight.current.color.setRGB(0.9 + c * 0.1, 0.9 - c * 0.58, 1 - c * 0.62)

      // Fog palette drift — deep storm blue → Null maroon → warm dawn.
      fogTarget.current.set(
        dawn > 0.02 ? '#4a3350' : phase === 1 ? '#070a14' : phase === 2 ? '#0c0a1a' : phase === 3 ? '#160a14' : '#1c0710',
      )
      fogColor.current.lerp(fogTarget.current, Math.min(1, realDt * 0.6))
      const sceneFog = state.scene.fog as THREE.Fog | null
      if (sceneFog) sceneFog.color.copy(fogColor.current)

      // The sky projection: rises among the towers at phase 2, rages with
      // him, dissolves at dawn. A fixed world position kept it out of frame
      // for most camera azimuths (QA: "faint cropped smears") — instead it
      // DRIFTS to stay in the camera's view direction, always looming on the
      // horizon past the boss, and slowly enough to feel weightless.
      const g = giantGrp.current
      if (g) {
        // Sized/pushed so the figure reads as a colossus WITHOUT covering
        // half the frame — a scale-26 body at 95m was ~30° of overdraw from
        // a skinned translucent mesh every frame and cost ~8ms (perf probe).
        const target = dead ? 0 : phase >= 2 ? 26 : 0
        giantScale.current += (target - giantScale.current) * Math.min(1, realDt * 0.7)
        const s = giantScale.current
        g.visible = s > 0.5
        g.scale.setScalar(Math.max(0.001, s))
        // Track the camera's view direction in ANGLE space on a fixed ring
        // well past the deck — lerping raw XZ dragged the colossus straight
        // THROUGH the arena whenever the camera swung (QA caught giant legs
        // over the helipad). Orbiting the rim can never cross the deck.
        camera.getWorldDirection(tmpDir.current)
        tmpDir.current.y = 0
        if (tmpDir.current.lengthSq() > 1e-6) {
          const want = Math.atan2(tmpDir.current.x, tmpDir.current.z)
          let delta = want - giantAzimuth.current
          delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
          if (delta < -Math.PI) delta += Math.PI * 2
          // Near-locked to the view azimuth: the player strafes in circles
          // constantly, and any real lag left the colossus perpetually
          // half-cropped at the frame edge (two QA rounds). At 88m the
          // residual smoothing still hides the tracking completely.
          giantAzimuth.current += delta * Math.min(1, realDt * 4.5)
          // Just past the deck edge, INSIDE the skyline ring: torso and head
          // fill the upper frame and dwarf the towers behind him. At the
          // skyline distance (124m) he shrank into "a guy on the horizon";
          // head-cropping at this range reads as scale, not as a bug.
          g.position.x = Math.sin(giantAzimuth.current) * 96
          g.position.z = Math.cos(giantAzimuth.current) * 96
        }
        // Face the arena; breathe vertically.
        g.rotation.y = Math.atan2(-g.position.x, -g.position.z) + Math.sin(t * 0.11) * 0.1
        g.position.y = -4 + Math.sin(t * 0.4) * 1.4
      }

      // Deck data-rings ignite with corruption (pulse outward like the Null
      // is streaming the rooftop).
      for (let i = 0; i < deckRingMats.current.length; i++) {
        const m = deckRingMats.current[i]
        if (!m) continue
        const p = (t * 0.55 + i / deckRingMats.current.length) % 1
        m.opacity = c * (1 - dawn) * 0.4 * Math.sin(p * Math.PI)
      }

      // Reality-glitch shells: periodic in P3+, always on phase breaks.
      nextGlitchWave.current -= realDt
      if (!dead && phase >= 3 && nextGlitchWave.current <= 0) {
        nextGlitchWave.current = phase >= 4 ? 4.5 + Math.random() * 3 : 7 + Math.random() * 4
        const shell = glitchShells.find((q) => !q.active)
        if (shell) {
          shell.active = true
          shell.t = 0
        }
      }
      for (let i = 0; i < glitchShells.length; i++) {
        const shell = glitchShells[i]
        const mesh = glitchRefs.current[i]
        const mat = glitchMats.current[i]
        if (!mesh || !mat) continue
        if (!shell.active) {
          mesh.visible = false
          continue
        }
        shell.t += realDt
        const p = shell.t / 2.1
        if (p >= 1) {
          shell.active = false
          mesh.visible = false
          continue
        }
        mesh.visible = true
        const r = 2 + p * 95
        mesh.scale.set(r, 1 + p * 6, r)
        mesh.position.set(bossPos.current.x, 5, bossPos.current.z)
        mat.opacity = (1 - p) * 0.4 * Math.max(0.25, c)
      }
    }
    if (thunderDelay.current != null) {
      thunderDelay.current -= realDt
      if (thunderDelay.current <= 0) {
        thunderDelay.current = null
        sfx.thunder()
      }
    }
    // Flash decays.
    const flashAge = strengthClock() - flashT.current
    const flashK = flashAge >= 0 && flashAge < 0.22 ? (1 - flashAge / 0.22) * flashStrength.current : 0
    if (lightningLight.current) lightningLight.current.intensity = flashK * 5
    if (skyFlashMat.current) skyFlashMat.current.opacity = flashK * 0.5

    /* ---- lock-on basis ---- */
    tmpDir.current.set(bossPos.current.x - pos.current.x, 0, bossPos.current.z - pos.current.z)
    if (tmpDir.current.lengthSq() < 1e-6) tmpDir.current.set(0, 0, 1)
    tmpDir.current.normalize()
    const camYaw = Math.atan2(tmpDir.current.x, tmpDir.current.z)
    tmpFwd.current.copy(tmpDir.current)
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)

    const str = (k['arrowright'] || k['d'] ? 1 : 0) - (k['arrowleft'] || k['a'] ? 1 : 0)
    const fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
    tmpMove.current.set(0, 0, 0)
    tmpMove.current.addScaledVector(tmpFwd.current, fwd)
    tmpMove.current.addScaledVector(tmpRight.current, str)
    const moving = tmpMove.current.lengthSq() > 0.001
    if (moving) tmpMove.current.normalize()

    /* ---- timers + actions ---- */
    dashCd.current -= dt
    rollCd.current -= dt
    cooldown.current -= dt
    comboTimer.current -= dt
    invuln.current = false

    if (!simFrozen) {
      if (reqJump.current) {
        reqJump.current = false
        if (grounded.current) {
          velY.current = JUMP_V
          grounded.current = false
          sfx.jump()
        }
      }
      if (reqDash.current) {
        reqDash.current = false
        if (dashCd.current <= 0) {
          action.current = 'dash'
          actionT.current = 0
          dashCd.current = DASH_CD
          actionDir.current.copy(moving ? tmpMove.current : tmpFwd.current)
          afterTimer.current = 0
          sfx.dash()
        }
      }
      if (reqRoll.current) {
        reqRoll.current = false
        if (rollCd.current <= 0 && grounded.current && action.current !== 'lunge') {
          action.current = 'roll'
          actionT.current = 0
          rollCd.current = ROLL_CD
          actionDir.current.copy(moving ? tmpMove.current : tmpRight.current)
          sfx.dash()
        }
      }
      if (reqSlice.current) {
        reqSlice.current = false
        if (!sliceActive.current) {
          sliceActive.current = true
          sliceT.current = 0
          sliceHit.current = false
          slashStart.current = t
          comboIndex.current = comboTimer.current > 0 ? Math.min(2, comboIndex.current + 1) : 0
          comboTimer.current = COMBO_WINDOW
          onCombo(comboIndex.current + 1)
          action.current = 'lunge'
          actionT.current = 0
          actionDir.current.copy(tmpFwd.current)
          sfx.slash()
        }
      }
    }

    // Slice swing + melee contact.
    if (sliceActive.current) {
      sliceT.current += dt
      if (playerTrail.current && sliceT.current < SLASH_TIME) {
        const sp = sliceT.current / SLASH_TIME
        const ang = camYaw - 1.2 + sp * 2.4
        tmpTip.current.set(
          pos.current.x + Math.sin(ang) * 1.5,
          1.4 + pos.current.y + Math.sin(sp * Math.PI) * 0.5,
          pos.current.z + Math.cos(ang) * 1.5,
        )
        playerTrail.current.setTip(tmpTip.current)
      }
      if (!sliceHit.current && sliceT.current >= 0.09 && sliceT.current <= 0.22) {
        // Phase-2 ward: a slice that reaches a twin seal strikes IT instead.
        // Only an engaged sequence consumes the swing — idle whiffs near a
        // dormant seal still carry through to the boss.
        if (phase === 2 && !dead && seals.current.windowT <= 0 && seals.current.phase !== 'idle') {
          for (let si = 0; si < 2; si++) {
            const sp = si === 0 ? sealPosA.current : sealPosB.current
            const sd = Math.hypot(sp.x - pos.current.x, sp.z - pos.current.z)
            if (sd < 2.6) {
              sliceHit.current = true
              applyWardEvents(twinStrike(seals.current, si === 0 ? 'L' : 'R'))
              if (sparks.current) sparks.current.burst(tmpTip.current.copy(sp), WARD_HOT, 12)
              sfx.hit()
              break
            }
          }
        }
        const dx = bossPos.current.x - pos.current.x
        const dz = bossPos.current.z - pos.current.z
        const hdist = Math.hypot(dx, dz)
        if (!sliceHit.current && hdist < MELEE_RANGE && !dead) {
          sliceHit.current = true
          const finisher = comboIndex.current === 2
          let dmg = MELEE_DMG[comboIndex.current]
          // The phase ward soaks everything outside a broken window (kept
          // fractional — a min-1 floor made mindless melee spam a faster kill
          // than the actual mechanics).
          if (!wardBroken(phase)) dmg = dmg * WARD_CHIP_MUL
          onBossHit(dmg)
          hitRef.current += 1
          hitStop.current = finisher ? 0.1 : 0.07
          if (dir) {
            dir.punch(finisher ? 0.85 : 0.6)
            dir.shake(finisher ? 0.3 : 0.18)
          }
          if (sparks.current) sparks.current.burst(tmpTip.current.set(pos.current.x + dx * 0.55, 1.6, pos.current.z + dz * 0.55), accent, finisher ? 18 : 12)
          sfx.hit()
        }
      }
      if (sliceT.current > SLASH_TIME) sliceActive.current = false
    }

    /* ---- player movement ---- */
    let mvx = 0
    let mvz = 0
    if (action.current === 'dash') {
      actionT.current += dt
      if (actionT.current >= DASH_TIME) action.current = 'none'
      else {
        mvx = actionDir.current.x * DASH_SPEED
        mvz = actionDir.current.z * DASH_SPEED
        if (actionT.current < DASH_IFRAME) invuln.current = true
        afterTimer.current -= dt
        if (afterTimer.current <= 0) {
          afterTimer.current = 0.03
          const a = afters.find((q) => !q.active)
          if (a) {
            a.active = true
            a.life = 0.26
            a.pos.set(pos.current.x, pos.current.y + 1.0, pos.current.z)
          }
        }
      }
    } else if (action.current === 'roll') {
      actionT.current += dt
      if (actionT.current >= ROLL_TIME) action.current = 'none'
      else {
        const tap = 1 - actionT.current / ROLL_TIME
        mvx = actionDir.current.x * ROLL_SPEED * (0.5 + tap * 0.5)
        mvz = actionDir.current.z * ROLL_SPEED * (0.5 + tap * 0.5)
        if (actionT.current < ROLL_IFRAME) invuln.current = true
      }
    } else if (action.current === 'lunge') {
      actionT.current += dt
      if (actionT.current >= SLASH_TIME) action.current = 'none'
      else {
        const tap = Math.max(0, 1 - actionT.current / 0.18)
        mvx = actionDir.current.x * LUNGE_SPEED * tap
        mvz = actionDir.current.z * LUNGE_SPEED * tap
      }
    } else if (moving) {
      mvx = tmpMove.current.x * RUN_SPEED
      mvz = tmpMove.current.z * RUN_SPEED
    }
    pos.current.x += mvx * dt
    pos.current.z += mvz * dt

    velY.current += GRAV * dt
    pos.current.y += velY.current * dt
    if (pos.current.y <= 0) {
      pos.current.y = 0
      velY.current = 0
      grounded.current = true
    } else {
      grounded.current = false
    }

    const rr = Math.hypot(pos.current.x, pos.current.z)
    if (rr > BOUND) {
      pos.current.x *= BOUND / rr
      pos.current.z *= BOUND / rr
    }

    // Player defeat: the collapse is TOP priority — once hearts hit zero the
    // avatar timbers and holds prone (the rig clamps 'death'), overriding any
    // slice/dash/jump/move pose. Cleared on retry when the arena remounts with
    // full hearts (playerAnimRef starts 'idle' on a fresh mount).
    if (playerDefeated) playerAnimRef.current = 'death'
    else if (sliceActive.current || action.current === 'dash') playerAnimRef.current = 'dash'
    else if (!grounded.current || action.current === 'roll') playerAnimRef.current = 'jump'
    else playerAnimRef.current = moving ? 'run' : 'idle'

    let hd = camYaw - heading.current
    hd = Math.atan2(Math.sin(hd), Math.cos(hd))
    heading.current += hd * HEADING_LERP
    const pg = playerGroup.current
    if (pg) {
      pg.position.copy(pos.current)
      pg.rotation.y = heading.current
    }

    /* ---- boss movement + facing ---- */
    if (!dead) {
      tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z)
      const distP = tmpDir.current.length() || 1
      tmpDir.current.normalize()
      const attacking = atkState.current === 'tele' || atkState.current === 'active'
      if (!attacking) {
        let approach = 0
        if (distP > 10) approach = 1
        else if (distP < 6) approach = -1
        const chase = 3.6 * dt
        bossPos.current.x += tmpDir.current.x * approach * chase
        bossPos.current.z += tmpDir.current.z * approach * chase
        bossPos.current.x += -tmpDir.current.z * 1.7 * dt
        bossPos.current.z += tmpDir.current.x * 1.7 * dt
      }
      const br = Math.hypot(bossPos.current.x, bossPos.current.z)
      if (br > BOUND - 2) {
        bossPos.current.x *= (BOUND - 2) / br
        bossPos.current.z *= (BOUND - 2) / br
      }
      const targetH = Math.atan2(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
      let dbh = targetH - bossHeading.current
      dbh = Math.atan2(Math.sin(dbh), Math.cos(dbh))
      bossHeading.current += dbh * 0.18

      if (intro) vexAnimRef.current = 'cast' // entrance channel pose
      else if (atkName.current === 'blink' && attacking) vexAnimRef.current = 'blink'
      else if (attacking) vexAnimRef.current = 'cast'
      else vexAnimRef.current = moving ? 'stride' : 'idle'
    }
    const bg = bossGroup.current
    if (bg) {
      bg.position.set(bossPos.current.x, bossPos.current.y, bossPos.current.z)
      bg.rotation.y = bossHeading.current
      if (cullFrames.current < 12) {
        cullFrames.current++
        bg.traverse((o) => {
          o.frustumCulled = false
        })
      }
    }

    /* ---- echo clones: flank the Architect and attack alongside him ---- */
    const cloneCount = dead ? 0 : cloneCountFor(phase)
    const cloneAng = t * 0.5
    placeEchoClone(
      cloneARef.current, cloneAPos.current, cloneCullA, cloneAng,
      cloneCount >= 1, bossPos.current.x, bossPos.current.z, pos.current.x, pos.current.z,
    )
    placeEchoClone(
      cloneBRef.current, cloneBPos.current, cloneCullB, cloneAng + Math.PI,
      cloneCount >= 2, bossPos.current.x, bossPos.current.z, pos.current.x, pos.current.z,
    )

    /* ---- camera ---- */
    tmpFwd.current.set(bossPos.current.x - pos.current.x, 0, bossPos.current.z - pos.current.z)
    if (tmpFwd.current.lengthSq() < 1e-6) tmpFwd.current.set(0, 0, 1)
    tmpFwd.current.normalize()
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)
    if (intro && !dead) {
      // Entrance hero shot: swing low around the Architect against the storm,
      // then rise + pull back to the gameplay framing as the beat ends.
      const p = THREE.MathUtils.clamp(introT.current / INTRO_DUR, 0, 1)
      const ease = p * p * (3 - 2 * p)
      const ang = Math.atan2(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
      const sweep = ang + (1 - ease) * 1.2 - 0.3
      const dist = 4.6 + ease * 10.8
      const h = 1.5 + ease * (CAM_HEIGHT - 1.5)
      tmpFrom.current.set(
        bossPos.current.x + Math.sin(sweep) * dist,
        h,
        bossPos.current.z + Math.cos(sweep) * dist,
      )
      tmpLook.current.set(bossPos.current.x, 1.8 + (1 - ease) * 0.4, bossPos.current.z)
      if (!introSnapped.current) {
        introSnapped.current = true
        camera.position.copy(tmpFrom.current)
      }
      if (!introRoared.current && introT.current > INTRO_DUR * 0.42) {
        introRoared.current = true
        if (dir) dir.shake(0.5)
        triggerFlash(1.0)
        sfx.thunder()
      }
      if (dir) dir.frame(tmpLook.current, tmpFrom.current, realDt)
    } else if (dead) {
      const e = state.clock.elapsedTime
      const orbit = e * 0.7
      tmpFrom.current.set(bossPos.current.x + Math.cos(orbit) * 9, 4.8, bossPos.current.z + Math.sin(orbit) * 9)
      tmpLook.current.set(bossPos.current.x, 1.6, bossPos.current.z)
      if (dir) dir.frame(tmpLook.current, tmpFrom.current, realDt)
    } else if (cutsceneT.current > 0) {
      // Phase-break beat: fast low push-in on the Architect (sim is frozen
      // for exactly this window) with the corrupting city behind him.
      tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z)
      if (tmpDir.current.lengthSq() < 1e-6) tmpDir.current.set(0, 0, 1)
      tmpDir.current.normalize()
      const push = 1 - cutsceneT.current / 0.85 // 0 → 1 over the beat
      const d = 6.2 - push * 2.1
      tmpFrom.current.set(
        bossPos.current.x + tmpDir.current.x * d - tmpDir.current.z * 1.4,
        1.3 + push * 0.5,
        bossPos.current.z + tmpDir.current.z * d + tmpDir.current.x * 1.4,
      )
      tmpLook.current.set(bossPos.current.x, 2.1, bossPos.current.z)
      if (dir) dir.frame(tmpLook.current, tmpFrom.current, realDt)
    } else {
      let tx = pos.current.x - tmpFwd.current.x * CAM_BACK + tmpRight.current.x * CAM_SIDE
      let tz = pos.current.z - tmpFwd.current.z * CAM_BACK + tmpRight.current.z * CAM_SIDE
      const camR = Math.hypot(tx, tz)
      const CAM_MAX_R = BOUND + 10
      if (camR > CAM_MAX_R) {
        tx *= CAM_MAX_R / camR
        tz *= CAM_MAX_R / camR
      }
      tmpFrom.current.set(tx, CAM_HEIGHT + pos.current.y * 0.3, tz)
      tmpLook.current.set(bossPos.current.x, 1.5 + bossPos.current.y * 0.4, bossPos.current.z)
      if (dir) dir.frame(tmpLook.current, tmpFrom.current, realDt)
    }

    /* ---- player shooting ---- */
    if (holdFire.current && !simFrozen && cooldown.current <= 0) {
      cooldown.current = BOLT_CD
      const muzzleX = pos.current.x + tmpFwd.current.x * 0.7
      const muzzleY = 1.2 + pos.current.y
      const muzzleZ = pos.current.z + tmpFwd.current.z * 0.7
      tmpDir.current
        .set(
          bossPos.current.x - muzzleX,
          bossPos.current.y + 1.5 - muzzleY,
          bossPos.current.z - muzzleZ,
        )
        .normalize()
      const horiz = Math.hypot(tmpDir.current.x, tmpDir.current.z) || 1
      const baseAng = Math.atan2(tmpDir.current.x, tmpDir.current.z)
      let fired = false
      for (let pellet = 0; pellet < WEAPON.pellets; pellet++) {
        const b = bolts.find((x) => !x.active)
        if (!b) break
        b.active = true
        b.life = BOLT_LIFE
        b.damage = WEAPON.damage
        b.pos.set(muzzleX, muzzleY, muzzleZ)
        const ang =
          baseAng + weaponPelletYaw(pellet, Math.random(), WEAPON)
        b.vel
          .set(
            Math.sin(ang) * horiz,
            tmpDir.current.y,
            Math.cos(ang) * horiz,
          )
          .normalize()
          .multiplyScalar(BOLT_SPEED)
        fired = true
      }
      if (fired) {
        fireRef.current = t
        playShot()
      }
    }

    /* ---- bolts ---- */
    if (boltsMesh.current) {
      const m = boltsMesh.current
      for (let i = 0; i < bolts.length; i++) {
        const b = bolts[i]
        if (!b.active) {
          hideInstance(m, i)
          continue
        }
        b.pos.addScaledVector(b.vel, dt)
        b.life -= dt
        let consumed = false
        if (!dead) {
          const d = Math.hypot(b.pos.x - bossPos.current.x, b.pos.y - (bossPos.current.y + 1.5), b.pos.z - bossPos.current.z)
          if (d < BOLT_HIT_R) {
            consumed = true
            let dmg = b.damage * BOSS_BOLT_DAMAGE_SCALE
            // The phase ward soaks ranged chip outside broken windows too.
            if (!wardBroken(phaseRef.current)) dmg *= WARD_CHIP_MUL
            onBossHit(dmg)
            hitRef.current += 1
            if (sparks.current) sparks.current.burst(b.pos, accent, 5)
          }
        }
        if (consumed || b.life <= 0) {
          b.active = false
          hideInstance(m, i)
          continue
        }
        dObj.current.position.copy(b.pos)
        dObj.current.scale.setScalar(1)
        dObj.current.rotation.set(0, 0, 0)
        dObj.current.updateMatrix()
        m.setMatrixAt(i, dObj.current.matrix)
      }
      m.instanceMatrix.needsUpdate = true
    }

    /* ---- boss AI ---- */
    if (!dead && !simFrozen) {
      switch (atkState.current) {
        case 'gap': {
          gapT.current -= dt
          if (gapT.current <= 0) chooseAttack(phase)
          break
        }
        case 'tele': {
          atkT.current += dt
          if (atkT.current >= durs(atkName.current)[0]) {
            atkState.current = 'active'
            atkT.current = 0
            onTelegraph(null)
            executeAttack(phase)
          }
          break
        }
        case 'active': {
          atkT.current += dt
          activeAttack(phase)
          if (atkT.current >= durs(atkName.current)[1]) {
            atkState.current = 'recover'
            atkT.current = 0
          }
          break
        }
        case 'recover': {
          atkT.current += dt
          if (atkT.current >= durs(atkName.current)[2]) {
            atkState.current = 'gap'
            // Relentless: shorter breathers between attacks at every phase.
            gapT.current = phase === 1 ? 1.05 : phase === 2 ? 0.78 : phase === 3 ? 0.58 : 0.42
          }
          break
        }
      }
    }

    /* ---- orbs (glyph-blades) ---- */
    {
      const fx = orbFx.current
      const homeSpeed = phase <= 2 ? 14 : 18
      fx?.begin(camera.quaternion)
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i]
        if (!o.active) {
          fx?.hide(i)
          continue
        }
        if (o.mode === 0 && !simFrozen) {
          // Track the player, then lock + fire.
          o.lock -= dt
          tmpDir.current.set(pos.current.x - o.pos.x, 1.1 + pos.current.y - o.pos.y, pos.current.z - o.pos.z).normalize()
          if (o.lock > 0) {
            o.vel.lerp(tmpDir.current.multiplyScalar(4), 0.06)
          } else {
            o.vel.copy(tmpDir.current.multiplyScalar(homeSpeed + 6))
            o.mode = 1
          }
        }
        o.pos.addScaledVector(o.vel, dt)
        o.life -= dt
        let gone = false
        const d = Math.hypot(o.pos.x - pos.current.x, o.pos.y - (1.1 + pos.current.y), o.pos.z - pos.current.z)
        if (!simFrozen && !invuln.current && d < PLAYER_HIT_R) {
          gone = true
          onPlayerHit(1)
          impactFx.current?.spawn(o.pos.x, o.pos.y, o.pos.z, GLYPH, 1.3, 8)
          if (dir) dir.shake(0.16)
        }
        if (gone || o.life <= 0) {
          o.active = false
          fx?.hide(i)
          continue
        }
        fx?.set(i, o.pos, o.vel.x, o.vel.y, o.vel.z, t)
      }
      fx?.commit()
    }

    /* ---- debris ---- */
    if (debrisMesh.current) {
      const m = debrisMesh.current
      for (let i = 0; i < debris.length; i++) {
        const dd = debris[i]
        if (!dd.active) {
          hideInstance(m, i)
          continue
        }
        dd.vel.y += GRAV * 0.35 * dt
        dd.pos.addScaledVector(dd.vel, dt)
        dd.life -= dt
        let gone = false
        const d = Math.hypot(dd.pos.x - pos.current.x, dd.pos.y - (1.1 + pos.current.y), dd.pos.z - pos.current.z)
        if (!simFrozen && !invuln.current && d < 1.3) {
          gone = true
          onPlayerHit(2)
          if (dir) dir.shake(0.2)
        }
        if (gone || dd.life <= 0 || dd.pos.y < -1) {
          dd.active = false
          hideInstance(m, i)
          continue
        }
        dObj.current.position.copy(dd.pos)
        dObj.current.scale.setScalar(1)
        dObj.current.rotation.set(t * dd.spin.x, t * dd.spin.y, t * dd.spin.z)
        dObj.current.updateMatrix()
        m.setMatrixAt(i, dObj.current.matrix)
      }
      m.instanceMatrix.needsUpdate = true
    }

    /* ---- damage shockwaves ---- */
    for (let i = 0; i < dshocks.length; i++) {
      const s = dshocks[i]
      if (!s.active) continue
      s.t += dt
      const p = Math.min(1, s.t / s.dur)
      const radius = 0.4 + p * s.maxR
      if (!simFrozen && !invuln.current && pos.current.y < 1.1 && !s.struck) {
        const pd = Math.hypot(pos.current.x - s.x, pos.current.z - s.z)
        if (Math.abs(pd - radius) < 0.9) {
          s.struck = true
          onPlayerHit(1)
          if (dir) dir.shake(0.18)
        }
      }
      if (p >= 1) s.active = false
    }

    /* ---- lightning bolts ---- */
    for (let i = 0; i < lbolts.length; i++) {
      const l = lbolts[i]
      const mesh = lboltRefs.current[i]
      const mat = lboltMatRefs.current[i]
      if (!mesh || !mat) continue
      if (!l.active) {
        mesh.visible = false
        continue
      }
      l.t += dt
      mesh.visible = l.t < 0.22
      mesh.position.set(l.x, 8, l.z)
      mat.opacity = THREE.MathUtils.clamp(1 - l.t / 0.22, 0, 1)
      if (!l.struck) {
        l.struck = true
        const pd = Math.hypot(pos.current.x - l.x, pos.current.z - l.z)
        if (!simFrozen && !invuln.current && pd < 2.4) onPlayerHit(2)
        if (sparks.current) sparks.current.burst(tmpDir.current.set(l.x, 0.3, l.z), LIGHTNING, 14)
      }
      if (l.t >= 0.22) {
        l.active = false
        mesh.visible = false
      }
    }

    /* ---- sweeping band (glyph-wall / reality sweep) ---- */
    const bd = band.current
    if (wallARef.current && wallBRef.current && wallAMat.current && wallBMat.current) {
      if (!bd.active) {
        wallARef.current.visible = false
        wallBRef.current.visible = false
      } else {
        bd.z += bd.dir * bd.speed * dt
        const wide = BOUND + 6
        if (bd.gapHalf > 0) {
          // Two walls leaving a gap at gapX.
          const leftW = bd.gapX - bd.gapHalf - -wide
          const rightW = wide - (bd.gapX + bd.gapHalf)
          const leftC = (-wide + (bd.gapX - bd.gapHalf)) / 2
          const rightC = (wide + (bd.gapX + bd.gapHalf)) / 2
          wallARef.current.visible = true
          wallBRef.current.visible = true
          wallARef.current.position.set(leftC, 3, bd.z)
          wallARef.current.scale.set(Math.max(0.1, leftW), 1, 1)
          wallBRef.current.position.set(rightC, 3, bd.z)
          wallBRef.current.scale.set(Math.max(0.1, rightW), 1, 1)
        } else {
          wallARef.current.visible = true
          wallBRef.current.visible = false
          wallARef.current.position.set(0, 3, bd.z)
          wallARef.current.scale.set(wide * 2, 1, 1)
        }
        const col = bd.kind === 'sweep' ? HOT : GLYPH
        wallAMat.current.color.set(col)
        wallBMat.current.color.set(col)
        wallAMat.current.opacity = 0.5 + Math.sin(t * 20) * 0.12
        wallBMat.current.opacity = wallAMat.current.opacity
        // Damage when the band crosses the player.
        if (!bd.struck && Math.abs(bd.z - pos.current.z) < 0.9) {
          const inGap = bd.gapHalf > 0 && Math.abs(pos.current.x - bd.gapX) < bd.gapHalf
          if (!inGap && !simFrozen && !invuln.current) {
            bd.struck = true
            onPlayerHit(bd.kind === 'sweep' ? 2 : 1)
            if (dir) dir.shake(0.22)
            sfx.zap()
          } else {
            bd.struck = true
          }
        }
        if (bd.z > BOUND + 3) bd.active = false
      }
    }

    // Reality-rewrite deck tilt.
    if (deckTilt.current) {
      tiltT.current = Math.max(0, tiltT.current - realDt)
      const tilt = tiltT.current > 0 ? Math.sin(t * 1.6) * 0.06 : 0
      deckTilt.current.rotation.z += (tilt - deckTilt.current.rotation.z) * Math.min(1, realDt * 4)
    }

    /* ---- slabs (fractured rooftop) ---- */
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i]
      const mesh = slabRefs.current[i]
      if (!mesh) continue
      // Clear the stage for the kill cam — a drifting slab parked in front of
      // the death orbit blocked the payoff shot for most of a rotation (QA).
      if (dead && s.active) s.active = false
      if (!s.active) {
        mesh.visible = false
        continue
      }
      s.vel.y += GRAV * 0.05 * dt
      s.pos.addScaledVector(s.vel, dt)
      s.rot.x += s.spin.x * dt
      s.rot.y += s.spin.y * dt
      s.rot.z += s.spin.z * dt
      mesh.position.copy(s.pos)
      mesh.rotation.copy(s.rot)
      // Camera-occlusion cull: a slab crossing the lens blacked out the whole
      // frame mid-combat (QA) — background flavor never gets to do that.
      mesh.visible = mesh.position.distanceToSquared(camera.position) > 42
      // Cap the hover low — slabs drifting to the roofline read as floating
      // black boxes against the sky (QA).
      if (s.pos.y > 8 || s.pos.y < -4) {
        s.active = false
        mesh.visible = false
      }
    }

    /* ---- afterimages ---- */
    if (afterMesh.current) {
      const m = afterMesh.current
      for (let i = 0; i < afters.length; i++) {
        const a = afters[i]
        if (!a.active) {
          hideInstance(m, i)
          continue
        }
        a.life -= dt
        if (a.life <= 0) {
          a.active = false
          hideInstance(m, i)
          continue
        }
        dObj.current.position.copy(a.pos)
        dObj.current.scale.set(1, 1 + (0.26 - a.life), 1)
        dObj.current.rotation.set(0, heading.current, 0)
        dObj.current.updateMatrix()
        m.setMatrixAt(i, dObj.current.matrix)
      }
      m.instanceMatrix.needsUpdate = true
      afterMat.opacity = 0.5
    }

    /* ---- QA autopilot hook (probe-only; the app never sets qaHooks) ---- */
    if (qaHooks) {
      const rec = qaRec.current
      rec.open = wardBroken(phase)
      rec.fire = true
      rec.hold = false
      rec.keys.length = 0
      rec.press.length = 0
      let tX: number | null = null
      let tZ: number | null = null
      if (!dead && !simFrozen) {
        if (
          phase === 2 &&
          seals.current.windowT <= 0 &&
          seals.current.phase !== 'idle'
        ) {
          // Route to the seal that must be struck NOW (first, then its twin).
          const st = seals.current
          const wantFirst = st.phase === 'first'
          const wantL = wantFirst ? st.firstSide === 'L' : st.firstSide !== 'L'
          const sp = wantL ? sealPosA.current : sealPosB.current
          tX = sp.x
          tZ = sp.z
          const sd = Math.hypot(pos.current.x - sp.x, pos.current.z - sp.z)
          if (sd < 2.4 && st.phase !== 'charge') rec.press.push('q')
          else if (sd > 6.5) rec.press.push('shift')
        } else if (phase === 3 && sigils.current && sigils.current.windowT <= 0) {
          const s = sigils.current
          const next = sphinxNextValue(s)
          const tile = s.tiles.find((q) => !q.done && q.value === next)
          if (tile) {
            // Anywhere ON the sigil is a valid plant spot — stop there.
            const don = Math.hypot(pos.current.x - tile.x, pos.current.z - tile.z)
            if (don <= ARCHITECT_SIGILS.tileRadius * 0.75) {
              rec.hold = true
            } else {
              tX = tile.x
              tZ = tile.z
            }
          }
        } else if (phase === 4 && mark.current.phase === 'branded') {
          tX = bossPos.current.x
          tZ = bossPos.current.z
          const dm = Math.hypot(
            pos.current.x - bossPos.current.x,
            pos.current.z - bossPos.current.z,
          )
          if (dm < 8 && dashCd.current <= 0) rec.press.push('shift')
        }
      }
      if (tX !== null && tZ !== null) {
        const ddx = tX - pos.current.x
        const ddz = tZ - pos.current.z
        const fAmt = ddx * tmpFwd.current.x + ddz * tmpFwd.current.z
        const sAmt = ddx * tmpRight.current.x + ddz * tmpRight.current.z
        if (fAmt > 1.0) rec.keys.push('w')
        else if (fAmt < -1.0) rec.keys.push('s')
        if (sAmt > 1.0) rec.keys.push('d')
        else if (sAmt < -1.0) rec.keys.push('a')
        // On target: PLANT (the sigils register only while standing still).
        rec.hold = rec.hold || rec.keys.length === 0
      }
      ;(window as unknown as { __mechQA?: unknown }).__mechQA = rec
    }
  })

  return (
    <group>
      {/* Storm flash light + sky flash plane. */}
      <directionalLight ref={lightningLight} position={[6, 30, 10]} color={LIGHTNING} intensity={0} />
      {/* Far outside the fog line and big enough that its edges can never
          enter the frame — at 400×200/z-60 it read as a floating glass sheet
          whenever a flash caught the camera at an angle. */}
      <mesh ref={skyFlash} position={[0, 70, -150]} frustumCulled={false}>
        <planeGeometry args={[1400, 700]} />
        <meshBasicMaterial ref={skyFlashMat} color={LIGHTNING} transparent opacity={0} toneMapped={false} depthWrite={false} fog={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Phase-tinted gradient sky behind everything (storm → red → dawn). */}
      <FinaleSky city={city} />

      <group ref={deckTilt}>
        <ApexRooftop accent={accent} tier={tier} count={tier === 'low' ? 28 : tier === 'med' ? 44 : 60} city={city} />
      </group>

      {/* THE SCALE MOMENT — from phase 2 the Architect projects himself
          across the skyline: a colossal spectral hologram behind the towers,
          mirroring every gesture the real one makes on the deck. */}
      <group ref={giantGrp} position={[0, -2, -54]} visible={false}>
        <Suspense fallback={null}>
          <MeshyArchitectBoss
            accent={accent}
            phaseRef={phaseRef}
            animRef={vexAnimRef}
            hitRef={hitRef}
            attackRef={attackRef}
            staggerRef={staggerRef}
            phaseBreakRef={phaseBreakRef}
            ghost
            projection
            dead={dead}
          />
        </Suspense>
      </group>

      {/* Reality-glitch shells — wireframe waves that tear across the city
          on phase breaks (and ambiently in the late phases). */}
      {glitchShells.map((_, i) => (
        <mesh
          key={`gl${i}`}
          ref={(el) => {
            glitchRefs.current[i] = el
          }}
          visible={false}
          frustumCulled={false}
          renderOrder={6}
        >
          <cylinderGeometry args={[1, 1, 1, 40, 3, true]} />
          <meshBasicMaterial
            ref={(el) => {
              glitchMats.current[i] = el
            }}
            color="#ff3b4e"
            wireframe
            transparent
            opacity={0}
            toneMapped={false}
            fog={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Corrupted deck data-rings — ignite as the city falls. */}
      {[9, 14.5, 20].map((r, i) => (
        <mesh key={`dr${i}`} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]} renderOrder={4}>
          <ringGeometry args={[r - 0.18, r + 0.18, 96]} />
          <meshBasicMaterial
            ref={(el) => {
              deckRingMats.current[i] = el
            }}
            color="#ff2438"
            transparent
            opacity={0}
            toneMapped={false}
            fog={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      <Rain count={tier === 'low' ? 240 : tier === 'med' ? 520 : 900} />
      <EmberField count={tier === 'low' ? 50 : tier === 'med' ? 90 : 140} area={BOUND} height={18} color={LIGHTNING} />

      <group ref={playerGroup}>
        <Avatar animRef={playerAnimRef} accent={accent} fireRef={fireRef} slashRef={slashStart} />
      </group>

      <group ref={bossGroup} scale={BOSS_SCALE}>
        <ArchitectSwitch
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          readyRef={bossReadyRef}
          dead={dead}
        />
      </group>

      {/* Echo clones — the Architect splits into multiple, mirroring his rig
          and firing alongside him in later phases. Rendered as translucent
          ghosts so the real Architect is never ambiguous. */}
      <group ref={cloneARef} scale={BOSS_SCALE * 0.96} visible={false}>
        <ArchitectSwitch
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          ghost
          dead={dead}
        />
      </group>
      <group ref={cloneBRef} scale={BOSS_SCALE * 0.96} visible={false}>
        <ArchitectSwitch
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          ghost
          dead={dead}
        />
      </group>

      {/* ---- Phase-ward props ---- */}
      {/* P2 twin seals — melee both within the link to break the ward. */}
      {[0, 1].map((i) => (
        <group
          key={`seal${i}`}
          ref={(el) => {
            sealRefs.current[i] = el
          }}
          visible={false}
        >
          <mesh>
            <octahedronGeometry args={[0.62, 0]} />
            <meshBasicMaterial
              ref={(el) => {
                sealMats.current[i] = el
              }}
              color={WARD_HOT}
              transparent
              opacity={0.9}
              toneMapped={false}
              fog={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
      {/* P3 sorted sigils — cross them in ascending order. */}
      {Array.from({ length: 4 }).map((_, i) => (
        <group
          key={`sigil${i}`}
          ref={(el) => {
            sigilRefs.current[i] = el
          }}
          visible={false}
        >
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} scale={ARCHITECT_SIGILS.tileRadius} renderOrder={4}>
            <circleGeometry args={[1, 40]} />
            <meshBasicMaterial
              ref={(el) => {
                sigilDiskMats.current[i] = el
              }}
              color={WARD_HOT}
              transparent
              opacity={0.2}
              toneMapped={false}
              fog={false}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.07, 0]} scale={ARCHITECT_SIGILS.tileRadius} renderOrder={4}>
            <ringGeometry args={[0.82, 1, 44]} />
            <meshBasicMaterial color={WARD_HOT} transparent opacity={0.5} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <sprite position={[0, 1.7, 0]} scale={[2.0, 2.0, 1]}>
            <spriteMaterial
              ref={(el) => {
                sigilSpriteMats.current[i] = el
              }}
              transparent
              depthWrite={false}
              toneMapped={false}
              fog={false}
            />
          </sprite>
        </group>
      ))}
      {/* P4 Deletion Mark brand — ring underfoot + a blood-red column ON the
          player, unmissable even mid-storm (QA: the ring alone read as a
          faint underfoot glow). */}
      <mesh ref={markRingRef} rotation-x={-Math.PI / 2} visible={false} renderOrder={5}>
        <ringGeometry args={[0.8, 1, 44]} />
        <meshBasicMaterial
          ref={markRingMat}
          color={WARD_BAD}
          transparent
          opacity={0.6}
          toneMapped={false}
          fog={false}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={markBeamRef} visible={false} renderOrder={5}>
        <cylinderGeometry args={[0.5, 1.1, 7, 10, 1, true]} />
        <meshBasicMaterial
          ref={markBeamMat}
          color={WARD_BAD}
          transparent
          opacity={0.3}
          toneMapped={false}
          fog={false}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <WeaponTrail ref={playerTrail} color={accent} width={0.22} segments={20} fade={0.16} />

      {/* Lightning bolt columns. */}
      {lbolts.map((_, i) => (
        <mesh
          key={`lb${i}`}
          ref={(el) => {
            lboltRefs.current[i] = el
          }}
          visible={false}
          frustumCulled={false}
          renderOrder={6}
        >
          <cylinderGeometry args={[0.18, 0.05, 16, 8, 1, true]} />
          <meshBasicMaterial
            ref={(el) => {
              lboltMatRefs.current[i] = el
            }}
            color={LIGHTNING}
            transparent
            opacity={0}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      ))}

      {/* Sweeping band walls (glyph-wall / reality sweep). */}
      <mesh ref={wallARef} visible={false} frustumCulled={false} renderOrder={5}>
        <planeGeometry args={[1, 6]} />
        <meshBasicMaterial ref={wallAMat} color={GLYPH} transparent opacity={0} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>
      <mesh ref={wallBRef} visible={false} frustumCulled={false} renderOrder={5}>
        <planeGeometry args={[1, 6]} />
        <meshBasicMaterial ref={wallBMat} color={GLYPH} transparent opacity={0} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>

      {/* Floating fractured slabs — glyph-lit undersides so they read as
          telekinetically ripped deck pieces, not stray black boxes (QA). */}
      {slabs.map((_, i) => (
        <mesh
          key={`slab${i}`}
          ref={(el) => {
            slabRefs.current[i] = el
          }}
          visible={false}
          frustumCulled={false}
        >
          <boxGeometry args={[3.4, 0.5, 3.4]} />
          <meshStandardMaterial color="#0f1119" emissive={GLYPH} emissiveIntensity={0.16} roughness={0.75} metalness={0.3} flatShading />
        </mesh>
      ))}

      {/* Pooled projectiles / particles. */}
      <instancedMesh ref={boltsMesh} args={[boltGeo, boltMat, BOLT_POOL]} frustumCulled={false} />
      <EnemyProjectiles ref={orbFx} pool={ORB_POOL} color={GLYPH} size={0.32} />
      <ImpactFlashes ref={impactFx} pool={12} />
      <instancedMesh ref={debrisMesh} args={[debrisGeo, debrisMat, DEBRIS_POOL]} frustumCulled={false} />
      <instancedMesh ref={afterMesh} args={[afterGeo, afterMat, AFTER_POOL]} frustumCulled={false} />

      {/* Cinematic VFX. */}
      <SparkBurst ref={sparks} pool={tier === 'low' ? 100 : 180} />
      <ShockwaveRing ref={shockFx} pool={5} />
      <GroundDecal ref={decals} pool={12} />
    </group>
  )
})

/** Position an echo-clone flanking the boss (or hide it when inactive). */
function placeEchoClone(
  group: THREE.Group | null,
  posVec: THREE.Vector3,
  cull: { current: number },
  ang: number,
  active: boolean,
  bx: number,
  bz: number,
  px: number,
  pz: number,
) {
  if (!group) return
  if (!active) {
    if (group.visible) group.visible = false
    return
  }
  group.visible = true
  const r = 6.5
  let cx = bx + Math.cos(ang) * r
  let cz = bz + Math.sin(ang) * r
  const rr = Math.hypot(cx, cz)
  if (rr > BOUND - 2) {
    cx *= (BOUND - 2) / rr
    cz *= (BOUND - 2) / rr
  }
  posVec.set(cx, 0, cz)
  group.position.set(cx, 0, cz)
  group.rotation.y = Math.atan2(px - cx, pz - cz)
  if (cull.current < 12) {
    cull.current++
    group.traverse((o) => {
      o.frustumCulled = false
    })
  }
}

/** Park an instanced slot off-screen at zero scale. */
function hideInstance(m: THREE.InstancedMesh, i: number) {
  _hideObj.position.set(0, -9999, 0)
  _hideObj.scale.setScalar(0)
  _hideObj.updateMatrix()
  m.setMatrixAt(i, _hideObj.matrix)
}
const _hideObj = new THREE.Object3D()

/* ------------------------------------------------------------- Component */

export interface ArchitectArenaProps {
  bossName?: string
  accent?: string
  onWin: () => void
  onLose: () => void
  onFlee?: () => void
  /** QA capture instrumentation ONLY (default off, never passed by the app):
   *  the player ignores incoming damage so an automated bot survives long
   *  enough to drive the fight through every phase for review. Changes NO
   *  boss HP/damage/combat numbers — purely player-side survivability. */
  qaGodMode?: boolean
  /** QA probe instrumentation ONLY: publishes per-frame ward autopilot
   *  recommendations on window.__mechQA so the scripted bot can execute the
   *  phase mechanics. Zero gameplay impact; the app never sets it. */
  qaHooks?: boolean
}

export function ArchitectArena({
  bossName = 'THE ARCHITECT',
  accent = ACCENT,
  onWin,
  onLose,
  onFlee,
  qaGodMode = false,
  qaHooks = false,
}: ArchitectArenaProps): JSX.Element {
  const [playerHp, setPlayerHp] = useState(PLAYER_HP)
  const [bossHp, setBossHp] = useState(BOSS_HP_MAX)
  const [phase, setPhase] = useState<Phase>(1)
  const [dead, setDead] = useState(false)
  const [hurt, setHurt] = useState(0)
  const [hitCount, setHitCount] = useState(0)
  const [hurtBoss, setHurtBoss] = useState(false)
  const [telegraph, setTelegraph] = useState<{ label: string; danger: boolean } | null>(null)
  const [combo, setCombo] = useState(0)
  const [flashOn, setFlashOn] = useState(false)
  const [callout, setCallout] = useState<string | null>(null)
  const [taunt, setTaunt] = useState<string | null>(null)
  const endedRef = useRef(false)
  const comboClearRef = useRef<number | null>(null)

  // Entrance staging: an opaque curtain covers the mount (and the rig load);
  // the scene lifts it via onCurtainUp, which starts the title-card clock.
  const bossReadyRef = useRef(0)
  const [curtain, setCurtain] = useState(true)
  const [introBanner, setIntroBanner] = useState(true)
  const onCurtainUp = useCallback(() => setCurtain(false), [])
  useEffect(() => {
    if (curtain) return
    const id = window.setTimeout(() => setIntroBanner(false), 3300)
    return () => window.clearTimeout(id)
  }, [curtain])

  const phaseRef = useRef<Phase>(1)
  const hitRef = useRef(0)
  const attackRef = useRef(0)
  const staggerRef = useRef(0)
  const phaseBreakRef = useRef(0)

  const onBossHit = useCallback((amount: number) => {
    setHitCount((c) => c + 1)
    setBossHp((hp) => Math.max(0, hp - amount))
  }, [])
  // Failed wards let him feed — capped at full, and never past a phase gate
  // he has already broken through (healing back across 75/50/25% would replay
  // phase cutscenes).
  const onBossHeal = useCallback((amount: number) => {
    setBossHp((hp) => {
      if (hp <= 0) return hp
      const ceiling =
        hp <= P4_AT ? P4_AT : hp <= P3_AT ? P3_AT : hp <= P2_AT ? P2_AT : BOSS_HP_MAX
      return Math.min(ceiling, hp + amount)
    })
  }, [])
  // Transient ward flash (mechanic teaching line, separate from telegraphs).
  const [mechFlash, setMechFlash] = useState<{ label: string; danger: boolean } | null>(null)
  const onMechFlash = useCallback((label: string | null, danger = false) => {
    setMechFlash(label ? { label, danger } : null)
  }, [])
  const onPlayerHit = useCallback((amount: number) => {
    setHurt((h) => h + 1)
    // QA capture only: keep the review bot alive to walk every phase. Real
    // gameplay never sets this, so damage is unchanged for players.
    if (!qaGodMode) setPlayerHp((hp) => Math.max(0, hp - amount))
    if (Math.random() < 0.28) {
      setCallout(ARCHITECT_HIT_LINES[Math.floor(Math.random() * ARCHITECT_HIT_LINES.length)])
      window.setTimeout(() => setCallout(null), 1100)
    }
  }, [qaGodMode])
  const onBossAttack = useCallback(() => {
    attackRef.current += 1
  }, [])
  const onTelegraph = useCallback((label: string | null, danger = false) => {
    setTelegraph(label ? { label, danger } : null)
  }, [])
  const onCombo = useCallback((n: number) => {
    setCombo(n)
    if (comboClearRef.current) window.clearTimeout(comboClearRef.current)
    comboClearRef.current = window.setTimeout(() => setCombo(0), 900)
  }, [])
  useEffect(() => () => {
    if (comboClearRef.current) window.clearTimeout(comboClearRef.current)
  }, [])

  useEffect(() => {
    const next: Phase = bossHp <= P4_AT ? 4 : bossHp <= P3_AT ? 3 : bossHp <= P2_AT ? 2 : 1
    if (next !== phaseRef.current) {
      phaseRef.current = next
      setPhase(next)
    }
    if (bossHp <= 0 && !dead) setDead(true)
  }, [bossHp, dead])

  useEffect(() => {
    if (phase === 1) return
    setTaunt(ARCHITECT_PHASE_TAUNTS[phase - 2] ?? null)
    const id = window.setTimeout(() => setTaunt(null), 2400)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (hitCount === 0) return
    setHurtBoss(true)
    const id = window.setTimeout(() => setHurtBoss(false), 110)
    return () => window.clearTimeout(id)
  }, [hitCount])

  useEffect(() => {
    if (!dead || endedRef.current) return
    endedRef.current = true
    setTelegraph(null)
    const id = window.setTimeout(onWin, (ARCHITECT_DEATH_DUR + 0.4) * 1000)
    return () => window.clearTimeout(id)
  }, [dead, onWin])

  useEffect(() => {
    if (playerHp > 0 || endedRef.current) return
    endedRef.current = true
    const id = window.setTimeout(onLose, 900)
    return () => window.clearTimeout(id)
  }, [playerHp, onLose])

  useEffect(() => {
    if (hurt === 0) return
    setFlashOn(true)
    const id = window.setTimeout(() => setFlashOn(false), 200)
    return () => window.clearTimeout(id)
  }, [hurt])

  const playerDefeated = playerHp <= 0
  const frozen = playerDefeated || dead
  const bossPct = Math.max(0, (bossHp / BOSS_HP_MAX) * 100)
  const lateGame = phase >= 3

  const hud = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
      {/* Entrance curtain — covers the mount + rig load. */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: curtain ? 1 : 0, transition: 'opacity 0.5s ease' }} />

      {/* Player-down treatment: the defeat reads as a beat, not a bug. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 100% at 50% 50%, transparent 30%, rgba(60,0,8,0.75) 100%)',
          opacity: playerHp <= 0 ? 1 : 0,
          transition: 'opacity 0.6s ease',
        }}
      />

      {/* Entrance beat: cinematic letterbox + boss title card (lower third). */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: introBanner ? '9%' : 0, background: '#000', transition: 'height 0.6s ease' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: introBanner ? '9%' : 0, background: '#000', transition: 'height 0.6s ease' }} />
      <div
        style={{
          position: 'absolute',
          top: '66%',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: introBanner && !curtain ? 1 : 0,
          transform: introBanner && !curtain ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <div style={{ color: accent, fontWeight: 800, fontSize: 13, letterSpacing: 6, textTransform: 'uppercase', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
          Final Showdown · The Apex
        </div>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 42, letterSpacing: 4, textTransform: 'uppercase', textShadow: `0 0 28px ${accent}aa, 0 3px 16px rgba(0,0,0,0.95)`, lineHeight: 1.1 }}>
          {bossName}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 700, fontSize: 15, letterSpacing: 3, textTransform: 'uppercase' }}>
          Mastermind of the Null
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 50%, transparent 40%, rgba(255,40,50,0.5) 100%)', opacity: flashOn ? 1 : 0, transition: 'opacity 0.18s ease' }} />

      {/* Boss HP + 4 phase pips */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(680px, 90%)', textAlign: 'center', opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <span style={{ color: '#fff', fontWeight: 800, letterSpacing: 1.2, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>{bossName} — MASTERMIND OF THE NULL</span>
          <span style={{ color: accent, fontWeight: 800, fontSize: 13 }}>
            {[1, 2, 3, 4].map((p) => (
              <span key={p} style={{ opacity: phase >= p ? 1 : 0.3, marginLeft: 4 }}>◆</span>
            ))}
          </span>
        </div>
        <div style={{ height: 17, borderRadius: 9, background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', boxShadow: hurtBoss ? `0 0 16px ${accent}` : 'none', transition: 'box-shadow 0.1s ease', position: 'relative' }}>
          <div style={{ height: '100%', width: `${bossPct}%`, background: lateGame ? '#c9d6ff' : accent, transition: 'width 0.14s ease' }} />
          {[75, 50, 25].map((p) => (
            <span key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 2, background: 'rgba(255,255,255,0.5)' }} />
          ))}
        </div>
        {/* The phase ward — how he can actually be hurt RIGHT NOW. */}
        <div style={{ marginTop: 6, color: '#ffd27a', fontWeight: 800, fontSize: 12.5, letterSpacing: 1.5, textShadow: '0 2px 8px rgba(0,0,0,0.85)' }}>
          {architectWardHint(phase)}
        </div>
        {/* Kill payoff stamp — the fall reads instantly while dawn breaks. */}
        {dead && (
          <div style={{ marginTop: 10, color: '#8dffb0', fontWeight: 900, fontSize: 32, letterSpacing: 6, textTransform: 'uppercase', textShadow: '0 0 24px rgba(141,255,176,0.7), 0 3px 14px rgba(0,0,0,0.95)' }}>
            The Architect Falls
          </div>
        )}
      </div>

      {/* Player vitals */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12, marginBottom: 6, letterSpacing: 1, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>VITALS</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 320 }}>
          {Array.from({ length: PLAYER_HP }).map((_, i) => (
            <span key={i} style={{ width: 15, height: 15, borderRadius: 4, background: i < playerHp ? '#ff5a6a' : 'rgba(255,255,255,0.16)', boxShadow: i < playerHp ? '0 0 8px rgba(255,90,106,0.7)' : 'none' }} />
          ))}
        </div>
      </div>

      {combo > 1 && (
        <div key={combo} style={{ position: 'absolute', top: '34%', right: 40, color: accent, fontWeight: 900, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
          <span style={{ fontSize: 46 }}>{combo}</span>
          <span style={{ fontSize: 18, marginLeft: 4 }}>HIT</span>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,0.8)', whiteSpace: 'nowrap', opacity: introBanner || playerHp <= 0 ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        WASD move · Click/Q slice · F/RMB shoot · Shift dash · Space jump · K roll
      </div>

      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: '50%', background: 'rgba(255,255,255,0.55)' }} />

      {telegraph && (
        <div key={telegraph.label} style={{ position: 'absolute', top: '19%', left: '50%', transform: 'translateX(-50%)', color: telegraph.danger ? '#ff5a6a' : '#fff', fontWeight: 900, fontSize: telegraph.danger ? 30 : 22, letterSpacing: 1, textShadow: '0 2px 14px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
          {telegraph.label}
        </div>
      )}

      {/* Ward-mechanic flash (separate line so it never fights a telegraph). */}
      {mechFlash && (
        <div key={mechFlash.label} style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)', color: mechFlash.danger ? '#ff5a6a' : '#8dffb0', fontWeight: 900, fontSize: mechFlash.danger ? 26 : 21, letterSpacing: 1, textShadow: '0 2px 14px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
          {mechFlash.label}
        </div>
      )}

      {callout && (
        <div key={callout} style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', color: accent, fontWeight: 800, fontStyle: 'italic', fontSize: 24, textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
          “{callout}”
        </div>
      )}

      {taunt && (
        <div key={taunt} style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translateX(-50%)', width: 'min(600px, 88%)', textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: 22, textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}>
          {taunt}
        </div>
      )}

      {onFlee && (
        <button onClick={onFlee} style={{ position: 'absolute', top: 16, left: 16, padding: '8px 14px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.4)', color: '#fff', fontWeight: 700, cursor: 'pointer', pointerEvents: 'auto' }}>
          Flee
        </button>
      )}
    </div>
  )

  // Memoize the Canvas subtree so HUD state churn (HP, combo, telegraph, barks,
  // flashes) re-renders ONLY the DOM overlay — never the 3D scene/post stack.
  // Identity changes only on death/freeze/late-game, so combat ticks can't stall
  // input.
  const stage = useMemo(
    () => (
      <CinematicStage
        environment="void"
        fog={{ color: '#070a14', near: 28, far: 150 }}
        cameraInitial={{ position: [CAM_SIDE, CAM_HEIGHT, 15 + CAM_BACK], fov: 60 }}
        bloom={lateGame ? 1.05 : 0.8}
        ssao
        grain
        chromaticAberration={lateGame}
        vignette
      >
        <ArchitectScene
          accent={accent}
          dead={dead}
          frozen={frozen}
          playerDefeated={playerDefeated}
          phaseRef={phaseRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          bossReadyRef={bossReadyRef}
          onCurtainUp={onCurtainUp}
          onBossHit={onBossHit}
          onBossHeal={onBossHeal}
          onPlayerHit={onPlayerHit}
          onBossAttack={onBossAttack}
          onTelegraph={onTelegraph}
          onMechFlash={onMechFlash}
          onCombo={onCombo}
          qaHooks={qaHooks}
        />
      </CinematicStage>
    ),
    [accent, dead, frozen, playerDefeated, lateGame, phaseRef, hitRef, attackRef, staggerRef, phaseBreakRef, onCurtainUp, onBossHit, onBossHeal, onPlayerHit, onBossAttack, onTelegraph, onMechFlash, onCombo, qaHooks],
  )

  return (
    <>
      {stage}
      {hud}
    </>
  )
}
