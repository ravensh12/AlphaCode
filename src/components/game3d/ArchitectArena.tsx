import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MutableRefObject,
} from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { Architect3D, ARCHITECT_DEATH_DUR, ARCHITECT_HEAVY_DUR, type ArchitectAnim, type ArchitectPhase } from './Architect3D'
import { useKeys } from './useKeys'
import { playShot } from '../../lib/soundFx'
import {
  ARCHITECT_PARRY_LINES,
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

/* ======================================================================
   THE APEX — the climactic final fight against THE ARCHITECT atop the Null
   Tower, in a lightning storm above a neon megacity.

   Built on the `cinematic` engine and the same proven combat scaffolding as
   CinematicBossArena (identical player kit + parry system), but DEEPER: 4 phases,
   200 boss HP / 14 player HP, a telekinesis/reality-editing roster (glyph-blades,
   debris hurl, lightning strikes, blink combo, force shockwaves, glyph-wall,
   parryable force-slam, reality-rewrite sweep, and a phase-4 glyph-storm ult),
   plus a storming rooftop that fractures as he loses. Ref-driven sim, pooled
   VFX, HUD via CinematicStage; no per-frame setState.
   ====================================================================== */

/* ------------------------------------------------------------- Tuning */

const PLAYER_HP = 12
const BOSS_HP_MAX = 300
const P2_AT = Math.round(BOSS_HP_MAX * 0.75)
const P3_AT = Math.round(BOSS_HP_MAX * 0.5)
const P4_AT = Math.round(BOSS_HP_MAX * 0.25)

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

// Parry
const PARRY_WINDOW = 0.2
const PARRY_CD = 0.42
const STAGGER_TIME = 1.7

// Ranged
const BOLT_SPEED = 72
const BOLT_LIFE = 1.4
const BOLT_CD = 0.15
const BOLT_POOL = 36
const BOLT_DMG = 1

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

type Phase = ArchitectPhase

type Bolt = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number }
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

/* ---------------------------------------------------------- Rooftop env */

function ApexRooftop({ accent, tier, count }: { accent: string; tier: QualityTier; count: number }): JSX.Element {
  // Instanced skyline towers receding into the fog below/around the deck. Kept
  // within ~camera-far so distant rings are frustum/fog-culled, not overdrawn.
  const towers = useMemo(() => {
    const out: { x: number; z: number; w: number; h: number; d: number; lit: number }[] = []
    for (let i = 0; i < count; i++) {
      const ring = 1 + Math.floor(i / 20)
      const a = (i * 2.399) % (Math.PI * 2)
      const r = BOUND + 22 + ring * 20 + (i % 5) * 5
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        w: 6 + (i % 4) * 3,
        h: 30 + (i % 7) * 22,
        d: 6 + (i % 3) * 3,
        lit: (i % 3) / 3,
      })
    }
    return out
  }, [count])
  const towerGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const towerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0a0c16', emissive: new THREE.Color(accent), emissiveIntensity: 0.12, roughness: 0.7, metalness: 0.3 }),
    [accent],
  )
  const towerRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = towerRef.current
    if (!m) return
    const d = new THREE.Object3D()
    for (let i = 0; i < towers.length; i++) {
      const tw = towers[i]
      d.position.set(tw.x, tw.h / 2 - 36, tw.z)
      d.scale.set(tw.w, tw.h, tw.d)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [towers])
  useEffect(() => () => {
    towerGeo.dispose()
    towerMat.dispose()
  }, [towerGeo, towerMat])

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

      {/* Skyline. */}
      <instancedMesh ref={towerRef} args={[towerGeo, towerMat, count]} frustumCulled={false} />
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
  phaseRef: MutableRefObject<Phase>
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
  staggerRef: MutableRefObject<number>
  phaseBreakRef: MutableRefObject<number>
  onBossHit: (amount: number) => void
  onPlayerHit: (amount: number) => void
  onBossAttack: () => void
  onTelegraph: (label: string | null, danger?: boolean) => void
  onCombo: (n: number) => void
  onParry: () => void
}

const ArchitectScene = memo(function ArchitectScene({
  accent,
  dead,
  frozen,
  phaseRef,
  hitRef,
  attackRef,
  staggerRef,
  phaseBreakRef,
  onBossHit,
  onPlayerHit,
  onBossAttack,
  onTelegraph,
  onCombo,
  onParry,
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

  const parryT = useRef(-100)
  const parryCd = useRef(0)

  // Input edges.
  const holdFire = useRef(false)
  const reqSlice = useRef(false)
  const reqDash = useRef(false)
  const reqRoll = useRef(false)
  const reqJump = useRef(false)
  const reqParry = useRef(false)
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
  const staggerTimer = useRef(0)
  const heavyStruck = useRef(false)
  const blinkStruck = useRef(false)
  const prevPhase = useRef<Phase>(1)
  const markPts = useRef<{ x: number; z: number }[]>([])
  const tiltT = useRef(0)

  // Juice.
  const hitStop = useRef(0)
  const cutsceneT = useRef(0)
  const slowmoUntil = useRef(0)

  const enabledRef = useRef(true)
  enabledRef.current = !frozen
  const keys = useKeys(enabledRef)

  // Pools.
  const bolts = useMemo<Bolt[]>(() => Array.from({ length: BOLT_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 })), [])
  const orbs = useMemo<Orb[]>(() => Array.from({ length: ORB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, mode: 0 as const, lock: 0 })), [])
  const debris = useMemo<Debris[]>(() => Array.from({ length: DEBRIS_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 })), [])
  const afters = useMemo<After[]>(() => Array.from({ length: AFTER_POOL }, () => ({ active: false, pos: new THREE.Vector3(), life: 0 })), [])
  const dshocks = useMemo<DShock[]>(() => Array.from({ length: DSHOCK_POOL }, () => ({ active: false, x: 0, z: 0, t: 0, dur: 0.7, maxR: BOUND, struck: false })), [])
  const lbolts = useMemo<LBolt[]>(() => Array.from({ length: LBOLT_POOL }, () => ({ active: false, x: 0, z: 0, t: 0, struck: false })), [])
  const slabs = useMemo<Slab[]>(() => Array.from({ length: SLAB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler() })), [])
  const band = useRef<Band>({ active: false, z: 0, dir: 1, speed: 10, gapX: 0, gapHalf: 2.2, struck: false, kind: 'wall' })

  const boltsMesh = useRef<THREE.InstancedMesh>(null)
  const orbsMesh = useRef<THREE.InstancedMesh>(null)
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
  const orbGeo = useMemo(() => new THREE.OctahedronGeometry(0.32, 0), [])
  const orbMat = useMemo(() => new THREE.MeshBasicMaterial({ color: GLYPH, toneMapped: false, fog: false }), [])
  const debrisGeo = useMemo(() => new THREE.DodecahedronGeometry(0.5, 0), [])
  const debrisMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2e3c', roughness: 0.8, metalness: 0.3, flatShading: true }), [])
  const afterGeo = useMemo(() => new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), [])
  const afterMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, fog: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), [accent])
  useEffect(
    () => () => {
      boltGeo.dispose(); boltMat.dispose(); orbGeo.dispose(); orbMat.dispose()
      debrisGeo.dispose(); debrisMat.dispose(); afterGeo.dispose(); afterMat.dispose()
    },
    [boltGeo, boltMat, orbGeo, orbMat, debrisGeo, debrisMat, afterGeo, afterMat],
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
      if (k === 'l' && fresh) reqParry.current = true
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
      case 'heavy': return [0.7, ARCHITECT_HEAVY_DUR, 0.7]
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
      case 'heavy': return ['◆ FORCE-SLAM — PARRY (L) ◆', true]
      case 'rewrite': return ['◆ REALITY REWRITE — DASH THE SWEEP ◆', true]
      case 'ultimate': return ['◆◆ DELETION PROTOCOL — SURVIVE ◆◆', true]
      default: return ['', false]
    }
  }
  function chooseAttack(phase: Phase) {
    const p1 = ['glyphFan', 'debris', 'shockwave', 'heavy']
    const p2 = ['glyphFan', 'debris', 'shockwave', 'lightning', 'blink', 'glyphWall', 'heavy']
    const p3 = ['glyphFan', 'debris', 'shockwave', 'lightning', 'blink', 'glyphWall', 'heavy', 'rewrite']
    const p4 = ['glyphFan', 'debris', 'lightning', 'blink', 'glyphWall', 'heavy', 'rewrite', 'ultimate']
    const list = phase === 1 ? p1 : phase === 2 ? p2 : phase === 3 ? p3 : p4
    let name = list[Math.floor(Math.random() * list.length)]
    if (name === lastName.current) name = list[Math.floor(Math.random() * list.length)]
    lastName.current = name
    atkName.current = name
    atkState.current = 'tele'
    atkT.current = 0
    heavyStruck.current = false
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
    } else if (name === 'heavy') {
      if (decals.current) decals.current.show(tmpDir.current.set(pos.current.x, 0.05, pos.current.z), 3.0, HOT, durs('heavy')[0])
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
    // 'glyphWall','rewrite','heavy' resolve via per-frame updates.
  }

  function activeAttack(_phase: Phase, parryActive: boolean) {
    const name = atkName.current
    const dir = dirRef.current
    if (name === 'heavy' && !heavyStruck.current) {
      const connectAt = durs('heavy')[1] * 0.45
      if (atkT.current >= connectAt) {
        heavyStruck.current = true
        const pd = Math.hypot(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
        const inReach = pd < 5.5
        if (parryActive && inReach) {
          staggerTimer.current = STAGGER_TIME
          staggerRef.current += 1
          slowmoUntil.current = performance.now() + 850
          if (dir) {
            dir.punch(1.0)
            dir.shake(0.5)
          }
          if (sparks.current) sparks.current.burst(tmpDir.current.set(pos.current.x, 1.4, pos.current.z), '#ffffff', 28)
          onTelegraph(null)
          onParry()
          sfx.parry()
        } else {
          fireDShock(bossPos.current.x, bossPos.current.z, 6)
          if (dir) dir.shake(0.28)
          sfx.boom()
          if (inReach && !invuln.current && pos.current.y < 1.4) onPlayerHit(2)
        }
      }
    } else if (name === 'blink' && !blinkStruck.current) {
      if (atkT.current >= 0.3) {
        blinkStruck.current = true
        if (vexAnimRef.current !== 'stagger') vexAnimRef.current = 'heavy'
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

    const slow = now < slowmoUntil.current
    if (dir) dir.setTimeScale(slow ? 0.32 : 1)
    hitStop.current = Math.max(0, hitStop.current - realDt)
    cutsceneT.current = Math.max(0, cutsceneT.current - realDt)
    const simFrozen = frozen || hitStop.current > 0 || cutsceneT.current > 0
    const dt = simFrozen ? 0 : (dir ? dir.scaledDelta(realDt) : realDt)
    const phase = phaseRef.current
    const k = simFrozen ? {} : keys.current

    // Phase transition beat.
    if (phase !== prevPhase.current) {
      if (phase > prevPhase.current) {
        cutsceneT.current = 0.85
        atkState.current = 'gap'
        gapT.current = 0.7
        phaseBreakRef.current += 1
        spawnSlabs(phase === 2 ? 2 : phase === 3 ? 3 : 4)
        triggerFlash(0.9)
        if (dir) dir.shake(0.45)
        sfx.thunder()
      }
      prevPhase.current = phase
    }

    /* ---- ambient lightning ---- */
    nextAmbientBolt.current -= realDt
    if (nextAmbientBolt.current <= 0) {
      nextAmbientBolt.current = 4 + Math.random() * 5
      triggerFlash(0.6 + Math.random() * 0.3)
      thunderDelay.current = 0.4 + Math.random() * 0.8
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
    parryCd.current -= dt
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
      if (reqParry.current) {
        reqParry.current = false
        if (parryCd.current <= 0) {
          parryT.current = t
          parryCd.current = PARRY_CD
          sfx.slash()
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

    const parryActive = t - parryT.current < PARRY_WINDOW

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
        const dx = bossPos.current.x - pos.current.x
        const dz = bossPos.current.z - pos.current.z
        const hdist = Math.hypot(dx, dz)
        if (hdist < MELEE_RANGE && !dead) {
          sliceHit.current = true
          const finisher = comboIndex.current === 2
          let dmg = MELEE_DMG[comboIndex.current]
          if (staggerTimer.current > 0) dmg = Math.round(dmg * 1.8)
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

    if (sliceActive.current || action.current === 'dash') playerAnimRef.current = 'dash'
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
      const staggered = staggerTimer.current > 0
      if (!attacking && !staggered) {
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

      if (staggered) vexAnimRef.current = 'stagger'
      else if (atkName.current === 'heavy' && attacking) vexAnimRef.current = 'heavy'
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
    if (dead) {
      const e = state.clock.elapsedTime
      const orbit = e * 0.7
      tmpFrom.current.set(bossPos.current.x + Math.cos(orbit) * 9, 4.8, bossPos.current.z + Math.sin(orbit) * 9)
      tmpLook.current.set(bossPos.current.x, 1.6, bossPos.current.z)
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
      const b = bolts.find((x) => !x.active)
      if (b) {
        b.active = true
        b.life = BOLT_LIFE
        b.pos.set(pos.current.x + tmpFwd.current.x * 0.7, 1.2 + pos.current.y, pos.current.z + tmpFwd.current.z * 0.7)
        tmpDir.current.set(bossPos.current.x - b.pos.x, bossPos.current.y + 1.5 - b.pos.y, bossPos.current.z - b.pos.z).normalize()
        b.vel.copy(tmpDir.current).multiplyScalar(BOLT_SPEED)
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
        if (!dead) {
          tmpDir.current.set(bossPos.current.x - b.pos.x, bossPos.current.y + 1.5 - b.pos.y, bossPos.current.z - b.pos.z).normalize()
          b.vel.lerp(tmpDir.current.multiplyScalar(BOLT_SPEED), 0.08)
        }
        b.pos.addScaledVector(b.vel, dt)
        b.life -= dt
        let consumed = false
        if (!dead) {
          const d = Math.hypot(b.pos.x - bossPos.current.x, b.pos.y - (bossPos.current.y + 1.5), b.pos.z - bossPos.current.z)
          if (d < BOLT_HIT_R) {
            consumed = true
            let dmg = BOLT_DMG
            if (staggerTimer.current > 0) dmg = 2
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
    if (staggerTimer.current > 0) {
      staggerTimer.current -= dt
    } else if (!dead && !simFrozen) {
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
          activeAttack(phase, parryActive)
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
    if (orbsMesh.current) {
      const m = orbsMesh.current
      const homeSpeed = phase <= 2 ? 14 : 18
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i]
        if (!o.active) {
          hideInstance(m, i)
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
          if (dir) dir.shake(0.16)
        }
        if (gone || o.life <= 0) {
          o.active = false
          hideInstance(m, i)
          continue
        }
        dObj.current.position.copy(o.pos)
        dObj.current.scale.setScalar(o.mode === 0 && o.lock > 0 ? 1.2 : 1)
        dObj.current.rotation.set(t * 3, t * 4, t * 2)
        dObj.current.updateMatrix()
        m.setMatrixAt(i, dObj.current.matrix)
      }
      m.instanceMatrix.needsUpdate = true
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
      if (!s.active) {
        mesh.visible = false
        continue
      }
      s.vel.y += GRAV * 0.05 * dt
      s.pos.addScaledVector(s.vel, dt)
      s.rot.x += s.spin.x * dt
      s.rot.y += s.spin.y * dt
      s.rot.z += s.spin.z * dt
      mesh.visible = true
      mesh.position.copy(s.pos)
      mesh.rotation.copy(s.rot)
      if (s.pos.y > 14 || s.pos.y < -4) {
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
  })

  return (
    <group>
      {/* Storm flash light + sky flash plane. */}
      <directionalLight ref={lightningLight} position={[6, 30, 10]} color={LIGHTNING} intensity={0} />
      <mesh ref={skyFlash} position={[0, 40, -60]} frustumCulled={false}>
        <planeGeometry args={[400, 200]} />
        <meshBasicMaterial ref={skyFlashMat} color={LIGHTNING} transparent opacity={0} toneMapped={false} depthWrite={false} fog={false} side={THREE.DoubleSide} />
      </mesh>

      <group ref={deckTilt}>
        <ApexRooftop accent={accent} tier={tier} count={tier === 'low' ? 28 : tier === 'med' ? 44 : 60} />
      </group>

      <Rain count={tier === 'low' ? 240 : tier === 'med' ? 520 : 900} />
      <EmberField count={tier === 'low' ? 50 : tier === 'med' ? 90 : 140} area={BOUND} height={18} color={LIGHTNING} />

      <group ref={playerGroup}>
        <Avatar animRef={playerAnimRef} accent={accent} fireRef={fireRef} slashRef={slashStart} />
      </group>

      <group ref={bossGroup} scale={BOSS_SCALE}>
        <Architect3D
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          dead={dead}
        />
      </group>

      {/* Echo clones — the Architect splits into multiple, mirroring his rig and
          firing alongside him in later phases. */}
      <group ref={cloneARef} scale={BOSS_SCALE * 0.96} visible={false}>
        <Architect3D
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          dead={dead}
        />
      </group>
      <group ref={cloneBRef} scale={BOSS_SCALE * 0.96} visible={false}>
        <Architect3D
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          dead={dead}
        />
      </group>

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

      {/* Floating fractured slabs. */}
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
          <meshStandardMaterial color="#0c0e18" roughness={0.8} metalness={0.3} flatShading />
        </mesh>
      ))}

      {/* Pooled projectiles / particles. */}
      <instancedMesh ref={boltsMesh} args={[boltGeo, boltMat, BOLT_POOL]} frustumCulled={false} />
      <instancedMesh ref={orbsMesh} args={[orbGeo, orbMat, ORB_POOL]} frustumCulled={false} />
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
}

export function ArchitectArena({
  bossName = 'THE ARCHITECT',
  accent = ACCENT,
  onWin,
  onLose,
  onFlee,
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
  const [parryFlash, setParryFlash] = useState(false)
  const [callout, setCallout] = useState<string | null>(null)
  const [taunt, setTaunt] = useState<string | null>(null)
  const endedRef = useRef(false)
  const comboClearRef = useRef<number | null>(null)

  const phaseRef = useRef<Phase>(1)
  const hitRef = useRef(0)
  const attackRef = useRef(0)
  const staggerRef = useRef(0)
  const phaseBreakRef = useRef(0)

  const onBossHit = useCallback((amount: number) => {
    setHitCount((c) => c + 1)
    setBossHp((hp) => Math.max(0, hp - amount))
  }, [])
  const onPlayerHit = useCallback((amount: number) => {
    setHurt((h) => h + 1)
    setPlayerHp((hp) => Math.max(0, hp - amount))
    if (Math.random() < 0.28) {
      setCallout(ARCHITECT_HIT_LINES[Math.floor(Math.random() * ARCHITECT_HIT_LINES.length)])
      window.setTimeout(() => setCallout(null), 1100)
    }
  }, [])
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
  const onParry = useCallback(() => {
    setParryFlash(true)
    window.setTimeout(() => setParryFlash(false), 360)
    setCallout(ARCHITECT_PARRY_LINES[Math.floor(Math.random() * ARCHITECT_PARRY_LINES.length)])
    window.setTimeout(() => setCallout(null), 1100)
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

  const frozen = playerHp <= 0 || dead
  const bossPct = Math.max(0, (bossHp / BOSS_HP_MAX) * 100)
  const lateGame = phase >= 3

  const hud = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 50%, transparent 40%, rgba(255,40,50,0.5) 100%)', opacity: flashOn ? 1 : 0, transition: 'opacity 0.18s ease' }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% 45%, ${accent}cc 0%, transparent 55%)`, opacity: parryFlash ? 1 : 0, transition: parryFlash ? 'opacity 0.05s ease' : 'opacity 0.4s ease', mixBlendMode: 'screen' }} />

      {/* Boss HP + 4 phase pips */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(680px, 90%)', textAlign: 'center' }}>
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
      </div>

      {/* Player vitals */}
      <div style={{ position: 'absolute', bottom: 20, left: 20 }}>
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

      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
        WASD move · Click/Q slice · F/RMB shoot · Shift dash · Space jump · K roll · <span style={{ color: accent }}>L PARRY</span>
      </div>

      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: '50%', background: 'rgba(255,255,255,0.55)' }} />

      {telegraph && (
        <div key={telegraph.label} style={{ position: 'absolute', top: '19%', left: '50%', transform: 'translateX(-50%)', color: telegraph.danger ? '#ff5a6a' : '#fff', fontWeight: 900, fontSize: telegraph.danger ? 30 : 22, letterSpacing: 1, textShadow: '0 2px 14px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
          {telegraph.label}
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
          phaseRef={phaseRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          phaseBreakRef={phaseBreakRef}
          onBossHit={onBossHit}
          onPlayerHit={onPlayerHit}
          onBossAttack={onBossAttack}
          onTelegraph={onTelegraph}
          onCombo={onCombo}
          onParry={onParry}
        />
      </CinematicStage>
    ),
    [accent, dead, frozen, lateGame, phaseRef, hitRef, attackRef, staggerRef, phaseBreakRef, onBossHit, onPlayerHit, onBossAttack, onTelegraph, onCombo, onParry],
  )

  return (
    <>
      {stage}
      {hud}
    </>
  )
}
