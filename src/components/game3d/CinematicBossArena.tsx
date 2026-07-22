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
import { VexBoss3D, VEX_DEATH_DUR, VEX_HEAVY_DUR, type VexAnim, type VexBoss3DProps } from './VexBoss3D'
import { NightRain, NightSkyline } from './NightCityStage'

// Phase-3 remake: the real character-boss-vex rig + the nine-piece arena kit
// stream lazily; the procedural VexBoss3D stays as the loading fallback AND
// the permanent one if the GLBs ever fail — a boss always renders.
const MeshyVexBoss = lazy(() => import('./meshy/MeshyVexBoss'))
const MeshyArenaDressing = lazy(() => import('./meshy/MeshyArenaDressing'))

class BossBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** The Meshy Vex behind a boundary + suspense, procedural Vex as fallback. */
function VexBossSwitch(props: VexBoss3DProps) {
  const fallback = <VexBoss3D {...props} />
  return (
    <BossBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <MeshyVexBoss {...props} />
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
import { playShot } from '../../lib/soundFx'
import {
  VEX_PARRY_LINES,
  VEX_PHASE_TAUNTS,
  VEX_HIT_LINES,
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
   THE NULL HERALD — a pure-skill cinematic boss fight against VEX.

   Built on the `cinematic` engine: CinematicStage owns the realistic render
   (IBL, shadows, post stack, quality scaling); this file owns the combat sim,
   which is entirely REF-DRIVEN (no setState in useFrame — HUD numbers update
   only on discrete events). Player kit: lock-on orbit, dash + roll i-frames,
   3-hit melee combo, fan-fired bolts, and a timed PARRY that staggers VEX for a
   slow-mo punish. Pooled projectiles/particles; VFX + camera juice come from
   the cinematic building blocks.
   ====================================================================== */

/* ------------------------------------------------------------- Tuning */

const WEAPON = resolveEquippedWeapon({ run: 'boss' })

const PLAYER_HP = 12
const VEX_HP_MAX = 140

const BOUND = 22
const CAM_BACK = 8.0
const CAM_SIDE = 3.0
const CAM_HEIGHT = 4.4
const RUN_SPEED = 11
const HEADING_LERP = 0.22

const BOSS_SCALE = 1.3
const BOLT_HIT_R = 2.6

// Player physics
const GRAV = -30
const JUMP_V = 12

// Dash (i-frames, afterimages)
const DASH_SPEED = 27
const DASH_TIME = 0.22
const DASH_CD = 0.5
const DASH_IFRAME = 0.18

// Dodge-roll (i-frames)
const ROLL_SPEED = 17
const ROLL_TIME = 0.36
const ROLL_CD = 0.7
const ROLL_IFRAME = 0.3

// Melee combo
const COMBO_WINDOW = 0.55
const MELEE_RANGE = 4.0
const MELEE_DMG = [4, 4, 8]
const LUNGE_SPEED = 19
const SLASH_TIME = 0.32

// Parry
const PARRY_WINDOW = 0.2
const PARRY_CD = 0.45
const STAGGER_TIME = 1.7

// Ranged
const LEGACY_BOLT_CD = 0.16
const BOSS_BOLT_DAMAGE_SCALE = bossProjectileDamageScale(LEGACY_BOLT_CD)
const BOLT_SPEED = WEAPON.boltSpeed
const BOLT_LIFE = 1.4
const BOLT_CD = WEAPON.cooldown
const BOLT_POOL = 48

// Boss projectiles
const ORB_POOL = 90
const ORB_LIFE = 6
const PLAYER_HIT_R = 1.0

// VFX pools
const AFTER_POOL = 18
const LINE_POOL = 4
const DSHOCK_POOL = 3

const CYAN = '#37e6ff'
const MAGENTA = '#ff48e0'
const HOT = '#ff5a4a'

/** Boss entrance beat length (s) — hero shot + roar before the fight opens. */
const INTRO_DUR = 2.8

type Bolt = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
}
type Orb = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  mode: 0 | 1 | 2 // 0 homing, 1 straight, 2 meteor
  tx: number
  tz: number
}
type After = { active: boolean; pos: THREE.Vector3; life: number }
type Line = { active: boolean; x: number; z: number; ang: number; t: number; warn: number; struck: boolean }
type DShock = { active: boolean; x: number; z: number; t: number; dur: number; maxR: number; struck: boolean }

type Phase = 1 | 2 | 3

/* ------------------------------------------------ Local Web-Audio SFX
   Self-contained synth (mirrors FinalBossArena's approach; does not touch
   soundFx.ts beyond the shared blaster pew). Lazily created. */
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
    _nz = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate)
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
  slash: () => tone(1400, 320, 0.13, 'sawtooth', 0.1),
  hit: () => {
    tone(440, 70, 0.14, 'square', 0.16)
    noise(0.08, 0.12, 1600)
  },
  parry: () => {
    tone(2200, 900, 0.18, 'square', 0.16)
    noise(0.12, 0.16, 2400)
  },
  dash: () => tone(180, 620, 0.12, 'sine', 0.07),
  jump: () => tone(360, 720, 0.1, 'sine', 0.06),
  boom: () => {
    tone(140, 32, 0.55, 'sawtooth', 0.2)
    noise(0.45, 0.18, 200)
  },
  warn: () => tone(280, 300, 0.2, 'triangle', 0.05),
}

/* ----------------------------------------------------- Loadout flags */

interface LoadoutFlags {
  doubleDash: boolean
  recallMend: boolean
  splitFocus: boolean
  scanOverclock: boolean
}
function loadoutFlags(id: string | null | undefined): LoadoutFlags {
  return {
    doubleDash: id === 'double-dash',
    recallMend: id === 'recall-mend',
    splitFocus: id === 'split-focus',
    scanOverclock: id === 'scan-overclock',
  }
}

/* ---------------------------------------------------------- The arena floor */

function ArenaFloor({ accent, tier }: { accent: string; tier: QualityTier }): JSX.Element {
  // HIGH gets the real-time reflector (scene re-render); MED/LOW fall back to a
  // cheap IBL-lit glossy floor with no reflection pass — the #1 perf win.
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[BOUND + 10, 64]} />
        {tier === 'high' ? (
          <MeshReflectorMaterial {...wetFloorProps} />
        ) : (
          // Darker + less mirror-metal than the stock glossy preset: under
          // the warm arena IBL the default read as a tan disc (QA).
          <meshStandardMaterial {...glossyFloorProps} color="#080a12" metalness={0.55} roughness={0.42} />
        )}
      </mesh>

      {/* Boundary + center rings. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[BOUND - 0.5, BOUND + 0.4, 72]} />
        <meshBasicMaterial color={accent} transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[3.0, 3.3, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>

      {/* The night city — lit towers past the arena edge, receding into the
          fog. VEX's mountaintop program renders the same world the player
          just walked through, not an abstract void. */}
      <NightSkyline count={tier === 'low' ? 36 : tier === 'med' ? 56 : 72} innerRadius={BOUND + 30} />
      {tier !== 'low' && <NightRain count={tier === 'med' ? 320 : 540} />}
    </group>
  )
}

/* ------------------------------------------------------------- Scene */

interface SceneProps {
  accent: string
  dead: boolean
  frozen: boolean
  /** Player HP hit 0 — drives the avatar's death collapse (presentation only). */
  playerDefeated: boolean
  flags: LoadoutFlags
  phaseRef: MutableRefObject<Phase>
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
  staggerRef: MutableRefObject<number>
  armorBreakRef: MutableRefObject<number>
  bossReadyRef: MutableRefObject<number>
  onCurtainUp: () => void
  onBossHit: (amount: number) => void
  onPlayerHit: (amount: number) => void
  onBossAttack: () => void
  onTelegraph: (label: string | null, danger?: boolean) => void
  onCombo: (n: number) => void
  onParry: () => void
  onPhaseBeat: () => void
}

const VexScene = memo(function VexScene({
  accent,
  dead,
  frozen,
  playerDefeated,
  flags,
  phaseRef,
  hitRef,
  attackRef,
  staggerRef,
  armorBreakRef,
  bossReadyRef,
  onCurtainUp,
  onBossHit,
  onPlayerHit,
  onBossAttack,
  onTelegraph,
  onCombo,
  onParry,
  onPhaseBeat,
}: SceneProps): JSX.Element {
  const { camera, gl } = useThree()
  const tier = useQuality()

  // Camera director (constructed once).
  const dirRef = useRef<CameraDirector | null>(null)
  if (!dirRef.current) dirRef.current = new CameraDirector()

  // VFX handles.
  const sparks = useRef<SparkBurstHandle>(null)
  const shockFx = useRef<ShockwaveRingHandle>(null)
  const decals = useRef<GroundDecalHandle>(null)
  const playerTrail = useRef<WeaponTrailHandle>(null)

  // ---- Player ----
  const playerGroup = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 14))
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
  const dashCharges = useRef(flags.doubleDash ? 2 : 1)
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
  const bossPos = useRef(new THREE.Vector3(0, 0, -2))
  const bossVelY = useRef(0)
  const bossGrounded = useRef(true)
  const bossHeading = useRef(0)
  const vexAnimRef = useRef<VexAnim>('idle')
  const cullFrames = useRef(0)

  // Boss AI.
  const atkState = useRef<'gap' | 'tele' | 'active' | 'recover'>('gap')
  const atkName = useRef<string>('')
  const atkT = useRef(0)
  const gapT = useRef(1.4)
  const lastName = useRef('')
  const staggerTimer = useRef(0)
  const beamAngle = useRef(0)
  const beamHitCd = useRef(0)
  const heavyStruck = useRef(false)
  const prevPhase = useRef<Phase>(1)

  // Juice.
  const hitStop = useRef(0)
  const cutsceneT = useRef(0)
  const slowmoUntil = useRef(0)

  // Entrance beat: hero-shot sweep on VEX (sim parked) before control opens.
  // Held behind the black curtain until the real rig mounts (2.2s cap).
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
  const orbs = useMemo<Orb[]>(() => Array.from({ length: ORB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, mode: 0 as const, tx: 0, tz: 0 })), [])
  const afters = useMemo<After[]>(() => Array.from({ length: AFTER_POOL }, () => ({ active: false, pos: new THREE.Vector3(), life: 0 })), [])
  const lines = useMemo<Line[]>(() => Array.from({ length: LINE_POOL }, () => ({ active: false, x: 0, z: 0, ang: 0, t: 0, warn: 0.9, struck: false })), [])
  const dshocks = useMemo<DShock[]>(() => Array.from({ length: DSHOCK_POOL }, () => ({ active: false, x: 0, z: 0, t: 0, dur: 0.7, maxR: BOUND, struck: false })), [])

  const boltsMesh = useRef<THREE.InstancedMesh>(null)
  const orbFx = useRef<EnemyProjectilesHandle>(null)
  const impactFx = useRef<ImpactFlashesHandle>(null)
  const afterMesh = useRef<THREE.InstancedMesh>(null)
  const lineRefs = useRef<(THREE.Mesh | null)[]>([])
  const lineMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const beamRef = useRef<THREE.Mesh>(null)
  const beamMat = useRef<THREE.MeshBasicMaterial>(null)
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
  const boltGeo = useMemo(() => new THREE.SphereGeometry(0.17, 8, 8), [])
  const boltMat = useMemo(() => new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false, fog: false }), [])
  const afterGeo = useMemo(() => new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), [])
  const afterMat = useMemo(() => new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false, fog: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  useEffect(
    () => () => {
      boltGeo.dispose(); boltMat.dispose(); afterGeo.dispose(); afterMat.dispose()
    },
    [boltGeo, boltMat, afterGeo, afterMat],
  )

  /* --- spawn helpers --- */
  function spawnOrb(x: number, y: number, z: number, vx: number, vy: number, vz: number, mode: 0 | 1 | 2, tx = 0, tz = 0): boolean {
    const o = orbs.find((q) => !q.active)
    if (!o) return false
    o.active = true
    o.life = ORB_LIFE
    o.pos.set(x, y, z)
    o.vel.set(vx, vy, vz)
    o.mode = mode
    o.tx = tx
    o.tz = tz
    return true
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

  // Input listeners.
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
    camera.position.set(CAM_SIDE, CAM_HEIGHT, 14 + CAM_BACK)
  }, [camera])

  /* ----------------------------- attack chooser ----------------------------- */
  function durs(name: string): [number, number, number] {
    const teleMul = flags.scanOverclock ? 1.4 : 1
    switch (name) {
      case 'volley': return [0.6 * teleMul, 0.2, 0.5]
      case 'shardRain': return [1.1 * teleMul, 1.2, 0.5]
      case 'shockwave': return [0.8 * teleMul, 0.3, 0.5]
      case 'beam': return [1.0 * teleMul, 1.4, 0.5]
      case 'crossSlash': return [0.9 * teleMul, 0.28, 0.5]
      case 'heavy': return [0.7 * teleMul, VEX_HEAVY_DUR, 0.7]
      case 'nova': return [1.8 * teleMul, 0.6, 0.95]
      default: return [0.8, 0.4, 0.5]
    }
  }
  function telegraphLabel(name: string): [string, boolean] {
    switch (name) {
      case 'volley': return ['DATA VOLLEY — DODGE', false]
      case 'shardRain': return ['PILLAR RAIN — REPOSITION', false]
      case 'shockwave': return ['GROUND SLAM — JUMP / DASH', false]
      case 'beam': return ['CORE BEAM — DASH THROUGH', false]
      case 'crossSlash': return ['CROSS SLASH — SIDESTEP', false]
      case 'heavy': return ['◆ HEAVY — PARRY (L) ◆', true]
      case 'nova': return ['◆ OVERLOAD NOVA — SURVIVE ◆', true]
      default: return ['', false]
    }
  }
  function chooseAttack(phase: Phase) {
    const p1 = ['volley', 'shardRain', 'shockwave', 'heavy']
    const p2 = ['volley', 'shardRain', 'shockwave', 'beam', 'crossSlash', 'heavy']
    const p3 = ['volley', 'shardRain', 'shockwave', 'beam', 'crossSlash', 'heavy', 'nova']
    const list = phase === 1 ? p1 : phase === 2 ? p2 : p3
    let name = list[Math.floor(Math.random() * list.length)]
    if (name === lastName.current) name = list[Math.floor(Math.random() * list.length)]
    lastName.current = name
    atkName.current = name
    atkState.current = 'tele'
    atkT.current = 0
    heavyStruck.current = false
    const [lab, danger] = telegraphLabel(name)
    onTelegraph(lab, danger)
    sfx.warn()

    // Pre-roll telegraph data.
    if (name === 'shardRain') {
      const cnt = phase === 1 ? 4 : phase === 2 ? 5 : 7
      const dur = durs('shardRain')[0] + durs('shardRain')[1]
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
        if (decals.current) decals.current.show(tmpDir.current.set(x, 0.05, z), 2.4, HOT, dur)
        // Stash impact target on an orb's spawn via a parked orb? We reuse decals
        // for the visual and spawn the meteors on execute using fresh randoms.
        const o = orbs.find((q) => !q.active)
        if (o) {
          o.active = true
          o.life = ORB_LIFE
          o.mode = 1 // parked marker until execute promotes it
          o.pos.set(0, -999, 0)
          o.vel.set(0, 0, 0)
          o.tx = x
          o.tz = z
        }
      }
    } else if (name === 'crossSlash') {
      const cnt = phase >= 3 ? 3 : 2
      for (let i = 0; i < cnt; i++) {
        const l = lines.find((q) => !q.active)
        if (!l) break
        l.active = true
        l.t = 0
        l.warn = durs('crossSlash')[0]
        l.struck = false
        l.x = pos.current.x * 0.5
        l.z = pos.current.z * 0.5
        l.ang = Math.atan2(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z) + (i - (cnt - 1) / 2) * 0.5
      }
    } else if (name === 'beam') {
      beamAngle.current = Math.atan2(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
    } else if (name === 'heavy') {
      if (decals.current) decals.current.show(tmpDir.current.set(pos.current.x, 0.05, pos.current.z), 3.0, MAGENTA, durs('heavy')[0])
    }
  }

  function executeAttack(phase: Phase) {
    const name = atkName.current
    onBossAttack()
    if (name === 'volley') {
      const shots = phase === 1 ? 5 : phase === 2 ? 7 : 9
      tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z).normalize()
      const base = Math.atan2(tmpDir.current.x, tmpDir.current.z)
      const radial = phase >= 3 && Math.random() < 0.4
      const spd = phase === 1 ? 11 : phase === 2 ? 13 : 15
      for (let s = 0; s < shots; s++) {
        const ang = radial ? (s / shots) * Math.PI * 2 : base + (s - (shots - 1) / 2) * 0.22
        spawnOrb(bossPos.current.x, bossPos.current.y + 1.4, bossPos.current.z, Math.sin(ang) * spd, -1.2, Math.cos(ang) * spd, 0)
      }
      // Muzzle flare — the volley visibly LEAVES VEX's core.
      impactFx.current?.spawn(bossPos.current.x, bossPos.current.y + 1.4, bossPos.current.z, MAGENTA, 1.2, 5)
    } else if (name === 'shardRain') {
      // Promote parked markers into falling meteors.
      for (const o of orbs) {
        if (o.active && o.mode === 1 && o.pos.y < -100) {
          o.pos.set(o.tx, 16, o.tz)
          o.vel.set(0, -22, 0)
          o.mode = 2
        }
      }
      sfx.warn()
    } else if (name === 'shockwave') {
      fireDShock(bossPos.current.x, bossPos.current.z, BOUND)
      if (phase >= 3) fireDShock(bossPos.current.x, bossPos.current.z, BOUND * 0.7)
      sfx.boom()
    } else if (name === 'nova') {
      const N = phase >= 3 ? 28 : 22
      for (let n = 0; n < N; n++) {
        const a = (n / N) * Math.PI * 2
        spawnOrb(bossPos.current.x, bossPos.current.y + 1.4, bossPos.current.z, Math.cos(a) * 16, 0, Math.sin(a) * 16, 1)
      }
      impactFx.current?.spawn(bossPos.current.x, bossPos.current.y + 1.4, bossPos.current.z, MAGENTA, 1.8, 8)
      fireDShock(bossPos.current.x, bossPos.current.z, BOUND)
      fireDShock(bossPos.current.x, bossPos.current.z, BOUND * 0.6)
      if (dirRef.current) dirRef.current.shake(0.7)
      sfx.boom()
    }
    // 'beam', 'crossSlash', 'heavy' resolve through per-frame updates.
  }

  /* ----------------------------- main loop ----------------------------- */
  useFrame((state, dtRaw) => {
    const t = state.clock.elapsedTime
    const realDt = Math.min(dtRaw, 0.05)
    const dir = dirRef.current
    if (dir) dir.attach(camera)
    const now = performance.now()

    // Entrance beat parks the whole sim while the camera sweeps VEX. The
    // beat itself waits behind the curtain until the rig is resident.
    const bossReady = bossReadyRef.current > 0 || holdT.current >= 2.2
    if (!bossReady) holdT.current += realDt
    else if (introT.current < INTRO_DUR) introT.current += realDt
    if (bossReady && !curtainCalled.current) {
      curtainCalled.current = true
      onCurtainUp()
    }
    const intro = introT.current < INTRO_DUR

    // Slow-mo (parry / finisher) + hit-stop + cutscene gate the SIM.
    const slow = now < slowmoUntil.current
    if (dir) dir.setTimeScale(slow ? (flags.splitFocus ? 0.45 : 0.3) : 1)
    hitStop.current = Math.max(0, hitStop.current - realDt)
    cutsceneT.current = Math.max(0, cutsceneT.current - realDt)
    const simFrozen = frozen || intro || hitStop.current > 0 || cutsceneT.current > 0
    const dt = simFrozen ? 0 : (dir ? dir.scaledDelta(realDt) : realDt)
    const phase = phaseRef.current
    const k = simFrozen ? {} : keys.current

    // Phase transition beat (cinematic freeze + armor shed).
    if (phase !== prevPhase.current) {
      if (phase > prevPhase.current) {
        cutsceneT.current = 0.8
        atkState.current = 'gap'
        gapT.current = 0.7
        armorBreakRef.current += 1
        if (dir) dir.shake(0.4)
        onPhaseBeat()
        sfx.boom()
      }
      prevPhase.current = phase
    }

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
    beamHitCd.current -= dt
    parryCd.current -= dt
    if (dashCd.current <= 0) dashCharges.current = flags.doubleDash ? 2 : 1
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
        if (dashCharges.current > 0 && dashCd.current <= 0) {
          action.current = 'dash'
          actionT.current = 0
          dashCharges.current -= 1
          if (dashCharges.current <= 0) dashCd.current = DASH_CD
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
      // Drive the player WeaponTrail along a swung arc in world space.
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
        const hd = Math.hypot(dx, dz)
        if (hd < MELEE_RANGE && !dead) {
          sliceHit.current = true
          const finisher = comboIndex.current === 2
          let dmg = MELEE_DMG[comboIndex.current]
          if (staggerTimer.current > 0) dmg = Math.round(dmg * 1.8) // stagger punish
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

      // Gravity + leap arc.
      bossVelY.current += -26 * dt
      bossPos.current.y += bossVelY.current * dt
      if (bossPos.current.y <= 0) {
        bossPos.current.y = 0
        bossVelY.current = 0
        bossGrounded.current = true
      }

      const attacking = atkState.current === 'tele' || atkState.current === 'active'
      const staggered = staggerTimer.current > 0
      if (!attacking && !staggered) {
        // Approach to a mid range, strafe a little.
        let approach = 0
        if (distP > 9) approach = 1
        else if (distP < 6) approach = -1
        const chase = 3.4 * dt
        bossPos.current.x += tmpDir.current.x * approach * chase
        bossPos.current.z += tmpDir.current.z * approach * chase
        bossPos.current.x += -tmpDir.current.z * 1.6 * dt
        bossPos.current.z += tmpDir.current.x * 1.6 * dt
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

      // Anim selection for the rig.
      if (intro) vexAnimRef.current = 'cast' // entrance channel/roar pose
      else if (staggered) vexAnimRef.current = 'stagger'
      else if (atkName.current === 'heavy' && attacking) vexAnimRef.current = 'heavy'
      else if (attacking) vexAnimRef.current = 'cast'
      else if (!bossGrounded.current) vexAnimRef.current = 'leap'
      else vexAnimRef.current = 'stride'
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

    /* ---- camera ---- */
    tmpFwd.current.set(bossPos.current.x - pos.current.x, 0, bossPos.current.z - pos.current.z)
    if (tmpFwd.current.lengthSq() < 1e-6) tmpFwd.current.set(0, 0, 1)
    tmpFwd.current.normalize()
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)
    if (intro && !dead) {
      // Entrance hero shot: swing low around VEX, rise + pull back to the
      // gameplay framing as the beat ends.
      const p = THREE.MathUtils.clamp(introT.current / INTRO_DUR, 0, 1)
      const ease = p * p * (3 - 2 * p)
      const ang = Math.atan2(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
      const sweep = ang + (1 - ease) * 1.15 - 0.28
      const dist = 4.6 + ease * 10.2
      const h = 1.5 + ease * (CAM_HEIGHT - 1.5)
      tmpFrom.current.set(
        bossPos.current.x + Math.sin(sweep) * dist,
        h,
        bossPos.current.z + Math.cos(sweep) * dist,
      )
      tmpLook.current.set(bossPos.current.x, 1.9 + (1 - ease) * 0.4, bossPos.current.z)
      if (!introSnapped.current) {
        introSnapped.current = true
        camera.position.copy(tmpFrom.current)
      }
      if (!introRoared.current && introT.current > INTRO_DUR * 0.4) {
        introRoared.current = true
        if (dir) dir.shake(0.45)
        if (shockFx.current) shockFx.current.fire(tmpTip.current.set(bossPos.current.x, 0.05, bossPos.current.z), 8, accent)
        sfx.boom()
      }
      if (dir) dir.frame(tmpLook.current, tmpFrom.current, realDt)
    } else if (dead) {
      // Orbiting finisher cam.
      const e = state.clock.elapsedTime
      const orbit = e * 0.7
      tmpFrom.current.set(bossPos.current.x + Math.cos(orbit) * 9, 4.5, bossPos.current.z + Math.sin(orbit) * 9)
      tmpLook.current.set(bossPos.current.x, 1.6, bossPos.current.z)
      if (dir) dir.frame(tmpLook.current, tmpFrom.current, realDt)
    } else {
      let tx = pos.current.x - tmpFwd.current.x * CAM_BACK + tmpRight.current.x * CAM_SIDE
      let tz = pos.current.z - tmpFwd.current.z * CAM_BACK + tmpRight.current.z * CAM_SIDE
      const camR = Math.hypot(tx, tz)
      const CAM_MAX_R = BOUND + 9
      if (camR > CAM_MAX_R) {
        tx *= CAM_MAX_R / camR
        tz *= CAM_MAX_R / camR
      }
      tmpFrom.current.set(tx, CAM_HEIGHT + pos.current.y * 0.3, tz)
      tmpLook.current.set(bossPos.current.x, 1.4 + bossPos.current.y * 0.4, bossPos.current.z)
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
          bossPos.current.y + 1.4 - muzzleY,
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
          const d = Math.hypot(b.pos.x - bossPos.current.x, b.pos.y - (bossPos.current.y + 1.4), b.pos.z - bossPos.current.z)
          if (d < BOLT_HIT_R) {
            consumed = true
            let dmg = b.damage * BOSS_BOLT_DAMAGE_SCALE
            if (staggerTimer.current > 0) dmg *= 2
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
          activeAttack(phase, dt, parryActive)
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
            gapT.current = phase === 1 ? 1.4 : phase === 2 ? 1.05 : 0.8
          }
          break
        }
      }
    }

    /* ---- orbs ---- */
    {
      const fx = orbFx.current
      const homeSpeed = phase === 1 ? 11 : phase === 2 ? 13 : 15
      fx?.begin(camera.quaternion)
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i]
        if (!o.active) {
          fx?.hide(i)
          continue
        }
        // Parked shardRain markers stay hidden until executeAttack promotes them.
        if (o.mode === 1 && o.pos.y < -100) {
          fx?.hide(i)
          continue
        }
        if (o.mode === 0 && !simFrozen) {
          tmpDir.current.set(pos.current.x - o.pos.x, 1.1 + pos.current.y - o.pos.y, pos.current.z - o.pos.z).normalize()
          o.vel.lerp(tmpDir.current.multiplyScalar(homeSpeed), 0.045)
        }
        o.pos.addScaledVector(o.vel, dt)
        o.life -= dt
        let gone = false
        if (o.mode === 2) {
          if (o.pos.y <= 0.4) {
            gone = true
            fireDShock(o.tx, o.tz, 4.5)
            impactFx.current?.spawn(o.tx, 0.5, o.tz, HOT, 1.5, 6)
            if (sparks.current) sparks.current.burst(tmpDir.current.set(o.tx, 0.4, o.tz), HOT, 12)
            if (dir) dir.shake(0.14)
            sfx.boom()
          }
        } else {
          const d = Math.hypot(o.pos.x - pos.current.x, o.pos.y - (1.1 + pos.current.y), o.pos.z - pos.current.z)
          if (!simFrozen && !invuln.current && d < PLAYER_HIT_R) {
            gone = true
            onPlayerHit(1)
            impactFx.current?.spawn(o.pos.x, o.pos.y, o.pos.z, MAGENTA, 1.3, 8)
            if (dir) dir.shake(0.16)
          }
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

    /* ---- damage shockwaves (visual handled by ShockwaveRing) ---- */
    for (let i = 0; i < dshocks.length; i++) {
      const s = dshocks[i]
      if (!s.active) continue
      s.t += dt
      const p = Math.min(1, s.t / s.dur)
      const r = 0.4 + p * s.maxR
      if (!simFrozen && !invuln.current && pos.current.y < 1.1) {
        const pd = Math.hypot(pos.current.x - s.x, pos.current.z - s.z)
        if (Math.abs(pd - r) < 0.9 && !s.struck) {
          s.struck = true
          onPlayerHit(1)
          if (dir) dir.shake(0.18)
        }
      }
      if (p >= 1) s.active = false
    }

    /* ---- cross-slash lines ---- */
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const ref = lineRefs.current[i]
      const mat = lineMatRefs.current[i]
      if (!ref || !mat) continue
      if (!l.active) {
        ref.visible = false
        continue
      }
      ref.visible = true
      l.t += dt
      ref.position.set(l.x, 0.16, l.z)
      ref.rotation.set(-Math.PI / 2, 0, -l.ang)
      if (l.t < l.warn) {
        mat.color.set(HOT)
        mat.opacity = 0.3 + Math.sin(t * 24) * 0.12
        ref.scale.set(0.12, 1, 1)
      } else {
        mat.color.set(CYAN)
        const fp = (l.t - l.warn) / 0.22
        mat.opacity = THREE.MathUtils.clamp(1 - fp, 0, 1)
        ref.scale.set(1, 1, 1)
        if (!l.struck) {
          l.struck = true
          if (dir) dir.shake(0.2)
          sfx.slash()
          const dx = Math.sin(l.ang)
          const dz = Math.cos(l.ang)
          const rx = pos.current.x - l.x
          const rz = pos.current.z - l.z
          const lateral = Math.abs(rx * dz - rz * dx)
          if (!simFrozen && !invuln.current && lateral < 1.5) onPlayerHit(1)
        }
        if (fp >= 1) {
          l.active = false
          ref.visible = false
        }
      }
    }

    /* ---- beam ---- */
    const beam = beamRef.current
    if (beam && beamMat.current) {
      const beaming = atkName.current === 'beam' && (atkState.current === 'tele' || atkState.current === 'active') && !dead
      if (!beaming) {
        beam.visible = false
      } else {
        beam.visible = true
        const firing = atkState.current === 'active'
        if (!simFrozen) beamAngle.current += dt * (firing ? 1.5 * (phase >= 3 ? 1.4 : 1) : 0.5)
        const a = beamAngle.current
        const dx = Math.sin(a)
        const dz = Math.cos(a)
        const LEN = 34
        beam.position.set(bossPos.current.x + (dx * LEN) / 2, 1.4, bossPos.current.z + (dz * LEN) / 2)
        beam.rotation.set(0, a, Math.PI / 2)
        const w = firing ? 1 : 0.16
        beam.scale.set(w, 1, w)
        beamMat.current.color.set(firing ? CYAN : HOT)
        beamMat.current.opacity = firing ? 0.85 : 0.3 + Math.sin(t * 30) * 0.1
        if (firing && !simFrozen && !invuln.current && beamHitCd.current <= 0) {
          const rx = pos.current.x - bossPos.current.x
          const rz = pos.current.z - bossPos.current.z
          const along = rx * dx + rz * dz
          const lateral = Math.abs(rx * dz - rz * dx)
          if (along > 0 && along < LEN && lateral < 1.15 && pos.current.y < 1.8) {
            beamHitCd.current = 0.5
            onPlayerHit(1)
            if (dir) dir.shake(0.2)
          }
        }
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

  /* ---- heavy-strike / beam active resolution ---- */
  function activeAttack(_phase: Phase, _dt: number, parryActive: boolean) {
    const name = atkName.current
    if (name === 'heavy' && !heavyStruck.current) {
      // The slam connects at the midpoint of the active window.
      const connectAt = durs('heavy')[1] * 0.45
      if (atkT.current >= connectAt) {
        heavyStruck.current = true
        const pd = Math.hypot(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
        const inReach = pd < 5.5
        const dir = dirRef.current
        if (parryActive && inReach) {
          // PARRY! Stagger VEX, slow-mo punish window. Punch kept moderate —
          // a full-strength dolly rammed the camera into the boss's back
          // for the whole slow-mo window (QA).
          staggerTimer.current = STAGGER_TIME
          staggerRef.current += 1
          slowmoUntil.current = performance.now() + (flags.splitFocus ? 1100 : 800)
          if (dir) {
            dir.punch(0.55)
            dir.shake(0.45)
          }
          if (sparks.current) sparks.current.burst(tmpDir.current.set(pos.current.x, 1.4, pos.current.z), '#ffffff', 26)
          onTelegraph(null)
          onParry()
          sfx.parry()
        } else {
          // Slam shock — hits if grounded & in reach & not i-framing.
          fireDShock(bossPos.current.x, bossPos.current.z, 6)
          if (dir) dir.shake(0.26)
          sfx.boom()
          if (inReach && !invuln.current && pos.current.y < 1.4) onPlayerHit(2)
        }
      }
    }
  }

  return (
    <group>
      <ArenaFloor accent={accent} tier={tier} />
      <EmberField count={tier === 'low' ? 70 : tier === 'med' ? 130 : 200} area={BOUND + 4} height={16} color={accent} />

      <group ref={playerGroup}>
        <Avatar animRef={playerAnimRef} accent={accent} fireRef={fireRef} slashRef={slashStart} />
      </group>

      <group ref={bossGroup} scale={BOSS_SCALE}>
        <VexBossSwitch
          accent={accent}
          phaseRef={phaseRef}
          animRef={vexAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          armorBreakRef={armorBreakRef}
          readyRef={bossReadyRef}
          dead={dead}
        />
      </group>

      {/* Phase-3 nine-piece arena kit (throne / emblem / pillars / debris /
          holo ring + warnings) — visual only, everything at or beyond the
          play boundary except the walkable floor emblem. Mounted at EVERY
          tier: it's baked-emissive instanced scenography, and dropping it on
          a tier dip stripped the whole set mid-fight (QA: the late phases
          played out in an empty void). */}
      <Suspense fallback={null}>
        <MeshyArenaDressing arenaRadius={BOUND + 1} kit />
      </Suspense>

      {/* Player melee trail (world-space; mounted at scene root). */}
      <WeaponTrail ref={playerTrail} color={accent} width={0.22} segments={20} fade={0.16} />

      {/* Sweeping core beam. */}
      <mesh ref={beamRef} visible={false} frustumCulled={false} renderOrder={5}>
        <cylinderGeometry args={[0.5, 0.5, 34, 16, 1, true]} />
        <meshBasicMaterial ref={beamMat} color={CYAN} toneMapped={false} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </mesh>

      {/* Cross-slash strike lines. */}
      {lines.map((_, i) => (
        <mesh
          key={`l${i}`}
          ref={(el) => {
            lineRefs.current[i] = el
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
          frustumCulled={false}
        >
          <planeGeometry args={[3, 60]} />
          <meshBasicMaterial
            ref={(el) => {
              lineMatRefs.current[i] = el
            }}
            color={HOT}
            transparent
            opacity={0}
            toneMapped={false}
            side={THREE.DoubleSide}
            depthWrite={false}
            fog={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Pooled projectiles / particles. */}
      <instancedMesh ref={boltsMesh} args={[boltGeo, boltMat, BOLT_POOL]} frustumCulled={false} />
      <EnemyProjectiles ref={orbFx} pool={ORB_POOL} color={MAGENTA} size={0.36} />
      <ImpactFlashes ref={impactFx} pool={12} />
      <instancedMesh ref={afterMesh} args={[afterGeo, afterMat, AFTER_POOL]} frustumCulled={false} />

      {/* Cinematic VFX building blocks. */}
      <SparkBurst ref={sparks} pool={tier === 'low' ? 90 : 160} />
      <ShockwaveRing ref={shockFx} pool={4} />
      <GroundDecal ref={decals} pool={10} />
    </group>
  )
})

/** Park an instanced slot far off-screen at zero scale. */
function hideInstance(m: THREE.InstancedMesh, i: number) {
  _hideObj.position.set(0, -9999, 0)
  _hideObj.scale.setScalar(0)
  _hideObj.updateMatrix()
  m.setMatrixAt(i, _hideObj.matrix)
}
const _hideObj = new THREE.Object3D()

/* ------------------------------------------------------------- Component */

export interface CinematicBossArenaProps {
  bossName?: string
  accent?: string
  /** Optional edge id from the Threshold loadout (ignored if null). */
  loadout?: string | null
  /** Modest v1-mastery adaptation; geometry and controls are unchanged. */
  combatScale?: number
  /** Starting hearts (defaults to full) — Boss Rush carries hearts between fights. */
  initialHp?: number
  /** Reports every hearts change so a rush can persist HP across arenas. */
  onHpChange?: (hp: number) => void
  onWin: () => void
  onLose: () => void
  onFlee?: () => void
}

export function CinematicBossArena({
  bossName = 'VEX',
  accent = CYAN,
  loadout = null,
  combatScale = 1,
  initialHp,
  onHpChange,
  onWin,
  onLose,
  onFlee,
}: CinematicBossArenaProps): JSX.Element {
  const flags = useMemo(() => loadoutFlags(loadout), [loadout])
  const bossHpMax = Math.round(
    VEX_HP_MAX * Math.max(0.9, Math.min(1.1, combatScale)),
  )
  const phase2At = Math.round(bossHpMax * 0.66)
  const phase3At = Math.round(bossHpMax * 0.33)

  const [playerHp, setPlayerHp] = useState(() =>
    Math.round(Math.min(PLAYER_HP, Math.max(1, initialHp ?? PLAYER_HP))),
  )
  const [bossHp, setBossHp] = useState(bossHpMax)
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

  // Entrance staging: an opaque curtain covers the mount (and the rig load);
  // the scene lifts it via onCurtainUp, which starts the title-card clock.
  const bossReadyRef = useRef(0)
  const [curtain, setCurtain] = useState(true)
  const [introBanner, setIntroBanner] = useState(true)
  const onCurtainUp = useCallback(() => setCurtain(false), [])
  useEffect(() => {
    if (curtain) return
    const id = window.setTimeout(() => setIntroBanner(false), 3100)
    return () => window.clearTimeout(id)
  }, [curtain])

  // Report hearts through a ref so a changing callback identity never refires.
  const onHpChangeRef = useRef(onHpChange)
  onHpChangeRef.current = onHpChange
  useEffect(() => {
    onHpChangeRef.current?.(playerHp)
  }, [playerHp])

  const phaseRef = useRef<Phase>(1)
  const hitRef = useRef(0)
  const attackRef = useRef(0)
  const staggerRef = useRef(0)
  const armorBreakRef = useRef(0)

  const onBossHit = useCallback((amount: number) => {
    setHitCount((c) => c + 1)
    setBossHp((hp) => Math.max(0, hp - amount))
  }, [])
  const onPlayerHit = useCallback((amount: number) => {
    setHurt((h) => h + 1)
    setPlayerHp((hp) => Math.max(0, hp - amount))
    if (Math.random() < 0.3) {
      setCallout(VEX_HIT_LINES[Math.floor(Math.random() * VEX_HIT_LINES.length)])
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
    setCallout(VEX_PARRY_LINES[Math.floor(Math.random() * VEX_PARRY_LINES.length)])
    window.setTimeout(() => setCallout(null), 1100)
    if (flags.recallMend) setPlayerHp((hp) => Math.min(PLAYER_HP, hp + 1))
  }, [flags.recallMend])
  const onPhaseBeat = useCallback(() => {
    // Phase taunt banner is driven by the phase effect below.
  }, [])

  useEffect(() => () => {
    if (comboClearRef.current) window.clearTimeout(comboClearRef.current)
  }, [])

  // Derive phase from boss HP.
  useEffect(() => {
    const next: Phase = bossHp <= phase3At ? 3 : bossHp <= phase2At ? 2 : 1
    if (next !== phaseRef.current) {
      phaseRef.current = next
      setPhase(next)
    }
    if (bossHp <= 0 && !dead) setDead(true)
  }, [bossHp, dead, phase2At, phase3At])

  // Phase taunt banner.
  useEffect(() => {
    if (phase === 1) return
    setTaunt(VEX_PHASE_TAUNTS[phase - 2] ?? null)
    const id = window.setTimeout(() => setTaunt(null), 2400)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (hitCount === 0) return
    setHurtBoss(true)
    const id = window.setTimeout(() => setHurtBoss(false), 120)
    return () => window.clearTimeout(id)
  }, [hitCount])

  useEffect(() => {
    if (!dead || endedRef.current) return
    endedRef.current = true
    setTelegraph(null)
    const id = window.setTimeout(onWin, (VEX_DEATH_DUR + 0.4) * 1000)
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
  const bossPct = Math.max(0, (bossHp / bossHpMax) * 100)
  const enraged = phase >= 3

  const hud = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
      {/* Entrance curtain — covers the mount + rig load. */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: curtain ? 1 : 0, transition: 'opacity 0.5s ease' }} />

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
          Final Boss · The Peak
        </div>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 42, letterSpacing: 4, textTransform: 'uppercase', textShadow: `0 0 28px ${accent}aa, 0 3px 16px rgba(0,0,0,0.95)`, lineHeight: 1.1 }}>
          {bossName}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 700, fontSize: 15, letterSpacing: 3, textTransform: 'uppercase' }}>
          The Null Herald
        </div>
      </div>

      {/* Hurt flash */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 50%, transparent 40%, rgba(255,40,50,0.5) 100%)', opacity: flashOn ? 1 : 0, transition: 'opacity 0.18s ease' }} />
      {/* Player-down treatment: the defeat reads as a beat, not a bug. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 50%, transparent 30%, rgba(60,0,8,0.75) 100%)', opacity: playerHp <= 0 ? 1 : 0, transition: 'opacity 0.6s ease' }} />
      {/* Parry flash */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% 45%, ${accent}cc 0%, transparent 55%)`, opacity: parryFlash ? 1 : 0, transition: parryFlash ? 'opacity 0.05s ease' : 'opacity 0.4s ease', mixBlendMode: 'screen' }} />

      {/* Boss HP + phase pips */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(620px, 88%)', textAlign: 'center', opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <span style={{ color: '#fff', fontWeight: 800, letterSpacing: 1, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>{bossName} — THE NULL HERALD</span>
          <span style={{ color: accent, fontWeight: 800, fontSize: 13 }}>
            {[1, 2, 3].map((p) => (
              <span key={p} style={{ opacity: phase >= p ? 1 : 0.3, marginLeft: 4 }}>◆</span>
            ))}
          </span>
        </div>
        <div style={{ height: 16, borderRadius: 9, background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', boxShadow: hurtBoss ? `0 0 16px ${accent}` : 'none', transition: 'box-shadow 0.12s ease', position: 'relative' }}>
          <div style={{ height: '100%', width: `${bossPct}%`, background: enraged ? MAGENTA : accent, transition: 'width 0.15s ease' }} />
          <span style={{ position: 'absolute', top: 0, bottom: 0, left: '66%', width: 2, background: 'rgba(255,255,255,0.5)' }} />
          <span style={{ position: 'absolute', top: 0, bottom: 0, left: '33%', width: 2, background: 'rgba(255,255,255,0.5)' }} />
        </div>
      </div>

      {/* Player hearts */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 12, marginBottom: 6, letterSpacing: 1, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>VITALS</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 280 }}>
          {Array.from({ length: PLAYER_HP }).map((_, i) => (
            <span key={i} style={{ width: 16, height: 16, borderRadius: 4, background: i < playerHp ? '#ff5a6a' : 'rgba(255,255,255,0.16)', boxShadow: i < playerHp ? '0 0 8px rgba(255,90,106,0.7)' : 'none' }} />
          ))}
        </div>
      </div>

      {/* Combo counter */}
      {combo > 1 && (
        <div key={combo} style={{ position: 'absolute', top: '34%', right: 40, color: accent, fontWeight: 900, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
          <span style={{ fontSize: 44 }}>{combo}</span>
          <span style={{ fontSize: 18, marginLeft: 4 }}>HIT</span>
        </div>
      )}

      {/* Ability legend */}
      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,0.8)', whiteSpace: 'nowrap', opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        WASD move · Click/Q slice · F/RMB shoot · Shift dash · Space jump · K roll · <span style={{ color: accent }}>L PARRY</span>
      </div>

      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: '50%', background: 'rgba(255,255,255,0.55)' }} />

      {/* Telegraph banner */}
      {telegraph && (
        <div key={telegraph.label} style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', color: telegraph.danger ? '#ff5a6a' : '#fff', fontWeight: 900, fontSize: telegraph.danger ? 30 : 22, letterSpacing: 1, textShadow: '0 2px 14px rgba(0,0,0,0.9)' }}>
          {telegraph.label}
        </div>
      )}

      {/* VEX barks (parry / hit lines) */}
      {callout && (
        <div key={callout} style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', color: accent, fontWeight: 800, fontStyle: 'italic', fontSize: 24, textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
          “{callout}”
        </div>
      )}

      {/* Phase taunt */}
      {taunt && (
        <div key={taunt} style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 86%)', textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: 22, textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}>
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

  // Memoize the entire Canvas subtree so frequent HUD state changes (HP, combo,
  // telegraph, flashes) re-render ONLY the DOM overlay below — never the 3D
  // scene/post stack. Its identity changes only on the rare props that actually
  // affect the render (death/freeze/enrage), so combat ticks can't stall input.
  const stage = useMemo(
    () => (
      <CinematicStage
        environment="arena"
        fog={{ color: '#0a0a14', near: 26, far: 120 }}
        cameraInitial={{ position: [CAM_SIDE, CAM_HEIGHT, 14 + CAM_BACK], fov: 58 }}
        bloom={enraged ? 1.0 : 0.75}
        ssao
        grain
        chromaticAberration={enraged}
        vignette
      >
        <VexScene
          accent={accent}
          dead={dead}
          frozen={frozen}
          playerDefeated={playerDefeated}
          flags={flags}
          phaseRef={phaseRef}
          hitRef={hitRef}
          attackRef={attackRef}
          staggerRef={staggerRef}
          armorBreakRef={armorBreakRef}
          bossReadyRef={bossReadyRef}
          onCurtainUp={onCurtainUp}
          onBossHit={onBossHit}
          onPlayerHit={onPlayerHit}
          onBossAttack={onBossAttack}
          onTelegraph={onTelegraph}
          onCombo={onCombo}
          onParry={onParry}
          onPhaseBeat={onPhaseBeat}
        />
      </CinematicStage>
    ),
    [accent, dead, frozen, playerDefeated, enraged, flags, phaseRef, hitRef, attackRef, staggerRef, armorBreakRef, onCurtainUp, onBossHit, onPlayerHit, onBossAttack, onTelegraph, onCombo, onParry, onPhaseBeat],
  )

  return (
    <>
      {stage}
      {hud}
    </>
  )
}
