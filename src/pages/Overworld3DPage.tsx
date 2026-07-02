import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Scanline,
  Noise,
  SMAA,
} from '@react-three/postprocessing'
import * as THREE from 'three'
import { AppHeader } from '../components/AppHeader'
import { PowerUnlock } from '../components/game/PowerUnlock'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useGauntlet } from '../context/GauntletContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { KILL_XP, answerXp } from '../lib/playerLevel'
import { grantBossEntry, grantLessonEntry } from '../lib/gameAccess'
import { prefetchBossBattle } from '../lib/prefetchBattle'
import {
  BOSS_DONE_KEY,
  clearQuestRun,
  COMBAT_SNAP_KEY,
  INTRO_KEY,
  LEVEL_WELCOME_KEY,
  PART_DONE_KEY,
  POS_KEY,
  SKIP_SPAWN_KEY,
  spawnAtLevel,
  TOUR_KEY,
} from '../lib/questSession'
import {
  CHECKPOINTS_PER_LEVEL,
  checkpointNumber,
  levelNumber,
  questPositionLabel,
} from '../lib/questLabels'
import { startMusic, stopMusic } from '../lib/themeMusic'
import { LESSON_CATALOG } from '../content/catalog'
import { WORLDS, WORLD_COUNT, type World } from '../content/adventure'
import { getWorldState } from '../lib/questState'
import {
  combatAdjustForBand,
  hordeTierAtPosition,
  questHordeTier,
} from '../lib/hordeTier'
import { targetConcept, weakestBand } from '../lib/learnerModel'
import { getMicroQuestion, type MicroQuestion } from '../content/microQuestions'
import type { ConceptId } from '../types/lesson'
import type { LessonSummary } from '../types/lesson'
import {
  Ground,
  Roads,
  InstancedWorld,
  CheckpointPortal,
  GateBuilding,
  BossTotem,
  LandmarkMesh,
  FloorPath,
} from '../components/game3d/Primitives3D'
import {
  ThirdPersonController,
  type Target,
  type DashState,
  type TouchMoveState,
} from '../components/game3d/ThirdPersonController'
import { CombatSystem, type CombatApi, GUNS } from '../components/game3d/CombatSystem'
import { SimulationDriver } from '../components/game3d/SimulationDriver'
import { SimulationSky, SkyEnvironment } from '../components/game3d/SimulationSky'
import { SIM, SUN_DIR } from '../components/game3d/simulation'
import type { QualityTier } from '../components/game3d/cinematic/quality'
import { playHeartbeat, playHeartPickup, playPlayerHurt } from '../lib/soundFx'
import {
  CHECKPOINTS_3D,
  START_3D,
  GROUND_HALF,
  LANDMARKS,
  WORLD_GATES,
  GATES_PER_WORLD,
  questDoor,
  type Vec2,
} from '../components/game3d/layout'
import { IconBolt, IconGrid, IconCompass } from '../components/icons'
import './Overworld3DPage.css'

const LANDMARK_GLYPH: Record<string, string> = {
  windmill: 'W',
  lighthouse: 'L',
  spire: 'S',
  arch: 'A',
  tower: 'T',
  mountain: 'M',
}

const SUMMARY_BY_ID: Record<string, LessonSummary> = Object.fromEntries(
  LESSON_CATALOG.map((l) => [l.id, l]),
)

// Safe houses: the spawn plaza + every checkpoint gate along the route. During
// the night these glow and become the player's shelter from the fast horde.
const SHELTERS: Vec2[] = [
  { x: START_3D.x, z: START_3D.z },
  ...WORLD_GATES.flat().map((g) => ({ x: g.x, z: g.z })),
]

// stage 0..GATES_PER_WORLD-1 = a lesson-part gate; stage === GATES_PER_WORLD = boss.
type TourSave = { world: number; stage: number }

const BOSS_STAGE = GATES_PER_WORLD
/** The gun starts solid (a punchy mid-tier blaster — never the awful tier-0/1
 * slinger) and upgrades toward the top-tier cannon as the player progresses Code
 * City, so the shooting visibly grows over a playthrough without ever feeling weak. */
// Start weak on purpose — you must LOOT chests to build a real arsenal (Fortnite).
const MIN_GUN_LEVEL = 1

/** How long a collected weapon crate overcharges the gun to the top tier. */
const OVERCHARGE_MS = 18000

/**
 * Hold-out siege: each checkpoint is a survival gauntlet. You must survive this
 * many seconds of escalating waves before the gate UNLOCKS and you can enter.
 * Combined with the walk-in, a checkpoint takes roughly a couple of minutes.
 * Level 1 is a gentle onboarding ramp (short holds) before the full siege.
 */
const LEG_HOLD_SECONDS = 95
const FIRST_LEVEL_HOLD_SECONDS = 30
const EARLY_LEVEL_HOLD_SECONDS = 60

/**
 * Seconds you must hold out at a checkpoint, by level index (0-based). A gentle
 * ramp: Level 1 onboards at 30s, Levels 2–4 sit at 60s, and the full siege
 * (95s) kicks in from Level 5 onward.
 */
function legHoldSecondsFor(world: number): number {
  if (world === 0) return FIRST_LEVEL_HOLD_SECONDS
  if (world < 4) return EARLY_LEVEL_HOLD_SECONDS // Levels 2–4
  return LEG_HOLD_SECONDS // Level 5+
}

/** Day/night cycle: seconds of daylight, then a survival night. */
const DAY_LENGTH = 32
const NIGHT_LENGTH = 18
/** Safe-house radius (kept in sync with CombatSystem's SHELTER_R). */
const SHELTER_R = 6.5

/** Combo timing + score: chained kills within the window stack a multiplier that
 *  boosts XP, rewarding aggressive, continuous fighting over passive kiting. */
const COMBO_WINDOW_MS = 2600
function comboMultiplier(combo: number): number {
  if (combo >= 25) return 3
  if (combo >= 12) return 2
  if (combo >= 5) return 1.5
  return 1
}

/** Where the player begins the given leg (previous objective door). */
function legOrigin(world: number, stage: number, atBoss: boolean): Vec2 {
  if (atBoss) return WORLD_GATES[world][GATES_PER_WORLD - 1]
  if (stage === 0) {
    if (world === 0) return START_3D
    // Skip / placement spawns at the end of the previous level's last checkpoint;
    // after a boss clear the hero stands at the previous boss door instead.
    try {
      if (sessionStorage.getItem(SKIP_SPAWN_KEY)) {
        return questDoor(WORLD_GATES[world - 1][GATES_PER_WORLD - 1], 6.5)
      }
    } catch {
      /* ignore */
    }
    return questDoor(CHECKPOINTS_3D[world - 1].boss, 6.5)
  }
  return WORLD_GATES[world][stage - 1]
}

type Milestone = { title: string; body: string }

function isReturningSession(): boolean {
  try {
    return !!(sessionStorage.getItem(TOUR_KEY) || sessionStorage.getItem(POS_KEY))
  } catch {
    return false
  }
}

function introAlreadySeen(): boolean {
  try {
    return !!sessionStorage.getItem(INTRO_KEY)
  } catch {
    return false
  }
}

function loadTour(): TourSave {
  try {
    const raw = sessionStorage.getItem(TOUR_KEY)
    if (raw) {
      const v = JSON.parse(raw) as TourSave
      if (typeof v.world === 'number' && typeof v.stage === 'number') return v
    }
  } catch {
    /* ignore */
  }
  return { world: 0, stage: 0 }
}

type PosSave = { x: number; z: number; h: number }

function loadPos(): PosSave | null {
  try {
    const raw = sessionStorage.getItem(POS_KEY)
    if (raw) {
      const v = JSON.parse(raw) as PosSave
      if (typeof v.x === 'number' && typeof v.z === 'number') return v
    }
  } catch {
    /* ignore */
  }
  return null
}

function aheadOfTourLabel(tourWorld: number, worldIndex: number): string {
  if (worldIndex > tourWorld) {
    return `Finish Level ${levelNumber(tourWorld)} first!`
  }
  return 'Reach this level&rsquo;s current checkpoint first.'
}

/**
 * Sky radius — kept just inside the camera far plane. The dome rides with the
 * camera (a classic skybox) so it always wraps the view no matter where on the
 * map the hero stands. That lets the far plane shrink from 3200 to CAMERA_FAR,
 * which frustum-culls everything past the fog wall instead of rasterising
 * hundreds of fully-fogged buildings down every avenue.
 */
const SKY_RADIUS = 470
const CAMERA_FAR = 520

/**
 * M5/M7 — tiered post stack for the overworld, memoized exactly like
 * CinematicStage: the pass list identity only changes when the tier does, so
 * the frequent HUD re-renders never rebuild the effect chain (a per-hit GPU
 * stall). Bloom is tuned to the Living Simulation emissive palette. HIGH is
 * the full look: bloom, a whisper of radial chromatic aberration (pulsed by
 * the shared shake channel), CRT scanlines, subtle filmic grain, and SMAA to
 * hold the micro-detail together under the dpr clamp. (Heavy full-screen SSAO
 * is intentionally NOT run here — see the note in the pass list below.)
 * MED keeps bloom + vignette; LOW runs bloom only.
 */
const OverworldEffects = memo(function OverworldEffects({
  tier,
  shakeRef,
}: {
  tier: QualityTier
  shakeRef: React.MutableRefObject<number>
}) {
  // Stable vector mutated in place — the effect uniform sees it by reference.
  const caOffset = useMemo(() => new THREE.Vector2(0.0005, 0.0005), [])
  const high = tier === 'high'
  useFrame(() => {
    if (!high) return
    const kickAmt = Math.min(0.6, shakeRef.current)
    const o = 0.0005 + kickAmt * 0.0045
    caOffset.set(o, o)
  })

  const passes = useMemo(() => {
    const out: JSX.Element[] = []
    // NOTE: N8AO (a full-screen SSAO over the entire open world) was the
    // heaviest single pass and could trip a WebGL context loss on integrated /
    // retina GPUs — the open city reads fine grounded by the sun shadow + fog
    // without it. Ambient occlusion stays in the tighter cinematic arenas where
    // the scene is small and the camera is authored, so it's affordable there.
    out.push(
      <Bloom
        key="bloom"
        mipmapBlur
        intensity={tier === 'low' ? 0.5 : 0.9}
        luminanceThreshold={0.68}
        luminanceSmoothing={0.24}
      />,
    )
    if (tier !== 'low') {
      out.push(<Vignette key="vig" eskil={false} offset={0.22} darkness={0.58} />)
    }
    if (high) {
      out.push(
        <ChromaticAberration
          key="ca"
          offset={caOffset}
          radialModulation
          modulationOffset={0.42}
        />,
      )
      out.push(<Scanline key="scan" density={1.15} opacity={0.05} />)
      out.push(<Noise key="grain" opacity={0.045} />)
      out.push(<SMAA key="smaa" />)
    }
    return out
  }, [tier, high, caOffset])

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {passes}
    </EffectComposer>
  )
})

// Sun color across the corruption blend: warm daylight → cold moonlight.
const SUN_DAY = new THREE.Color('#ffe6b8')
const SUN_NIGHT = new THREE.Color('#8fa5e8')
// The light rides the SAME sun direction as the sky's disc + the baked env
// map, so shadows, sky and reflections always agree on where the sun is.
const SUN_DIST = 62

function FollowLight({ playerPosRef }: { playerPosRef: React.MutableRefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    const p = playerPosRef.current
    const l = light.current
    if (l) {
      l.position.set(
        p.x + SUN_DIR.x * SUN_DIST,
        SUN_DIR.y * SUN_DIST,
        p.z + SUN_DIR.z * SUN_DIST,
      )
      l.target.position.set(p.x, 0, p.z)
      l.target.updateMatrixWorld()
      // Nightfall (M6): the key light cools and dims into moonlight with the
      // shared blend — the sky env swap handles the ambient side of dusk.
      const n = SIM.night.value
      l.color.lerpColors(SUN_DAY, SUN_NIGHT, n)
      l.intensity = 2.3 - n * 1.65
    }
  })
  return (
    <directionalLight
      ref={light}
      intensity={2.3}
      color="#ffe6b8"
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-radius={4}
      // Tight follow frustum: fewer wasted texels → visibly crisper contact
      // shadows around the hero for the same 1024 map. Still the ONE caster.
      shadow-camera-left={-34}
      shadow-camera-right={34}
      shadow-camera-top={34}
      shadow-camera-bottom={-34}
      shadow-camera-near={16}
      shadow-camera-far={130}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  )
}

/** Only offer the on-screen stick where the primary pointer is a finger. */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

/**
 * Virtual joystick (touch devices): drag anywhere on the pad to move; push to
 * the rim to sprint. Writes an analog vector into `moveRef` every pointer move
 * — the movement controller reads it each frame alongside the keys, so there
 * is no React state on the hot path.
 */
function TouchJoystick({ moveRef }: { moveRef: React.MutableRefObject<TouchMoveState> }) {
  const nubRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const activeId = useRef<number | null>(null)

  function apply(e: React.PointerEvent) {
    const base = baseRef.current
    const nub = nubRef.current
    if (!base || !nub) return
    const rect = base.getBoundingClientRect()
    const r = rect.width / 2
    let dx = (e.clientX - (rect.left + r)) / r
    let dy = (e.clientY - (rect.top + r)) / r
    const mag = Math.hypot(dx, dy)
    if (mag > 1) {
      dx /= mag
      dy /= mag
    }
    moveRef.current.str = dx
    moveRef.current.fwd = -dy // screen-up = forward
    moveRef.current.mag = Math.min(1, mag)
    nub.style.transform = `translate(${dx * r * 0.55}px, ${dy * r * 0.55}px)`
  }

  function release() {
    activeId.current = null
    moveRef.current.fwd = 0
    moveRef.current.str = 0
    moveRef.current.mag = 0
    if (nubRef.current) nubRef.current.style.transform = 'translate(0px, 0px)'
  }

  return (
    <div
      ref={baseRef}
      className="over3d-joystick"
      onPointerDown={(e) => {
        activeId.current = e.pointerId
        e.currentTarget.setPointerCapture(e.pointerId)
        apply(e)
      }}
      onPointerMove={(e) => {
        if (activeId.current === e.pointerId) apply(e)
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={nubRef} className="over3d-joystick-nub" />
    </div>
  )
}

const MAX_HP = 10

type WorldStateEntry = { world: World; state: ReturnType<typeof getWorldState> }

function MiniMap({
  playerPosRef,
  headingRef,
  states,
  activeIndex,
  night,
  shelterTarget,
}: {
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  headingRef: React.MutableRefObject<number>
  states: WorldStateEntry[]
  activeIndex: number
  night?: boolean
  shelterTarget?: { x: number; z: number } | null
}) {
  const SIZE = 152
  const R = GROUND_HALF
  const [me, setMe] = useState({ x: 50, y: 50, deg: 0 })
  const lastMeRef = useRef(me)

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerPosRef.current
      const x = (p.x / R / 2 + 0.5) * SIZE
      const y = (p.z / R / 2 + 0.5) * SIZE
      const deg = (headingRef.current * 180) / Math.PI
      const last = lastMeRef.current
      if (
        Math.abs(x - last.x) > 0.6 ||
        Math.abs(y - last.y) > 0.6 ||
        Math.abs(deg - last.deg) > 2.5
      ) {
        lastMeRef.current = { x, y, deg }
        setMe({ x, y, deg })
      }
    }, 200)
    return () => clearInterval(id)
  }, [playerPosRef, headingRef, R])

  const proj = (v: Vec2) => ({ x: (v.x / R / 2 + 0.5) * SIZE, y: (v.z / R / 2 + 0.5) * SIZE })

  return (
    <div className="over3d-minimap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" height="100%">
        <defs>
          <clipPath id="mmclip">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} />
          </clipPath>
        </defs>
        <g clipPath="url(#mmclip)">
          <rect x={0} y={0} width={SIZE} height={SIZE} fill="#1f2a3d" />
          {/* landmarks */}
          {LANDMARKS.map((l) => {
            const p = proj(l.pos)
            return (
              <g key={`lm-${l.index}`}>
                <rect x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} rx={1.5} fill={l.color} stroke="#0b1322" strokeWidth={0.8} />
                <text x={p.x} y={p.y + 2.4} textAnchor="middle" fontSize={5.5} fill="#0b1322" fontWeight={700}>
                  {LANDMARK_GLYPH[l.type]}
                </text>
              </g>
            )
          })}
          {/* checkpoints */}
          {states.map(({ world, state }, i) => {
            const p = proj(CHECKPOINTS_3D[i].flag)
            const locked = state.status === 'locked'
            const isActive = i === activeIndex
            return (
              <circle
                key={world.id}
                cx={p.x}
                cy={p.y}
                r={isActive ? 4.5 : 3}
                fill={locked ? '#5a637a' : world.theme.accent}
                stroke={isActive ? '#fff' : 'none'}
                strokeWidth={isActive ? 1.4 : 0}
                className={isActive ? 'mm-active' : undefined}
              />
            )
          })}
          {/* safe houses — shown at night so you can navigate to shelter */}
          {night &&
            SHELTERS.map((s, i) => {
              const p = proj(s)
              const isTarget =
                !!shelterTarget &&
                Math.abs(shelterTarget.x - s.x) < 1 &&
                Math.abs(shelterTarget.z - s.z) < 1
              return (
                <circle
                  key={`mm-safe-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={isTarget ? 4.5 : 2.4}
                  fill="#5ef2ff"
                  stroke={isTarget ? '#ffffff' : 'none'}
                  strokeWidth={isTarget ? 1.4 : 0}
                  className={isTarget ? 'mm-active' : undefined}
                  opacity={isTarget ? 1 : 0.7}
                />
              )
            })}
          {/* player */}
          <g transform={`translate(${me.x} ${me.y}) rotate(${me.deg})`}>
            <path d="M0,-6 L4,5 L0,2.5 L-4,5 Z" fill="#ffffff" stroke="#0b1322" strokeWidth={0.8} />
          </g>
        </g>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} fill="none" stroke="#0b1322" strokeWidth={2} />
      </svg>
    </div>
  )
}

/**
 * The far-flung district landmarks never change, so isolate them in a memoized
 * component. Without this, all six (animated) landmark rigs are reconciled on
 * every parent re-render — and the parent re-renders several times a second from
 * the distance / timer / horde HUD intervals while you run around.
 */
const LandmarkField = memo(function LandmarkField() {
  return (
    <>
      {LANDMARKS.map((l) => (
        <LandmarkMesh key={`lm-${l.index}`} landmark={l} />
      ))}
    </>
  )
})

/**
 * Academy + Boss buildings for every district. These only change when the tour
 * advances (rare), so memoizing keeps the whole set — dozens of meshes each —
 * out of the frequent HUD-driven reconciliation passes.
 */
const QuestSites = memo(function QuestSites({
  states,
  tourDone,
  atBoss,
  tourWorldClamped,
  isGuest,
}: {
  states: WorldStateEntry[]
  tourDone: boolean
  atBoss: boolean
  tourWorldClamped: number
  isGuest: boolean
}) {
  return (
    <>
      {states.map(({ world }, i) => {
        const cp = CHECKPOINTS_3D[i]
        const isCurrentWorld = !tourDone && i === tourWorldClamped
        return (
          <group key={world.id}>
            {/* Academy buildings stay as city scenery (no completion shown). */}
            <CheckpointPortal
              world={world}
              pos={cp.flag}
              locked={false}
              cleared={false}
              active={false}
              hideLabel
            />
            <BossTotem
              world={world}
              pos={cp.boss}
              locked={isCurrentWorld && atBoss ? isGuest : false}
              cleared={false}
              hideLabel={!(isCurrentWorld && atBoss)}
            />
          </group>
        )
      })}
    </>
  )
})

export function Overworld3DPage() {
  const navigate = useNavigate()
  const { isGuest } = useAuth()
  const {
    getLessonProgress,
    isLessonUnlocked,
    totalBadgeCount,
    lessons,
    interZoneComplete,
    readyForFinalGauntlet,
    learnerModel,
    recordConceptResult,
  } = useProgress()
  const { state: gauntlet } = useGauntlet()
  const { addXp, info: playerLevel, title: playerTitle } = usePlayerLevel()

  // Render resolution adapts to the live frame rate: full sharpness on capable
  // GPUs, automatically dialled back when the horde gets thick so the game keeps
  // running smoothly instead of dropping frames.
  const [dpr, setDpr] = useState(() =>
    Math.min(1.35, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
  )
  // Living Simulation quality tier, derived from the same adaptive-resolution
  // signal the PerformanceMonitor already drives — no second monitor. Weak GPUs
  // (dpr stepped to the floor) drop the hologram/sky flourishes and the heavier
  // post passes; capable ones get the full look.
  const simTier: QualityTier = dpr >= 1.15 ? 'high' : dpr >= 0.95 ? 'med' : 'low'

  const states = useMemo(() => {
    return WORLDS.map((world) => {
      const summary = SUMMARY_BY_ID[world.id]
      const unlocked = summary ? isLessonUnlocked(summary) : false
      return { world, state: getWorldState(world.id, getLessonProgress(world.id), unlocked) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons])

  const clearedCount = states.filter((s) => s.state.mastered).length
  const allCleared = clearedCount >= WORLD_COUNT

  // Guided tour always starts at Checkpoint 1 on every refresh. Mid-tour position
  // lives in sessionStorage only while the tab stays open (cleared on refresh).
  // Fresh page load → Checkpoint 1. Returning from list / lesson keeps session progress.
  const returning = isReturningSession()
  const savedTour = returning ? loadTour() : { world: 0, stage: 0 }
  const savedPosRef = useRef(returning ? loadPos() : null)
  const [tourWorld, setTourWorld] = useState(savedTour.world)
  const [tourStage, setTourStage] = useState<number>(savedTour.stage)
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const location = useLocation()

  useEffect(() => {
    sessionStorage.setItem(TOUR_KEY, JSON.stringify({ world: tourWorld, stage: tourStage }))
  }, [tourWorld, tourStage])

  // Skip-spawn flag only applies while still on a level's first checkpoint leg.
  useEffect(() => {
    if (tourStage > 0) {
      try {
        sessionStorage.removeItem(SKIP_SPAWN_KEY)
      } catch {
        /* ignore */
      }
    }
  }, [tourStage])

  // When a lesson part is finished, unlock the next part (or the boss lair).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PART_DONE_KEY)
      if (!raw) return
      sessionStorage.removeItem(PART_DONE_KEY)
      const { world, part, final } = JSON.parse(raw) as {
        world: number
        part: number
        final?: boolean
      }
      if (typeof world !== 'number' || typeof part !== 'number') return

      setTourWorld(world)
      if (final) {
        setTourStage(BOSS_STAGE)
        setMilestone({
          title: 'All checkpoints cleared!',
          body: `Level ${levelNumber(world)} lesson done. Follow the trail to the Level ${levelNumber(world)} Boss before time runs out — answer the quiz, then blast the boss with your gun to clear the level!`,
        })
      } else {
        setTourStage(part + 1)
        setMilestone({
          title: `Checkpoint ${part + 1} complete!`,
          body: `Level ${levelNumber(world)} · Checkpoint ${part + 2} is unlocked. Zombies are tougher — reach the next building before the timer hits zero. Hearts do not refill between checkpoints.`,
        })
      }
    } catch {
      /* ignore */
    }
  }, [location.key])

  // A real refresh clears tour + position so you restart at Checkpoint 1.
  // In-app navigation (e.g. to the list) does NOT fire this, so it's remembered.
  useEffect(() => {
    const clear = () => {
      sessionStorage.removeItem(TOUR_KEY)
      sessionStorage.removeItem(POS_KEY)
      sessionStorage.removeItem(PART_DONE_KEY)
      sessionStorage.removeItem(COMBAT_SNAP_KEY)
    }
    window.addEventListener('beforeunload', clear)
    return () => window.removeEventListener('beforeunload', clear)
  }, [])

  const tourDone = tourWorld >= WORLD_COUNT
  const tourWorldClamped = Math.min(tourWorld, WORLD_COUNT - 1)
  const atBoss = !tourDone && tourStage >= BOSS_STAGE
  const tourWorldMeta = states[tourWorldClamped]?.world
  const stageClamped = Math.min(tourStage, BOSS_STAGE)
  const levelNum = tourDone ? WORLD_COUNT : levelNumber(tourWorldClamped)
  const checkpointNum = atBoss ? null : checkpointNumber(stageClamped)
  const positionLabel = tourDone
    ? 'All levels cleared!'
    : questPositionLabel(tourWorldClamped, stageClamped, atBoss)

  // Adaptive combat: tune the horde + timer to how well the learner knows the
  // concept this level teaches. Struggling = gentler & more time; confident =
  // tougher & tighter. This is what makes the run different per kid.
  const learnerBand = useMemo(
    () => weakestBand(learnerModel, LESSON_CATALOG[tourWorldClamped]?.conceptTags ?? []),
    [learnerModel, tourWorldClamped],
  )
  const combatAdjust = useMemo(
    () => combatAdjustForBand(learnerBand),
    [learnerBand],
  )
  const questTier = questHordeTier(tourWorldClamped, stageClamped, atBoss)

  const worldEntries = useMemo(
    () =>
      states.map((s, i) => ({
        state: s.state,
        gatesPassed:
          i < tourWorldClamped ? GATES_PER_WORLD : i === tourWorldClamped ? stageClamped : 0,
      })),
    [states, tourWorldClamped, stageClamped],
  )

  // Only the current objective (current lesson-part gate, or the boss) is an
  // interactive target — keeps the player on the guided path.
  const targets = useMemo<Target[]>(() => {
    if (tourDone) return []
    const world = states[tourWorldClamped].world
    const state = states[tourWorldClamped].state
    const cp = CHECKPOINTS_3D[tourWorldClamped]
    if (atBoss) {
      const door = questDoor(cp.boss, 6)
      return [
        {
          key: `${world.id}-boss`,
          world,
          kind: 'boss',
          x: door.x,
          z: door.z,
          locked: state.status === 'locked' || !state.learnDone || isGuest,
          cleared: state.mastered,
        },
      ]
    }
    const gate = WORLD_GATES[tourWorldClamped][stageClamped]
    const door = questDoor(gate)
    return [
      {
        key: `${world.id}-part-${stageClamped}`,
        world,
        kind: 'lesson',
        part: stageClamped,
        x: door.x,
        z: door.z,
        locked: state.status === 'locked',
        cleared: false,
      },
    ]
  }, [states, isGuest, tourDone, tourWorldClamped, atBoss, stageClamped])

  // Advance the tour only when the boss was actually beaten THIS run (a session
  // signal set by the boss fight). Never auto-skip just because the lesson was
  // mastered in a past run — every run goes through the quiz + boss again.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BOSS_DONE_KEY)
      if (raw == null) return
      sessionStorage.removeItem(BOSS_DONE_KEY)
      const world = parseInt(raw, 10)
      if (Number.isNaN(world)) return
      const nextWorld = world + 1
      // Respawn at this boss, facing the next level's first checkpoint.
      const here = questDoor(CHECKPOINTS_3D[world].boss, 6.5)
      const next = nextWorld < WORLD_COUNT ? questDoor(WORLD_GATES[nextWorld][0]) : null
      setSpawn(here, next)
      setTourWorld(nextWorld)
      setTourStage(0)
      if (nextWorld < WORLD_COUNT) {
        setMilestone({
          title: `Level ${levelNumber(nextWorld)} unlocked!`,
          body: `Each level has ${CHECKPOINTS_PER_LEVEL} checkpoints — beat the clock on every one. The zombies get faster and tougher from here, so keep firing!`,
        })
      }
    } catch {
      /* ignore */
    }
  }, [location.key])

  const [nearby, setNearby] = useState<Target | null>(null)
  const nearbyRef = useRef<Target | null>(null)
  const playerPosRef = useRef(
    new THREE.Vector3(savedPosRef.current?.x ?? START_3D.x, 0, savedPosRef.current?.z ?? START_3D.z),
  )
  const headingRef = useRef(savedPosRef.current?.h ?? 0)

  // Shared blade-dash state: the controller writes it, CombatSystem reads it to
  // slice the horde + grant i-frames, and the HUD polls it for the cooldown ring.
  const dashRef = useRef<DashState>({
    active: false,
    x: savedPosRef.current?.x ?? START_3D.x,
    z: savedPosRef.current?.z ?? START_3D.z,
    radius: 0,
    cd01: 1,
    ready: true,
  })

  // Shared stealth state: the controller writes it (crouch), CombatSystem reads
  // it to pause spawns + drop aggro on far zombies.
  const stealthRef = useRef<{ active: boolean }>({ active: false })
  // Virtual joystick channel (touch devices) — the stick writes, controller reads.
  const touchMoveRef = useRef<TouchMoveState>({ fwd: 0, str: 0, mag: 0 })
  const touchUi = useMemo(isTouchDevice, [])
  // Shared gun-heat readout: CombatSystem writes it, the HUD polls it.
  const gunHeatRef = useRef<{ heat: number; overheated: boolean }>({
    heat: 0,
    overheated: false,
  })

  // Combat: pooled zombies + arrows live in CombatSystem; we keep score/HP here.
  const combatApi = useRef<CombatApi | null>(null)
  const [kills, setKills] = useState(0)
  const [hp, setHp] = useState(MAX_HP)
  const [hurt, setHurt] = useState(false)
  const [invuln, setInvuln] = useState(false)
  const [combo, setCombo] = useState(0)
  const [dead, setDead] = useState(false)
  // Stealth HUD flag (mirrors stealthRef for the on-screen indicator).
  const [stealthOn, setStealthOn] = useState(false)
  // Gun heat HUD (0..1) + jammed flag, polled from gunHeatRef.
  const [gunHeat, setGunHeat] = useState(0)
  const [gunJammed, setGunJammed] = useState(false)
  // Knowledge surge: the concept question raised by destroying a Glitch carrier.
  const [surge, setSurge] = useState<MicroQuestion | null>(null)
  const [surgeResult, setSurgeResult] = useState<null | 'right' | 'wrong'>(null)
  // Weapon overcharge: clock (ms) until a collected crate's boost expires.
  const [overchargeUntil, setOverchargeUntil] = useState(0)
  const [overcharge, setOvercharge] = useState(false)
  // Permanent (run-scoped) gun tiers earned by collecting weapon chests.
  const [crateGunBonus, setCrateGunBonus] = useState(0)
  // Day/night cycle. At night the horde turns deadly and the player must shelter.
  const [night, setNight] = useState(false)
  const [nightLeft, setNightLeft] = useState(0)
  const [sheltered, setSheltered] = useState(false)
  // Nearest safe house (distance + on-screen arrow bearing) for night navigation.
  const [shelterInfo, setShelterInfo] = useState<
    { dist: number; angleDeg: number; x: number; z: number } | null
  >(null)
  const nightRef = useRef(false)
  nightRef.current = night
  const dayClockRef = useRef(0)
  const nightClockRef = useRef(0)
  // Bumping this remounts the controller + combat: clear zombies on a fresh run.
  const [runId, setRunId] = useState(0)
  const hurtTimer = useRef<number | null>(null)
  const invulnTimer = useRef<number | null>(null)
  const deadRef = useRef(false)
  deadRef.current = dead

  // Juice channels written by the combat system / controller (refs so they never
  // re-render the scene): camera-shake magnitude + a slow-mo "hit-stop" clock time.
  const shakeRef = useRef(0)
  const hitstopRef = useRef(0)
  // Combo tracking lives in refs on the hot path; mirrored to state only for HUD.
  const comboRef = useRef(0)
  const lastKillRef = useRef(0)

  // Player i-frames last as long as the combat system suppresses damage (0.7s);
  // mirror that here for the blink/flash tell.
  const PLAYER_IFRAME_MS = 700

  // The gun starts solid and upgrades with progress (mastered worlds / how deep
  // into the tour you are), so the shooting visibly grows over a playthrough.
  // Base gun grows with progress; weapon chests you hunt down stack on top.
  const baseGunLevel = Math.min(
    GUNS.length - 1,
    MIN_GUN_LEVEL + Math.max(clearedCount, Math.min(tourWorld, WORLD_COUNT - 1)),
  )
  const gunLevel = Math.min(GUNS.length - 1, baseGunLevel + crateGunBonus)
  // A freshly collected crate also overcharges the gun to the very top for a bit.
  const effectiveGunLevel = overcharge ? GUNS.length - 1 : gunLevel

  // Concept to target with knowledge-zombies right now: something due for review,
  // else the learner's weakest practiced concept. Undefined for brand-new players.
  const targetConceptId = useMemo(
    () => targetConcept(learnerModel),
    [learnerModel],
  )

  // Stable callbacks (useCallback) so the memoized CombatSystem / controller
  // don't re-render every time the HUD distance / timer ticks.
  const handleKill = useCallback(() => {
    if (deadRef.current) return
    setKills((k) => k + 1)
    const t = performance.now()
    const chained = t - lastKillRef.current < COMBO_WINDOW_MS
    lastKillRef.current = t
    const next = chained ? comboRef.current + 1 : 1
    comboRef.current = next
    setCombo(next)
    addXp(Math.round(KILL_XP * comboMultiplier(next)))
  }, [addXp])

  const handlePlayerHit = useCallback((damage = 1) => {
    if (deadRef.current) return
    // Taking a hit breaks the combo.
    comboRef.current = 0
    lastKillRef.current = 0
    setCombo(0)
    setHurt(true)
    setInvuln(true)
    playPlayerHurt()
    if (hurtTimer.current) window.clearTimeout(hurtTimer.current)
    hurtTimer.current = window.setTimeout(() => setHurt(false), 260)
    if (invulnTimer.current) window.clearTimeout(invulnTimer.current)
    invulnTimer.current = window.setTimeout(() => setInvuln(false), PLAYER_IFRAME_MS)
    setHp((h) => {
      const next = h - Math.max(1, Math.round(damage))
      if (next <= 0) {
        setDead(true)
        return 0
      }
      return next
    })
  }, [])

  const handleHeal = useCallback(() => {
    if (deadRef.current) return
    playHeartPickup()
    setHp((h) => Math.min(MAX_HP, h + 1))
  }, [])

  // A Glitch carrier was destroyed → raise its concept question (knowledge surge).
  const targetConceptRef = useRef<ConceptId | undefined>(targetConceptId)
  targetConceptRef.current = targetConceptId
  const handleGlitchKill = useCallback(() => {
    if (deadRef.current) return
    const concept = targetConceptRef.current
    if (!concept) return
    const q = getMicroQuestion(concept)
    if (!q) return
    setSurgeResult(null)
    setSurge(q)
  }, [])

  // A weapon crate was collected → permanently upgrade the gun for this run
  // (stacking toward the top tier) and overcharge it for a short burst.
  const handleChest = useCallback(() => {
    if (deadRef.current) return
    playHeartPickup()
    setCrateGunBonus((b) => b + 1)
    setOverchargeUntil(performance.now() + OVERCHARGE_MS)
    setOvercharge(true)
  }, [])

  // Stealth indicator (the controller calls this only when crouch toggles).
  const handleStealthChange = useCallback((active: boolean) => {
    setStealthOn(active)
  }, [])

  // Answer the knowledge-surge question: feed the learner model + reward.
  const answerSurge = useCallback(
    (choiceIndex: number) => {
      setSurge((q) => {
        if (!q) return null
        const correct = choiceIndex === q.answerIndex
        recordConceptResult({
          conceptIds: [q.concept],
          firstTry: true,
          correct,
        })
        if (correct) {
          addXp(answerXp(true, true, 2500))
          setHp((h) => Math.min(MAX_HP, h + 2))
        }
        setSurgeResult(correct ? 'right' : 'wrong')
        return q
      })
      // Auto-dismiss shortly after showing the result.
      window.setTimeout(() => {
        setSurge(null)
        setSurgeResult(null)
      }, 1400)
    },
    [recordConceptResult, addXp],
  )

  // Expire the weapon overcharge when its window runs out.
  useEffect(() => {
    if (!overcharge) return
    const remaining = overchargeUntil - performance.now()
    if (remaining <= 0) {
      setOvercharge(false)
      return
    }
    const id = window.setTimeout(() => setOvercharge(false), remaining)
    return () => window.clearTimeout(id)
  }, [overcharge, overchargeUntil])

  // Shared respawn — drop the player at the START of `targetWorld` (Checkpoint 1),
  // reset hearts / timer / night / chest guns, and remount combat fresh. Lesson
  // mastery is untouched. Death keeps you on your CURRENT level by default; a
  // separate option sends you back to Level 1.
  function respawnAt(targetWorld: number) {
    const clamped = Math.max(0, Math.min(WORLD_COUNT - 1, targetWorld))
    const spawn = spawnAtLevel(clamped)
    // Clear any stale run flags / horde snapshot so we don't restore old state.
    try {
      sessionStorage.removeItem(PART_DONE_KEY)
      sessionStorage.removeItem(BOSS_DONE_KEY)
      sessionStorage.removeItem(COMBAT_SNAP_KEY)
    } catch {
      /* ignore */
    }
    savedPosRef.current = { x: spawn.x, z: spawn.z, h: spawn.h }
    playerPosRef.current.set(spawn.x, 0, spawn.z)
    headingRef.current = spawn.h
    setTourWorld(clamped)
    setTourStage(0)
    setHp(MAX_HP)
    setKills(0)
    setHurt(false)
    setInvuln(false)
    setCombo(0)
    comboRef.current = 0
    lastKillRef.current = 0
    shakeRef.current = 0
    hitstopRef.current = 0
    setDead(false)
    setRunId((r) => r + 1)
    // Reset the day/night cycle to a fresh dawn.
    dayClockRef.current = 0
    nightClockRef.current = 0
    setNight(false)
    setNightLeft(0)
    setSheltered(false)
    // Lose your hard-won chest guns on death — go find them again.
    setCrateGunBonus(0)
    setOvercharge(false)
  }

  // Default death restart: drop back in at the start of the level you reached.
  function restartLevel() {
    respawnAt(tourWorldClamped)
  }

  // Optional full reset: wipe the run and start over at Level 1.
  function restartGame() {
    clearQuestRun()
    respawnAt(0)
    setShowIntro(true)
  }

  // Live distance to the current objective for the guide readout.
  const [objDist, setObjDist] = useState<number | null>(null)
  const [hordeTier, setHordeTier] = useState(1)
  // Horde tier after the learner-model adjustment (gentler when struggling,
  // tougher when confident). Used for combat + the HUD readout.
  const effectiveHordeTier = Math.max(1, hordeTier + combatAdjust.tierDelta)
  const [dashCd, setDashCd] = useState(1) // 0 = just used .. 1 = ready
  const lastDistRef = useRef<number | null>(null)
  const lastHordeRef = useRef(1)
  const lastDashCdRef = useRef(1)
  const guidePosRef = useRef<Vec2 | null>(null)

  // Live readouts (distance + horde tier) — read via refs to avoid stale closures.
  const worldEntriesRef = useRef(worldEntries)
  worldEntriesRef.current = worldEntries
  const questTierRef = useRef(questTier)
  questTierRef.current = questTier
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = guidePosRef.current
      const p = playerPosRef.current
      const dist = g ? Math.round(Math.hypot(g.x - p.x, g.z - p.z)) : null
      if (dist !== lastDistRef.current) {
        lastDistRef.current = dist
        setObjDist(dist)
      }
      const tier = hordeTierAtPosition(p.x, p.z, worldEntriesRef.current, questTierRef.current)
      if (tier !== lastHordeRef.current) {
        lastHordeRef.current = tier
        setHordeTier(tier)
      }
      // Dash cooldown ring (poll the shared ref; ref writes don't re-render).
      const cd = dashRef.current.cd01
      if (Math.abs(cd - lastDashCdRef.current) > 0.04 || (cd >= 1) !== (lastDashCdRef.current >= 1)) {
        lastDashCdRef.current = cd
        setDashCd(cd)
      }
      // Gun heat readout for the HUD.
      const gh = gunHeatRef.current
      setGunHeat((prev) => (Math.abs(prev - gh.heat) > 0.04 ? gh.heat : prev))
      setGunJammed((prev) => (prev !== gh.overheated ? gh.overheated : prev))
      // Safe-house navigation (only at night): nearest shelter + distance + a
      // bearing arrow relative to where the player is facing.
      if (nightRef.current) {
        let nd2 = Infinity
        let nx = 0
        let nz = 0
        for (let i = 0; i < SHELTERS.length; i++) {
          const sdx = SHELTERS[i].x - p.x
          const sdz = SHELTERS[i].z - p.z
          const d2 = sdx * sdx + sdz * sdz
          if (d2 < nd2) {
            nd2 = d2
            nx = SHELTERS[i].x
            nz = SHELTERS[i].z
          }
        }
        const dist = Math.sqrt(nd2)
        const inShelter = dist <= SHELTER_R
        setSheltered((prev) => (prev !== inShelter ? inShelter : prev))
        const bearing = Math.atan2(nx - p.x, nz - p.z)
        const angleDeg = ((bearing - headingRef.current) * 180) / Math.PI
        setShelterInfo({ dist: Math.round(dist), angleDeg, x: nx, z: nz })
      } else {
        setSheltered((prev) => (prev ? false : prev))
        setShelterInfo((prev) => (prev ? null : prev))
      }
      // Remember map position so popping over to the list returns you here.
      try {
        sessionStorage.setItem(
          POS_KEY,
          JSON.stringify({ x: p.x, z: p.z, h: headingRef.current }),
        )
      } catch {
        /* ignore */
      }
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Day / night cycle -------------------------------------------------
  // Daylight runs the normal race-the-checkpoint loop. After DAY_LENGTH the sun
  // sets: the horde turns fast + deadly and the checkpoint clock pauses while a
  // "survive until dawn" countdown runs. Reach a glowing safe house (or hide) or
  // you'll be overrun. Survive NIGHT_LENGTH seconds and day returns.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (overlayPausedRef.current || deadRef.current || tourDoneRef.current) return
      if (!nightRef.current) {
        dayClockRef.current += 1
        if (dayClockRef.current >= DAY_LENGTH) {
          dayClockRef.current = 0
          nightClockRef.current = NIGHT_LENGTH
          setNight(true)
          setNightLeft(NIGHT_LENGTH)
        }
      } else {
        nightClockRef.current -= 1
        setNightLeft(Math.max(0, nightClockRef.current))
        if (nightClockRef.current <= 0) {
          setNight(false)
        }
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  // How-to-play popup. Shows ONLY at a fresh game start or when jumped into a
  // level (placement / "Skip to Level"). Both of those paths clear INTRO_KEY
  // (clearQuestRun / skipToLevel), so a simple "have we shown it this session?"
  // check is enough — it will NOT re-appear after visiting the list, finishing a
  // checkpoint, or beating a boss, since INTRO_KEY stays set once dismissed.
  const [showIntro, setShowIntro] = useState(() => !introAlreadySeen())

  // Jumped straight to a level from the LIST view → skip the how-to-play intro
  // (they already know the ropes) and greet them with a "Welcome to Level N"
  // popup, matching the one shown when a boss is beaten.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LEVEL_WELCOME_KEY)
      if (raw == null) return
      sessionStorage.removeItem(LEVEL_WELCOME_KEY)
      const w = parseInt(raw, 10)
      if (Number.isNaN(w)) return
      setMilestone({
        title: `Welcome to Level ${levelNumber(w)}!`,
        body: `You jumped ahead to Level ${levelNumber(w)}. Each level has ${CHECKPOINTS_PER_LEVEL} checkpoints — follow the trail and beat the clock on every one, then take down the boss. The zombies get faster and tougher the deeper you go, so keep firing!`,
      })
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Hold-out siege to open the next checkpoint -------------------------
  // Each checkpoint is a survival gauntlet: hold out against escalating waves
  // (through nightfalls and all) for LEG_HOLD_SECONDS, and the gate UNLOCKS.
  // Death is only by losing all your hearts — no arbitrary distance timer.
  // The ref is the source of truth for the survival counter — it is owned by the
  // tick + reset effects only. Do NOT sync it from state every render, or the
  // frequent HUD re-renders would keep overwriting the interval's progress and
  // freeze the meter.
  const [legHeld, setLegHeld] = useState(0)
  const legHeldRef = useRef(0)
  // Brief "checkpoint still locked" flash when you try to enter too early.
  const [holdDenied, setHoldDenied] = useState(false)
  const tourDoneRef = useRef(tourDone)
  tourDoneRef.current = tourDone

  // How long this checkpoint's siege lasts (Level 1 is a short onboarding ramp).
  const legHoldTarget = legHoldSecondsFor(tourWorldClamped)
  const legHoldTargetRef = useRef(legHoldTarget)
  legHoldTargetRef.current = legHoldTarget

  const legReady = tourDone || legHeld >= legHoldTarget
  const legReadyRef = useRef(legReady)
  legReadyRef.current = legReady
  // 0..1 leg progress — drives wave escalation in the combat system.
  const legProgress = Math.min(1, legHeld / Math.max(1, legHoldTarget))

  // A unique id for the current leg of the journey. Changes whenever the
  // objective (gate / boss) or the run resets — that's when we reset the siege.
  const objectiveKey = tourDone
    ? 'done'
    : `${tourWorldClamped}:${stageClamped}:${atBoss ? 'boss' : 'gate'}:${runId}`

  // Pause the siege whenever any overlay is up (assigned after those flags
  // exist, below). The ref is read inside the tick effect.
  const overlayPausedRef = useRef(false)

  // New leg → reset the hold-out meter.
  useEffect(() => {
    setLegHeld(0)
    legHeldRef.current = 0
    setHoldDenied(false)
  }, [objectiveKey])

  // Count up survival time while actively fighting the leg (nightfall included).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (overlayPausedRef.current || deadRef.current || tourDoneRef.current) return
      const target = legHoldTargetRef.current
      const cur = legHeldRef.current
      if (cur >= target) return
      const next = Math.min(target, cur + 0.25)
      legHeldRef.current = next
      setLegHeld(next)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  function dismissIntro() {
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* ignore */
    }
    setShowIntro(false)
    startMusic() // user gesture — safe to begin the theme
  }

  // If the intro was already dismissed this session, kick the music off on the
  // first interaction; always stop it when leaving the overworld.
  useEffect(() => {
    if (!showIntro) startMusic()
    return () => stopMusic()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaving the overworld in-app (e.g. opening the list) → stash the live horde
  // so it's restored on return instead of vanishing and respawning. A death /
  // restart clears the snapshot separately and doesn't unmount the page here.
  // Alias the ref object (not its `.current`) into a local so the cleanup reads
  // the LATEST combat handle at unmount time. We must NOT capture `.current`
  // itself here: CombatSystem remounts via its `key` on respawn (without
  // re-running this mount-only effect), so a value captured now would snapshot a
  // stale, orphaned horde. Reading through the aliased ref always sees the live
  // handle.
  useEffect(() => {
    const combatApiHolder = combatApi
    return () => {
      try {
        const api = combatApiHolder.current
        if (api) sessionStorage.setItem(COMBAT_SNAP_KEY, JSON.stringify(api.snapshot()))
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phase 4 capstone: a one-time grand finale when every realm is restored.
  const [finaleSeen, setFinaleSeen] = useState(() => {
    try {
      return !!localStorage.getItem('alphacode.quest.finale')
    } catch {
      return false
    }
  })
  function dismissFinale() {
    try {
      localStorage.setItem('alphacode.quest.finale', '1')
    } catch {
      /* ignore */
    }
    setFinaleSeen(true)
  }

  const handleNearby = useCallback((t: Target | null) => {
    nearbyRef.current = t
    setNearby(t)
  }, [])

  // Stable fire handle — forwards to the combat system's imperative API.
  const handleFire = useCallback(
    (o: THREE.Vector3, d: THREE.Vector3) => combatApi.current?.fire(o, d) ?? false,
    [],
  )

  // On-screen sprint button. The movement controller already treats Shift as
  // sprint, so the button just drives a synthetic Shift keydown/keyup (held
  // while pressed) — no controller plumbing needed, and the keyboard still works.
  const [sprinting, setSprinting] = useState(false)
  function startSprint() {
    if (overlayPausedRef.current) return
    setSprinting(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
  }
  function endSprint() {
    setSprinting(false)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))
  }

  // On-screen blade-dash button — fires a synthetic 'q' keydown so it shares the
  // controller's dash handler (and its cooldown). The button reflects cooldown.
  function triggerDash() {
    if (overlayPausedRef.current) return
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
  }

  // On-screen fire button (touch) — drives the same held-F rapid-fire path the
  // keyboard uses, so heat/cooldown behave identically.
  const [firing, setFiring] = useState(false)
  function startFire() {
    if (overlayPausedRef.current) return
    setFiring(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))
  }
  function endFire() {
    setFiring(false)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'f' }))
  }

  // Remember where to respawn (and which way to face) after an objective.
  function setSpawn(here: Vec2, next: Vec2 | null) {
    const h = next ? Math.atan2(next.x - here.x, next.z - here.z) : 0
    const save = { x: here.x, z: here.z, h }
    savedPosRef.current = save
    try {
      sessionStorage.setItem(POS_KEY, JSON.stringify(save))
    } catch {
      /* ignore */
    }
  }

  function enter(t: Target | null) {
    if (!t || t.locked) return
    // The checkpoint is sealed until you've survived the siege — keep fighting.
    if (!legReadyRef.current) {
      setHoldDenied(true)
      window.setTimeout(() => setHoldDenied(false), 1600)
      return
    }
    if (t.kind === 'lesson') {
      const part = t.part ?? 0
      const nextStage = Math.min(BOSS_STAGE, part + 1)
      const gatePos = WORLD_GATES[tourWorldClamped][part]
      const here = questDoor(gatePos, 6.5)
      const next =
        nextStage >= BOSS_STAGE
          ? questDoor(CHECKPOINTS_3D[tourWorldClamped].boss, 6)
          : questDoor(WORLD_GATES[tourWorldClamped][nextStage])
      // Spawn back outside this building, facing the next one.
      setSpawn(here, next)
      grantLessonEntry(t.world.index, part)
      navigate(`/lesson/${t.world.id}/learn?part=${part}`)
    } else {
      // After the boss, the next checkpoint is the following world's first gate.
      const here = questDoor(CHECKPOINTS_3D[tourWorldClamped].boss, 6.5)
      const nextWorld = tourWorldClamped + 1
      const next = nextWorld < WORLD_COUNT ? questDoor(WORLD_GATES[nextWorld][0]) : null
      setSpawn(here, next)
      grantBossEntry(t.world.index)
      prefetchBossBattle()
      navigate(`/battle/${t.world.id}`)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && nearbyRef.current) {
        enter(nearbyRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Boss-clear celebration on return.
  const [celebrateWorld, setCelebrateWorld] = useState<World | null>(null)
  useEffect(() => {
    for (const { world, state } of states) {
      if (!state.mastered) continue
      try {
        if (!localStorage.getItem(`alphacode.power.${world.id}`)) {
          setCelebrateWorld(world)
          break
        }
      } catch {
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function closeCelebration() {
    if (celebrateWorld) {
      try {
        localStorage.setItem(`alphacode.power.${celebrateWorld.id}`, '1')
      } catch {
        /* ignore */
      }
    }
    setCelebrateWorld(null)
  }

  // Show the finale only after any pending per-world celebration and the intro.
  const finaleVisible = allCleared && !finaleSeen && !celebrateWorld && !showIntro

  // Pause the countdown + combat while any blocking overlay is on screen.
  const overlayPaused =
    !!celebrateWorld || dead || showIntro || !!milestone || finaleVisible || !!surge
  overlayPausedRef.current = overlayPaused

  // Combo decays: once the chain window lapses with no new kill, drop it to zero.
  useEffect(() => {
    if (combo <= 0) return
    const id = window.setInterval(() => {
      if (performance.now() - lastKillRef.current > COMBO_WINDOW_MS) {
        comboRef.current = 0
        setCombo(0)
      }
    }, 300)
    return () => window.clearInterval(id)
  }, [combo])

  // Low-health heartbeat: a tense double-thump while in the danger zone.
  useEffect(() => {
    if (hp > 3 || dead || overlayPaused) return
    playHeartbeat()
    const id = window.setInterval(() => playHeartbeat(), 1100)
    return () => window.clearInterval(id)
  }, [hp, dead, overlayPaused])

  // Memoized so it keeps a stable object identity across the frequent HUD
  // re-renders — otherwise the (memoized) controller's faceTarget prop would
  // change every tick and bust the memo.
  const guidePos = useMemo<Vec2 | null>(
    () =>
      tourDone
        ? null
        : atBoss
          ? questDoor(CHECKPOINTS_3D[tourWorldClamped].boss, 6)
          : questDoor(WORLD_GATES[tourWorldClamped][stageClamped]),
    [tourDone, atBoss, tourWorldClamped, stageClamped],
  )
  guidePosRef.current = guidePos
  const guideColor = tourWorldMeta?.theme.accent ?? '#6d4afe'

  // Fixed start of the current leg (the spawn point), so the carved trail stays
  // stable for the whole leg instead of jittering as the player moves.
  const legStart = useMemo<Vec2 | null>(
    () => (tourDone ? null : legOrigin(tourWorldClamped, stageClamped, atBoss)),
    [tourDone, tourWorldClamped, stageClamped, atBoss],
  )

  const guideLine = tourDone
    ? allCleared
      ? 'You cleared Code City — you are the Code Master!'
      : 'Tour complete — explore the city or revisit any level.'
    : nearby && !nearby.locked
      ? nearby.kind === 'boss'
        ? `${positionLabel} — press E for the quiz & boss fight!`
        : `${positionLabel} — press E to enter and learn!`
      : nearby && nearby.locked
        ? aheadOfTourLabel(tourWorldClamped, nearby.world.index)
        : atBoss
          ? `${positionLabel}: reach the Boss before time runs out! Horde ${hordeTier}.`
          : `${positionLabel}: follow the trail and press E. Beat the clock — zombies get faster each checkpoint. Horde ${hordeTier}.`

  return (
    <div className="page over3d-page">
      <AppHeader />

      {celebrateWorld && (
        <PowerUnlock
          world={celebrateWorld}
          clearedCount={clearedCount}
          isFinal={celebrateWorld.index === WORLDS.length - 1}
          onClose={closeCelebration}
        />
      )}

      <div className="over3d-stage">
        <Canvas
          shadows
          dpr={dpr}
          gl={{
            // The scene is composited through the EffectComposer (offscreen
            // render targets), so a multisampled default framebuffer is never
            // resolved to screen — antialias:true just wastes memory/bandwidth.
            antialias: false,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          camera={{ fov: 60, near: 0.3, far: CAMERA_FAR, position: [START_3D.x, 2.6, START_3D.z - 10] }}
          onCreated={({ gl }) => {
            // WebGL context-loss recovery. By spec the browser only re-issues a
            // context if `preventDefault()` is called on the loss event — without
            // this, a transient GPU hiccup leaves the canvas permanently black
            // (HUD survives) until a full reload. This makes it self-heal.
            const canvas = gl.domElement
            canvas.addEventListener(
              'webglcontextlost',
              (e) => e.preventDefault(),
              false,
            )
          }}
        >
          <PerformanceMonitor
            onDecline={() => setDpr((d) => Math.max(0.8, Math.round((d - 0.2) * 100) / 100))}
            onIncline={() => setDpr((d) => Math.min(1.35, Math.round((d + 0.2) * 100) / 100))}
          />
          <fog attach="fog" args={['#c6d4e0', 48, 238]} />
          {/* The baked sky env (SkyEnvironment) now carries the ambient light;
              these two are just gentle shape-fill so nothing reads dead flat. */}
          <hemisphereLight args={['#fff1d6', '#7a8a6a', 0.28]} />
          <ambientLight intensity={0.06} />
          {/* cool fill from the opposite side for form + depth */}
          <directionalLight position={[-40, 30, -28]} intensity={0.22} color="#9fc2ff" />

          <Suspense fallback={null}>
            <SimulationDriver nightRef={nightRef} tier={simTier} driveFog />
            <SimulationSky radius={SKY_RADIUS} />
            <SkyEnvironment />
            <FollowLight playerPosRef={playerPosRef} />
            <Ground />
            <Roads />
            <InstancedWorld tier={simTier} />

            <LandmarkField />

            {/* Current lesson part — enterable building in a cleared plaza. */}
            {!tourDone && !atBoss && (
              <GateBuilding
                pos={WORLD_GATES[tourWorldClamped][stageClamped]}
                color={tourWorldMeta?.theme.accent ?? '#6d4afe'}
                levelNum={levelNum}
                checkpointNum={checkpointNum ?? 1}
                active
              />
            )}

            <QuestSites
              states={states}
              tourDone={tourDone}
              atBoss={atBoss}
              tourWorldClamped={tourWorldClamped}
              isGuest={isGuest}
            />

            {/* Safe houses — tall light beacons (Minecraft-style), lit at night.
                The nearest one burns brightest so you always know where to run. */}
            {night &&
              SHELTERS.map((s, i) => {
                const isNearest =
                  !!shelterInfo &&
                  Math.abs(shelterInfo.x - s.x) < 1 &&
                  Math.abs(shelterInfo.z - s.z) < 1
                return (
                  <group key={`safe-${i}`} position={[s.x, 0, s.z]}>
                    <mesh position={[0, 40, 0]}>
                      <cylinderGeometry args={[SHELTER_R, SHELTER_R, 80, 24, 1, true]} />
                      <meshBasicMaterial
                        color={isNearest ? '#9bffe9' : '#5ef2ff'}
                        transparent
                        opacity={isNearest ? 0.3 : 0.13}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        toneMapped={false}
                        fog={false}
                      />
                    </mesh>
                    <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
                      <ringGeometry args={[SHELTER_R - 0.7, SHELTER_R, 40]} />
                      <meshBasicMaterial
                        color="#5ef2ff"
                        transparent
                        opacity={isNearest ? 0.9 : 0.45}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        toneMapped={false}
                        fog={false}
                      />
                    </mesh>
                  </group>
                )
              })}

            <ThirdPersonController
              key={`ctrl-${runId}`}
              playerPosRef={playerPosRef}
              headingRef={headingRef}
              accent={tourWorldMeta?.theme.accent}
              targets={targets}
              onNearbyChange={handleNearby}
              paused={overlayPaused}
              onFire={handleFire}
              faceTarget={guidePos}
              startPos={savedPosRef.current}
              startHeading={savedPosRef.current?.h ?? null}
              dashRef={dashRef}
              stealthRef={stealthRef}
              onStealthChange={handleStealthChange}
              shakeRef={shakeRef}
              hitstopRef={hitstopRef}
              touchMoveRef={touchMoveRef}
            />
            <FloorPath from={legStart} target={guidePos} color={guideColor} />
            <CombatSystem
              key={`combat-${runId}`}
              playerPosRef={playerPosRef}
              dashRef={dashRef}
              stealthRef={stealthRef}
              gunHeatRef={gunHeatRef}
              apiRef={combatApi}
              paused={overlayPaused}
              difficulty={effectiveHordeTier}
              gunLevel={effectiveGunLevel}
              heartBonus={combatAdjust.heartBonus}
              intensity={legProgress}
              wantGlitch={!tourDone && !!targetConceptId}
              night={night}
              zombieShadows={simTier !== 'low'}
              shelters={SHELTERS}
              onKill={handleKill}
              onPlayerHit={handlePlayerHit}
              onHeal={handleHeal}
              onGlitchKill={handleGlitchKill}
              onChest={handleChest}
              shakeRef={shakeRef}
              hitstopRef={hitstopRef}
            />

            <OverworldEffects tier={simTier} shakeRef={shakeRef} />
          </Suspense>
        </Canvas>

        <div className="over3d-right-rail">
          <Link className="over3d-levels-btn" to="/quest/list">
            <IconGrid size={18} />
            Levels
          </Link>
          <MiniMap
            playerPosRef={playerPosRef}
            headingRef={headingRef}
            states={states}
            activeIndex={tourDone ? -1 : tourWorldClamped}
            night={night}
            shelterTarget={shelterInfo}
          />
        </div>

        {/* hurt flash + i-frame shield shimmer + low-health vignette */}
        <div className={`over3d-hurt ${hurt ? 'is-on' : ''}`} aria-hidden="true" />
        <div className={`over3d-iframe ${invuln ? 'is-on' : ''}`} aria-hidden="true" />
        <div className={`over3d-lowhp ${hp <= 3 && !dead ? 'is-on' : ''}`} aria-hidden="true" />
        {/* Night darkening — tints the whole view after dusk. */}
        <div className={`over3d-night ${night ? 'is-on' : ''}`} aria-hidden="true" />

        {/* Hold-out siege banner — the gate is sealed until you survive it */}
        {!tourDone && !dead && !night && (
          <div className={`over3d-holdbar ${legReady ? 'is-open' : ''} ${holdDenied ? 'is-denied' : ''}`}>
            {legReady ? (
              <>
                <span className="over3d-holdbar-title">✅ CHECKPOINT OPEN</span>
                <span className="over3d-holdbar-hint">Reach the gate and press E</span>
              </>
            ) : (
              <>
                <span className="over3d-holdbar-title">
                  {holdDenied ? '🔒 CHECKPOINT CLOSED — survive the siege!' : '🔒 CHECKPOINT CLOSED'}
                </span>
                <span className="over3d-holdbar-timer">
                  {Math.max(0, Math.ceil(legHoldTarget - legHeld))}s
                </span>
                <span className="over3d-holdbar-track" aria-hidden="true">
                  <span
                    className="over3d-holdbar-fill"
                    style={{ width: `${Math.round(legProgress * 100)}%` }}
                  />
                </span>
                <span className="over3d-holdbar-hint">Hold the line until it opens</span>
              </>
            )}
          </div>
        )}

        {/* Nightfall survival banner */}
        {night && !dead && (
          <div className={`over3d-nightbar ${sheltered ? 'is-safe' : ''}`}>
            <span className="over3d-nightbar-title">
              {sheltered ? '🛡️ Safe — wait for dawn' : '🌙 NIGHTFALL'}
            </span>
            <span className="over3d-nightbar-timer">Dawn in {Math.ceil(nightLeft)}s</span>
            {!sheltered && shelterInfo && (
              <span className="over3d-nightbar-shelter">
                <span
                  className="over3d-shelter-arrow"
                  style={{ transform: `rotate(${shelterInfo.angleDeg}deg)` }}
                  aria-hidden="true"
                >
                  ↑
                </span>
                Shelter {shelterInfo.dist}m
              </span>
            )}
            {!sheltered && (
              <span className="over3d-nightbar-hint">
                Run to the cyan beacon · hold <kbd>C</kbd> to hide &amp; shake them
              </span>
            )}
          </div>
        )}

        {/* HUD */}
        <div className="over3d-hud">
          <div className="over3d-hud-left">
            <div className="over3d-hud-row">
              <div className="over3d-health" aria-label={`Health ${hp} of ${MAX_HP}`}>
                <span className="over3d-health-heart">{'\u2665'}</span>
                <div className="over3d-health-track">
                  <span
                    className={`over3d-health-fill ${hp <= 3 ? 'is-low' : ''}`}
                    style={{ width: `${(hp / MAX_HP) * 100}%` }}
                  />
                </div>
                <span className="over3d-health-num">{hp}/{MAX_HP}</span>
              </div>
              <div className="over3d-objective">
                <IconCompass size={16} />
                <span>
                  {tourDone
                    ? 'Tour complete!'
                    : `${objDist != null ? `${objDist}m to goal` : 'Follow the trail'} · Horde ${effectiveHordeTier}`}
                </span>
              </div>
              <div className="over3d-stats">
                <span className="over3d-chip over3d-chip-ko">KO {kills}</span>
                {combo >= 2 && (
                  <span
                    className={`over3d-chip over3d-chip-combo ${comboMultiplier(combo) > 1 ? 'is-hot' : ''}`}
                  >
                    Combo {combo}
                    {comboMultiplier(combo) > 1 && <b> ×{comboMultiplier(combo)}</b>}
                  </span>
                )}
                {overcharge && (
                  <span className="over3d-chip over3d-chip-combo is-hot" title="Weapon crate overcharge">
                    ⚡ OVERCHARGE
                  </span>
                )}
                {stealthOn && (
                  <span className="over3d-chip over3d-chip-ko" title="Laying low — the horde loses track of you">
                    🥷 Hidden
                  </span>
                )}
                <span className="over3d-chip over3d-chip-gun" title="Your current blaster — find chests to upgrade it">
                  {overcharge ? `${GUNS[GUNS.length - 1].name} ⚡` : GUNS[gunLevel].name}
                  {crateGunBonus > 0 && <b> +{crateGunBonus}</b>}
                </span>
                <span
                  className={`over3d-chip over3d-heat ${gunJammed ? 'is-jammed' : gunHeat > 0.75 ? 'is-hot' : ''}`}
                  title="Gun heat — fire in bursts or it jams. Use the sword (Q) to vent the pressure."
                >
                  {gunJammed ? 'JAMMED — use sword!' : 'Heat'}
                  <span className="over3d-heat-track" aria-hidden="true">
                    <span className="over3d-heat-fill" style={{ width: `${Math.round(gunHeat * 100)}%` }} />
                  </span>
                </span>
                <span
                  className="over3d-chip over3d-chip-level"
                  title={`${playerLevel.intoLevel}/${playerLevel.needed} XP to next level`}
                >
                  Lv {playerLevel.level} · {playerTitle}
                  <span className="over3d-level-bar" aria-hidden="true">
                    <span
                      className="over3d-level-bar-fill"
                      style={{ width: `${Math.round(playerLevel.fraction * 100)}%` }}
                    />
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Game over — any death restarts the whole run at Checkpoint 1 */}
        {dead && (
          <div className="over3d-death">
            <div className="over3d-death-card">
              <h2>You were overwhelmed!</h2>
              <p>
                The horde took you down. You’ll drop back in at the start of{' '}
                <strong>Level {levelNumber(tourWorldClamped)}</strong>. Finished lessons stay saved.
              </p>
              <div className="over3d-death-stats">
                <span>KOs this run: <strong>{kills}</strong></span>
                <span>Reached: <strong>{positionLabel}</strong></span>
              </div>
              <div className="over3d-death-actions">
                <button type="button" className="over3d-death-btn" onClick={restartLevel}>
                  Restart Level {levelNumber(tourWorldClamped)}
                </button>
                {tourWorldClamped > 0 && (
                  <button
                    type="button"
                    className="over3d-death-btn over3d-death-btn-ghost"
                    onClick={restartGame}
                  >
                    Restart from Level 1
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Knowledge surge — a destroyed Glitch carrier raises a concept question */}
        {surge && (
          <div className="over3d-death">
            <div className="over3d-death-card over3d-surge-card">
              <span className="over3d-surge-tag">⚡ Knowledge Surge</span>
              <h2 className="over3d-surge-q">{surge.prompt}</h2>
              <div className="over3d-surge-choices">
                {surge.choices.map((choice, i) => {
                  const reveal = surgeResult != null
                  const isAnswer = i === surge.answerIndex
                  const cls = reveal
                    ? isAnswer
                      ? 'is-right'
                      : 'is-dim'
                    : ''
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`over3d-surge-choice ${cls}`}
                      disabled={reveal}
                      onClick={() => answerSurge(i)}
                    >
                      {choice}
                    </button>
                  )
                })}
              </div>
              {surgeResult === 'right' && (
                <p className="over3d-surge-msg is-right">Surge absorbed! +XP and +2 hearts.</p>
              )}
              {surgeResult === 'wrong' && (
                <p className="over3d-surge-msg is-wrong">
                  Not quite — you’ll see this concept again soon.
                </p>
              )}
            </div>
          </div>
        )}

        {/* How to play — tutorial when you enter the city each session */}
        {showIntro && (
          <div className="over3d-quest-intro" role="dialog" aria-labelledby="quest-intro-title">
            <div className="over3d-quest-card">
              <span className="over3d-quest-tag">How to play</span>
              <h2 id="quest-intro-title">Welcome to Code City</h2>

              <ol className="over3d-quest-steps">
                <li>
                  Code City has <strong>{WORLD_COUNT} levels</strong> to fight through. Clear every
                  checkpoint in a level, then defeat the <strong>boss</strong> to unlock the next.
                </li>
                <li>
                  Each checkpoint is a <strong>siege</strong>: <strong>hold the line</strong> against
                  escalating waves until the gate <strong>unlocks</strong>, then push in and press E.
                  Camping gets you swarmed — keep moving, looting, and picking your targets.
                </li>
                <li>
                  Follow the <strong>gold light beam</strong> to a <strong>weapon chest</strong> —
                  each one permanently upgrades your gun for the run. Hold{' '}
                  <strong>C to lay low</strong> and shake the shamblers — but{' '}
                  <strong>spitters still see you</strong>, so gun them down. Destroy cyan{' '}
                  <strong>Glitches</strong> for a Knowledge Surge question.
                </li>
                <li>
                  <strong>Pick your weapon:</strong> the <strong>gun</strong> overheats if you
                  hold the trigger — fire in bursts and use it on <strong>spitters</strong> at
                  range. The <strong>sword</strong> (<kbd>Q</kbd>) dodges and cleaves swarms, and
                  it’s the only thing that drops <strong>armored brutes</strong> fast.
                </li>
                <li>
                  Watch for <strong>nightfall</strong> — the horde turns fast and deadly. Sprint
                  to a glowing <strong>safe house</strong> (or hide) and survive until dawn.
                </li>
                <li>
                  Lose your hearts or the timer and the <strong>run restarts at Level 1</strong> —
                  but finished lessons stay saved.
                </li>
              </ol>

              <button type="button" className="over3d-quest-btn" onClick={dismissIntro}>
                Start playing
              </button>
            </div>
          </div>
        )}

        {/* Objective unlocked — after finishing a lesson part or on first spawn */}
        {milestone && !showIntro && (
          <div className="over3d-quest-intro" role="dialog" aria-labelledby="milestone-title">
            <div className="over3d-quest-card">
              <span className="over3d-quest-tag">Objective</span>
              <h2 id="milestone-title">{milestone.title}</h2>
              <p>{milestone.body}</p>
              <button type="button" className="over3d-quest-btn" onClick={() => setMilestone(null)}>
                Got it
              </button>
            </div>
          </div>
        )}

        {/* Phase 4 finale — every realm restored */}
        {finaleVisible && (
          <div className="over3d-finale">
            <div className="over3d-finale-card">
              <span className="over3d-finale-crown">{'\u2728'}</span>
              <span className="over3d-finale-tag">Quest Complete</span>
              <h2>You are the Code Master</h2>
              <p>
                All {WORLD_COUNT} levels are cleared and Code City is whole again. Every
                skill you relearned now powers the world around you.
              </p>
              <div className="over3d-finale-stats">
                <div className="over3d-finale-stat">
                  <strong>{totalBadgeCount}</strong>
                  <span>Badges</span>
                </div>
                <div className="over3d-finale-stat">
                  <strong>{WORLD_COUNT}/{WORLD_COUNT}</strong>
                  <span>Levels</span>
                </div>
              </div>
              <p className="over3d-finale-hint">
                {!interZoneComplete
                  ? 'But one last gate stands beyond the city walls — The Threshold. Step through it to reach the Final Gauntlet.'
                  : gauntlet.finalBossBeaten
                    ? 'You have conquered the Final Gauntlet and the Null Sovereign itself. Code City salutes its champion.'
                    : 'But one trial remains beyond the city walls — a journey, a mastery test of everything, and a final boss unlike any other.'}
              </p>
              <div className="over3d-finale-actions">
                {!readyForFinalGauntlet ? (
                  <Link
                    className="over3d-quest-btn over3d-finale-gauntlet"
                    to="/threshold"
                    onClick={dismissFinale}
                  >
                    Enter The Threshold
                  </Link>
                ) : (
                  <Link
                    className="over3d-quest-btn over3d-finale-gauntlet"
                    to={gauntlet.examPassed ? '/final/boss' : '/final/journey'}
                    onClick={dismissFinale}
                  >
                    {gauntlet.finalBossBeaten
                      ? 'Replay the Final Boss'
                      : gauntlet.examPassed
                        ? 'Face the Final Boss'
                        : 'Enter the Final Gauntlet'}
                  </Link>
                )}
                <button type="button" className="over3d-finale-link" onClick={dismissFinale}>
                  Take a victory lap
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Guide companion side panel */}
        <div className="guide-panel">
          <div className="guide-avatar" style={{ background: guideColor }}>
            <span className="guide-eye" />
          </div>
          <div className="guide-text">
            <span className="guide-name">Bit · your guide</span>
            <p>{guideLine}</p>
          </div>
        </div>

        {/* Enter prompt */}
        {nearby && (
          <div className={`over3d-prompt ${nearby.locked ? 'is-locked' : ''}`}>
            {nearby.locked ? (
              <span>
                <strong>{nearby.kind === 'boss' ? nearby.world.boss.name : nearby.world.name}</strong> is sealed
              </span>
            ) : nearby.kind === 'boss' ? (
              <span>
                <kbd>E</kbd> to challenge <strong>{nearby.world.boss.name}</strong>
              </span>
            ) : (
              <span>
                <kbd>E</kbd> enter{' '}
                <strong>{questPositionLabel(nearby.world.index, nearby.part ?? 0, false)}</strong>
              </span>
            )}
          </div>
        )}

        {/* Touch controls: analog joystick (move / rim = sprint) + fire button */}
        {touchUi && (
          <>
            <TouchJoystick moveRef={touchMoveRef} />
            <button
              type="button"
              className={`over3d-fire-btn ${firing ? 'is-on' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault()
                startFire()
              }}
              onPointerUp={endFire}
              onPointerLeave={endFire}
              onPointerCancel={endFire}
              aria-pressed={firing}
              title="Hold to fire (or hold F)"
            >
              <IconBolt size={22} />
              <span>Fire</span>
            </button>
          </>
        )}

        {/* Action buttons — sprint (hold) + blade dash (tap, with cooldown) */}
        <div className="over3d-action-btns">
          <button
            type="button"
            className={`over3d-dash-btn ${dashCd >= 1 ? 'is-ready' : 'is-cooling'}`}
            onPointerDown={(e) => {
              e.preventDefault()
              triggerDash()
            }}
            title="Blade dash — slice through the horde (Q)"
          >
            <span className="over3d-dash-cool" style={{ transform: `scaleY(${1 - Math.min(1, dashCd)})` }} aria-hidden="true" />
            <span className="over3d-dash-label">
              <IconBolt size={18} />
              Dash
              <kbd>Q</kbd>
            </span>
          </button>
          <button
            type="button"
            className={`over3d-sprint-btn ${sprinting ? 'is-on' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              startSprint()
            }}
            onPointerUp={endSprint}
            onPointerLeave={endSprint}
            onPointerCancel={endSprint}
            aria-pressed={sprinting}
            title="Hold to sprint (or hold Shift)"
          >
            <IconBolt size={18} />
            <span>Sprint</span>
            <kbd>Shift</kbd>
          </button>
        </div>

        {/* Controls hint */}
        <div className="over3d-controls-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>←</kbd><kbd>→</kbd> turn</span>
          <span><kbd>Shift</kbd> sprint</span>
          <span><kbd>Q</kbd> blade dash</span>
          <span><kbd>C</kbd> lay low</span>
          <span><kbd>Space</kbd> jump</span>
          <span><kbd>F</kbd> shoot</span>
        </div>
      </div>
    </div>
  )
}
