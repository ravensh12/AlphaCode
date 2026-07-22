import {
  Component,
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { Boss3D, type BossAnim } from './Boss3D'
import { useKeys } from './useKeys'
import { SimulationDriver } from './SimulationDriver'
import { applyArenaPulse } from './simulation'
import { asphaltMaps, concreteMaps } from './proceduralTextures'
import { NightRain, NightSkyline } from './NightCityStage'
import { realmStage, type RealmStageSpec } from './realmStages'
import {
  CameraDirector,
  EmberField,
  SparkBurst,
  ShockwaveRing,
  type SparkBurstHandle,
  type ShockwaveRingHandle,
} from './cinematic'
import {
  EnemyProjectiles,
  ImpactFlashes,
  type EnemyProjectilesHandle,
  type ImpactFlashesHandle,
} from './projectileFx'
import {
  meetsTier,
  resolveQualityProfile,
} from '../../lib/graphicsQuality'
import {
  bossProjectileDamageScale,
  resolveEquippedWeapon,
  weaponPelletYaw,
} from './weaponProfile'
import {
  BRACKET,
  bracketShoot,
  bracketShotValid,
  bracketTargetIndex,
  createBracketState,
  createGateState,
  createHiderState,
  createMirrorState,
  createSphinxState,
  createTwinKeyState,
  GATE,
  gateDash,
  gateFlashOn,
  HIDER,
  hiderPing,
  hiderRealSignal,
  isOpener,
  MECH_SPECS,
  mechanicForVariant,
  MIRROR,
  mirrorPoint,
  mirrorReflect,
  SPHINX,
  sphinxNextValue,
  sphinxStep,
  sphinxTileAt,
  tickBracket,
  tickGate,
  tickHider,
  tickMirror,
  tickSphinx,
  tickTwinKey,
  twinStrike,
  type BracketState,
  type GateState,
  type HiderState,
  type MechEvent,
  type MirrorState,
  type SphinxState,
  type TwinKeyState,
} from './bossMechanics'
import { playShot } from '../../lib/soundFx'
import type { BonusQuestion } from '../../content/bonusQuestions'
import './BossArena.css'

// Per-realm themed set dressing (MEDIUM+) — lazy so its GLB loader stack
// never weighs down the boss-battle route chunk.
const RealmStageDressing = lazy(() => import('./RealmStageDressing'))
// The real rigged villains (tier-11 Meshy characters). Lazy + fenced by an
// error boundary: the procedural Boss3D stays as the loading fallback AND the
// permanent one if a GLB is missing — a boss always renders.
const MeshyRealmBoss = lazy(() => import('./meshy/MeshyRealmBoss'))

class BossBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Meshy villain behind boundary + suspense; procedural Boss3D as fallback. */
function VillainSwitch(props: {
  accent: string
  variant: number
  animRef: MutableRefObject<BossAnim>
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
  readyRef?: MutableRefObject<number>
  dead: boolean
}) {
  const fallback = <Boss3D {...props} />
  return (
    <BossBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <MeshyRealmBoss {...props} />
      </Suspense>
    </BossBoundary>
  )
}

const WEAPON = resolveEquippedWeapon({ run: 'boss' })

const PLAYER_HP = 8
// Boss is a real fight but beatable: rapid-fire melts it if you keep dodging.
const BOSS_HP_BASE = 26
const BOSS_HP_PER_LEVEL = 4

const ARENA_R = 23
const BOUND = 20
// Camera framing: a close, low-ish 3/4 chase view. Close enough that the boss is always
// BIG and clearly readable, with a side offset so the hero never occludes it. Looks
// straight at the boss so it stays centered and on-screen the whole fight.
const CAM_BACK = 6.4 // behind the hero, toward the boss line
const CAM_SIDE = 3.0 // lateral offset so the hero sits to the side, boss stays clear
const CAM_HEIGHT = 3.7
const AIM_HEIGHT = 1.55
const RUN_SPEED = 9
const HEADING_LERP = 0.2

const LEGACY_BOLT_COOLDOWN = 0.14
const BOSS_BOLT_DAMAGE_SCALE = bossProjectileDamageScale(
  LEGACY_BOLT_COOLDOWN,
)
const BOLT_SPEED = WEAPON.boltSpeed
const BOLT_LIFE = 1.6
const BOLT_COOLDOWN = WEAPON.cooldown
const BOLT_POOL = 64
const BOSS_HIT_R = 2.4
/** Villain stands a touch taller than the hero — menacing but human-scale. */
const BOSS_SCALE = 1.18

const ORB_LIFE = 5
const ORB_POOL = 16
const PLAYER_HIT_R = 1.35

/** Bonus-question power blast: a beam + shockwave that lasts this long (s). */
const BLAST_DUR = 0.95
const UP = new THREE.Vector3(0, 1, 0)

/** Boss entrance beat length (s) — hero shot + roar before the fight opens. */
const INTRO_DUR = 2.6

/** Distinct orb colors so each boss's attack reads differently. The Mirror
 *  Mimic's volleys (and reflected shots) are hot magenta — hostile fire must
 *  never share its cyan arena's palette (QA). */
const ORB_COLORS = ['#b6ff5c', '#ff4fd8', '#b48cff', '#ffb44a', '#ff5a6a', '#5aa8ff']

/* ------------------------------------------------ Kill-mechanic tuning */
// Every realm boss guards its HP behind a UNIQUE mechanic (bossMechanics.ts):
// bolts only hurt it while its guard is broken, so HP is sized against the
// in-window DPS (~7.1 HP/s with the Pattern Cannon) to demand ~3–4 clean
// mechanic cycles per kill — a real fight that takes practice.
const MECH_HP = [60, 90, 90, 78, 100, 105]

/** Hot white-gold used by every mechanic telegraph (distinct from accents). */
const MECH_HOT = '#ffd27a'
const MECH_DANGER = '#ff5a6a'
const MECH_GOOD = '#8dffb0'

/** Teaching line shown when the player fumbles a mechanic. */
function mistakeMessage(mechId: string, reason: string): string {
  switch (reason) {
    case 'whiff':
      return 'NOTHING THERE — PING ON TOP OF A SIGNAL'
    case 'decoy':
      return 'DECOY! IT BITES BACK — READ THE FLICKER'
    case 'zone-missed':
      return 'THE ZONE SHATTERED EMPTY — STEER ITS REFLECTION IN'
    case 'reflected':
      return 'REFLECTED! HOLD FIRE WHILE THE MIRROR IS UP'
    case 'not-armed':
      return 'THE LOCKS ARE DORMANT — WAIT FOR THE GLOW'
    case 'wrong-lock':
      return 'WRONG LOCK — STRIKE THE GLOWING ONE FIRST'
    case 'too-early':
      return 'TOO EAGER — LET THE TWIN FINISH CHARGING'
    case 'link-broken':
      return 'TOO SLOW — IT RESEALS AND REGENERATES'
    case 'slammed':
      return 'CAUGHT — DASH (SPACE) ON THE WHITE FLASH'
    case 'timeout':
      return 'TOO SLOW — THE PLATES RESHUFFLE'
    case 'wrong-order':
      return mechId === 'bracket'
        ? 'MISMATCHED BRACKET — IT FEEDS AND RESHUFFLES'
        : 'WRONG PLATE — LOWEST NUMBER FIRST'
    default:
      return 'IT SHRUGS YOU OFF — READ THE MECHANIC'
  }
}

/** Crisp glyph texture (bracket symbols, lock keys, plate numbers). A dark
 *  backing disc keeps the glyph readable over bright floors and bloom (QA:
 *  numbers washed out on the Sphinx's sandstone court). */
function makeGlyphTexture(text: string, color: string): THREE.CanvasTexture {
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

type Bolt = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
  /** Bracket sigil this bolt was aimed at (-1 = the boss). */
  nodeIdx: number
}
type Orb = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number }

/* --------------------------------------------------------------- The arena */

/* Night-city remake: the fight now happens on a rain-slick plaza in the same
   neon NYC-at-night world as the overworld — wet asphalt, a lit skyline all
   around, accent-neon boundary — instead of the old abstract purple dome. */

const ArenaFloor = memo(function ArenaFloor({
  accent,
  skyline,
  spec,
}: {
  accent: string
  skyline: number
  spec: RealmStageSpec
}) {
  // Living Simulation (M8): the combat disk still streams accent data rings
  // from the center (clock-uniform driven); its base color and the outer
  // ground material come from the realm's stage spec so each arena reads as
  // its own place (wet asphalt / mirror glass / quarry dust / marble …).
  const diskMat = useMemo(() => {
    // Polished stages: the combat disk is where the camera lives, so the
    // gritty concrete grid must go here too — a clean uniform surface reads
    // as marble/mirror (QA: the disk alone made the whole court look like
    // asphalt even after the outer ground went polished).
    if (spec.floor.outer.polished) {
      return applyArenaPulse(
        new THREE.MeshStandardMaterial({
          color: spec.floor.disk,
          roughness: spec.floor.outer.roughness,
          metalness: spec.floor.outer.metalness,
          envMapIntensity: spec.floor.outer.envMapIntensity,
        }),
        new THREE.Color(accent).multiplyScalar(0.16),
      )
    }
    const maps = concreteMaps()
    const normal = maps.normal.clone()
    const rough = maps.roughness.clone()
    normal.repeat.set(9, 9)
    rough.repeat.set(9, 9)
    // The M8 data-ring pulse stays, but heavily dimmed — full strength read
    // as cartoon neon donuts on the dark ground.
    return applyArenaPulse(
      new THREE.MeshStandardMaterial({
        color: spec.floor.disk,
        roughness: Math.max(0.35, spec.floor.outer.roughness),
        metalness: 0.28,
        envMapIntensity: spec.floor.outer.envMapIntensity,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: rough,
      }),
      new THREE.Color(accent).multiplyScalar(0.22),
    )
  }, [accent, spec])
  // Themed city ground for everything outside the combat disk. Polished
  // stages (mirror atrium, gilded court) drop the tiled detail maps that
  // otherwise read as a gritty paving grid — they get a clean, uniform,
  // reflective surface driven purely by the strong themed IBL.
  const groundMat = useMemo(() => {
    const o = spec.floor.outer
    if (o.polished) {
      return new THREE.MeshStandardMaterial({
        color: o.color,
        roughness: o.roughness,
        metalness: o.metalness,
        envMapIntensity: o.envMapIntensity,
      })
    }
    const maps = o.concrete ? concreteMaps() : asphaltMaps()
    const normal = maps.normal.clone()
    const rough = maps.roughness.clone()
    normal.repeat.set(22, 22)
    rough.repeat.set(22, 22)
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping
    return new THREE.MeshStandardMaterial({
      color: o.color,
      roughness: o.roughness,
      metalness: o.metalness,
      envMapIntensity: o.envMapIntensity,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: rough,
    })
  }, [spec])
  useEffect(
    () => () => {
      diskMat.dispose()
      groundMat.dispose()
    },
    [diskMat, groundMat],
  )

  return (
    <group>
      {/* City ground — one huge themed disk out past the fog line. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow material={groundMat}>
        <circleGeometry args={[170, 72]} />
      </mesh>

      {/* Inner combat disk — accent data rings over darker paving. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow material={diskMat}>
        <circleGeometry args={[16.5, 96]} />
      </mesh>

      {/* Play boundary — accent neon line the fighters can't cross. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[BOUND - 0.28, BOUND + 0.28, 96]} />
        <meshBasicMaterial color={accent} side={THREE.DoubleSide} transparent opacity={0.38} toneMapped={false} depthWrite={false} fog={false} />
      </mesh>

      {/* Knee-high containment barrier ring: dark metal posts + emissive top
          rail — defines the arena without hiding the skyline behind it. */}
      {Array.from({ length: 26 }).map((_, i) => {
        const a = (i / 26) * Math.PI * 2
        const r = ARENA_R + 1.4
        return (
          <mesh key={`post${i}`} position={[Math.cos(a) * r, 0.55, Math.sin(a) * r]} castShadow>
            <boxGeometry args={[0.16, 1.1, 0.16]} />
            <meshStandardMaterial color="#1b2030" roughness={0.5} metalness={0.7} />
          </mesh>
        )
      })}
      <mesh rotation-x={-Math.PI / 2} position={[0, 1.08, 0]}>
        <torusGeometry args={[ARENA_R + 1.4, 0.05, 8, 96]} />
        <meshStandardMaterial color="#0c0e16" emissive={accent} emissiveIntensity={1.1} roughness={0.4} metalness={0.4} />
      </mesh>

      {/* Center marker — small and non-intrusive. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[2.8, 3.15, 48]} />
        <meshBasicMaterial color={accent} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.22} depthWrite={false} fog={false} />
      </mesh>

      {/* The city — lit towers on every side, fading into the night fog. */}
      <NightSkyline count={skyline} innerRadius={spec.skyline.inner} />
    </group>
  )
})

/* ----------------------------------------------------------------- Scene */

const ArenaScene = memo(function ArenaScene({
  accent,
  variant,
  dead,
  frozen,
  playerDefeated,
  skyline,
  rain,
  spec,
  hitRef,
  attackRef,
  bossReadyRef,
  onCurtainUp,
  attackEvery,
  orbSpeed,
  bossMoveMul,
  multiShot,
  blastCount,
  onBossHit,
  onBossHeal,
  onPlayerHit,
  onBossAttack,
  onMechPrompt,
  qaHooks,
}: {
  accent: string
  variant: number
  dead: boolean
  frozen: boolean
  /** Player HP hit 0 — drives the avatar's death collapse (presentation only). */
  playerDefeated: boolean
  skyline: number
  rain: number
  spec: RealmStageSpec
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
  bossReadyRef: MutableRefObject<number>
  onCurtainUp: () => void
  attackEvery: number
  orbSpeed: number
  bossMoveMul: number
  multiShot: number
  blastCount: number
  onBossHit: (amount: number) => void
  onBossHeal: (amount: number) => void
  onPlayerHit: () => void
  onBossAttack: () => void
  onMechPrompt: (label: string | null, danger?: boolean) => void
  qaHooks: boolean
}) {
  const { camera, gl } = useThree()

  // Camera director: smoothed framing + impact shake/punch (same helper the
  // cinematic fights use). Constructed once.
  const dirRef = useRef<CameraDirector | null>(null)
  if (!dirRef.current) {
    dirRef.current = new CameraDirector()
    dirRef.current.followLerp = 0.35
    dirRef.current.lookLerp = 0.5
  }

  // VFX handles.
  const sparks = useRef<SparkBurstHandle>(null)
  const shockFx = useRef<ShockwaveRingHandle>(null)

  // Boss entrance beat: a short hero-shot sweep on the boss (scream + roar
  // shake) before control is handed over. Presentation only — no combat rule
  // runs until it ends. The beat HOLDS behind the black curtain until the
  // real villain rig has mounted (bossReadyRef), so the hero shot never
  // frames the procedural stand-in mid-swap (fail-safe cap: 2.2s).
  const introT = useRef(0)
  const holdT = useRef(0)
  const curtainCalled = useRef(false)
  const introSnapped = useRef(false)
  const introRoared = useRef(false)
  const prevDead = useRef(false)

  // Preload this villain's GLBs the moment the scene mounts (in parallel
  // with the curtain hold) using the canvas renderer for KTX2 detection.
  useEffect(() => {
    let cancelled = false
    void import('./meshy/realmBossAssets').then((m) => {
      if (!cancelled) m.preloadRealmBoss(variant, gl)
    })
    return () => {
      cancelled = true
    }
  }, [variant, gl])

  // Player
  const playerGroup = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 12))
  const heading = useRef(Math.PI) // face -Z (toward boss)
  const camYaw = useRef(Math.PI)
  const fireRef = useRef(0)
  // Anim lives in refs read by the rigs each frame — no setState from useFrame.
  const playerAnimRef = useRef<AvatarAnim>('idle')

  // Boss — a grounded, human-scale villain that strafes and leaps. bossPos is the
  // CHEST/aim point; feet are CHEST_H below it. y rises when it jumps.
  const bossGroup = useRef<THREE.Group>(null)
  const bossPos = useRef(new THREE.Vector3(0, 1.3, -6))
  const bossVelY = useRef(0)
  const bossGrounded = useRef(true)
  const leapTimer = useRef(1.6)
  const orbitDir = useRef(1)
  const bossHeading = useRef(0)
  const bossAnimRef = useRef<BossAnim>('idle')
  // Runs the frustum-cull setup pass only for the first handful of frames
  // (covering any late-mounted rig nodes) instead of traversing the whole boss
  // every single frame.
  const cullFrames = useRef(0)

  // Input
  const enabledRef = useRef(true)
  enabledRef.current = !frozen
  const keys = useKeys(enabledRef)
  const fireReq = useRef(false)

  /* ---------------- Kill mechanic (bossMechanics.ts drives the rules) ---- */
  const mechId = mechanicForVariant(variant)
  // One state object for this fight's mechanic; created once per mount.
  const hider = useRef<HiderState | null>(null)
  const mirror = useRef<MirrorState | null>(null)
  const twin = useRef<TwinKeyState | null>(null)
  const gate = useRef<GateState | null>(null)
  const bracket = useRef<BracketState | null>(null)
  const sphinx = useRef<SphinxState | null>(null)
  if (mechId === 'hider' && !hider.current) hider.current = createHiderState()
  if (mechId === 'mirror' && !mirror.current) mirror.current = createMirrorState()
  if (mechId === 'twinkey' && !twin.current) twin.current = createTwinKeyState()
  if (mechId === 'gatekeeper' && !gate.current) gate.current = createGateState()
  if (mechId === 'bracket' && !bracket.current) bracket.current = createBracketState()
  if (mechId === 'sphinx' && !sphinx.current) sphinx.current = createSphinxState()

  // True while the boss guard is BROKEN (bolts deal damage).
  const guardOpen = useRef(false)
  // Mechanic key edges (Space / Q / E) — separate from useKeys (edge, not hold).
  const reqPing = useRef(false) // Space (Hider ping / Gatekeeper dash)
  const reqLockL = useRef(false) // Q
  const reqLockR = useRef(false) // E
  // Gatekeeper dash action.
  const dashT = useRef(-1)
  const dashDir = useRef(new THREE.Vector3())
  const dashCd = useRef(0)
  const gatePassed = useRef(false)
  // Mechanic warm-up: covers the teaching card after the entrance beat.
  const mechWarmupT = useRef(7.2)
  // Sphinx plate dwell (a plate registers only after standing on it a beat).
  const sphinxDwellIdx = useRef(-1)
  const sphinxDwellT = useRef(0)
  // Prompt throttling: only push text changes to the HUD.
  const lastPrompt = useRef<string | null>('')
  const promptHoldT = useRef(0)
  const immuneFlashCd = useRef(0)
  // QA autopilot recommendation record (probe-only; reused, never re-allocated).
  const qaRec = useRef({
    variant,
    open: false,
    fire: false,
    hold: false,
    keys: [] as string[],
    press: [] as string[],
  })
  // Mechanic prop visual refs.
  const signalRefs = useRef<(THREE.Group | null)[]>([])
  const signalMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const zoneRef = useRef<THREE.Group>(null)
  const zoneFuseMat = useRef<THREE.MeshBasicMaterial>(null)
  const zoneDiskMat = useRef<THREE.MeshBasicMaterial>(null)
  const zoneBeamMat = useRef<THREE.MeshBasicMaterial>(null)
  const lockRefs = useRef<(THREE.Group | null)[]>([])
  const lockCoreMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const gateRingRef = useRef<THREE.Mesh>(null)
  const gateRingMat = useRef<THREE.MeshBasicMaterial>(null)
  const nodeRefs = useRef<(THREE.Group | null)[]>([])
  const nodeRingMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const nodeSpriteMats = useRef<(THREE.SpriteMaterial | null)[]>([])
  const tileRefs = useRef<(THREE.Group | null)[]>([])
  const tileDiskMats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const tileSpriteMats = useRef<(THREE.SpriteMaterial | null)[]>([])
  const shieldRef = useRef<THREE.Mesh>(null)
  const shieldMat = useRef<THREE.MeshBasicMaterial>(null)
  const strikeBeamRef = useRef<THREE.Mesh>(null)
  const strikeBeamT = useRef(-1)
  // Sphinx number textures regenerate on every shuffle and dispose their
  // predecessors (plus everything on unmount).
  const tileTexes = useRef<(THREE.CanvasTexture | null)[]>([])
  useEffect(() => {
    const tiles = tileTexes.current
    return () => {
      for (const t of tiles) t?.dispose()
    }
  }, [])
  // Refresh the sphinx number sprites from the current tile state.
  const refreshTileGlyphs = useCallback(() => {
    const s = sphinx.current
    if (!s) return
    for (let i = 0; i < s.tiles.length; i++) {
      const mat = tileSpriteMats.current[i]
      if (!mat) continue
      const tex = makeGlyphTexture(String(s.tiles[i].value), MECH_HOT)
      tileTexes.current[i]?.dispose()
      tileTexes.current[i] = tex
      mat.map = tex
      mat.needsUpdate = true
    }
  }, [])
  useEffect(() => {
    if (mechId === 'sphinx') refreshTileGlyphs()
  }, [mechId, refreshTileGlyphs])

  // Projectile pools
  const bolts = useMemo<Bolt[]>(
    () => Array.from({ length: BOLT_POOL }, () => ({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      damage: WEAPON.damage,
      nodeIdx: -1,
    })),
    [],
  )
  const orbs = useMemo<Orb[]>(
    () => Array.from({ length: ORB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 })),
    [],
  )
  const boltRefs = useRef<(THREE.Mesh | null)[]>([])
  const orbFx = useRef<EnemyProjectilesHandle>(null)
  const impactFx = useRef<ImpactFlashesHandle>(null)
  const cooldown = useRef(0)
  const atkTimer = useRef(1.2)
  const atkWound = useRef(false)
  // Attack telegraph: a hot ring that flares under the boss during the windup
  // so the incoming volley is READABLE (QA: telegraphs were the same hue as
  // the ambient floor decor). Hot white-orange, distinct from every stage
  // accent. Presentation only — the orb timing/damage is unchanged.
  const teleRing = useRef<THREE.Mesh>(null)
  const teleMat = useRef<THREE.MeshBasicMaterial>(null)

  // One geometry + one material shared by every bolt / orb mesh, instead of a
  // fresh sphere geometry + material per pooled mesh (28 bolts + 16 orbs = 44 of
  // each). That collapses ~88 GPU buffer/material allocations at fight mount down
  // to 4 — less upload work + GC churn on the frame the arena appears.
  // Additive, glow-graded projectiles — a solid flat circle read as a UI
  // smear on the dark night arena (QA), not an energy attack.
  const boltGeo = useMemo(() => new THREE.SphereGeometry(0.13, 8, 8), [])
  const boltMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accent,
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [accent],
  )
  // Orb visuals now live in the shared <EnemyProjectiles> layers (hot core +
  // glow halo + motion trail) — this arena only keeps its accent choice.
  const orbColor = ORB_COLORS[variant % ORB_COLORS.length]
  useEffect(
    () => () => {
      boltGeo.dispose()
      boltMat.dispose()
    },
    [boltGeo, boltMat],
  )

  // Shared geometry for the mechanic props (only this variant's are mounted).
  const mechGeo = useMemo(
    () => ({
      beamCone: new THREE.CylinderGeometry(0.22, 0.95, 7, 10, 1, true),
      groundRing: new THREE.RingGeometry(0.82, 1, 44),
      disk: new THREE.CircleGeometry(1, 40),
      lock: new THREE.OctahedronGeometry(0.55, 0),
      beam: new THREE.CylinderGeometry(1, 1, 2, 8, 1, true),
      shield: new THREE.SphereGeometry(2.7, 20, 14),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const geo of Object.values(mechGeo)) geo.dispose()
    },
    [mechGeo],
  )
  // Q / E key glyphs for the twin locks (static for the whole fight).
  const lockTexes = useMemo(
    () =>
      mechId === 'twinkey'
        ? [makeGlyphTexture('Q', MECH_HOT), makeGlyphTexture('E', MECH_HOT)]
        : [],
    [mechId],
  )
  useEffect(
    () => () => {
      for (const tex of lockTexes) tex.dispose()
    },
    [lockTexes],
  )

  const tmpFwd = useRef(new THREE.Vector3())
  const tmpRight = useRef(new THREE.Vector3())
  const tmpMove = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())
  const camFrom = useRef(new THREE.Vector3())
  const camLook = useRef(new THREE.Vector3())

  // Bonus-strike power blast (beam + shockwave from player to boss).
  const beamRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const blastT = useRef(-1)
  const prevBlast = useRef(blastCount)
  const tmpA = useRef(new THREE.Vector3())
  const tmpB = useRef(new THREE.Vector3())
  const tmpC = useRef(new THREE.Vector3())
  const tmpD = useRef(new THREE.Vector3())
  useEffect(() => {
    if (blastCount !== prevBlast.current) {
      prevBlast.current = blastCount
      blastT.current = 0
      dirRef.current?.shake(0.5)
      dirRef.current?.punch(0.6)
    }
  }, [blastCount])

  // Node the player's fire is redirected to this frame (Bracket Beast).
  const nodeTargetIdx = useRef(-1)
  // Brief invulnerability earned by a PERFECT gate dash.
  const invulnT = useRef(0)
  const strikeFrom = useRef(new THREE.Vector3())
  const strikeTo = useRef(new THREE.Vector3())

  // Bracket glyph sprites re-skin on every reshuffle (labels move around).
  const nodeTexes = useRef<(THREE.CanvasTexture | null)[]>([])
  const refreshNodeGlyphs = useCallback(() => {
    const s = bracket.current
    if (!s) return
    for (let i = 0; i < s.nodes.length; i++) {
      const mat = nodeSpriteMats.current[i]
      if (!mat) continue
      const tex = makeGlyphTexture(s.nodes[i].label, MECH_HOT)
      nodeTexes.current[i]?.dispose()
      nodeTexes.current[i] = tex
      mat.map = tex
      mat.needsUpdate = true
    }
  }, [])
  useEffect(() => {
    if (mechId === 'bracket') refreshNodeGlyphs()
    const texes = nodeTexes.current
    return () => {
      for (const t of texes) t?.dispose()
    }
  }, [mechId, refreshNodeGlyphs])

  /** Push a prompt to the HUD only when the text actually changes. */
  function pushPrompt(label: string | null, danger = false, hold = 0) {
    if (label === lastPrompt.current) return
    lastPrompt.current = label
    onMechPrompt(label, danger)
    if (hold > 0) promptHoldT.current = hold
  }

  /** Spawn homing add-orbs (mechanic punishments) from a world point. */
  function spawnAdds(count: number, x: number, z: number) {
    for (let i = 0; i < count; i++) {
      const o = orbs.find((q) => !q.active)
      if (!o) return
      o.active = true
      o.life = ORB_LIFE
      o.pos.set(x, 1.5, z)
      const a = Math.random() * Math.PI * 2
      o.vel.set(Math.sin(a) * orbSpeed * 0.5, 0, Math.cos(a) * orbSpeed * 0.5)
    }
  }

  /** Route mechanic events into damage/heals/VFX/prompts. */
  function applyMechEvents(events: readonly MechEvent[]) {
    if (events.length === 0) return
    const dir = dirRef.current
    for (const e of events) {
      switch (e.type) {
        case 'open': {
          guardOpen.current = true
          if (shockFx.current) {
            shockFx.current.fire(
              tmpB.current.set(bossPos.current.x, 0.05, bossPos.current.z),
              6,
              MECH_GOOD,
            )
          }
          if (sparks.current) {
            sparks.current.burst(
              tmpA.current.set(bossPos.current.x, bossPos.current.y, bossPos.current.z),
              MECH_GOOD,
              18,
            )
          }
          dir?.shake(0.3)
          hitRef.current += 1 // boss recoil one-shot sells the guard break
          break
        }
        case 'close':
          guardOpen.current = false
          break
        case 'heal':
          onBossHeal(e.amount)
          if (sparks.current && e.amount > 0) {
            sparks.current.burst(
              tmpA.current.set(bossPos.current.x, bossPos.current.y + 0.6, bossPos.current.z),
              MECH_DANGER,
              14,
            )
          }
          break
        case 'zap': {
          const n = Math.min(3, Math.max(1, Math.round(e.amount)))
          for (let i = 0; i < n; i++) onPlayerHit()
          dir?.punch(0.5)
          dir?.shake(0.3)
          if (sparks.current) {
            sparks.current.burst(
              tmpA.current.set(pos.current.x, 1.2, pos.current.z),
              '#ff5a4a',
              12,
            )
          }
          break
        }
        case 'adds':
          spawnAdds(e.count, e.x, e.z)
          if (sparks.current) {
            sparks.current.burst(tmpA.current.set(e.x, 1.2, e.z), MECH_DANGER, 10)
          }
          break
        case 'shuffle':
          if (mechId === 'sphinx') refreshTileGlyphs()
          if (mechId === 'bracket') refreshNodeGlyphs()
          break
        case 'progress':
          if (sparks.current) {
            sparks.current.burst(
              tmpA.current.set(pos.current.x, 1.4, pos.current.z),
              MECH_GOOD,
              6,
            )
          }
          break
        case 'mistake': {
          pushPrompt(mistakeMessage(mechId, e.reason), true, 1.7)
          dir?.shake(0.18)
          if (e.reason === 'not-armed') spawnAdds(2, bossPos.current.x, bossPos.current.z)
          if (e.reason === 'timeout') spawnAdds(3, bossPos.current.x, bossPos.current.z)
          break
        }
      }
    }
  }

  // Hold mouse or F to rapid-fire. Aim is automatic (lock-on to the boss).
  const holdFire = useRef(false)
  useEffect(() => {
    const el = gl.domElement
    const onDown = () => {
      holdFire.current = true
    }
    const onUp = () => {
      holdFire.current = false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') holdFire.current = true
      // Mechanic keys (edge-triggered; repeats from key-hold are ignored).
      if (e.repeat) return
      if (e.key === ' ' || e.code === 'Space') {
        reqPing.current = true
        e.preventDefault()
      }
      if (e.key === 'q' || e.key === 'Q') reqLockL.current = true
      if (e.key === 'e' || e.key === 'E') reqLockR.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') holdFire.current = false
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [gl])

  useEffect(() => {
    camera.position.set(CAM_SIDE, CAM_HEIGHT, 12 + CAM_BACK)
  }, [camera])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const dir = dirRef.current!
    dir.attach(camera)

    // Entrance beat: sim stays parked while the camera sweeps the boss. The
    // beat itself waits behind the curtain until the villain rig is resident.
    const ready = bossReadyRef.current > 0 || holdT.current >= 2.2
    if (!ready) holdT.current += dt
    else if (introT.current < INTRO_DUR) introT.current += dt
    if (ready && !curtainCalled.current) {
      curtainCalled.current = true
      onCurtainUp()
    }
    const intro = introT.current < INTRO_DUR
    const k = frozen || intro ? {} : keys.current

    // One-time death beat: shake + burst the instant the boss goes down.
    if (dead && !prevDead.current) {
      prevDead.current = true
      dir.shake(0.6)
      dir.punch(0.7)
      if (sparks.current) {
        sparks.current.burst(
          tmpA.current.set(bossPos.current.x, bossPos.current.y + 0.4, bossPos.current.z),
          '#ffd9a0',
          26,
        )
      }
      if (shockFx.current) {
        shockFx.current.fire(
          tmpB.current.set(bossPos.current.x, 0.05, bossPos.current.z),
          9,
          accent,
        )
      }
    }

    // --- Lock-on movement: the hero always faces the boss so it stays framed.
    // Aim axis = direction from hero to boss; left/right strafe (orbit) around it,
    // up/down advance or retreat. This guarantees the boss is always on screen.
    // While the Hider is CLOAKED there is no boss to face — the lock-on (and
    // the camera) hold the arena center so the aim never betrays its spot.
    const hiderCloaked =
      mechId === 'hider' && !dead && hider.current?.phase === 'cloak'
    const aimX = hiderCloaked ? 0 : bossPos.current.x
    const aimZ = hiderCloaked ? 0 : bossPos.current.z
    tmpDir.current.set(aimX - pos.current.x, 0, aimZ - pos.current.z)
    if (tmpDir.current.lengthSq() < 1e-6) tmpDir.current.set(0, 0, 1)
    tmpDir.current.normalize()
    // Player heading faces the boss (gun + body track the target).
    camYaw.current = Math.atan2(tmpDir.current.x, tmpDir.current.z)

    tmpFwd.current.copy(tmpDir.current)
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)

    // arrowleft/right strafe around the boss; arrowup/down (or W/S) advance/retreat.
    const str = (k['arrowright'] || k['d'] ? 1 : 0) - (k['arrowleft'] || k['a'] ? 1 : 0)
    const fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
    tmpMove.current.set(0, 0, 0)
    tmpMove.current.addScaledVector(tmpFwd.current, fwd)
    tmpMove.current.addScaledVector(tmpRight.current, str)
    const moving = tmpMove.current.lengthSq() > 0.001
    if (moving) tmpMove.current.normalize()

    // Gatekeeper dash: a short burst that overrides normal movement. Only a
    // PERFECT (flash-timed) dash phases through the slam.
    dashCd.current -= dt
    if (dashT.current >= 0) {
      dashT.current += dt
      if (dashT.current >= 0.24) dashT.current = -1
      else {
        const sp = 26 * dt
        pos.current.x += dashDir.current.x * sp
        pos.current.z += dashDir.current.z * sp
        const r = Math.hypot(pos.current.x, pos.current.z)
        if (r > BOUND) {
          pos.current.x *= BOUND / r
          pos.current.z *= BOUND / r
        }
      }
    } else if (moving) {
      const speed = RUN_SPEED * dt
      const nx = pos.current.x + tmpMove.current.x * speed
      const nz = pos.current.z + tmpMove.current.z * speed
      // Keep a minimum gap from the boss so we never overlap or clip the
      // camera (skipped while the Hider is intangible in its cloak). Inside
      // the gap the player SLIDES around the boss instead of sticking — a
      // hard reject wedged players (and route-running mechanics) whenever
      // the boss stood on their path.
      const ndb = Math.hypot(bossPos.current.x - nx, bossPos.current.z - nz)
      if (ndb > 2.6 || hiderCloaked) {
        pos.current.x = nx
        pos.current.z = nz
      } else {
        const inv = 2.6 / (ndb || 1)
        pos.current.x = bossPos.current.x + (nx - bossPos.current.x) * inv
        pos.current.z = bossPos.current.z + (nz - bossPos.current.z) * inv
      }
      const r = Math.hypot(pos.current.x, pos.current.z)
      if (r > BOUND) {
        pos.current.x *= BOUND / r
        pos.current.z *= BOUND / r
      }
    }
    // Player defeat: the collapse is TOP priority — once hearts hit zero the
    // avatar timbers and holds prone (the rig clamps 'death'), regardless of
    // any lingering move input. Cleared on retry when the arena remounts with
    // full hearts (playerAnimRef starts 'idle' on a fresh mount).
    playerAnimRef.current = playerDefeated
      ? 'death'
      : dashT.current >= 0 || moving
        ? 'run'
        : 'idle'

    // Face the boss.
    let hd = camYaw.current - heading.current
    hd = Math.atan2(Math.sin(hd), Math.cos(hd))
    heading.current += hd * HEADING_LERP

    const g = playerGroup.current
    if (g) {
      g.position.copy(pos.current)
      g.rotation.y = heading.current
    }

    /* ============== KILL MECHANIC — the unique way THIS boss dies ============ */
    // Warm-up: the mechanic stays dormant while the teaching card is on
    // screen, so its FIRST beat never plays out underneath the tutorial (QA:
    // first shatter/flash landed while the card was still up). Props render
    // (read the arena), the boss fights — but no clocks run, nothing punishes.
    let mechActive = !dead && !frozen && !intro
    if (mechActive && mechWarmupT.current > 0) {
      mechWarmupT.current -= dt
      mechActive = false
    }
    promptHoldT.current = Math.max(0, promptHoldT.current - dt)
    invulnT.current = Math.max(0, invulnT.current - dt)
    immuneFlashCd.current = Math.max(0, immuneFlashCd.current - dt)
    nodeTargetIdx.current = -1
    let idlePrompt: string | null = null
    let idleDanger = false
    if (mechActive) {
      switch (mechId) {
        case 'hider': {
          const s = hider.current!
          applyMechEvents(tickHider(s, dt))
          if (reqPing.current) {
            reqPing.current = false
            applyMechEvents(hiderPing(s, pos.current.x, pos.current.z))
            if (shockFx.current) {
              shockFx.current.fire(
                tmpB.current.set(pos.current.x, 0.05, pos.current.z),
                HIDER.pingRadius,
                '#ffffff',
              )
            }
          }
          guardOpen.current = s.phase === 'revealed'
          idlePrompt = guardOpen.current
            ? 'FLUSHED OUT — OPEN FIRE!'
            : 'IT HIDES — PING (SPACE) ON THE TRUE SIGNAL'
          idleDanger = guardOpen.current
          break
        }
        case 'mirror': {
          const s = mirror.current!
          applyMechEvents(tickMirror(s, dt, bossPos.current.x, bossPos.current.z))
          guardOpen.current = !s.guard
          idlePrompt = guardOpen.current
            ? 'MIRROR SHATTERED — OPEN FIRE!'
            : s.zone
              ? 'STEER ITS REFLECTION INTO THE RED ZONE'
              : 'A NEW SHATTER ZONE FORMS…'
          idleDanger = guardOpen.current
          break
        }
        case 'twinkey': {
          const s = twin.current!
          applyMechEvents(tickTwinKey(s, dt))
          const strike = (side: 'L' | 'R') => {
            const engaged = s.phase === 'first' || s.phase === 'second' || s.phase === 'charge'
            applyMechEvents(twinStrike(s, side))
            if (engaged) {
              // Visible zap to the struck lock (even a punished strike lands).
              const lock = lockRefs.current[side === 'L' ? 0 : 1]
              if (lock) {
                strikeFrom.current.set(pos.current.x, 1.3, pos.current.z)
                strikeTo.current.copy(lock.position)
                strikeBeamT.current = 0
                if (sparks.current) {
                  sparks.current.burst(tmpA.current.copy(lock.position), MECH_HOT, 10)
                }
              }
            }
          }
          if (reqLockL.current) {
            reqLockL.current = false
            strike('L')
          }
          if (reqLockR.current) {
            reqLockR.current = false
            strike('R')
          }
          guardOpen.current = s.windowT > 0
          const firstKey = s.firstSide === 'L' ? 'Q (LEFT)' : 'E (RIGHT)'
          const twinKey = s.firstSide === 'L' ? 'E (RIGHT)' : 'Q (LEFT)'
          idlePrompt = guardOpen.current
            ? 'IT KNEELS — OPEN FIRE!'
            : s.phase === 'first'
              ? `THE ${firstKey} LOCK GLOWS — STRIKE IT!`
              : s.phase === 'charge'
                ? 'ITS TWIN CHARGES — HOLD…'
                : s.phase === 'second'
                  ? `NOW ${twinKey} — THE TWIN!`
                  : 'THE LOCKS SLEEP — DODGE UNTIL ONE GLOWS'
          idleDanger = guardOpen.current || s.phase === 'second'
          break
        }
        case 'gatekeeper': {
          const s = gate.current!
          const distB = Math.hypot(
            pos.current.x - bossPos.current.x,
            pos.current.z - bossPos.current.z,
          )
          if (reqPing.current) {
            reqPing.current = false
            if (dashCd.current <= 0 && dashT.current < 0) {
              const res = gateDash(s, distB)
              dashCd.current = 1.1
              dashT.current = 0
              // The dash always carries you toward/through the boss line.
              dashDir.current.set(
                bossPos.current.x - pos.current.x,
                0,
                bossPos.current.z - pos.current.z,
              )
              if (dashDir.current.lengthSq() < 1e-6) dashDir.current.set(0, 0, 1)
              dashDir.current.normalize()
              if (res === 'perfect') {
                gatePassed.current = true
                invulnT.current = 0.5
                dir.punch(0.4)
                if (sparks.current) {
                  sparks.current.burst(
                    tmpA.current.set(pos.current.x, 1.3, pos.current.z),
                    '#ffffff',
                    20,
                  )
                }
              } else if (res === 'early') {
                pushPrompt('TOO EARLY — DASH ON THE WHITE FLASH', true, 1.6)
              } else if (res === 'too-far') {
                pushPrompt('TOO FAR — DASH FROM CLOSER IN', true, 1.6)
              }
            }
          }
          const before = s.phase
          applyMechEvents(tickGate(s, dt, distB, gatePassed.current))
          if (before === 'windup' && s.phase !== 'windup') {
            gatePassed.current = false
            if (s.phase === 'idle') {
              // The slam always lands somewhere — sell the impact even when dodged.
              if (shockFx.current) {
                shockFx.current.fire(
                  tmpB.current.set(bossPos.current.x, 0.05, bossPos.current.z),
                  GATE.slamRadius,
                  MECH_HOT,
                )
              }
              dir.shake(0.3)
            }
          }
          if (s.phase === 'windup') {
            // Plant + roar through the windup so the tell reads on the rig too.
            bossAnimRef.current = 'scream'
            const targetH = Math.atan2(
              pos.current.x - bossPos.current.x,
              pos.current.z - bossPos.current.z,
            )
            let dh = targetH - bossHeading.current
            dh = Math.atan2(Math.sin(dh), Math.cos(dh))
            bossHeading.current += dh * 0.2
          }
          guardOpen.current = s.phase === 'stagger'
          idlePrompt = guardOpen.current
            ? 'THE GATE HANGS OPEN — OPEN FIRE!'
            : s.phase === 'windup'
              ? gateFlashOn(s)
                ? 'DASH NOW (SPACE)!'
                : 'GATE-SLAM WINDS UP — WAIT FOR THE WHITE FLASH…'
              : 'BAIT THE GATE-SLAM — STAY IN ITS REACH'
          idleDanger = guardOpen.current || gateFlashOn(s)
          break
        }
        case 'bracket': {
          const s = bracket.current!
          applyMechEvents(tickBracket(s, dt))
          guardOpen.current = s.windowT > 0
          nodeTargetIdx.current = guardOpen.current
            ? -1
            : bracketTargetIndex(s, pos.current.x, pos.current.z)
          if (guardOpen.current) {
            idlePrompt = 'ARMOR DOWN — OPEN FIRE!'
            idleDanger = true
          } else if (nodeTargetIdx.current >= 0) {
            idlePrompt = `TARGETING ${s.nodes[nodeTargetIdx.current].label} — FIRE TO BREAK IT`
          } else if (s.stack.length === 0) {
            idlePrompt = 'STAND IN A SIGIL RING — OPENERS ( [ { FIRST'
          } else {
            const top = s.stack[s.stack.length - 1]
            const closer = top === '(' ? ')' : top === '[' ? ']' : '}'
            idlePrompt = `OPEN: ${s.stack.join(' ')} — CLOSE ${closer} NEXT (OR ANOTHER OPENER)`
          }
          break
        }
        case 'sphinx': {
          const s = sphinx.current!
          applyMechEvents(tickSphinx(s, dt))
          guardOpen.current = s.windowT > 0
          if (!guardOpen.current) {
            // A plate only registers after PLANTING on it — standing still
            // for a beat. Dwell time accrues ONLY while not moving, so
            // running across any plate (even slowly, even dodging) can never
            // register: the crossing-safety promise is exact, not a race
            // against a timer (QA: at run speed a plate crossing outlasted
            // the old timer-only dwell and zapped correct routes).
            const ti = sphinxTileAt(s, pos.current.x, pos.current.z)
            if (ti !== sphinxDwellIdx.current) {
              sphinxDwellIdx.current = ti
              sphinxDwellT.current = 0
            } else if (ti >= 0 && !moving && dashT.current < 0) {
              sphinxDwellT.current += dt
              if (sphinxDwellT.current >= 0.45) {
                sphinxDwellT.current = 0
                sphinxDwellIdx.current = -1
                applyMechEvents(sphinxStep(s, ti))
              }
            }
          }
          if (guardOpen.current) {
            idlePrompt = 'THE SPHINX IS STUNNED — OPEN FIRE!'
            idleDanger = true
          } else {
            const next = sphinxNextValue(s)
            const sec = Math.max(0, Math.ceil(sphinx.current!.timer))
            idlePrompt = `STEP THE PLATES IN ORDER — NEXT ${next ?? '—'} · ${sec}s`
            idleDanger = sec <= 4
          }
          break
        }
      }
      // Consume any unclaimed mechanic-key edges so they never go stale.
      reqPing.current = false
      reqLockL.current = false
      reqLockR.current = false
      if (promptHoldT.current <= 0) pushPrompt(idlePrompt, idleDanger)
    } else if (dead || frozen) {
      pushPrompt(null)
    }

    /* ---- mechanic prop visuals (imperative — a handful of objects) ---- */
    {
      // Props render through the warm-up too, so the card's words map onto
      // visible things before the clocks start.
      const showProps = !dead && !frozen && !intro
      if (mechId === 'hider') {
        const s = hider.current!
        for (let i = 0; i < HIDER.signals; i++) {
          const grp = signalRefs.current[i]
          const mat = signalMats.current[i]
          if (!grp || !mat) continue
          const sig = s.signals[i]
          const vis = showProps && s.phase === 'cloak' && !!sig
          grp.visible = vis
          if (!vis || !sig) continue
          grp.position.set(sig.x, 0, sig.z)
          if (sig.real) {
            // The tell: the TRUE signal strobes in nervous bursts; decoys breathe.
            const strobe =
              Math.sin(t * 16) > 0.25 && Math.sin(t * 2.1) > -0.35 ? 1 : 0.2
            mat.opacity = 0.14 + 0.5 * strobe
          } else {
            mat.opacity = 0.3 + 0.2 * Math.sin(t * 2.4 + i * 2.1)
          }
        }
      } else if (mechId === 'mirror') {
        const s = mirror.current!
        const grp = zoneRef.current
        if (grp) {
          const vis = showProps && s.guard && !!s.zone
          grp.visible = vis
          if (vis && s.zone) {
            grp.position.set(s.zone.x, 0, s.zone.z)
            const frac = Math.max(0, s.zone.fuse / MIRROR.zoneFuse)
            const ring = grp.children[1]
            if (ring) {
              const rs = MIRROR.zoneRadius * Math.max(0.08, frac)
              ring.scale.set(rs, rs, rs)
            }
            if (zoneFuseMat.current) {
              zoneFuseMat.current.opacity =
                0.65 + 0.3 * Math.sin(t * (6 + (1 - frac) * 18))
            }
            if (zoneDiskMat.current) {
              zoneDiskMat.current.opacity = 0.24 + 0.12 * Math.sin(t * 5)
            }
            if (zoneBeamMat.current) {
              // The column burns hotter as the fuse runs down.
              zoneBeamMat.current.opacity =
                0.18 + (1 - frac) * 0.3 + 0.08 * Math.sin(t * 9)
            }
          }
        }
      } else if (mechId === 'twinkey') {
        const s = twin.current!
        // Lateral axis of the boss→player line: locks sit screen-left/right.
        const fx0 = pos.current.x - bossPos.current.x
        const fz0 = pos.current.z - bossPos.current.z
        const fl = Math.hypot(fx0, fz0) || 1
        const rxx = -(fz0 / fl)
        const rzz = fx0 / fl
        for (let i = 0; i < 2; i++) {
          const grp = lockRefs.current[i]
          const mat = lockCoreMats.current[i]
          if (!grp || !mat) continue
          const vis = showProps && s.windowT <= 0
          grp.visible = vis
          if (!vis) continue
          const side = i === 0 ? 1 : -1 // 0 = Q = screen-left of the boss
          grp.position.set(
            bossPos.current.x + rxx * side * 3.1,
            1.75 + Math.sin(t * 2.2 + i * 1.7) * 0.18,
            bossPos.current.z + rzz * side * 3.1,
          )
          grp.rotation.y = t * 1.4
          const mySide = i === 0 ? 'L' : 'R'
          const isFirst = s.firstSide === mySide
          if (s.phase === 'first') {
            if (isFirst) {
              // The lock to strike NOW: hot, big, pulsing.
              const p = 1 + 0.2 * Math.sin(t * 14)
              grp.scale.set(p, p, p)
              mat.opacity = 0.95
              mat.color.set(MECH_HOT)
            } else {
              grp.scale.set(0.7, 0.7, 0.7)
              mat.opacity = 0.25
              mat.color.set(accent)
            }
          } else if (s.phase === 'charge') {
            if (isFirst) {
              grp.scale.set(0.85, 0.85, 0.85)
              mat.opacity = 0.6
              mat.color.set(MECH_GOOD) // struck + locked in
            } else {
              // The twin visibly CHARGES — brightening ramp, not yet strikeable.
              const chargeP = 1 - s.t / s.cfg.chargeDelay
              grp.scale.set(0.75 + chargeP * 0.2, 0.75 + chargeP * 0.2, 0.75 + chargeP * 0.2)
              mat.opacity = 0.35 + chargeP * 0.4
              mat.color.set('#ffffff')
            }
          } else if (s.phase === 'second') {
            if (isFirst) {
              grp.scale.set(0.85, 0.85, 0.85)
              mat.opacity = 0.6
              mat.color.set(MECH_GOOD)
            } else {
              const p = 1 + 0.22 * Math.sin(t * 16)
              grp.scale.set(p, p, p)
              mat.opacity = 1
              mat.color.set('#ffffff')
            }
          } else {
            grp.scale.set(0.7, 0.7, 0.7)
            mat.opacity = 0.3
            mat.color.set(accent)
          }
        }
      } else if (mechId === 'gatekeeper') {
        const s = gate.current!
        const ring = gateRingRef.current
        const mat = gateRingMat.current
        if (ring && mat) {
          const vis = showProps && s.phase === 'windup'
          ring.visible = vis
          if (vis) {
            const p = 1 - s.t / GATE.windup
            ring.position.set(bossPos.current.x, 0.08, bossPos.current.z)
            const rr = 1.5 + p * (GATE.slamRadius - 1.5)
            ring.scale.set(rr, rr, rr)
            if (gateFlashOn(s)) {
              mat.color.set('#ffffff')
              mat.opacity = 0.6 + 0.4 * Math.sin(t * 50)
            } else {
              mat.color.set(MECH_HOT)
              mat.opacity = 0.35 + 0.2 * Math.sin(t * 10)
            }
          }
        }
      } else if (mechId === 'bracket') {
        const s = bracket.current!
        for (let i = 0; i < s.nodes.length; i++) {
          const grp = nodeRefs.current[i]
          if (!grp) continue
          const n = s.nodes[i]
          const vis = showProps && n.alive && s.windowT <= 0
          grp.visible = vis
          if (!vis) continue
          grp.position.set(n.x, 0, n.z)
          const targeted = nodeTargetIdx.current === i
          // Currently-LEGAL sigils pulse hot; illegal closers sit dim — the
          // arena itself points at the valid next moves (QA: players had to
          // route-plan from the text prompt alone).
          const legal = bracketShotValid(s.stack, n.label)
          const rmat = nodeRingMats.current[i]
          if (rmat) {
            rmat.color.set(targeted ? '#ffffff' : legal ? MECH_HOT : '#5a6376')
            rmat.opacity = targeted
              ? 0.85
              : legal
                ? 0.45 + 0.25 * Math.sin(t * 5 + i)
                : 0.18
          }
          const smat = nodeSpriteMats.current[i]
          if (smat) smat.opacity = targeted ? 1 : legal ? 0.95 : 0.45
        }
      } else if (mechId === 'sphinx') {
        const s = sphinx.current!
        for (let i = 0; i < s.tiles.length; i++) {
          const grp = tileRefs.current[i]
          if (!grp) continue
          const tile = s.tiles[i]
          const vis = showProps && s.windowT <= 0
          grp.visible = vis
          if (!vis) continue
          grp.position.set(tile.x, 0, tile.z)
          const dmat = tileDiskMats.current[i]
          const smat = tileSpriteMats.current[i]
          const urgency = s.timer < 4 ? 9 : 3
          if (dmat) {
            if (tile.done) {
              dmat.color.set(MECH_GOOD)
              dmat.opacity = 0.4
            } else {
              dmat.color.set(MECH_HOT)
              dmat.opacity = 0.18 + 0.12 * Math.sin(t * urgency + i)
            }
          }
          if (smat) smat.opacity = tile.done ? 0.25 : 1
        }
      }
      // Guard shell: reads "immune" at a glance; drops with the guard.
      const sh = shieldRef.current
      const shm = shieldMat.current
      if (sh && shm) {
        const vis =
          showProps &&
          !guardOpen.current &&
          !(mechId === 'hider' && hider.current!.phase === 'cloak')
        sh.visible = vis
        if (vis) {
          sh.position.set(bossPos.current.x, bossPos.current.y, bossPos.current.z)
          shm.opacity = 0.05 + 0.03 * Math.sin(t * 3)
        }
      }
      // Twin-lock strike beam (short zap from the hero to the struck lock).
      const beamM = strikeBeamRef.current
      if (beamM) {
        if (strikeBeamT.current >= 0) {
          strikeBeamT.current += dt
          if (strikeBeamT.current > 0.16) {
            strikeBeamT.current = -1
            beamM.visible = false
          } else {
            beamM.visible = true
            const mid = tmpC.current.copy(strikeFrom.current).add(strikeTo.current).multiplyScalar(0.5)
            const d = tmpD.current.copy(strikeTo.current).sub(strikeFrom.current)
            const len = d.length() || 0.001
            d.normalize()
            beamM.position.copy(mid)
            beamM.quaternion.setFromUnitVectors(UP, d)
            beamM.scale.set(0.08, len / 2, 0.08)
          }
        } else {
          beamM.visible = false
        }
      }
    }

    // --- Boss movement: grounded villain that strafes, chases and LEAPS ---
    const bg = bossGroup.current
    const CHEST_H = 1.3
    if (intro && !dead) {
      // Entrance: hold position, face the player, roar.
      bossAnimRef.current = 'scream'
      const targetH = Math.atan2(
        pos.current.x - bossPos.current.x,
        pos.current.z - bossPos.current.z,
      )
      let dh = targetH - bossHeading.current
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      bossHeading.current += dh * 0.3
      if (!introRoared.current && introT.current > INTRO_DUR * 0.42) {
        introRoared.current = true
        dir.shake(0.42)
        if (shockFx.current) {
          shockFx.current.fire(
            tmpB.current.set(bossPos.current.x, 0.05, bossPos.current.z),
            7,
            accent,
          )
        }
      }
    }
    // Mechanic-owned movement: the Hider parks (cloaked) on its true signal;
    // the Mirror Mimic's position IS the player's reflection. Both skip the
    // default chase/leap brain below.
    const bossMovesFree =
      mechId !== 'hider' &&
      !(mechId === 'mirror' && !dead && !intro) &&
      // The Gatekeeper plants for his slam windup (the tell must be readable).
      !(mechId === 'gatekeeper' && gate.current?.phase === 'windup') &&
      // While its guard is broken the boss reels in place — the punish
      // window is a stationary target, not a chase.
      !guardOpen.current
    if (mechId === 'hider' && !dead && !intro) {
      const s = hider.current!
      const real = hiderRealSignal(s)
      if (s.phase === 'cloak') {
        // Teleport while invisible — nothing on screen betrays the move.
        bossPos.current.set(real.x, CHEST_H, real.z)
        bossVelY.current = 0
        bossGrounded.current = true
        bossAnimRef.current = 'idle'
      } else {
        bossAnimRef.current = 'idle'
        const targetH = Math.atan2(
          pos.current.x - bossPos.current.x,
          pos.current.z - bossPos.current.z,
        )
        let dh = targetH - bossHeading.current
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        bossHeading.current += dh * 0.25
      }
    } else if (mechId === 'mirror' && !dead && !intro) {
      const s = mirror.current!
      if (s.guard && !frozen) {
        const mp = mirrorPoint(pos.current.x, pos.current.z)
        const prevX = bossPos.current.x
        const prevZ = bossPos.current.z
        bossPos.current.x += (mp.x - bossPos.current.x) * Math.min(1, dt * 9)
        bossPos.current.z += (mp.z - bossPos.current.z) * Math.min(1, dt * 9)
        bossPos.current.y = CHEST_H
        const sq =
          (bossPos.current.x - prevX) ** 2 + (bossPos.current.z - prevZ) ** 2
        bossAnimRef.current = sq > (0.5 * dt) ** 2 ? 'run' : 'idle'
      } else {
        bossAnimRef.current = 'idle' // shattered — it stands exposed
      }
      const targetH = Math.atan2(
        pos.current.x - bossPos.current.x,
        pos.current.z - bossPos.current.z,
      )
      let dh = targetH - bossHeading.current
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      bossHeading.current += dh * 0.25
    }
    if (!dead && !intro && bossMovesFree) {
      tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z)
      const distP = tmpDir.current.length() || 1
      tmpDir.current.normalize()

      // Vertical: gravity + jump arc.
      bossVelY.current += -26 * dt
      bossPos.current.y += bossVelY.current * dt
      if (bossPos.current.y <= CHEST_H) {
        const wasAir = !bossGrounded.current
        bossPos.current.y = CHEST_H
        bossVelY.current = 0
        bossGrounded.current = true
        if (wasAir) {
          // Every landing thumps: ground ring + a camera hit within reason.
          dir.shake(0.24)
          if (shockFx.current) {
            shockFx.current.fire(
              tmpB.current.set(bossPos.current.x, 0.05, bossPos.current.z),
              4.5,
              accent,
            )
          }
          // Landing near the player = a melee slam.
          if (distP < 3.2 && !frozen) {
            onPlayerHit()
            dir.punch(0.55)
          }
        }
      }

      // Decide a leap toward the player every couple seconds. Lower arc so the boss
      // never rockets out of the frame.
      leapTimer.current -= dt
      if (bossGrounded.current && leapTimer.current <= 0) {
        leapTimer.current = Math.max(1.8, 3.4 - variant * 0.16)
        bossVelY.current = 6.2
        bossGrounded.current = false
        orbitDir.current = Math.random() < 0.5 ? 1 : -1
        // Lunge horizontally toward the player as it takes off.
        bossPos.current.x += tmpDir.current.x * 1.1
        bossPos.current.z += tmpDir.current.z * 1.1
      }

      // Horizontal: chase to a close, readable fighting range, plus a strafe to circle.
      // Closer range keeps the (sometimes dark) boss big and clearly visible while you shoot.
      let approach = 0
      if (distP > 8) approach = 1
      else if (distP < 5.5) approach = -1
      const groundSpd = bossGrounded.current ? 1 : 1.7 // faster while leaping
      const chase = 3.6 * bossMoveMul * groundSpd * dt
      bossPos.current.x += tmpDir.current.x * approach * chase
      bossPos.current.z += tmpDir.current.z * approach * chase
      bossPos.current.x += -tmpDir.current.z * orbitDir.current * 2.2 * bossMoveMul * dt
      bossPos.current.z += tmpDir.current.x * orbitDir.current * 2.2 * bossMoveMul * dt

      const br = Math.hypot(bossPos.current.x, bossPos.current.z)
      if (br > BOUND - 2) {
        bossPos.current.x *= (BOUND - 2) / br
        bossPos.current.z *= (BOUND - 2) / br
      }

      // Smooth facing so the boss doesn't twitch when strafing or the player circles.
      const targetH = Math.atan2(
        pos.current.x - bossPos.current.x,
        pos.current.z - bossPos.current.z,
      )
      let dh = targetH - bossHeading.current
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      bossHeading.current += dh * 0.22

      // Boss is a living fighter — always animates (run while on ground, jump in air).
      bossAnimRef.current = !bossGrounded.current ? 'jump' : 'run'
    }
    // Broken guard: the boss reels in place, roaring — a stationary punish
    // target that still visibly tracks its attacker.
    if (!dead && !intro && guardOpen.current) {
      bossAnimRef.current = 'scream'
      const targetH = Math.atan2(
        pos.current.x - bossPos.current.x,
        pos.current.z - bossPos.current.z,
      )
      let dh = targetH - bossHeading.current
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      bossHeading.current += dh * 0.12
    }
    if (bg) {
      // Render feet at chest - CHEST_H so the humanoid stands on the floor.
      bg.position.set(bossPos.current.x, bossPos.current.y - CHEST_H, bossPos.current.z)
      bg.rotation.y = bossHeading.current
      // The Hider is INVISIBLE while cloaked (never during the entrance
      // cinematic or the death beat — those always frame the villain).
      bg.visible = !(hiderCloaked && !intro)
      // The boss rig is moved imperatively every frame, so its meshes must never
      // be frustum-culled (its base bounds sit at the origin). Re-assert this for
      // the first few frames to catch any late-mounted nodes, then stop — there's
      // no need to walk the whole rig on every single frame thereafter.
      if (cullFrames.current < 8) {
        cullFrames.current++
        bg.traverse((o) => {
          o.frustumCulled = false
        })
      }
    }

    // --- Camera frames the boss using its FINAL position this frame ---
    // Computed AFTER both the player and boss have moved (and after a leap's instant
    // lunge), so the look target is never a frame stale — the boss stays dead-centre.
    // (While the Hider is cloaked the camera frames the arena center instead —
    // pointing at the invisible boss would betray the true signal.)
    const lookX = hiderCloaked ? 0 : bossPos.current.x
    const lookY = hiderCloaked ? CHEST_H : bossPos.current.y
    const lookZ = hiderCloaked ? 0 : bossPos.current.z
    tmpFwd.current.set(
      lookX - pos.current.x,
      0,
      lookZ - pos.current.z,
    )
    if (tmpFwd.current.lengthSq() < 1e-6) tmpFwd.current.set(0, 0, 1)
    tmpFwd.current.normalize()
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)

    if (intro && !dead) {
      // Entrance hero shot: swing low around the boss, then rise + pull back
      // toward the gameplay framing as the beat ends.
      const p = THREE.MathUtils.clamp(introT.current / INTRO_DUR, 0, 1)
      const ease = p * p * (3 - 2 * p)
      const ang = Math.atan2(pos.current.x - bossPos.current.x, pos.current.z - bossPos.current.z)
      const sweep = ang + (1 - ease) * 1.1 - 0.25
      const dist = 4.2 + ease * 8.4
      const h = 1.35 + ease * (CAM_HEIGHT - 1.35)
      camFrom.current.set(
        bossPos.current.x + Math.sin(sweep) * dist,
        h,
        bossPos.current.z + Math.cos(sweep) * dist,
      )
      camLook.current.set(bossPos.current.x, 1.5 + (1 - ease) * 0.3, bossPos.current.z)
      if (!introSnapped.current) {
        introSnapped.current = true
        camera.position.copy(camFrom.current)
      }
      dir.frame(camLook.current, camFrom.current, dtRaw)
    } else if (dead) {
      // Death orbit — a slow victory-lap around the fallen boss, close
      // enough that the kill reads (QA: a wide orbit made the corpse a dot).
      const orbit = t * 0.5
      camFrom.current.set(
        bossPos.current.x + Math.cos(orbit) * 6.2,
        2.7,
        bossPos.current.z + Math.sin(orbit) * 6.2,
      )
      camLook.current.set(bossPos.current.x, 0.8, bossPos.current.z)
      dir.frame(camLook.current, camFrom.current, dtRaw)
    } else {
      // The camera sits behind the hero (opposite the boss) and to one side + up high,
      // so the hero never occludes the boss and the boss is always clearly framed.
      let tx = pos.current.x - tmpFwd.current.x * CAM_BACK + tmpRight.current.x * CAM_SIDE
      let tz = pos.current.z - tmpFwd.current.z * CAM_BACK + tmpRight.current.z * CAM_SIDE
      const camR = Math.hypot(tx, tz)
      const CAM_MAX_R = ARENA_R + 0.6
      if (camR > CAM_MAX_R) {
        tx *= CAM_MAX_R / camR
        tz *= CAM_MAX_R / camR
      }
      camFrom.current.set(tx, CAM_HEIGHT, tz)
      camLook.current.set(
        lookX,
        lookY * 0.5 + AIM_HEIGHT,
        lookZ,
      )
      dir.frame(camLook.current, camFrom.current, dtRaw)
    }

    // --- Player firing ---
    cooldown.current -= dt
    if (holdFire.current && !frozen && !intro) fireReq.current = true
    if (fireReq.current) {
      fireReq.current = false
      if (cooldown.current <= 0 && !frozen && !intro) {
        cooldown.current = BOLT_COOLDOWN
        // Aim: the boss by default. A targeted bracket sigil redirects the
        // volley; the cloaked Hider can't be aimed at (bolts sail center-ward).
        let aimTx = bossPos.current.x
        let aimTy = bossPos.current.y
        let aimTz = bossPos.current.z
        const shootNode = nodeTargetIdx.current
        if (shootNode >= 0 && bracket.current) {
          const n = bracket.current.nodes[shootNode]
          aimTx = n.x
          aimTy = 1.5
          aimTz = n.z
        } else if (hiderCloaked) {
          aimTx = 0
          aimTy = 1.3
          aimTz = 0
        }
        tmpDir.current
          .set(
            aimTx - pos.current.x,
            aimTy - 1.2,
            aimTz - pos.current.z,
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
          b.nodeIdx = shootNode
          b.pos.set(
            pos.current.x + tmpFwd.current.x * 0.7,
            1.2,
            pos.current.z + tmpFwd.current.z * 0.7,
          )
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
    }

    // Advance the authored three-bolt fan + hit test against boss armor.
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i]
      const m = boltRefs.current[i]
      if (!b.active) {
        if (m) m.visible = false
        continue
      }
      b.pos.addScaledVector(b.vel, dt)
      b.life -= dt
      // Bracket sigil bolts belong to the node they were aimed at.
      if (b.nodeIdx >= 0) {
        const bs = bracket.current
        const n = bs?.nodes[b.nodeIdx]
        if (bs && n && n.alive) {
          const nd = Math.hypot(b.pos.x - n.x, b.pos.y - 1.5, b.pos.z - n.z)
          if (nd < 1.4) {
            b.active = false
            if (m) m.visible = false
            if (sparks.current) sparks.current.burst(b.pos, MECH_HOT, 8)
            applyMechEvents(bracketShoot(bs, b.nodeIdx))
            continue
          }
        }
      } else {
        const hitD = Math.hypot(b.pos.x - bossPos.current.x, b.pos.y - bossPos.current.y, b.pos.z - bossPos.current.z)
        if (!dead && !hiderCloaked && hitD < BOSS_HIT_R) {
          b.active = false
          if (m) m.visible = false
          if (guardOpen.current) {
            onBossHit(b.damage * BOSS_BOLT_DAMAGE_SCALE)
            // Impact feedback: sparks fly off the armor + a whisper of shake.
            if (sparks.current) sparks.current.burst(b.pos, accent, 5)
            dir.shake(0.05)
          } else if (mechId === 'mirror' && mirror.current) {
            // The mirror throws your own shot back as a homing bite.
            applyMechEvents(
              mirrorReflect(mirror.current, bossPos.current.x, bossPos.current.z),
            )
            if (sparks.current) sparks.current.burst(b.pos, '#cfe0ff', 6)
          } else {
            // Guarded: shots ping off, with a periodic teaching reminder.
            if (sparks.current) sparks.current.burst(b.pos, '#9fb2c8', 3)
            if (immuneFlashCd.current <= 0) {
              immuneFlashCd.current = 2.4
              pushPrompt('ITS GUARD HOLDS — USE THE MECHANIC', true, 1.4)
            }
          }
          continue
        }
      }
      if (b.life <= 0) {
        b.active = false
        if (m) m.visible = false
        continue
      }
      if (m) {
        m.visible = true
        m.position.copy(b.pos)
      }
    }

    // --- Boss attacks (fan of orbs; more + faster at higher levels) ---
    // A boss with a broken guard is reeling — it can't also be shooting.
    if (!dead && !frozen && !intro && !guardOpen.current) {
      atkTimer.current -= dt
      // WINDUP TELEGRAPH (presentation only): the attack one-shot fires
      // ~0.45s before the orbs release, so the rig's swing/cast reads as a
      // telegraph and the volley leaves the hands mid-swing. Orb timing,
      // speed and damage are byte-identical to before.
      if (atkTimer.current <= 0.45 && !atkWound.current) {
        atkWound.current = true
        onBossAttack()
      }
      if (atkTimer.current <= 0) {
        atkTimer.current = attackEvery
        atkWound.current = false
        // Aim at the player, then spread a small fan when multiShot > 1.
        tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z).normalize()
        const baseAng = Math.atan2(tmpDir.current.x, tmpDir.current.z)
        for (let s = 0; s < multiShot; s++) {
          const o = orbs.find((x) => !x.active)
          if (!o) break
          const fan = (s - (multiShot - 1) / 2) * 0.16
          const ang = baseAng + fan
          o.active = true
          o.life = ORB_LIFE
          o.pos.set(bossPos.current.x, bossPos.current.y, bossPos.current.z)
          o.vel.set(Math.sin(ang) * orbSpeed, 0, Math.cos(ang) * orbSpeed)
        }
        // Muzzle flare at the release point so the volley visibly LEAVES the
        // boss — suppressed while the Hider is cloaked (a bright flare at its
        // true signal would hand players the answer; the orbs' origin alone
        // stays as the earnable advanced read).
        if (!hiderCloaked) {
          impactFx.current?.spawn(bossPos.current.x, bossPos.current.y, bossPos.current.z, orbColor, 1.1, 4)
        }
      }
    }

    // Telegraph ring: expands + brightens through the windup, snaps off when
    // the volley fires. Tracks the boss's feet.
    {
      const ring = teleRing.current
      const mat = teleMat.current
      if (ring && mat) {
        // The Hider's cloak also hides its windup ring — a telegraph parked
        // on the true signal would leak its position (QA).
        const winding = !dead && !frozen && !intro && atkWound.current && !hiderCloaked
        if (winding) {
          const p = THREE.MathUtils.clamp(1 - atkTimer.current / 0.45, 0, 1)
          ring.visible = true
          ring.position.set(bossPos.current.x, 0.09, bossPos.current.z)
          const s = 0.6 + p * 2.2
          ring.scale.set(s, s, s)
          // Pulse hard as it fills so the release moment is unmistakable.
          mat.opacity = 0.35 + 0.5 * p * (0.6 + 0.4 * Math.sin(t * 40))
        } else {
          ring.visible = false
        }
      }
    }

    // Advance orbs (slight homing) + hit test vs player. Visuals write through
    // the layered projectile renderer (hot core / halo / velocity trail).
    orbFx.current?.begin(camera.quaternion)
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]
      if (!o.active) {
        orbFx.current?.hide(i)
        continue
      }
      if (!frozen) {
        tmpDir.current.set(pos.current.x - o.pos.x, 1.1 - o.pos.y, pos.current.z - o.pos.z).normalize()
        o.vel.lerp(tmpDir.current.multiplyScalar(orbSpeed), 0.05)
      }
      o.pos.addScaledVector(o.vel, dt)
      o.life -= dt
      const d = Math.hypot(o.pos.x - pos.current.x, o.pos.y - 1.1, o.pos.z - pos.current.z)
      if (!frozen && invulnT.current <= 0 && d < PLAYER_HIT_R) {
        o.active = false
        orbFx.current?.hide(i)
        onPlayerHit()
        // Getting tagged HURTS: flash + burst at the impact + a real camera punch.
        impactFx.current?.spawn(o.pos.x, o.pos.y, o.pos.z, orbColor, 1.3, 8)
        if (sparks.current) {
          sparks.current.burst(tmpA.current.set(pos.current.x, 1.2, pos.current.z), '#ff5a4a', 12)
        }
        dir.punch(0.5)
        dir.shake(0.32)
        continue
      }
      if (o.life <= 0) {
        o.active = false
        orbFx.current?.hide(i)
        // Spent shots fizzle instead of blinking out.
        impactFx.current?.spawn(o.pos.x, o.pos.y, o.pos.z, orbColor, 0.5, 2)
        continue
      }
      orbFx.current?.set(i, o.pos, o.vel.x, o.vel.y, o.vel.z, t)
    }
    orbFx.current?.commit()

    // --- Bonus power blast: bright beam from hero to boss + shockwave ring ---
    const beam = beamRef.current
    const ring = ringRef.current
    if (blastT.current >= 0) {
      blastT.current += dt
      const p = Math.min(1, blastT.current / BLAST_DUR)
      const swell = Math.sin(p * Math.PI) // 0 → 1 → 0
      const from = tmpA.current.set(pos.current.x, 1.25, pos.current.z)
      const to = tmpB.current.set(bossPos.current.x, bossPos.current.y, bossPos.current.z)
      const mid = tmpC.current.copy(from).add(to).multiplyScalar(0.5)
      const dir = tmpD.current.copy(to).sub(from)
      const len = dir.length() || 0.001
      dir.normalize()
      if (beam) {
        beam.visible = p < 1
        beam.position.copy(mid)
        beam.quaternion.setFromUnitVectors(UP, dir)
        const rad = 0.1 + swell * 0.55
        beam.scale.set(rad, len / 2, rad)
        ;(beam.material as THREE.MeshBasicMaterial).opacity = 0.25 + swell * 0.75
      }
      if (ring) {
        ring.visible = p < 1
        ring.position.copy(to)
        ring.quaternion.copy(camera.quaternion)
        const s = 0.4 + p * 5.2
        ring.scale.set(s, s, s)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.95
      }
      if (p >= 1) {
        blastT.current = -1
        if (beam) beam.visible = false
        if (ring) ring.visible = false
      }
    }

    /* ---- QA autopilot hook (probe-only; the app never sets qaHooks) ----
       Publishes key/press/fire recommendations so the scripted probe bot can
       actually execute each boss's unique mechanic and finish fights. */
    if (qaHooks) {
      const rec = qaRec.current
      rec.open = guardOpen.current
      rec.fire = guardOpen.current
      rec.hold = false
      rec.keys.length = 0
      rec.press.length = 0
      let tX: number | null = null
      let tZ: number | null = null
      if (mechActive) {
        if (mechId === 'hider') {
          const s = hider.current!
          if (s.phase === 'cloak') {
            const real = hiderRealSignal(s)
            tX = real.x
            tZ = real.z
            if (
              s.pingCd <= 0 &&
              Math.hypot(pos.current.x - real.x, pos.current.z - real.z) <
                HIDER.pingRadius * 0.6
            ) {
              rec.press.push(' ')
            }
          }
        } else if (mechId === 'mirror') {
          const s = mirror.current!
          if (s.guard && s.zone) {
            tX = -s.zone.x
            tZ = -s.zone.z
          }
        } else if (mechId === 'twinkey') {
          const s = twin.current!
          if (s.phase === 'first') rec.press.push(s.firstSide === 'L' ? 'q' : 'e')
          else if (s.phase === 'second') rec.press.push(s.firstSide === 'L' ? 'e' : 'q')
        } else if (mechId === 'gatekeeper') {
          const s = gate.current!
          const distB = Math.hypot(
            pos.current.x - bossPos.current.x,
            pos.current.z - bossPos.current.z,
          )
          if (distB > GATE.passRange * 0.6) {
            tX = bossPos.current.x
            tZ = bossPos.current.z
          }
          if (
            s.phase === 'windup' &&
            gateFlashOn(s) &&
            distB <= GATE.passRange &&
            dashCd.current <= 0
          ) {
            rec.press.push(' ')
          }
        } else if (mechId === 'bracket') {
          const s = bracket.current!
          if (s.windowT <= 0) {
            // Route to the NEAREST currently-valid node (opener, or the
            // closer matching the stack top).
            const top = s.stack[s.stack.length - 1]
            const closer =
              top === '(' ? ')' : top === '[' ? ']' : top === '{' ? '}' : null
            let want = -1
            let wantD = Infinity
            for (let i = 0; i < s.nodes.length; i++) {
              const n = s.nodes[i]
              if (!n.alive) continue
              const valid = (closer && n.label === closer) || isOpener(n.label)
              if (!valid) continue
              const nd = Math.hypot(pos.current.x - n.x, pos.current.z - n.z)
              if (nd < wantD) {
                wantD = nd
                want = i
              }
            }
            if (want >= 0) {
              tX = s.nodes[want].x
              tZ = s.nodes[want].z
              rec.fire = nodeTargetIdx.current === want
            }
          }
        } else if (mechId === 'sphinx') {
          const s = sphinx.current!
          if (s.windowT <= 0) {
            const next = sphinxNextValue(s)
            const tile = s.tiles.find((q) => !q.done && q.value === next)
            if (tile) {
              // Anywhere ON the plate is a valid plant spot — stop there
              // instead of hunting the exact center (probe overshoot made
              // the old center-seek orbit forever).
              const don = Math.hypot(pos.current.x - tile.x, pos.current.z - tile.z)
              if (don <= SPHINX.tileRadius * 0.75) {
                rec.hold = true
              } else {
                tX = tile.x
                tZ = tile.z
              }
            }
          }
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
        // On target: tell the bot to PLANT (dwell mechanics need stillness).
        rec.hold = rec.hold || rec.keys.length === 0
      }
      ;(window as unknown as { __mechQA?: unknown }).__mechQA = rec
    }
  })

  return (
    <group>
      <ArenaFloor accent={accent} skyline={skyline} spec={spec} />
      {rain > 0 && <NightRain count={rain} />}
      <EmberField count={spec.embers.count} area={BOUND + 4} height={13} color={spec.embers.color} />

      <group ref={playerGroup}>
        <Avatar animRef={playerAnimRef} accent={accent} fireRef={fireRef} />
      </group>

      {/* Attack windup telegraph — hot ring under the boss, distinct from
          every stage accent so the incoming volley always reads. */}
      <mesh ref={teleRing} rotation-x={-Math.PI / 2} position={[0, 0.09, 0]} visible={false} renderOrder={3}>
        <ringGeometry args={[1.5, 2.0, 64]} />
        <meshBasicMaterial ref={teleMat} color="#ffd27a" transparent opacity={0} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>

      {/* ---------------- Kill-mechanic props (variant-specific) ---------------- */}
      {/* Hider: three signal beacons — one true, two decoys. */}
      {mechId === 'hider' &&
        Array.from({ length: HIDER.signals }).map((_, i) => (
          <group
            key={`sig${i}`}
            ref={(el) => {
              signalRefs.current[i] = el
            }}
            visible={false}
          >
            <mesh geometry={mechGeo.beamCone} position={[0, 3.5, 0]}>
              <meshBasicMaterial
                ref={(el) => {
                  signalMats.current[i] = el
                }}
                color={MECH_HOT}
                transparent
                opacity={0.3}
                toneMapped={false}
                fog={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh geometry={mechGeo.groundRing} rotation-x={-Math.PI / 2} position={[0, 0.07, 0]} scale={1.7} renderOrder={3}>
              <meshBasicMaterial color={MECH_HOT} transparent opacity={0.45} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}

      {/* Mirror Mimic: the shatter zone its reflection must be lured into.
          A vertical light column + hot rim so it reads from across the arena
          (QA: a flat disc at the boss's feet was nearly invisible far away). */}
      {mechId === 'mirror' && (
        <group ref={zoneRef} visible={false}>
          <mesh geometry={mechGeo.disk} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]} scale={MIRROR.zoneRadius} renderOrder={3}>
            <meshBasicMaterial ref={zoneDiskMat} color={MECH_DANGER} transparent opacity={0.28} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={mechGeo.groundRing} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} scale={MIRROR.zoneRadius} renderOrder={3}>
            <meshBasicMaterial ref={zoneFuseMat} color={MECH_DANGER} transparent opacity={0.85} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={mechGeo.beamCone} position={[0, 3.5, 0]}>
            <meshBasicMaterial
              ref={zoneBeamMat}
              color={MECH_DANGER}
              transparent
              opacity={0.3}
              toneMapped={false}
              fog={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}

      {/* Twin-Key Golem: the two keystone locks (Q left, E right). */}
      {mechId === 'twinkey' &&
        [0, 1].map((i) => (
          <group
            key={`lock${i}`}
            ref={(el) => {
              lockRefs.current[i] = el
            }}
            visible={false}
          >
            <mesh geometry={mechGeo.lock}>
              <meshBasicMaterial
                ref={(el) => {
                  lockCoreMats.current[i] = el
                }}
                color={MECH_HOT}
                transparent
                opacity={0.9}
                toneMapped={false}
                fog={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <sprite position={[0, 1.1, 0]} scale={[0.95, 0.95, 1]}>
              <spriteMaterial map={lockTexes[i]} transparent depthWrite={false} toneMapped={false} fog={false} />
            </sprite>
          </group>
        ))}
      {mechId === 'twinkey' && (
        <mesh ref={strikeBeamRef} geometry={mechGeo.beam} visible={false} renderOrder={6}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} fog={false} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Gatekeeper: the slam telegraph ring (gold windup → white flash). */}
      {mechId === 'gatekeeper' && (
        <mesh ref={gateRingRef} geometry={mechGeo.groundRing} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} visible={false} renderOrder={3}>
          <meshBasicMaterial ref={gateRingMat} color={MECH_HOT} transparent opacity={0.5} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Bracket Beast: six bracket sigils around the arena. */}
      {mechId === 'bracket' &&
        Array.from({ length: BRACKET.nodeCount }).map((_, i) => (
          <group
            key={`node${i}`}
            ref={(el) => {
              nodeRefs.current[i] = el
            }}
            visible={false}
          >
            <mesh geometry={mechGeo.groundRing} rotation-x={-Math.PI / 2} position={[0, 0.07, 0]} scale={BRACKET.standRadius} renderOrder={3}>
              <meshBasicMaterial
                ref={(el) => {
                  nodeRingMats.current[i] = el
                }}
                color={MECH_HOT}
                transparent
                opacity={0.35}
                toneMapped={false}
                fog={false}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <sprite position={[0, 1.7, 0]} scale={[1.7, 1.7, 1]}>
              <spriteMaterial
                ref={(el) => {
                  nodeSpriteMats.current[i] = el
                }}
                transparent
                depthWrite={false}
                toneMapped={false}
                fog={false}
              />
            </sprite>
          </group>
        ))}

      {/* Sorted Sphinx: five numbered step-plates. */}
      {mechId === 'sphinx' &&
        Array.from({ length: SPHINX.tileCount }).map((_, i) => (
          <group
            key={`tile${i}`}
            ref={(el) => {
              tileRefs.current[i] = el
            }}
            visible={false}
          >
            <mesh geometry={mechGeo.disk} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} scale={SPHINX.tileRadius} renderOrder={3}>
              <meshBasicMaterial
                ref={(el) => {
                  tileDiskMats.current[i] = el
                }}
                color={MECH_HOT}
                transparent
                opacity={0.2}
                toneMapped={false}
                fog={false}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh geometry={mechGeo.groundRing} rotation-x={-Math.PI / 2} position={[0, 0.07, 0]} scale={SPHINX.tileRadius} renderOrder={3}>
              <meshBasicMaterial color={MECH_HOT} transparent opacity={0.5} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            <sprite position={[0, 1.5, 0]} scale={[1.6, 1.6, 1]}>
              <spriteMaterial
                ref={(el) => {
                  tileSpriteMats.current[i] = el
                }}
                transparent
                depthWrite={false}
                toneMapped={false}
                fog={false}
              />
            </sprite>
          </group>
        ))}

      {/* Guard shell — reads "immune" at a glance on every boss. */}
      <mesh ref={shieldRef} geometry={mechGeo.shield} visible={false} renderOrder={2}>
        <meshBasicMaterial
          ref={shieldMat}
          color={accent}
          transparent
          opacity={0.06}
          toneMapped={false}
          fog={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      <group ref={bossGroup} scale={BOSS_SCALE}>
        <VillainSwitch
          accent={accent}
          variant={variant}
          animRef={bossAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
          readyRef={bossReadyRef}
          dead={dead}
        />
      </group>

      {/* Impact VFX (pooled, ref-driven). */}
      <SparkBurst ref={sparks} pool={120} />
      <ShockwaveRing ref={shockFx} pool={4} />

      {bolts.map((_, i) => (
        <mesh
          key={`b${i}`}
          ref={(el) => {
            boltRefs.current[i] = el
          }}
          visible={false}
          geometry={boltGeo}
          material={boltMat}
        />
      ))}

      {/* Boss orbs — layered instanced projectile visuals + impact flashes. */}
      <EnemyProjectiles ref={orbFx} pool={ORB_POOL} color={orbColor} size={0.34} />
      <ImpactFlashes ref={impactFx} pool={10} />

      {/* Bonus power blast — beam + shockwave (driven imperatively in useFrame) */}
      <mesh ref={beamRef} visible={false} renderOrder={6}>
        <cylinderGeometry args={[1, 1, 2, 14, 1, true]} />
        <meshBasicMaterial
          color="#ffffff"
          toneMapped={false}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>
      <mesh ref={ringRef} visible={false} renderOrder={6}>
        <ringGeometry args={[0.62, 1, 44]} />
        <meshBasicMaterial
          color={accent}
          toneMapped={false}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>
    </group>
  )
})

/* ------------------------------------------------------------- Component */

export function BossArena({
  accent,
  variant,
  combatScale = 1,
  bossName,
  bonusQuestion,
  initialHp,
  onHpChange,
  onWin,
  onLose,
  onFlee,
  qaGodMode = false,
  qaHooks = false,
}: {
  accent: string
  variant: number
  combatScale?: number
  bossName: string
  bonusQuestion?: BonusQuestion | null
  /** Starting hearts (defaults to full) — Boss Rush carries hearts between fights. */
  initialHp?: number
  /** Reports every hearts change so a rush can persist HP across arenas. */
  onHpChange?: (hp: number) => void
  onWin: () => void
  onLose: () => void
  onFlee?: () => void
  /** QA capture instrumentation ONLY (default off, never passed by the app):
   *  the player ignores incoming damage so an automated review bot survives
   *  to exercise the boss's full animation set (entrance → telegraphs →
   *  hit reacts → death). Changes NO boss HP/damage/combat numbers. */
  qaGodMode?: boolean
  /** QA probe instrumentation ONLY: publishes per-frame mechanic autopilot
   *  recommendations on window.__mechQA so the scripted bot can execute the
   *  kill mechanic. Zero gameplay impact; the app never sets it. */
  qaHooks?: boolean
}): JSX.Element {
  // The realm's stage identity (palette, lighting, floor, dressing theme).
  const stage = realmStage(variant)

  // Meshy set dressing rides the unified graphics profile (MEDIUM+); one
  // read per mount, same as the dojo interior. The same read scales the
  // night-city extras (skyline instances, rain density), then the stage
  // spec themes them (denser glass for the atrium, dry air in the quarry…).
  const { meshyDressing, skyline, rain } = useMemo(() => {
    const tier = resolveQualityProfile().tier
    const med = meetsTier(tier, 'medium')
    const high = meetsTier(tier, 'high')
    const skylineBase = high ? 84 : med ? 60 : 36
    const rainBase = high ? 700 : med ? 420 : 200
    return {
      meshyDressing: med,
      skyline: Math.round(skylineBase * stage.skyline.countMul),
      rain: Math.round(rainBase * stage.rainMul),
    }
  }, [stage])

  // Entrance staging: an opaque curtain covers the mount (and the villain
  // GLB load); the scene lifts it via onCurtainUp, which also starts the
  // title-card clock. Presentation only.
  const bossReadyRef = useRef(0)
  const [curtain, setCurtain] = useState(true)
  const [introBanner, setIntroBanner] = useState(true)
  const onCurtainUp = useCallback(() => setCurtain(false), [])
  useEffect(() => {
    if (curtain) return
    const id = window.setTimeout(() => setIntroBanner(false), 2900)
    return () => window.clearTimeout(id)
  }, [curtain])

  // Difficulty: the guard mechanic gates all damage, so HP is sized to demand
  // ~3–4 clean mechanic cycles (MECH_HP) rather than raw DPS-race numbers.
  const tunedScale = Math.max(0.9, Math.min(1.1, combatScale))
  const mechId = mechanicForVariant(variant)
  const mechSpec = MECH_SPECS[mechId]
  const bossHpMax = Math.round(
    (MECH_HP[variant % MECH_HP.length] ?? BOSS_HP_BASE + variant * BOSS_HP_PER_LEVEL) *
      tunedScale,
  )
  const attackEvery =
    Math.max(0.95, 1.7 - variant * 0.1) / tunedScale
  const orbSpeed = (11 + variant * 0.8) * tunedScale
  const bossMoveMul = (1.05 + variant * 0.05) * tunedScale
  const multiShot = variant < 2 ? 1 : variant < 4 ? 2 : 3

  const [playerHp, setPlayerHp] = useState(() =>
    Math.round(Math.min(PLAYER_HP, Math.max(1, initialHp ?? PLAYER_HP))),
  )
  const [bossHp, setBossHp] = useState(bossHpMax)
  const [hitCount, setHitCount] = useState(0)
  const [dead, setDead] = useState(false)
  const [hurt, setHurt] = useState(0)
  const endedRef = useRef(false)

  // Report hearts through a ref so a changing callback identity never refires.
  const onHpChangeRef = useRef(onHpChange)
  onHpChangeRef.current = onHpChange
  useEffect(() => {
    onHpChangeRef.current?.(playerHp)
  }, [playerHp])

  // Boss hit/attack reactions are driven through refs so a landed bolt updates
  // the 3D boss WITHOUT re-rendering the arena scene every shot.
  const hitRef = useRef(0)
  const attackRef = useRef(0)

  // Mid-fight bonus strike: pauses the fight at half HP for one lesson question.
  const [bonusPhase, setBonusPhase] = useState<'pending' | 'active' | 'done'>(
    bonusQuestion ? 'pending' : 'done',
  )
  const [bonusPicked, setBonusPicked] = useState<number | null>(null)
  const [bonusResult, setBonusResult] = useState<'correct' | 'wrong' | null>(null)
  const [blastCount, setBlastCount] = useState(0)
  const [blastFlash, setBlastFlash] = useState(false)
  const [hurtBoss, setHurtBoss] = useState(false)

  const onBossHit = useCallback((amount: number) => {
    hitRef.current += 1
    setHitCount((c) => c + 1)
    setBossHp((hp) => Math.max(0, hp - amount))
  }, [])
  const onPlayerHit = useCallback(() => {
    setHurt((h) => h + 1)
    // QA capture only: keep the review bot alive to exercise the full boss
    // animation set. Real gameplay never sets this, so damage is unchanged.
    if (!qaGodMode) setPlayerHp((hp) => Math.max(0, hp - 1))
  }, [qaGodMode])
  const onBossAttack = useCallback(() => {
    attackRef.current += 1
  }, [])
  // Failed mechanics let the boss regenerate — capped at full, never reviving.
  const onBossHeal = useCallback(
    (amount: number) => {
      setBossHp((hp) => (hp <= 0 ? hp : Math.min(bossHpMax, hp + amount)))
    },
    [bossHpMax],
  )

  // Live mechanic prompt (top-center, like the Architect's telegraph line).
  const [mechPrompt, setMechPrompt] = useState<{ label: string; danger: boolean } | null>(null)
  const onMechPrompt = useCallback((label: string | null, danger = false) => {
    setMechPrompt(label ? { label, danger } : null)
  }, [])

  // Mechanic teaching card: shows right after the title banner drops, long
  // enough to read twice — every control is explained before it's needed.
  const [mechCard, setMechCard] = useState(false)
  useEffect(() => {
    if (curtain || introBanner) return
    setMechCard(true)
    const id = window.setTimeout(() => setMechCard(false), 7000)
    return () => window.clearTimeout(id)
  }, [curtain, introBanner])

  useEffect(() => {
    if (bossHp <= 0 && !dead) setDead(true)
  }, [bossHp, dead])

  // Pulse the boss HP bar briefly each time we land a hit.
  useEffect(() => {
    if (hitCount === 0) return
    setHurtBoss(true)
    const id = window.setTimeout(() => setHurtBoss(false), 150)
    return () => window.clearTimeout(id)
  }, [hitCount])

  // Pop the bonus question once the boss is worn down to half health.
  useEffect(() => {
    if (bonusPhase !== 'pending' || !bonusQuestion || dead) return
    if (bossHp > 0 && bossHp <= bossHpMax / 2) setBonusPhase('active')
  }, [bossHp, bossHpMax, bonusPhase, bonusQuestion, dead])

  function answerBonus(i: number) {
    if (bonusPhase !== 'active' || bonusResult || !bonusQuestion) return
    setBonusPicked(i)
    const correct = i === bonusQuestion.answerIndex
    setBonusResult(correct ? 'correct' : 'wrong')
    if (correct) {
      // Let the player read the "Critical hit!" state, then DISMISS the card
      // (and its blurred overlay) FIRST — only after it's gone do we fire the
      // beam, so the hit on the boss is smooth and clearly visible, not buried
      // under the UI where it stutters.
      window.setTimeout(() => {
        setBonusPhase('done')
        setBonusResult(null)
        setBonusPicked(null)
        setBlastCount((c) => c + 1)
        setBlastFlash(true)
        window.setTimeout(() => setBlastFlash(false), 500)
        // Land the damage + boss recoil right as the beam connects.
        const dmg = Math.max(1, Math.ceil(bossHpMax * 0.3))
        window.setTimeout(() => {
          hitRef.current += 1
          setHitCount((c) => c + 1)
          setBossHp((hp) => Math.max(0, hp - dmg))
        }, 430)
      }, 750)
    } else {
      window.setTimeout(() => {
        setBonusPhase('done')
        setBonusResult(null)
        setBonusPicked(null)
      }, 1500)
    }
  }

  useEffect(() => {
    if (!dead || endedRef.current) return
    endedRef.current = true
    const id = window.setTimeout(onWin, 1500)
    return () => window.clearTimeout(id)
  }, [dead, onWin])

  useEffect(() => {
    if (playerHp > 0 || endedRef.current) return
    endedRef.current = true
    const id = window.setTimeout(onLose, 800)
    return () => window.clearTimeout(id)
  }, [playerHp, onLose])

  // Auto-fade the hurt flash.
  const [flashOn, setFlashOn] = useState(false)
  useEffect(() => {
    if (hurt === 0) return
    setFlashOn(true)
    const id = window.setTimeout(() => setFlashOn(false), 200)
    return () => window.clearTimeout(id)
  }, [hurt])

  const frozen = playerHp <= 0 || dead || bonusPhase === 'active'
  const bossPct = Math.max(0, Math.round((bossHp / bossHpMax) * 100))

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        dpr={[1, 1.7]}
        // antialias:false — the EffectComposer renders to offscreen targets and
        // the SMAA pass below does the edge AA, so a multisampled default
        // framebuffer would only cost memory/bandwidth for no visible benefit.
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        camera={{ position: [CAM_SIDE, CAM_HEIGHT, 12 + CAM_BACK], fov: 58, near: 0.1, far: 140 }}
      >
        <color attach="background" args={[stage.bg]} />
        <fog attach="fog" args={stage.fog} />
        {/* Ticks the shared simulation clock for the pulse floor + rim shaders.
            No nightRef: arenas always read as "inside the program", day state. */}
        <SimulationDriver />
        {/* Themed night-city IBL (one-time bake, frames=1): key wash, cool
            rim and horizon neon bands come from the realm's stage spec so
            floors and armor reflect THIS arena's mood, not a generic one. */}
        <Environment frames={1} resolution={128}>
          <Lightformer form="rect" intensity={0.5} color="#141b33" scale={[40, 40, 1]} position={[0, 0, -16]} />
          <Lightformer form="rect" intensity={3.6 * stage.formerBoost} color={stage.formers.key} scale={[11, 8, 1]} position={[8, 12, -7]} target={[0, 1, 0]} />
          <Lightformer form="rect" intensity={2.6 * stage.formerBoost} color={stage.formers.rim} scale={[12, 6, 1]} position={[-9, 6, 9]} target={[0, 1, 0]} />
          {/* Horizon neon bands — the city's glow reflected in the ground. */}
          <Lightformer form="rect" intensity={1.7 * stage.formerBoost} color={stage.formers.horizonA} scale={[46, 2.2, 1]} position={[0, 2.2, 20]} target={[0, 1, 0]} />
          <Lightformer form="rect" intensity={1.2 * stage.formerBoost} color={stage.formers.horizonB} scale={[30, 1.6, 1]} position={[-18, 3, -14]} target={[0, 1, 0]} />
          <Lightformer form="ring" intensity={0.8 * stage.formerBoost} color="#c9d6ff" scale={7} position={[0, 15, 0]} target={[0, 0, 0]} />
        </Environment>
        <hemisphereLight args={stage.hemi} />
        <ambientLight intensity={stage.ambient} />
        {/* Themed key light. The shadow camera is explicitly sized to the
            play area so shadows stay crisp with no dead patch. */}
        <directionalLight
          position={[9, 19, 7]}
          intensity={stage.key.intensity}
          color={stage.key.color}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-radius={4}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
          shadow-camera-near={2}
          shadow-camera-far={60}
          shadow-camera-left={-24}
          shadow-camera-right={24}
          shadow-camera-top={24}
          shadow-camera-bottom={-24}
        />
        {/* Cool fill so silhouettes separate from the dark ground. */}
        <directionalLight position={[-10, 14, -8]} intensity={stage.fill.intensity} color={stage.fill.color} />
        {/* Accent uplight at the arena rim — neon bounce off the plaza. */}
        <pointLight position={[0, 3, -14]} color={accent} intensity={2.2} distance={30} decay={1.8} />
        <ArenaScene
          accent={accent}
          variant={variant}
          dead={dead}
          frozen={frozen}
          playerDefeated={playerHp <= 0}
          skyline={skyline}
          rain={rain}
          spec={stage}
          hitRef={hitRef}
          bossReadyRef={bossReadyRef}
          onCurtainUp={onCurtainUp}
          attackRef={attackRef}
          attackEvery={attackEvery}
          orbSpeed={orbSpeed}
          bossMoveMul={bossMoveMul}
          multiShot={multiShot}
          blastCount={blastCount}
          onBossHit={onBossHit}
          onBossHeal={onBossHeal}
          onPlayerHit={onPlayerHit}
          onBossAttack={onBossAttack}
          onMechPrompt={onMechPrompt}
          qaHooks={qaHooks}
        />
        {/* Themed realm set dressing (visual only; everything ≥ ~25m from
            center, past the play boundary + barrier ring). */}
        {meshyDressing && (
          <Suspense fallback={null}>
            <RealmStageDressing variant={variant} accent={accent} />
          </Suspense>
        )}

        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.5} luminanceThreshold={0.86} luminanceSmoothing={0.16} />
          <Vignette eskil={false} offset={0.28} darkness={0.5} />
          <SMAA />
        </EffectComposer>
      </Canvas>

      {/* Entrance curtain — covers the mount + villain GLB load so the hero
          shot never frames a half-loaded stand-in. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: curtain ? 1 : 0,
          transition: 'opacity 0.5s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Entrance beat: cinematic letterbox + boss title card (lower third —
          the boss owns the center of the frame). */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: introBanner ? '9%' : 0,
          background: '#000',
          transition: 'height 0.6s ease',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: introBanner ? '9%' : 0,
          background: '#000',
          transition: 'height 0.6s ease',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '68%',
          left: 0,
          right: 0,
          textAlign: 'center',
          pointerEvents: 'none',
          opacity: introBanner && !curtain ? 1 : 0,
          transform: introBanner && !curtain ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <div style={{ color: accent, fontWeight: 800, fontSize: 13, letterSpacing: 6, textTransform: 'uppercase', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
          Boss Fight
        </div>
        <div
          style={{
            color: '#fff',
            fontWeight: 900,
            fontSize: 40,
            letterSpacing: 3,
            textTransform: 'uppercase',
            textShadow: `0 0 26px ${accent}aa, 0 3px 16px rgba(0,0,0,0.95)`,
            lineHeight: 1.1,
          }}
        >
          {bossName}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase' }}>
          {stage.title}
        </div>
      </div>

      {/* Hurt flash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(120% 90% at 50% 50%, transparent 40%, rgba(255,40,50,0.55) 100%)',
          opacity: flashOn ? 1 : 0,
          transition: 'opacity 0.18s ease',
        }}
      />

      {/* Power-blast flash (correct bonus answer) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(120% 90% at 50% 45%, ${accent}cc 0%, transparent 60%)`,
          opacity: blastFlash ? 1 : 0,
          transition: blastFlash ? 'opacity 0.06s ease' : 'opacity 0.5s ease',
          mixBlendMode: 'screen',
        }}
      />

      {/* Boss HP */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 86%)', textAlign: 'center', pointerEvents: 'none', opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <span style={{ color: '#fff', fontWeight: 800, letterSpacing: 0.5, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
            {bossName}
          </span>
          <span style={{ color: accent, fontWeight: 800, fontSize: 14, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>
            {Math.ceil(bossHp)} / {bossHpMax} HP
          </span>
        </div>
        {/* Kill payoff stamp — the win reads instantly, even before the
            victory screen takes over. */}
        {dead && (
          <div style={{ position: 'absolute', top: 44, left: 0, right: 0, textAlign: 'center', color: '#8dffb0', fontWeight: 900, fontSize: 30, letterSpacing: 5, textTransform: 'uppercase', textShadow: '0 0 22px rgba(141,255,176,0.7), 0 3px 14px rgba(0,0,0,0.95)' }}>
            Defeated
          </div>
        )}
        <div style={{ height: 16, borderRadius: 9, background: 'rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', boxShadow: hurtBoss ? `0 0 16px ${accent}` : 'none', transition: 'box-shadow 0.18s ease' }}>
          <div style={{ height: '100%', width: `${bossPct}%`, background: accent, transition: 'width 0.18s ease' }} />
        </div>
      </div>

      {/* Player HP */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, pointerEvents: 'none', opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 6, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>You</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {Array.from({ length: PLAYER_HP }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: i < playerHp ? '#ff5a6a' : 'rgba(255,255,255,0.18)',
                boxShadow: i < playerHp ? '0 0 8px rgba(255,90,106,0.7)' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Controls hint — this boss's OWN control scheme */}
      <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,0.7)', pointerEvents: 'none', whiteSpace: 'nowrap', opacity: introBanner ? 0 : 1, transition: 'opacity 0.4s ease' }}>
        {mechSpec.controls}
      </div>

      {/* Mechanic teaching card — how THIS boss dies, before it matters. */}
      <div
        style={{
          position: 'absolute',
          top: '14%',
          left: '50%',
          transform: mechCard ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-10px)',
          width: 'min(620px, 90%)',
          textAlign: 'center',
          pointerEvents: 'none',
          opacity: mechCard ? 1 : 0,
          transition: 'opacity 0.45s ease, transform 0.45s ease',
          background: 'rgba(4,6,12,0.72)',
          border: `2px solid ${accent}55`,
          borderRadius: 14,
          padding: '14px 18px',
          boxShadow: `0 0 30px ${accent}33, 0 8px 24px rgba(0,0,0,0.5)`,
        }}
      >
        <div style={{ color: MECH_HOT, fontWeight: 900, fontSize: 20, letterSpacing: 4, textTransform: 'uppercase', textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
          {mechSpec.title}
        </div>
        {mechSpec.lines.map((line, i) => (
          <div key={i} style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 600, fontSize: 14.5, marginTop: 6, lineHeight: 1.35 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Live mechanic prompt — the fight teaches as it goes. */}
      {mechPrompt && !mechCard && !introBanner && (
        <div
          key={mechPrompt.label}
          style={{
            position: 'absolute',
            top: '17%',
            left: '50%',
            transform: 'translateX(-50%)',
            color: mechPrompt.danger ? MECH_DANGER : '#fff',
            fontWeight: 900,
            fontSize: mechPrompt.danger ? 24 : 19,
            letterSpacing: 1,
            textShadow: '0 2px 14px rgba(0,0,0,0.95)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {mechPrompt.label}
        </div>
      )}

      {/* Center dot */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />

      {onFlee && (
        <button
          onClick={onFlee}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            padding: '8px 14px',
            borderRadius: 10,
            border: '2px solid rgba(255,255,255,0.3)',
            background: 'rgba(0,0,0,0.4)',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Flee
        </button>
      )}

      {/* Bonus strike question */}
      {bonusPhase === 'active' && bonusQuestion && (
        <div className="bonus-overlay">
          <div
            className={`bonus-card ${bonusResult ?? ''}`}
            style={{ ['--accent' as string]: accent }}
          >
            <span className="bonus-tag">★ Bonus Strike</span>
            <p className="bonus-prompt">{bonusQuestion.prompt}</p>
            <div className="bonus-choices">
              {bonusQuestion.choices.map((c, i) => {
                const isAnswer = i === bonusQuestion.answerIndex
                const picked = bonusPicked === i
                let cls = 'bonus-choice'
                if (bonusResult) {
                  if (isAnswer) cls += ' is-correct'
                  else if (picked) cls += ' is-wrong'
                }
                return (
                  <button
                    key={i}
                    className={cls}
                    disabled={!!bonusResult}
                    onClick={() => answerBonus(i)}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
            <p className="bonus-hint">
              {bonusResult === 'correct'
                ? 'Critical hit! −30% boss HP!'
                : bonusResult === 'wrong'
                  ? 'Missed — no bonus damage. Back to the fight!'
                  : 'Answer correctly to blast 30% off the boss!'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
