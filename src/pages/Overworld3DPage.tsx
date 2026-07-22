import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type MutableRefObject,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei'
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
import { Loader } from '../components/Loader'
import { PowerUnlock } from '../components/game/PowerUnlock'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useGauntlet } from '../context/GauntletContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { KILL_XP, answerXp } from '../lib/playerLevel'
import { prefetchBossBattle } from '../lib/prefetchBattle'
import {
  grantAcademyBossEntry,
  grantAcademyTrackEntry,
} from '../lib/gameAccess'
import {
  BOSS_DONE_KEY,
  COMBAT_SNAP_KEY,
  consumeAcademyCheckpointReturn,
  consumeAcademyReviewReturn,
  consumeBeatReturn,
  INTRO_KEY,
  LEVEL_WELCOME_KEY,
  loadClearedEncounters,
  loadFreshRunState,
  loadFreshRunTour,
  markBeatReturn,
  PART_DONE_KEY,
  persistClearedEncounters,
  POS_KEY,
  recordReviveUsed,
  resolveQuestResume,
  REVIVES_PER_LEVEL,
  revivesLeft,
  saveFreshRunTour,
  spawnAfterQuestEntry,
  startFreshQuestRun,
  TOUR_KEY,
  spawnForQuestObjective,
  type QuestTour,
  type SpawnSave,
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
import {
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_REALM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  ACADEMY_BOSS_STAGE,
  academyMissionPath,
  academyTourPosition,
  academyWorldState,
  isRealmRunPassed,
  realmBossFollowUp,
  realmIdForWorldIndex,
  trackIdForCheckpoint,
} from '../lib/academyQuest'
import {
  isMissionRetentionDue,
  selectTrackProgress,
} from '../lib/academyProgress'
import { freshRunProgressView } from '../lib/freshRunView'
import {
  buildBeatInteractables,
  beatForProblem,
  legBeatProgress,
  legBeats,
  nextPendingBeat,
  worldBeatVisuals,
  type EncounterBeat,
} from '../lib/encounterBeats'
import {
  ARCADE_QUESTIONS_PER_SESSION,
  PHOTO_COSMETICS,
  arcadeSessionsRemaining,
  claimBitPickups,
  claimCourierDelivery,
  courierRouteById,
  firstDeliveryDone,
  isoWeekKey,
  markNpcChatToday,
  placeBitCollectibles,
  readCityDaily,
  readCityLifetime,
  readCityMilestones,
  readCollectedBitIds,
  readNpcChatsToday,
  recordCollectedBitIds,
  startArcadeSession,
  unlockedPhotoCosmeticIds,
} from '../lib/cityLife'
import { placeMemoryCrystals } from '../lib/crystalPlacement'
import { buildWarmupSession, dueReviewCount, hasReviewHistory } from '../lib/warmup'
import {
  buildCityInteractables,
  type CityInteractable,
} from '../components/game3d/city/interactables'
import {
  collectBitsNear,
  dateFromIsoWeekKey,
} from '../components/game3d/city/bitCollectiblesCore'
import type { HoverboardPose } from '../components/game3d/city/hoverboardCore'
import {
  courierArrived,
  courierElapsedSeconds,
  photoFileName,
  resolveCityInteraction,
  startCourierRun,
  type CourierRun,
} from '../components/overworld/cityInteractions'
import type { QuizChainQuestion } from '../components/overworld/quizChain'
import type { ArcadeDuePointer } from '../components/overworld/ArcadeOverlay'
import type { PhotoSelection } from '../components/overworld/PhotoModeOverlay'
import {
  combatAdjustForBand,
  hordeTierAtPosition,
  questHordeTier,
} from '../lib/hordeTier'
import { targetConcept, weakestBand } from '../lib/learnerModel'
import { getMicroQuestion, type MicroQuestion } from '../content/microQuestions'
import type { ConceptId } from '../types/lesson'
import type { ProblemId, RealmId, TrackId } from '../types/curriculum'
import {
  Ground,
  Roads,
  StreetDecals,
  InstancedWorld,
  CheckpointPortal,
  GateBuilding,
  BossTotem,
  LandmarkMesh,
  FloorPath,
} from '../components/game3d/Primitives3D'
import { DistanceGate } from '../components/game3d/ProximityInstances'
import { HoverTraffic } from '../components/game3d/life/HoverTraffic'
import { CitizenCrowd } from '../components/game3d/life/CitizenCrowd'
import { AmbientLife } from '../components/game3d/life/AmbientLife'
import { DistrictAprons } from '../components/game3d/life/DistrictAprons'
import {
  ThirdPersonController,
  type Target,
  type DashState,
  type TouchMoveState,
} from '../components/game3d/ThirdPersonController'
import {
  CombatSystem,
  type CombatApi,
  type EncounterSpawn,
} from '../components/game3d/CombatSystem'
import { EncounterBeatField } from '../components/game3d/city/EncounterBeatField'
import {
  getMeshyPreload,
  subscribeMeshyPreload,
} from '../components/game3d/meshy/preloadStatus'
import { SimulationDriver } from '../components/game3d/SimulationDriver'
import { NIGHT_AMBIENT_FLOOR, SIM } from '../components/game3d/simulation'
import { SimulationSky, SkyEnvironment } from '../components/game3d/SimulationSky'
import { CascadedSunlight } from '../components/game3d/CascadedSunlight'
import { DuskLightShafts } from '../components/game3d/OverworldGodRays'
import { hdriMode } from '../components/game3d/skyIbl'
import { RainSystem } from '../components/game3d/weather/RainSystem'
import { useWeatherScheduler } from '../components/game3d/weather/useWeatherScheduler'
import { DistrictStreamer } from '../components/game3d/streaming/DistrictStreamer'
import {
  setMeshyHiddenBuildings,
  useMeshyLandmarkMask,
} from '../components/game3d/meshy/meshySwap'
import type { QualityTier } from '../components/game3d/cinematic/quality'
import { readDeviceCaps, simTierForDpr } from '../lib/graphicsQuality'
import {
  GOVERNOR_MAX_NOTCH,
  GOVERNOR_WARMUP_MS,
  governedProfile,
  densityTierForNotch,
  initialGovernorState,
  resolveBootNotch,
  stepGovernor,
  stepJankFrame,
  writeNotchHint,
} from '../lib/graphicsGovernor'
import { playHeartbeat, playHeartPickup, playPlayerHurt } from '../lib/soundFx'
import {
  CHECKPOINTS_3D,
  START_3D,
  GROUND_HALF,
  LANDMARKS,
  WORLD_GATES,
  GATES_PER_WORLD,
  collidersNear,
  dynamicColliderCounts,
  questDoor,
  type Vec2,
} from '../components/game3d/layout'
import { IconBolt, IconGrid, IconCompass } from '../components/icons'
import './Overworld3DPage.css'

/* ---------------------------------------------------------------------------
   Living Code City — lazy layers. The world-object layer (3D, inside the
   Canvas) and the 2D interaction overlays load on demand so guests and the
   first paint never pay for them; the NPC GLB streams behind its own
   Suspense inside CityWorldObjects.
   ------------------------------------------------------------------------- */
const CityWorldObjects = lazy(() =>
  import('../components/game3d/city/CityWorldObjects').then((m) => ({
    default: m.CityWorldObjects,
  })),
)
const ArcadeOverlay = lazy(() =>
  import('../components/overworld/ArcadeOverlay').then((m) => ({
    default: m.ArcadeOverlay,
  })),
)
const NpcDialogOverlay = lazy(() =>
  import('../components/overworld/NpcDialogOverlay').then((m) => ({
    default: m.NpcDialogOverlay,
  })),
)
const PhotoModeOverlay = lazy(() =>
  import('../components/overworld/PhotoModeOverlay').then((m) => ({
    default: m.PhotoModeOverlay,
  })),
)
// Meshy prop layer (MEDIUM+ only): the GLB loaders, manifest, and instanced
// batches all live in this lazy chunk — LOW never fetches a byte of it.
const MeshyCityLayer = lazy(() => import('../components/game3d/meshy/MeshyCityLayer'))

/**
 * Photo-mode capture hook: renders the live scene once (synchronously, so the
 * default framebuffer is fresh — preserveDrawingBuffer stays off) and returns
 * a PNG data URL. Post effects are skipped; tone mapping still applies.
 */
function CaptureBridge({
  apiRef,
}: {
  apiRef: MutableRefObject<(() => string) | null>
}) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    apiRef.current = () => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/png')
    }
    return () => {
      apiRef.current = null
    }
  }, [gl, scene, camera, apiRef])
  return null
}

/** Overlay state for the two quiz-chain interactions (arcade / NPC chat). */
type CityOverlayState =
  | {
      kind: 'arcade'
      session: QuizChainQuestion[]
      remaining: number
      duePointers: ArcadeDuePointer[]
    }
  | {
      kind: 'npc'
      npcName: string
      districtTitle: string
      questions: readonly QuizChainQuestion[]
    }
  | null

const LANDMARK_GLYPH: Record<string, string> = {
  windmill: 'W',
  lighthouse: 'L',
  spire: 'S',
  arch: 'A',
  tower: 'T',
  mountain: 'M',
}

// Safe houses: the spawn plaza + every checkpoint gate along the route. During
// the night these glow and become the player's shelter from the fast horde.
const SHELTERS: Vec2[] = [
  { x: START_3D.x, z: START_3D.z },
  ...WORLD_GATES.flat().map((g) => ({ x: g.x, z: g.z })),
]

const BOSS_STAGE = ACADEMY_BOSS_STAGE

/**
 * Hold-out siege: each checkpoint is a survival gauntlet. You must survive this
 * many seconds of escalating waves before the gate UNLOCKS and you can enter.
 * Combined with the walk-in, a checkpoint takes roughly a couple of minutes.
 * Level 1 is a gentle onboarding ramp (short holds) before the full siege.
 */
/** Per-mission unlock siege (July 2026 — replaces the checkpoint hold-out):
 * arriving at a terminal/bounty beat starts this defense timer under zombie
 * pressure; the mission unlocks when it expires. Rescue beats skip the timer
 * (clearing the 5-zombie ring rescues the citizen and unlocks immediately). */
const BEAT_SIEGE_SECONDS = 30
/** Metres from the beat marker that arm its defense. */
const BEAT_SIEGE_TRIGGER = 18

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
  if (atBoss) {
    return questDoor(WORLD_GATES[world][GATES_PER_WORLD - 1], 6.5)
  }
  if (stage === 0) {
    if (world === 0) return START_3D
    return questDoor(CHECKPOINTS_3D[world - 1].boss, 6.5)
  }
  return questDoor(WORLD_GATES[world][stage - 1], 6.5)
}

type Milestone = { title: string; body: string; cta?: string }

function loadTour(): QuestTour | null {
  try {
    const raw = sessionStorage.getItem(TOUR_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<QuestTour>
    return typeof value.world === 'number' && typeof value.stage === 'number'
      ? { world: value.world, stage: value.stage }
      : null
  } catch {
    return null
  }
}

function introAlreadySeen(): boolean {
  try {
    return !!sessionStorage.getItem(INTRO_KEY)
  } catch {
    return false
  }
}

function loadPos(): SpawnSave | null {
  try {
    const raw = sessionStorage.getItem(POS_KEY)
    if (raw) {
      const value = JSON.parse(raw) as Partial<SpawnSave>
      if (
        typeof value.x === 'number' &&
        typeof value.z === 'number' &&
        typeof value.h === 'number'
      ) {
        return { x: value.x, z: value.z, h: value.h }
      }
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
  return 'Reach this level’s current checkpoint first.'
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
 *
 * Phase 2 (`godRays`, ULTRA profiles only): a fused dawn/dusk light-shaft
 * pass slots in after bloom, and the ACES exposure opens up a touch — the
 * only tone tweak, applied here so tier changes stay live.
 */
const OverworldEffects = memo(function OverworldEffects({
  tier,
  shakeRef,
  godRays = false,
  cleanGrade = false,
}: {
  tier: QualityTier
  shakeRef: React.MutableRefObject<number>
  godRays?: boolean
  /** Realism-rebuild grading (MEDIUM+ profiles): higher bloom threshold so
   *  only true emissives bloom, and a slightly opened exposure. LOW keeps the
   *  original numbers — pinned look. Profile-driven (never the adaptive sim
   *  tier) so dpr dips don't re-grade the frame. */
  cleanGrade?: boolean
}) {
  // Stable vector mutated in place — the effect uniform sees it by reference.
  const caOffset = useMemo(() => new THREE.Vector2(0.0005, 0.0005), [])
  const high = tier === 'high'
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMappingExposure = cleanGrade ? (godRays ? 1.18 : 1.14) : godRays ? 1.12 : 1.08
    return () => {
      gl.toneMappingExposure = 1.08
    }
  }, [gl, godRays, cleanGrade])
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
        intensity={tier === 'low' ? 0.5 : cleanGrade ? 0.85 : 0.9}
        luminanceThreshold={cleanGrade ? 0.88 : 0.68}
        luminanceSmoothing={cleanGrade ? 0.18 : 0.24}
      />,
    )
    if (high && godRays) {
      // ULTRA: sun shafts through the skyline at dawn/dusk. Fused into the
      // same effect pass — idle cost is one uniform branch outside the window.
      out.push(<DuskLightShafts key="shafts" />)
    }
    if (tier !== 'low') {
      out.push(
        <Vignette
          key="vig"
          eskil={false}
          offset={0.22}
          darkness={cleanGrade ? 0.42 : 0.58}
        />,
      )
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
  }, [tier, high, godRays, caOffset, cleanGrade])

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {passes}
    </EffectComposer>
  )
})

// Fill-light palette (module scratch — colors never change identity).
const HEMI_SKY_DAY = new THREE.Color('#fff1d6')
const HEMI_SKY_NIGHT = new THREE.Color('#3c4668')
const HEMI_GROUND_DAY = new THREE.Color('#7a8a6a')
const HEMI_GROUND_NIGHT = new THREE.Color('#1c2030')

/**
 * The gentle shape-fill lights (hemisphere + ambient + cool rim). On MEDIUM+
 * they ride the shared night blend DOWN so night belongs to the emissives —
 * lamp pools, windows, neon — instead of a flat mint ambient wash. LOW keeps
 * the original constant fills (pinned look). Ref writes only; zero setState.
 */
function FillLights({ dimAtNight }: { dimAtNight: boolean }) {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    if (!dimAtNight) return
    const n = SIM.night.value
    const h = hemi.current
    if (h) {
      h.intensity = 0.28 * (1 - n * 0.75)
      h.color.lerpColors(HEMI_SKY_DAY, HEMI_SKY_NIGHT, n)
      h.groundColor.lerpColors(HEMI_GROUND_DAY, HEMI_GROUND_NIGHT, n)
    }
    if (amb.current) amb.current.intensity = 0.06 * (1 - n * 0.6)
    if (fill.current) fill.current.intensity = 0.22 * (1 - n * 0.55)
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#fff1d6', '#7a8a6a', 0.28]} />
      <ambientLight ref={amb} intensity={0.06} />
      {/* cool fill from the opposite side for form + depth */}
      <directionalLight ref={fill} position={[-40, 30, -28]} intensity={0.22} color="#9fc2ff" />
    </>
  )
}

/**
 * KO count + combo chip. Self-polling leaf: kills/combo change several times a
 * second in combat; reading killsRef/comboRef here (instead of page state)
 * keeps the whole overworld page from re-rendering per kill — the dominant
 * combat CPU cost found via profiling (page re-render = jsxDEV ≈ 15% of
 * samples). Polls at 150ms; only this small element updates.
 */
function KoComboChips({
  killsRef,
  comboRef,
}: {
  killsRef: React.MutableRefObject<number>
  comboRef: React.MutableRefObject<number>
}) {
  const [v, setV] = useState({ kills: 0, combo: 0 })
  useEffect(() => {
    const id = window.setInterval(() => {
      const kills = killsRef.current
      const combo = comboRef.current
      setV((prev) => (prev.kills === kills && prev.combo === combo ? prev : { kills, combo }))
    }, 150)
    return () => window.clearInterval(id)
  }, [killsRef, comboRef])
  return (
    <>
      <span className="over3d-chip over3d-chip-ko">KO {v.kills}</span>
      {v.combo >= 2 && (
        <span
          className={`over3d-chip over3d-chip-combo ${comboMultiplier(v.combo) > 1 ? 'is-hot' : ''}`}
        >
          Combo {v.combo}
          {comboMultiplier(v.combo) > 1 && <b> ×{comboMultiplier(v.combo)}</b>}
        </span>
      )}
    </>
  )
}

/**
 * Gun-heat bar. Self-polling leaf (reads gunHeatRef): firing builds heat every
 * frame, so mirroring it to page state re-rendered the whole page ~4×/s. Polls
 * at 150ms; only this element updates.
 */
function GunHeatBar({
  gunHeatRef,
}: {
  gunHeatRef: React.MutableRefObject<{ heat: number; overheated: boolean }>
}) {
  const [v, setV] = useState({ heat: 0, jammed: false })
  useEffect(() => {
    const id = window.setInterval(() => {
      const heat = gunHeatRef.current.heat
      const jammed = gunHeatRef.current.overheated
      setV((prev) =>
        Math.abs(prev.heat - heat) < 0.04 && prev.jammed === jammed ? prev : { heat, jammed },
      )
    }, 150)
    return () => window.clearInterval(id)
  }, [gunHeatRef])
  const { heat, jammed } = v
  return (
    <span
      className={`over3d-heatbar ${jammed ? 'is-jammed' : heat > 0.75 ? 'is-hot' : ''} ${jammed || heat > 0.03 ? 'is-visible' : ''}`}
      title="Pattern Cannon heat — fire in bursts or it jams. Use the sword (Q) to vent the pressure."
      aria-label={jammed ? 'Gun jammed — use the sword' : 'Gun heat'}
    >
      {jammed && <b>JAMMED — sword!</b>}
      <span className="over3d-heatbar-track" aria-hidden="true">
        <span className="over3d-heatbar-fill" style={{ width: `${Math.round(heat * 100)}%` }} />
      </span>
    </span>
  )
}

/**
 * Live "· 38m" objective-distance readout. Self-polling leaf: the distance
 * changes every step the player takes, and keeping it as page state made the
 * ENTIRE overworld tree re-render per digit while sprinting (measured as the
 * single biggest mid-run frame hitch). Only this tiny element re-renders now.
 */
function ObjDistReadout({
  guidePosRef,
  playerPosRef,
  bold,
}: {
  guidePosRef: React.MutableRefObject<Vec2 | null>
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  bold?: boolean
}) {
  const [dist, setDist] = useState<number | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = guidePosRef.current
      const p = playerPosRef.current
      const next = g ? Math.round(Math.hypot(g.x - p.x, g.z - p.z)) : null
      setDist((prev) => (prev === next ? prev : next))
    }, 250)
    return () => window.clearInterval(id)
  }, [guidePosRef, playerPosRef])
  if (dist == null) return null
  return bold ? <b> · {dist}m</b> : <> · {dist}m</>
}

/** Nearest-shelter arrow + distance (night navigation). Self-polling leaf for
 *  the same reason as ObjDistReadout — running toward a shelter used to
 *  re-render the whole page 4×/s all night. */
function ShelterCompass({
  target,
  playerPosRef,
  headingRef,
}: {
  target: { x: number; z: number }
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  headingRef: React.MutableRefObject<number>
}) {
  const [view, setView] = useState<{ dist: number; angleDeg: number } | null>(null)
  useEffect(() => {
    const tick = () => {
      const p = playerPosRef.current
      const dist = Math.round(Math.hypot(target.x - p.x, target.z - p.z))
      const bearing = Math.atan2(target.x - p.x, target.z - p.z)
      const angleDeg = ((bearing - headingRef.current) * 180) / Math.PI
      setView((prev) =>
        prev && prev.dist === dist && Math.abs(prev.angleDeg - angleDeg) < 2
          ? prev
          : { dist, angleDeg },
      )
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [target, playerPosRef, headingRef])
  if (!view) return null
  return (
    <span className="over3d-nightbar-shelter">
      <span
        className="over3d-shelter-arrow"
        style={{ transform: `rotate(${view.angleDeg}deg)` }}
        aria-hidden="true"
      >
        ↑
      </span>
      Shelter {view.dist}m
    </span>
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

// Bit's readout for the active street mission, by encounter kind.
const BEAT_GUIDE_LINE: Record<'terminal' | 'rescue' | 'bounty', string> = {
  terminal:
    'A corrupted terminal is scrambling this street — defend it for 30s, then press E to restore it',
  rescue:
    'Yellow marker: kill all 5 zombies in the ring — the citizen is rescued the moment the last one falls (then press E)',
  bounty:
    'Red shard: survive the 30s guardian siege and kill the Elite Glitch — then press E',
}

type WorldStateEntry = {
  world: World
  state: ReturnType<typeof academyWorldState>
}

function MiniMap({
  playerPosRef,
  headingRef,
  night,
  shelterTarget,
}: {
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  headingRef: React.MutableRefObject<number>
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
 *
 * MEDIUM+ swaps each primitive for its Meshy model the moment it decodes
 * (the lazy Meshy layer publishes the mask); until then — and always on LOW —
 * the primitive landmark renders. Index 5's cliff is never masked (the wind
 * turbine is additive on the ridge beside it).
 */
const LandmarkField = memo(function LandmarkField({ cullRadius }: { cullRadius: number }) {
  const meshyMask = useMeshyLandmarkMask()
  // Landmarks are wayfinding beacons, so they get the widest bubble — but
  // beyond ~1.3× the cull radius the fog has fully swallowed them anyway.
  const radius = cullRadius * 1.3
  return (
    <>
      {LANDMARKS.map((l) =>
        (meshyMask & (1 << l.index)) !== 0 ? null : (
          <DistanceGate key={`lm-${l.index}`} x={l.pos.x} z={l.pos.z} radius={radius}>
            <LandmarkMesh landmark={l} />
          </DistanceGate>
        ),
      )}
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
  cullRadius,
}: {
  states: WorldStateEntry[]
  tourDone: boolean
  atBoss: boolean
  tourWorldClamped: number
  isGuest: boolean
  cullRadius: number
}) {
  return (
    <>
      {states.map(({ world }, i) => {
        const cp = CHECKPOINTS_3D[i]
        const isCurrentWorld = !tourDone && i === tourWorldClamped
        return (
          <group key={world.id}>
            {/* Academy buildings stay as city scenery (no completion shown).
                Each site hides entirely outside the player bubble — dozens of
                meshes per district that used to render from anywhere. */}
            <DistanceGate x={cp.flag.x} z={cp.flag.z} radius={cullRadius}>
              <CheckpointPortal
                world={world}
                pos={cp.flag}
                locked={false}
                cleared={false}
                active={false}
              />
            </DistanceGate>
            <DistanceGate x={cp.boss.x} z={cp.boss.z} radius={cullRadius}>
              <BossTotem
                world={world}
                pos={cp.boss}
                locked={isCurrentWorld && atBoss ? isGuest : false}
                cleared={false}
                hideLabel={!(isCurrentWorld && atBoss)}
              />
            </DistanceGate>
          </group>
        )
      })}
    </>
  )
})

/** Boot-veil tuning: the loader drops after the first genuinely smooth run of
 * frames (or the hard cap), so shader-compile hitches happen behind it. */
const BOOT_STABLE_FRAME_MS = 55
const BOOT_STABLE_RUN = 6
const BOOT_MIN_MS = 400
/** Hard cap counted from the moment the full-city preload lands (the veil is
 *  allowed to take as long as the preload needs — owner direction — but must
 *  never wedge afterwards on a machine that can't produce smooth frames). */
const BOOT_MAX_AFTER_PRELOAD_MS = 5000

/**
 * Rides the frame loop while the boot veil is up. Precompiles every material
 * currently in the scene graph a few times (Suspense keeps streaming meshes in
 * during the first frames), then — once `gate` is true (the FULL Meshy city
 * inventory is decoded and its warm-pocket draws have uploaded every texture)
 * — signals stability after a run of consecutive frames under the jank
 * threshold. The veil therefore drops onto a fully-dressed, fully-warmed,
 * already-fluid city: nothing pops in afterwards.
 */
function BootWarmup({ gate, onStable }: { gate: boolean; onStable: () => void }) {
  const doneRef = useRef(false)
  const startRef = useRef(0)
  const gateAtRef = useRef(0)
  const lastRef = useRef(0)
  const runRef = useRef(0)
  const frameRef = useRef(0)
  const gateRef = useRef(gate)
  gateRef.current = gate
  useFrame(({ gl, scene, camera }) => {
    if (doneRef.current) return
    const now = performance.now()
    frameRef.current++
    if (startRef.current === 0) {
      startRef.current = now
      lastRef.current = now
      return
    }
    const dt = now - lastRef.current
    lastRef.current = now
    if (frameRef.current === 2 || frameRef.current % 15 === 0) {
      try {
        gl.compile(scene, camera)
      } catch {
        /* a mid-compile context loss must not crash the frame loop */
      }
    }
    // Insta-render contract: frames only count toward stability once every
    // Meshy model is resident — decode jank must stay behind the veil, and
    // the last-decoded models still need their warm draws + compiles here.
    if (!gateRef.current) {
      runRef.current = 0
      gateAtRef.current = 0
      return
    }
    if (gateAtRef.current === 0) gateAtRef.current = now
    const elapsed = now - startRef.current
    runRef.current = dt <= BOOT_STABLE_FRAME_MS ? runRef.current + 1 : 0
    if (
      (elapsed >= BOOT_MIN_MS && runRef.current >= BOOT_STABLE_RUN) ||
      now - gateAtRef.current >= BOOT_MAX_AFTER_PRELOAD_MS
    ) {
      doneRef.current = true
      onStable()
    }
  })
  return null
}

/**
 * Feeds every rAF frame's wall-clock duration to the jank-aware governor
 * signal (stepJankFrame): average fps can look fine while a spiky stream of
 * 33–100ms frames makes traversal FEEL laggy. Renders nothing; the page owns
 * all the protected-window guards inside `onFrame`. `enabled` (the boot veil
 * has dropped) gates counting, but the previous-frame timestamp is kept warm
 * regardless so the first enabled frame never reads a stale mega-delta.
 */
function JankMeter({
  enabled,
  onFrame,
}: {
  enabled: boolean
  onFrame: (frameMs: number, now: number) => void
}) {
  const last = useRef(0)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  useFrame(() => {
    const now = performance.now()
    const prev = last.current
    last.current = now
    if (!enabledRef.current || prev === 0) return
    onFrame(now - prev, now)
  })
  return null
}

export function Overworld3DPage() {
  const { ready } = useProgress()
  if (!ready) return <Loader label="Restoring academy progress" night />
  return <HydratedOverworld3DPage />
}

function HydratedOverworld3DPage() {
  // Dev-only render counter: perf probes read window.__owRenders to measure
  // how often this (very large) page re-renders during gameplay — a
  // load-independent proxy for the React reconcile cost. Stripped in prod.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __owRenders?: number }).__owRenders =
      ((window as unknown as { __owRenders?: number }).__owRenders ?? 0) + 1
  }
  const navigate = useNavigate()
  const { isGuest, isShowcaseAccount, identityId } = useAuth()
  const {
    totalBadgeCount,
    academyProgress,
    trackProgress,
    realmProgress,
    academyCampaignComplete,
    interZoneComplete,
    readyForFinalGauntlet,
    learnerModel,
    recordConceptResult,
    cloudEnabled,
    syncLearningNow,
    dueProblemIds,
  } = useProgress()
  const { state: gauntlet } = useGauntlet()
  const { addXp, info: playerLevel, title: playerTitle } = usePlayerLevel()

  // Smooth-first: boot at a device-aware notch (weak / mobile GPUs skip the
  // ULTRA grind), then the invisible governor is the only mid-session
  // downshifter. A session hint means refreshes restart near the last stable
  // notch. There is no Graphics panel.
  const [gfxNotch, setGfxNotch] = useState(() => resolveBootNotch())
  // Meshy building swaps are disabled — wipe any stale hide-set (HMR / a
  // prior session) so the procedural city never boots with invisible boxes,
  // even when the Meshy layer itself is unmounted at the safety floor.
  useEffect(() => {
    setMeshyHiddenBuildings([])
  }, [])
  const profile = useMemo(
    () => governedProfile(gfxNotch, readDeviceCaps().devicePixelRatio),
    [gfxNotch],
  )
  // Render resolution adapts to the live frame rate: full sharpness on capable
  // GPUs, automatically dialled back when the horde gets thick so the game keeps
  // running smoothly instead of dropping frames. The profile sets the window.
  const [dpr, setDpr] = useState(() => profile.dpr.start)
  // Remount the Canvas after a WebGL context restore so materials / RTs come
  // back clean (a lost context otherwise leaves a permanent black city).
  const [glGeneration, setGlGeneration] = useState(0)
  // Boot veil: keep the loader over the canvas until the scene has produced a
  // run of smooth frames, so shader compiles / first uploads happen unseen.
  const [bootStable, setBootStable] = useState(false)
  const handleBootStable = useCallback(() => setBootStable(true), [])
  // ONCE-PER-MOUNT LATCH (owner directive: "there should be ONE time this
  // happens"). Everything that can re-arm the boot gate mid-session — a
  // governor notch crossing remounting the Meshy layer (its preloader
  // republishes 0/N), a WebGL context restore remounting the Canvas, late
  // asset streaming — must never re-raise the veil or re-pause gameplay.
  const bootDoneRef = useRef(false)
  // Insta-render contract: the veil ALSO holds until the Meshy preloader has
  // decoded the full city inventory (see MeshyCityPreloader) — gameplay then
  // never fetches/decodes a model again, and NOTHING pops in after the veil
  // drops. When the Meshy layer is going to mount, the veil now also waits
  // for the preloader to START (the lazy chunk landing), closing the old gap
  // where a fast boot dropped the veil onto an undressed city and re-raised
  // it seconds later. A generous waiver keeps a broken network from wedging
  // the loader forever ("take a long time if you have to" — owner).
  const meshyPreload = useSyncExternalStore(
    subscribeMeshyPreload,
    getMeshyPreload,
    () => ({ started: false, total: 0, loaded: 0 }),
  )
  // GRAPHICS-PURITY FLOOR: the Meshy city layer stays mounted at EVERY
  // governor notch. The old safety floor (notch 3 → density 'low') unmounted
  // the layer entirely, which (a) turned every car/tree/prop back into
  // primitive boxes — the owner's "blocky graphics" — and (b) re-armed the
  // boot preloader when the governor later recovered, re-raising the loading
  // veil mid-gameplay. The deepest notch now keeps MEDIUM density; the
  // governor's honest levers stay resolution / shadow scale / city-life.
  const meshyTier = densityTierForNotch(Math.min(gfxNotch, 2))
  const meshyLayerExpected = meshyTier !== 'low'
  // The waiver is STALL-based, not clock-based: as long as the preloader
  // reports progress the veil holds ("take a long time if you have to" —
  // owner). Only a genuinely hung pipeline (no started signal, no new model
  // for 45s: broken network, wedged decoder) waives the gate — a slow boot
  // on a starved machine must never drop the veil onto an undressed city.
  const [preloadWaived, setPreloadWaived] = useState(false)
  useEffect(() => {
    if (preloadWaived) return
    const id = window.setTimeout(() => setPreloadWaived(true), 45_000)
    return () => window.clearTimeout(id)
  }, [preloadWaived, meshyPreload.started, meshyPreload.loaded])
  const preloadReady =
    !meshyLayerExpected ||
    (meshyPreload.started && meshyPreload.loaded >= meshyPreload.total) ||
    preloadWaived
  if (bootStable && preloadReady) bootDoneRef.current = true
  // Latched: true forever once the first boot completed — later preload
  // republishes (layer remounts, context restores) never re-block gameplay.
  const bootReady = bootDoneRef.current
  // A notch change re-windows the adaptive resolution — clamp the live value in.
  useEffect(() => {
    setDpr((d) => Math.max(profile.dpr.min, Math.min(profile.dpr.max, d)))
  }, [profile])
  // Living Simulation quality tier, derived from the same adaptive-resolution
  // signal the PerformanceMonitor already drives — no second monitor. Weak GPUs
  // (dpr stepped to the floor) drop the hologram/sky flourishes and the heavier
  // post passes; capable ones get the full look. Deep notches cap it.
  const simTier: QualityTier = simTierForDpr(dpr, profile)
  // The post-processing pass CHAIN is pinned to the profile's ceiling (the
  // tier the adaptive dpr window can reach) instead of the live dpr-derived
  // tier: rebuilding the EffectComposer whenever the dpr crossed the
  // high-post threshold was BOTH a measured mid-sprint hitch (pass-program
  // compiles + render-target churn) AND a visible full-frame change right
  // after the boot veil dropped. dpr dips still shed resolution; a real
  // governor notch change (new profile) is what lowers the chain.
  const effectsTier: QualityTier = useMemo(
    () => simTierForDpr(profile.dpr.max, profile),
    [profile],
  )

  // Governor wiring: PerformanceMonitor FPS samples feed the pure stepper.
  const fpsRef = useRef(0)
  const governorRef = useRef(initialGovernorState(resolveBootNotch()))
  const lastSampleRef = useRef(0)
  const mountedAtRef = useRef(performance.now())
  // Tab-switch guard: rAF stops while the page is hidden, so the first
  // samples after a return report garbage fps over the whole hidden gap —
  // folding those in demoted the notch on EVERY tab switch (and stepping
  // back up later re-armed the Meshy preload: the mid-gameplay loading
  // screen). Hidden samples are dropped and a short grace after returning
  // lets the compositor settle before the governor listens again.
  const visibilityGraceUntilRef = useRef(0)
  useEffect(() => {
    const enterGrace = () => {
      visibilityGraceUntilRef.current = performance.now() + 4_000
      lastSampleRef.current = 0
      // A below-floor (or above-recovery) streak must not survive the
      // suspension: "sustained" means continuous wall-clock evidence, and a
      // pre-hide streak completing right after return demoted the notch on
      // every tab switch. The jank tally resets for the same reason — the
      // first frames back from a suspension are compositor artifacts.
      governorRef.current = {
        ...governorRef.current,
        belowMs: 0,
        aboveMs: 0,
        jankWindowStart: 0,
        jankCount: 0,
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') enterGrace()
      else lastSampleRef.current = 0
    }
    document.addEventListener('visibilitychange', onVisibility)
    // Belt-and-braces for lifecycle states that never fire visibilitychange
    // (frozen pages, aggressive timer throttling): a gap in a 1s heartbeat
    // means the page just woke from a suspended state — same grace applies.
    let lastBeat = performance.now()
    const beat = window.setInterval(() => {
      const now = performance.now()
      if (now - lastBeat > 2_500) enterGrace()
      lastBeat = now
    }, 1_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(beat)
    }
  }, [])
  const perfSignalsBlocked = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return true
    }
    return performance.now() < visibilityGraceUntilRef.current
  }, [])
  const handlePerfChange = useCallback((api: PerformanceMonitorApi) => {
    fpsRef.current = api.fps
    if (perfSignalsBlocked()) {
      lastSampleRef.current = 0
      return
    }
    const now = performance.now()
    const dtMs = lastSampleRef.current === 0 ? 0 : now - lastSampleRef.current
    lastSampleRef.current = now
    // Warmup grace: first-load shader compiles + Meshy decodes tank the frame
    // rate on every machine — don't let boot jank demote strong devices.
    if (now - mountedAtRef.current < GOVERNOR_WARMUP_MS) return
    if (dtMs <= 0 || dtMs > 20_000) return // first sample / tab was hidden
    const step = stepGovernor(governorRef.current, api.fps, dtMs, now)
    governorRef.current = step.state
    if (step.changed) {
      const notch = step.state.notch
      writeNotchHint(notch)
      // Debuggable, invisible to players.
      console.info(
        `[gfx-governor] notch → ${notch} (${['ultra', 'high-density', 'medium-density', 'safety-floor'][notch]}) at ${Math.round(api.fps)} fps`,
      )
      setGfxNotch(notch)
    }
  }, [perfSignalsBlocked])

  // Jank-aware demote signal: every rAF frame duration feeds the pure
  // long-frame detector (stepJankFrame). Average fps can hold 50+ while a
  // spiky stream of 33–100ms frames makes traversal feel laggy — sustained
  // jank now steps the SAME notch ladder down. Protected windows mirror
  // handlePerfChange exactly: hidden tab / visibility grace / boot warmup /
  // context restore (mountedAtRef resets) never feed frames, and the JankMeter
  // itself is gated on the boot veil having dropped.
  const handleJankFrame = useCallback(
    (frameMs: number, now: number) => {
      if (perfSignalsBlocked()) return
      if (now - mountedAtRef.current < GOVERNOR_WARMUP_MS) return
      const step = stepJankFrame(governorRef.current, frameMs, now)
      governorRef.current = step.state
      if (step.changed) {
        const notch = step.state.notch
        writeNotchHint(notch)
        console.info(
          `[gfx-governor] notch → ${notch} (${['ultra', 'high-density', 'medium-density', 'safety-floor'][notch]}) — sustained long frames`,
        )
        setGfxNotch(notch)
      }
    },
    [perfSignalsBlocked],
  )

  // Session position is cosmetic; durable academy evidence owns the objective.
  // Hydration and refresh both reconcile to the first incomplete track/realm.
  const durableTour = useMemo(
    () => academyTourPosition(academyProgress),
    [academyProgress],
  )
  // "Reset run" starts a FRESH RUN: a session-scoped replay anchor that
  // overrides the durable objective so a progressed account restarts at
  // Level 1 like a brand-new player. Durable academy evidence is untouched;
  // closing the tab ends the fresh run and durable progress resumes control.
  // The snapshot carries the run's own mission ledger + start time; missions
  // are replayed on OTHER routes, so a mount-time read is always current.
  const [freshRunBase, setFreshRunBase] = useState(() => loadFreshRunState())
  const freshRun = freshRunBase != null
  const [initialResume] = useState(() =>
    resolveQuestResume(
      loadFreshRunTour() ?? durableTour,
      loadTour(),
      loadPos(),
    ),
  )
  const savedPosRef = useRef<SpawnSave>(initialResume.spawn)
  const [tourWorld, setTourWorld] = useState(initialResume.tour.world)
  const [tourStage, setTourStage] = useState<number>(
    initialResume.tour.stage,
  )
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const location = useLocation()
  // Dev-only QA seam (?nohorde): scripted probes measure collision /
  // streaming / pacing on long routes the horde would otherwise cut short.
  // DEV-guarded — production ignores the parameter entirely.
  const probeNoHorde = import.meta.env.DEV && location.search.includes('nohorde')

  // The progress every DERIVED surface reads (beats, leg HUD, world map,
  // dojo/boss gating). During a fresh run this is a masked SUBSET of durable
  // evidence (see freshRunView.ts) following the live replay tour, so street
  // missions present as unplayed and re-clear one by one exactly like a first
  // playthrough. It is a read-side projection — durable evidence, and the
  // durable consumers that advance it, still read `academyProgress` directly.
  const viewProgress = useMemo(
    () =>
      freshRunBase
        ? freshRunProgressView(academyProgress, {
            ...freshRunBase,
            tour: { world: tourWorld, stage: tourStage },
          })
        : academyProgress,
    [freshRunBase, academyProgress, tourWorld, tourStage],
  )

  const states = useMemo(() => {
    return WORLDS.map((world, worldIndex) => {
      return {
        world,
        state: academyWorldState(viewProgress, worldIndex),
      }
    })
  }, [viewProgress])

  const clearedCount = states.filter((s) => s.state.mastered).length
  const allCleared = academyCampaignComplete

  useEffect(() => {
    sessionStorage.setItem(TOUR_KEY, JSON.stringify({ world: tourWorld, stage: tourStage }))
    // The fresh-run anchor follows the replay run so a refresh resumes the
    // replay at its own objective instead of snapping back to durable.
    if (freshRun) saveFreshRunTour({ world: tourWorld, stage: tourStage })
  }, [tourWorld, tourStage, freshRun])

  // FRESH-RUN replay advancement. A review-mode replay records no durable
  // evidence, so the normal academy-return advancement below can never fire
  // for it. Every clean replay logs its mission into the run's ledger (the
  // masked view then shows that beat re-cleared, walking the street trail one
  // mission at a time); when the RUN'S OWN view of the current track is
  // practice-complete, the replay trail moves one checkpoint, exactly like
  // the original run did. Durable completeness alone must never collapse the
  // leg — it always holds for replayed content.
  useEffect(() => {
    if (!freshRun) return
    const returned = consumeAcademyReviewReturn()
    if (!returned) return
    const realm = NEETCODE_150_REALM_BY_ID.get(returned.realmId as RealmId)
    const track = NEETCODE_150_TRACK_BY_ID.get(returned.trackId as TrackId)
    if (!realm || !track || track.realmId !== realm.id) return
    const world = realm.order - 1
    const part = track.realmOrder - 1
    if (world !== tourWorld || part !== tourStage || tourStage >= BOSS_STAGE) {
      return
    }
    if (!selectTrackProgress(viewProgress, track.id).practiceComplete) return

    const nextStage = part + 1
    const here = questDoor(WORLD_GATES[world][part], 6.5)
    const next =
      nextStage >= BOSS_STAGE
        ? questDoor(CHECKPOINTS_3D[world].boss, 6)
        : questDoor(WORLD_GATES[world][nextStage])
    setSpawn(here, next)
    setTourStage(nextStage)
    const nextTrackId =
      nextStage < BOSS_STAGE ? trackIdForCheckpoint(world, nextStage) : null
    // Same milestone the durable path shows: 3rd checkpoint down → boss time.
    if (nextTrackId) {
      setMilestone({
        title: `Checkpoint ${part + 1} of ${CHECKPOINTS_PER_LEVEL} complete!`,
        body: `${track.title} mastered again! ${NEETCODE_150_TRACK_BY_ID.get(nextTrackId)?.title ?? 'The next topic'} is next — follow the trail to Checkpoint ${nextStage + 1}.`,
        cta: 'Onward',
      })
    } else {
      setMilestone({
        title: 'Lessons cleared!',
        body: `Now prove your mastery — fight the boss. Follow the trail to the Realm ${realm.order} Boss Lair.`,
        cta: 'To the boss',
      })
    }
  }, [freshRun, location.key, tourWorld, tourStage, viewProgress])

  // FRESH-RUN boss advancement. Re-beating an already-defeated realm boss
  // walks the replay trail into the next realm instead of snapping to the
  // durable frontier, so this consumes the boss signal BEFORE the durable
  // effect below. Run-passing needs only the durable boss defeat (which the
  // battle page records before setting the signal) — the mastery claim
  // (quiz gate + retention) never holds the replay trail either.
  useEffect(() => {
    if (!freshRun) return
    try {
      const raw = sessionStorage.getItem(BOSS_DONE_KEY)
      if (raw == null) return
      const world = parseInt(raw, 10)
      const realmId = realmIdForWorldIndex(world)
      if (Number.isNaN(world) || !realmId) return
      if (!isRealmRunPassed(realmProgress(realmId))) return
      // A run-passed re-fight never re-derives the durable objective.
      sessionStorage.removeItem(BOSS_DONE_KEY)
      // Out-of-order re-fights (wandering into another realm's lair) don't
      // move the replay trail; only the current boss objective advances it.
      if (world !== tourWorld || tourStage < BOSS_STAGE) return

      const nextWorld = world + 1
      const here = questDoor(CHECKPOINTS_3D[world].boss, 6.5)
      const next =
        nextWorld < WORLD_COUNT ? questDoor(WORLD_GATES[nextWorld][0]) : null
      setSpawn(here, next)
      setTourWorld(nextWorld)
      setTourStage(0)
      if (nextWorld < WORLD_COUNT) {
        const nextRealmId = realmIdForWorldIndex(nextWorld)
        const nextTitle = nextRealmId
          ? NEETCODE_150_REALM_BY_ID.get(nextRealmId)?.title
          : null
        setMilestone({
          title: `Level ${levelNumber(world)} complete!`,
          body: `Vex is down again. Level ${levelNumber(nextWorld)} unlocked — ${nextTitle ?? 'the next realm'}: three new checkpoints, then its boss.`,
          cta: 'Continue',
        })
      } else {
        setMilestone({
          title: 'Run complete!',
          body: 'You replayed the whole campaign back to back. Code City is yours — explore, or reset the run to ride again.',
        })
      }
    } catch {
      /* ignore */
    }
  }, [freshRun, location.key, tourWorld, tourStage, realmProgress])

  // Academy completion marks a physical checkpoint return. Re-read durable
  // progress before moving the trail; a session event alone never unlocks it.
  useEffect(() => {
    const returned = consumeAcademyCheckpointReturn()
    if (!returned) return
    const realm = NEETCODE_150_REALM_BY_ID.get(
      returned.realmId as RealmId,
    )
    const track = NEETCODE_150_TRACK_BY_ID.get(
      returned.trackId as TrackId,
    )
    if (
      !realm ||
      !track ||
      track.realmId !== realm.id ||
      !trackProgress(track.id).complete
    ) {
      return
    }

    const nextTour = academyTourPosition(academyProgress)
    const world = realm.order - 1
    const part = track.realmOrder - 1
    const here = questDoor(WORLD_GATES[world][part], 6.5)
    const next =
      nextTour.world >= WORLD_COUNT
        ? null
        : nextTour.stage >= BOSS_STAGE
          ? questDoor(CHECKPOINTS_3D[nextTour.world].boss, 6)
          : questDoor(WORLD_GATES[nextTour.world][nextTour.stage])
    setSpawn(here, next)
    setTourWorld(nextTour.world)
    setTourStage(nextTour.stage)

    const nextTrack =
      nextTour.world === world && nextTour.stage < BOSS_STAGE
        ? trackIdForCheckpoint(nextTour.world, nextTour.stage)
        : null
    // The realm's 3rd (final) checkpoint just cleared → the boss is next.
    if (nextTrack) {
      setMilestone({
        title: `Checkpoint ${part + 1} of ${CHECKPOINTS_PER_LEVEL} complete!`,
        body: `${track.title} mastered! ${NEETCODE_150_TRACK_BY_ID.get(nextTrack)?.title ?? 'The next topic'} is next — follow the trail to Checkpoint ${nextTour.stage + 1}.`,
        cta: 'Onward',
      })
    } else {
      setMilestone({
        title: 'Lessons cleared!',
        body: `Now prove your mastery — fight the boss. Follow the trail to the Realm ${realm.order} Boss Lair.`,
        cta: 'To the boss',
      })
    }
  }, [academyProgress, location.key, trackProgress])

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
  const tourRealmId = realmIdForWorldIndex(tourWorldClamped)
  const activeTrackId =
    !tourDone && !atBoss
      ? trackIdForCheckpoint(tourWorldClamped, stageClamped)
      : null
  const activeTrack = activeTrackId
    ? NEETCODE_150_TRACK_BY_ID.get(activeTrackId)
    : null
  // View-based: a fresh run's HUD counts "Mission 1/9" again from the top.
  const activeTrackProgress = activeTrackId
    ? selectTrackProgress(viewProgress, activeTrackId)
    : null
  const activeRealm = tourRealmId
    ? NEETCODE_150_REALM_BY_ID.get(tourRealmId)
    : null
  const positionLabel = tourDone
    ? 'All 150 missions cleared!'
    : atBoss
      ? `${activeRealm?.title ?? `Realm ${levelNum}`} · Boss`
      : `${activeTrack?.title ?? questPositionLabel(tourWorldClamped, stageClamped, false)} · Mission ${Math.min((activeTrackProgress?.practicedProblems ?? 0) + 1, activeTrackProgress?.totalProblems ?? 1)}/${activeTrackProgress?.totalProblems ?? 0}`

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

  /* ------------------------------------------------------------------------
     Living Code City — interaction layer state.

     The interactables registry (buildCityInteractables) is the single source
     of pressable targets: dojo gates + bosses for everyone (guests see ONLY
     those), plus crystals / arcade / NPCs / courier / vehicle / photo spots
     for signed-in players. The world-object layer renders from the same
     registry, so what you can see and what you can press never drift apart.
     LOW keeps today's look: the city-life layer (visuals + targets) is
     gated off entirely and only the campaign doors remain.
     ------------------------------------------------------------------------ */

  // Minute-resolution clock: crystal ripeness and the weekly bit reseed are
  // slow phenomena — no need to rebuild the registry more often than this.
  const [cityClock, setCityClock] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setCityClock(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Storage-backed city-life facts, re-read when the identity changes and
  // updated in place as the session earns things (cityLife owns persistence).
  const [chattedDistricts, setChattedDistricts] = useState<ReadonlySet<number>>(
    () => new Set(readNpcChatsToday({ identityId })),
  )
  const [collectedBitIds, setCollectedBitIds] = useState<ReadonlySet<string>>(
    () => new Set(readCollectedBitIds({ identityId })),
  )
  const [vehicleUnlocked, setVehicleUnlocked] = useState(() =>
    firstDeliveryDone({ identityId }),
  )
  useEffect(() => {
    setChattedDistricts(new Set(readNpcChatsToday({ identityId })))
    setCollectedBitIds(new Set(readCollectedBitIds({ identityId })))
    setVehicleUnlocked(firstDeliveryDone({ identityId }))
  }, [identityId])

  const hasHistory = useMemo(() => hasReviewHistory(learnerModel), [learnerModel])
  const arcadeDue = useMemo(() => dueReviewCount(learnerModel), [learnerModel])

  const cityInteractables = useMemo(
    () =>
      buildCityInteractables({
        academyProgress: viewProgress,
        isGuest,
        isShowcaseAccount,
        now: cityClock,
        cloudEnabled,
        firstDeliveryDone: vehicleUnlocked,
        hasReviewHistory: hasHistory,
      }),
    [
      viewProgress,
      isGuest,
      isShowcaseAccount,
      cityClock,
      cloudEnabled,
      vehicleUnlocked,
      hasHistory,
    ],
  )

  // LOW profile: city-life objects don't render, so they don't press either.
  // City-life interactables are for signed-in players (guest flow unchanged);
  // graphics-wise everyone runs ULTRA now, so there is no tier gate here.
  const cityLifeOn = !isGuest
  const activeInteractables = useMemo(
    () =>
      cityLifeOn
        ? cityInteractables
        : cityInteractables.filter(
            ({ target }) => target.kind === 'dojo' || target.kind === 'boss',
          ),
    [cityLifeOn, cityInteractables],
  )
  // NOTE: cityByKey + the controller targets are built further down — they
  // fold in the encounter-beat layer, which needs the hold-out siege state
  // declared below.

  // Full crystal placement (ALL states — scenery included). Guests and LOW
  // render none, matching the empty registry path.
  const crystals = useMemo(
    () =>
      cityLifeOn
        ? placeMemoryCrystals({
            academyProgress: viewProgress,
            now: cityClock,
            cloudEnabled,
          })
        : [],
    [cityLifeOn, viewProgress, cityClock, cloudEnabled],
  )

  // Weekly bit field: anchor + the spawn list the auto-collect sweep tests
  // against (identical inputs to the renderer's own placement — same field).
  const bitWeekKey = isoWeekKey(new Date(cityClock))
  const bitWeekAnchor = useMemo(() => dateFromIsoWeekKey(bitWeekKey), [bitWeekKey])
  const bitSpawns = useMemo(
    () => (cityLifeOn ? placeBitCollectibles(bitWeekAnchor) : []),
    [cityLifeOn, bitWeekAnchor],
  )

  // Districts whose NPC still has a fresh chat chain today (glyph gating).
  const npcChainDistricts = useMemo(() => {
    const available = new Set<number>()
    for (const { payload } of cityInteractables) {
      if (payload.kind === 'npc' && !chattedDistricts.has(payload.districtIndex)) {
        available.add(payload.districtIndex)
      }
    }
    return available
  }, [cityInteractables, chattedDistricts])

  // A return signal only triggers presentation; the durable boss defeat it
  // reports is what advances the run. Beating the boss ALWAYS moves the trail
  // to the next realm — the strict mastery claim (assessment gate and/or
  // delayed-retrieval retention) stays available as an optional side quest and
  // is mentioned on the objective card, never demanded before advancing.
  useEffect(() => {
    if (freshRun) return // the fresh-run consumer above owns the signal
    try {
      const raw = sessionStorage.getItem(BOSS_DONE_KEY)
      if (raw == null) return
      sessionStorage.removeItem(BOSS_DONE_KEY)
      const world = parseInt(raw, 10)
      const realmId = realmIdForWorldIndex(world)
      if (Number.isNaN(world) || !realmId) return
      const progress = realmProgress(realmId)
      // The battle page sets the signal only after the durable save; a signal
      // without evidence is stale (e.g. copied storage) and moves nothing.
      if (!isRealmRunPassed(progress)) return
      const followUp = realmBossFollowUp(progress)
      const realmTitle =
        NEETCODE_150_REALM_BY_ID.get(realmId)?.title ?? 'the realm'
      const masteryNote =
        followUp.kind === 'retakeQuiz'
          ? ` Optional mastery claim for ${realmTitle}: pass its realm assessment (80%+ with the open-ended transfer) at the Boss Lair whenever you like.`
          : followUp.kind === 'retention'
            ? ` Optional mastery claim for ${realmTitle}: ${followUp.missionsRemaining} memory ${followUp.missionsRemaining === 1 ? 'crystal' : 'crystals'} will ripen around the city — harvest them to lock in what you learned.`
            : ''
      const nextTour = academyTourPosition(academyProgress)
      // Respawn at this boss, facing the next objective (usually the next
      // realm's first checkpoint; its boss door if those tracks are done).
      const here = questDoor(CHECKPOINTS_3D[world].boss, 6.5)
      const next =
        nextTour.world >= WORLD_COUNT
          ? null
          : nextTour.stage >= BOSS_STAGE
            ? questDoor(CHECKPOINTS_3D[nextTour.world].boss, 6)
            : questDoor(WORLD_GATES[nextTour.world][nextTour.stage])
      setSpawn(here, next)
      setTourWorld(nextTour.world)
      setTourStage(nextTour.stage)
      if (nextTour.world < WORLD_COUNT) {
        const nextRealm = realmIdForWorldIndex(nextTour.world)
        const nextTitle = nextRealm
          ? NEETCODE_150_REALM_BY_ID.get(nextRealm)?.title
          : null
        setMilestone({
          title: `Level ${levelNumber(world)} complete!`,
          body: `Vex is down and ${realmTitle} is restored. Level ${levelNumber(nextTour.world)} unlocked — ${nextTitle ?? 'the next realm'}: three new checkpoints, then its boss.${masteryNote}`,
          cta: 'Continue',
        })
      } else {
        setMilestone({
          title: 'Campaign trail complete!',
          body: `Every realm boss is down — Code City is yours to roam.${masteryNote}`,
        })
      }
    } catch {
      /* ignore */
    }
  }, [academyProgress, freshRun, location.key, realmProgress])

  const [nearby, setNearby] = useState<Target | null>(null)
  const nearbyRef = useRef<Target | null>(null)
  const playerPosRef = useRef(
    new THREE.Vector3(savedPosRef.current?.x ?? START_3D.x, 0, savedPosRef.current?.z ?? START_3D.z),
  )
  const headingRef = useRef(savedPosRef.current?.h ?? 0)
  // Dev-only probe hook: QA scripts read the live hero transform (collision
  // walk-through audits steer by heading, not the chase camera). Stripped
  // from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as {
      __alphaPlayer?: { pos: () => { x: number; z: number; h: number } }
    }
    w.__alphaPlayer = {
      pos: () => ({
        x: playerPosRef.current.x,
        z: playerPosRef.current.z,
        h: headingRef.current,
      }),
    }
    // Collider queries through the APP's module instance (probes that
    // re-import layout.ts get a second instance under dev HMR and would
    // miss the live dynamic registrations).
    const wc = window as unknown as {
      __alphaColliders?: {
        near: typeof collidersNear
        counts: typeof dynamicColliderCounts
      }
    }
    wc.__alphaColliders = { near: collidersNear, counts: dynamicColliderCounts }
    return () => {
      delete w.__alphaPlayer
      delete wc.__alphaColliders
    }
  }, [])

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
  // Keyboard-controls panel: open for the first minute of play (desktop only —
  // touch players get on-screen buttons), then it collapses behind the "?"
  // chip so the corner stays clean. The chip toggles it back any time.
  const [controlsOpen, setControlsOpen] = useState(!touchUi)
  useEffect(() => {
    const id = window.setTimeout(() => setControlsOpen(false), 60_000)
    return () => window.clearTimeout(id)
  }, [])
  // Shared gun-heat readout: CombatSystem writes it, the HUD polls it.
  const gunHeatRef = useRef<{ heat: number; overheated: boolean }>({
    heat: 0,
    overheated: false,
  })

  /* --------------------------------------------- city interaction channels */

  // Courier delivery run (start → carry → arrive) + the burst replay key.
  const [courierRun, setCourierRun] = useState<CourierRun | null>(null)
  const courierRunRef = useRef(courierRun)
  courierRunRef.current = courierRun
  const [courierBurstKey, setCourierBurstKey] = useState(0)
  const [courierDist, setCourierDist] = useState<number | null>(null)
  const courierRoute = courierRun ? (courierRouteById(courierRun.routeId) ?? null) : null
  const courierDestination = courierRoute?.to ?? null

  // Hoverboard: React state drives the board visual's `mounted` prop; the
  // ref twin is what the controller reads each frame (no state on hot path).
  const [hoverboardMounted, setHoverboardMounted] = useState(false)
  const rideRef = useRef({ mounted: false })
  const hoverboardPoseRef = useRef<HoverboardPose>({
    x: START_3D.x,
    y: 0,
    z: START_3D.z,
    yaw: 0,
    speed: 0,
  })
  const setMounted = useCallback((on: boolean) => {
    if (rideRef.current.mounted === on) return
    rideRef.current.mounted = on
    if (on) {
      // Seed the pose at the hero so the board doesn't flash at its old spot.
      const p = playerPosRef.current
      const pose = hoverboardPoseRef.current
      pose.x = p.x
      pose.y = 0
      pose.z = p.z
      pose.yaw = headingRef.current
      pose.speed = 0
    }
    setHoverboardMounted(on)
  }, [])

  // 2D interaction overlays (arcade / NPC chat) + photo mode.
  const [cityOverlay, setCityOverlay] = useState<CityOverlayState>(null)
  const [photoSpotIndex, setPhotoSpotIndex] = useState<number | null>(null)
  const photoSpotIndexRef = useRef(photoSpotIndex)
  photoSpotIndexRef.current = photoSpotIndex
  const captureApiRef = useRef<(() => string) | null>(null)

  // Transient city toast (delivery complete, photo saved, …).
  const [cityToast, setCityToast] = useState<string | null>(null)
  const cityToastTimer = useRef<number | null>(null)
  const showCityToast = useCallback((message: string) => {
    setCityToast(message)
    if (cityToastTimer.current) window.clearTimeout(cityToastTimer.current)
    cityToastTimer.current = window.setTimeout(() => setCityToast(null), 3200)
  }, [])
  useEffect(
    () => () => {
      if (cityToastTimer.current) window.clearTimeout(cityToastTimer.current)
    },
    [],
  )

  // Combat: pooled zombies + arrows live in CombatSystem; we keep score/HP here.
  const combatApi = useRef<CombatApi | null>(null)
  // Kills / combo / gun-heat are NOT page state: they change several times a
  // second during combat and re-rendering this (huge) page for each was the
  // dominant measured CPU cost. They live in refs and are displayed by
  // self-polling HUD leaves (KoComboChips / GunHeatBar) so the page tree is
  // never recreated for them. (kills for the end-run summary is read from
  // killsRef.current at death — see below.)
  const [hp, setHp] = useState(MAX_HP)
  const [hurt, setHurt] = useState(false)
  const [invuln, setInvuln] = useState(false)
  const [dead, setDead] = useState(false)
  // Stealth HUD flag (mirrors stealthRef for the on-screen indicator).
  const [stealthOn, setStealthOn] = useState(false)
  // Knowledge surge: the concept question raised by destroying a Glitch carrier.
  const [surge, setSurge] = useState<MicroQuestion | null>(null)
  const [surgeResult, setSurgeResult] = useState<null | 'right' | 'wrong'>(null)
  // Death fallback revive: when the leg has no pending mission, a 3-question
  // Knowledge Surge chain (2+ correct) gets the player back up in place.
  const [reviveQuiz, setReviveQuiz] = useState<{
    questions: MicroQuestion[]
    index: number
    correct: number
    failed: boolean
  } | null>(null)
  // Revive budget: 3 per level, shared by BOTH revive paths (study-to-revive
  // and Knowledge Surge). Synced from the session ledger when the death card
  // opens; a new level starts back at the full budget.
  const [revivesRemaining, setRevivesRemaining] = useState(REVIVES_PER_LEVEL)
  useEffect(() => {
    if (dead) setRevivesRemaining(revivesLeft(tourWorldClamped))
  }, [dead, tourWorldClamped])
  // Day/night cycle. At night the horde turns deadly and the player must shelter.
  const [night, setNight] = useState(false)
  const [nightLeft, setNightLeft] = useState(0)
  const [sheltered, setSheltered] = useState(false)
  // Nearest safe house for night navigation. Only the shelter's IDENTITY is
  // page state (it changes when the player crosses a midpoint); the live
  // distance/arrow readout polls inside ShelterCompass so running toward a
  // shelter doesn't re-render the whole page 4×/s.
  const [shelterInfo, setShelterInfo] = useState<{ x: number; z: number } | null>(null)
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
  // Kill count + pending XP also accumulate in refs so mowing down the horde
  // does NOT re-render this (very large) page once per kill. The 250ms HUD
  // poller flushes kills/combo → state and drains pending XP → the level
  // context. Measured: per-kill setState was the dominant combat CPU cost
  // (React re-created the whole overworld JSX tree ~10×/s — jsxDEV ≈ 15% of
  // all samples). Flushing at ≤4Hz makes the KO/combo counters lag ≤250ms
  // (imperceptible) while cutting combat re-renders by an order of magnitude.
  const killsRef = useRef(0)
  const pendingXpRef = useRef(0)
  // Stable handle to addXp for the []-dep HUD poller (which drains pendingXp).
  const addXpRef = useRef(addXp)
  addXpRef.current = addXp

  // Player i-frames last as long as the combat system suppresses damage (0.7s);
  // mirror that here for the blink/flash tell.
  const PLAYER_IFRAME_MS = 700

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
    // Hot path: accumulate into refs only — a self-polling HUD leaf reads these
    // for display and the 250ms poller drains pending XP. No per-kill page
    // re-render (the whole overworld JSX tree was being recreated per kill).
    killsRef.current += 1
    const t = performance.now()
    const chained = t - lastKillRef.current < COMBO_WINDOW_MS
    lastKillRef.current = t
    const next = chained ? comboRef.current + 1 : 1
    comboRef.current = next
    pendingXpRef.current += Math.round(KILL_XP * comboMultiplier(next))
  }, [])

  const handlePlayerHit = useCallback((damage = 1) => {
    if (deadRef.current) return
    // Taking a hit breaks the combo (ref only — KoComboChips reflects it).
    comboRef.current = 0
    lastKillRef.current = 0
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

  // Shared respawn — drop the player at the START of `targetWorld` (Checkpoint 1),
  // reset hearts / timer / night, and remount combat fresh. Lesson
  // mastery is untouched. Death keeps you on your CURRENT level by default; a
  // separate option sends you back to Level 1.
  function respawnAt(targetWorld: number, opts: { stage?: number } = {}) {
    const clamped = Math.max(0, Math.min(WORLD_COUNT - 1, targetWorld))
    const durableStage =
      opts.stage ??
      (freshRun && clamped === tourWorld
        ? Math.min(tourStage, BOSS_STAGE)
        : clamped === durableTour.world
          ? durableTour.stage
          : 0)
    const spawn = spawnForQuestObjective({
      world: clamped,
      stage: durableStage,
    })
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
    setTourStage(durableStage)
    setHp(MAX_HP)
    killsRef.current = 0
    pendingXpRef.current = 0
    setHurt(false)
    setInvuln(false)
    comboRef.current = 0
    lastKillRef.current = 0
    shakeRef.current = 0
    hitstopRef.current = 0
    setDead(false)
    setReviveQuiz(null)
    setRunId((r) => r + 1)
    // Reset the day/night cycle to a fresh dawn.
    dayClockRef.current = 0
    nightClockRef.current = 0
    setNight(false)
    setNightLeft(0)
    setSheltered(false)
    // Respawn on foot — the board waits back at its pad.
    setMounted(false)
  }

  // Default death restart: drop back in at the start of the level you reached.
  function restartLevel() {
    respawnAt(tourWorldClamped)
  }

  // "Reset current run": start a FRESH RUN at Level 1, exactly like a
  // brand-new player (intro shown, Checkpoint 1 objective, no carried run
  // state). Durable academy completion evidence stays untouched and remains
  // replayable through the fresh-run trail above.
  function restartGame() {
    startFreshQuestRun()
    setFreshRunBase(loadFreshRunState())
    respawnAt(0, { stage: 0 })
    setShowIntro(true)
  }

  // Get back up exactly where you fell, hearts restored. Used by both revive
  // paths (study-to-revive success settles via the beat-return effect above;
  // the quiz revive calls this directly).
  function reviveInPlace() {
    const p = playerPosRef.current
    persistSpawn({ x: p.x, z: p.z, h: headingRef.current })
    try {
      sessionStorage.removeItem(COMBAT_SNAP_KEY)
    } catch {
      /* ignore */
    }
    savedPosRef.current = { x: p.x, z: p.z, h: headingRef.current }
    setHp(MAX_HP)
    setHurt(false)
    setInvuln(false)
    comboRef.current = 0
    lastKillRef.current = 0
    shakeRef.current = 0
    hitstopRef.current = 0
    setDead(false)
    setReviveQuiz(null)
    setRunId((r) => r + 1)
  }

  // Death fallback when the leg has no pending mission: a 3-question surge
  // chain. 2+ correct revives in place; anything less falls back to restart.
  function startReviveQuiz() {
    if (revivesLeft(tourWorldClamped) <= 0) return
    const questions = buildWarmupSession(learnerModel, 3)
    if (questions.length < 3) return
    setReviveQuiz({ questions, index: 0, correct: 0, failed: false })
  }

  function answerReviveQuiz(choiceIndex: number) {
    if (!reviveQuiz || reviveQuiz.failed) return
    const question = reviveQuiz.questions[reviveQuiz.index]
    const correct = choiceIndex === question.answerIndex
    recordConceptResult({
      conceptIds: [question.concept],
      firstTry: true,
      correct,
    })
    const index = reviveQuiz.index + 1
    const correctCount = reviveQuiz.correct + (correct ? 1 : 0)
    if (index < reviveQuiz.questions.length) {
      setReviveQuiz({ ...reviveQuiz, index, correct: correctCount })
      return
    }
    if (correctCount >= 2) {
      const left = recordReviveUsed(tourWorldClamped)
      addXp(answerXp(true, true, 2500))
      showCityToast(
        `Knowledge surge! You\u2019re back on your feet. Revives left: ${left}.`,
      )
      reviveInPlace()
      return
    }
    setReviveQuiz({ ...reviveQuiz, index, correct: correctCount, failed: true })
  }

  // Whether the player is close to the current objective (drives the
  // checkpoint HUD focus). The live meter READOUT is no longer page state:
  // while sprinting it changed every poll tick, and each change re-rendered
  // this entire page tree (the single biggest mid-run frame hitch in dev
  // profiles). ObjDistReadout polls the same refs and re-renders only itself.
  const [objNear, setObjNear] = useState(false)
  const [hordeTier, setHordeTier] = useState(1)
  // Horde tier after the learner-model adjustment (gentler when struggling,
  // tougher when confident). Used for combat + the HUD readout.
  const effectiveHordeTier = Math.max(1, hordeTier + combatAdjust.tierDelta)
  const [dashCd, setDashCd] = useState(1) // 0 = just used .. 1 = ready
  const lastNearRef = useRef(false)
  const lastHordeRef = useRef(1)
  const lastDashCdRef = useRef(1)
  const guidePosRef = useRef<Vec2 | null>(null)

  // Live readouts (distance + horde tier) — read via refs to avoid stale closures.
  const worldEntriesRef = useRef(worldEntries)
  worldEntriesRef.current = worldEntries
  const questTierRef = useRef(questTier)
  questTierRef.current = questTier
  useEffect(() => {
    let tick = 0
    const id = window.setInterval(() => {
      tick++
      const g = guidePosRef.current
      const p = playerPosRef.current
      const dist = g ? Math.round(Math.hypot(g.x - p.x, g.z - p.z)) : null
      const near = dist != null && dist < 40
      if (near !== lastNearRef.current) {
        lastNearRef.current = near
        setObjNear(near)
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
      // Gun heat, kills and combo are NOT flushed to page state here — they are
      // displayed by self-polling HUD leaves (GunHeatBar / KoComboChips) that
      // read gunHeatRef / killsRef / comboRef directly, so combat never
      // re-renders this whole page for them. Only pending XP drains here (a
      // real context update, but batched to ≤4Hz instead of once per kill).
      if (pendingXpRef.current > 0) {
        const xp = pendingXpRef.current
        pendingXpRef.current = 0
        addXpRef.current(xp)
      }
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
        // Fresh object only when the NEAREST SHELTER changes — the live
        // distance/arrow lives in ShelterCompass (self-polling leaf).
        setShelterInfo((prev) =>
          prev && prev.x === nx && prev.z === nz ? prev : { x: nx, z: nz },
        )
      } else {
        setSheltered((prev) => (prev ? false : prev))
        setShelterInfo((prev) => (prev ? null : prev))
      }
      // Remember map position so popping over to the list returns you here.
      // Once a second is plenty — sessionStorage writes are synchronous and
      // JSON.stringify per tick was the priciest line in this poller.
      if (tick % 4 === 0) {
        try {
          sessionStorage.setItem(
            POS_KEY,
            JSON.stringify({ x: p.x, z: p.z, h: headingRef.current }),
          )
        } catch {
          /* ignore */
        }
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

  // --- Per-mission unlock sieges (replaces the checkpoint hold-out) -------
  // Terminal + bounty beats each run their own ~30s defense when the player
  // arrives at the marker; the mission unlocks when the timer expires under
  // live zombie pressure. Rescue beats have NO timer — clearing the ring
  // rescues the citizen and unlocks the mission immediately. The old
  // whole-checkpoint hold-out is gone: gates seal nothing anymore.
  const tourDoneRef = useRef(tourDone)
  tourDoneRef.current = tourDone
  // Checkpoint gates no longer seal — kept as a named constant so the beat
  // pipeline (capstone ordering, dojo-era inputs) reads unambiguously.
  const legReady = true

  // Pause sieges whenever any overlay is up (assigned after those flags
  // exist, below). The ref is read inside the tick effect.
  const overlayPausedRef = useRef(false)

  const [beatSiege, setBeatSiege] = useState<{
    beatId: string
    kind: 'terminal' | 'bounty'
    left: number
  } | null>(null)
  const beatSiegeRef = useRef(beatSiege)
  beatSiegeRef.current = beatSiege
  // Beats whose defense has been survived this session (unlocked for E).
  const [siegedBeats, setSiegedBeats] = useState<ReadonlySet<string>>(() => new Set())
  const siegedBeatsRef = useRef(siegedBeats)
  siegedBeatsRef.current = siegedBeats

  // Arm + tick the defense. Runs on the same 250ms cadence the old hold-out
  // used; pauses under overlays/death so the timer is honest fight time.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (overlayPausedRef.current || deadRef.current || tourDoneRef.current) return
      const beat = activeBeatRef.current
      const live = beatSiegeRef.current
      if (live) {
        // The objective moved (mission finished / leg advanced) — drop it.
        if (!beat || beat.id !== live.beatId) {
          setBeatSiege(null)
          return
        }
        const left = live.left - 0.25
        if (left <= 0) {
          setBeatSiege(null)
          setSiegedBeats((prev) => {
            const next = new Set(prev)
            next.add(live.beatId)
            return next
          })
          showCityToast(
            live.kind === 'terminal'
              ? 'Terminal defended — press E to restore the mission!'
              : 'Shard stabilized — drop the Elite Glitch, then press E!',
          )
        } else {
          setBeatSiege({ ...live, left })
        }
        return
      }
      if (!beat || beat.kind === 'rescue') return
      if (siegedBeatsRef.current.has(beat.id)) return
      const p = playerPosRef.current
      if (Math.hypot(beat.x - p.x, beat.z - p.z) > BEAT_SIEGE_TRIGGER) return
      setBeatSiege({ beatId: beat.id, kind: beat.kind, left: BEAT_SIEGE_SECONDS })
      showCityToast(
        beat.kind === 'terminal'
          ? `Corruption surge — defend the terminal for ${BEAT_SIEGE_SECONDS}s!`
          : `The shard's guardians stir — hold this block for ${BEAT_SIEGE_SECONDS}s!`,
      )
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ------------------------------------------------------- encounter beats
     Every academy mission is one street-side event on the leg to its gate
     (corrupted terminal / trapped citizen / elite bounty). Beat state derives
     purely from practice evidence; the only session state is which bounty /
     rescue FIGHTS were already won (so a mission trip doesn't resurrect a
     beaten elite). See lib/encounterBeats.ts. */
  const [clearedEncounters, setClearedEncounters] = useState<ReadonlySet<string>>(
    () => new Set(loadClearedEncounters()),
  )

  // The guide's next mission on the active leg (null: leg done / at boss).
  // View-based: a fresh run walks the street beats again from mission 1.
  const activeBeat = useMemo<EncounterBeat | null>(
    () =>
      tourDone || atBoss
        ? null
        : nextPendingBeat(viewProgress, tourWorldClamped, stageClamped),
    [tourDone, atBoss, viewProgress, tourWorldClamped, stageClamped],
  )
  const activeBeatRef = useRef(activeBeat)
  activeBeatRef.current = activeBeat

  // The mission "study to revive" may offer (the capstone no longer seals —
  // per-mission defenses replaced the gate siege).
  const reviveBeat = activeBeat

  const beatInteractables = useMemo(
    () =>
      buildBeatInteractables({
        academyProgress: viewProgress,
        isShowcaseAccount,
        siegeReady: true, // per-mission sieges replaced the checkpoint hold-out
        activeWorld: tourWorldClamped,
        activePart: stageClamped,
        clearedEncounterIds: clearedEncounters,
      }),
    [
      viewProgress,
      isShowcaseAccount,
      tourWorldClamped,
      stageClamped,
      clearedEncounters,
    ],
  )

  // Beats are campaign-critical, so they join the pressable set for everyone
  // (guests included — the mission page itself handles the guest preview).
  const allInteractables = useMemo(
    () => [...activeInteractables, ...beatInteractables],
    [activeInteractables, beatInteractables],
  )
  const cityByKey = useMemo(() => {
    const map = new Map<string, CityInteractable>()
    for (const interactable of allInteractables) {
      map.set(interactable.target.key, interactable)
    }
    return map
  }, [allInteractables])

  // Controller targets come straight off the registry (CityTarget is a
  // structural superset of the controller's Target). Guests additionally keep
  // today's hard boss lock: sign in before challenging a realm boss.
  const targets = useMemo<Target[]>(
    () =>
      allInteractables.map(({ target }) =>
        isGuest && target.kind === 'boss' && !target.locked
          ? { ...target, locked: true }
          : target,
      ),
    [allInteractables, isGuest],
  )

  // Leg mission progress for the HUD ("Mission 4/9 — Arrays & Hashing").
  const legMissions = useMemo(
    () =>
      tourDone || atBoss
        ? null
        : legBeatProgress(viewProgress, tourWorldClamped, stageClamped),
    [tourDone, atBoss, viewProgress, tourWorldClamped, stageClamped],
  )

  // Checkpoint HUD focus: the single centered checkpoint element expands for
  // a few seconds whenever its state changes (new leg, mission cleared, seal
  // opened, entry denied), while the gate is open, or when the objective is
  // close — and minimizes to a slim one-liner otherwise so the middle of the
  // screen stays clear during combat.
  const [checkpointPulse, setCheckpointPulse] = useState(true)
  useEffect(() => {
    setCheckpointPulse(true)
    const id = window.setTimeout(() => setCheckpointPulse(false), 5000)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourWorldClamped, stageClamped, atBoss, legMissions?.cleared, beatSiege == null])
  const checkpointOpen = legReady && !activeBeat
  const checkpointFocus =
    checkpointPulse || beatSiege != null || checkpointOpen || objNear

  // What the 3D beat layer draws for the current district.
  const beatVisuals = useMemo(
    () =>
      tourDone
        ? []
        : worldBeatVisuals(viewProgress, tourWorldClamped, {
            siegeReady: true, // per-mission sieges replaced the checkpoint hold-out
            activePart: stageClamped,
            activeBeatId: activeBeat?.id ?? null,
            clearedEncounterIds: clearedEncounters,
          }),
    [
      tourDone,
      viewProgress,
      tourWorldClamped,
      stageClamped,
      activeBeat,
      clearedEncounters,
    ],
  )

  // The pending bounty/rescue fight the combat system should stage, if any.
  const combatEncounter = useMemo<EncounterSpawn | null>(() => {
    if (!activeBeat || activeBeat.kind === 'terminal') return null
    if (clearedEncounters.has(activeBeat.id)) return null
    return {
      id: activeBeat.id,
      kind: activeBeat.kind,
      x: activeBeat.x,
      z: activeBeat.z,
    }
  }, [activeBeat, clearedEncounters])

  const handleEncounterCleared = useCallback(
    (id: string) => {
      const beat = activeBeatRef.current
      setClearedEncounters((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        persistClearedEncounters([...next])
        return next
      })
      showCityToast(
        beat?.kind === 'bounty'
          ? 'Elite down — mission unlocked! Press E on the red shard.'
          : 'Ring cleared — mission unlocked! Press E on the citizen.',
      )
    },
    [showCityToast],
  )

  // Open a beat's mission: remember where to respawn, flag the return, and
  // run the exact AcademyMissionPage flow the dojo uses — for ONE problem.
  function openBeatMission(beat: EncounterBeat, revive: boolean) {
    const p = playerPosRef.current
    persistSpawn({ x: p.x, z: p.z, h: headingRef.current })
    try {
      sessionStorage.removeItem(COMBAT_SNAP_KEY)
    } catch {
      /* ignore */
    }
    markBeatReturn(beat.problemId, revive)
    grantAcademyTrackEntry(beat.realmId, beat.trackId)
    // A fresh-run replay of already-earned content runs the full lesson+quiz
    // in non-recording review mode (durable evidence stays untouched; a clean
    // pass joins the run's ledger instead). Frontier content — no durable
    // practice yet, the replay caught up to real progress — records normally.
    const review = freshRun && !!academyProgress.missionPractices[beat.problemId]
    navigate(
      `${academyMissionPath(beat.realmId, beat.trackId, beat.problemSlug)}?from=city${review ? '&mode=review' : ''}`,
    )
  }

  // Returning from a beat mission (street encounter or study-to-revive):
  // settle the outcome once, on mount. A completed revive mission means the
  // player is already standing where they fell, hearts restored (fresh run
  // state) — bailing out instead applies the normal death penalty.
  useEffect(() => {
    const ret = consumeBeatReturn()
    if (!ret) return
    const problemId = ret.problemId as ProblemId
    // View-based: on a fresh run "practiced" means replayed THIS run (or new
    // frontier work) — durable evidence alone must not settle the beat, or a
    // bailed replay would count and a revival replay would revive for free.
    const practiced = !!viewProgress.missionPractices[problemId]
    const beat = beatForProblem(problemId)
    if (ret.revive && !practiced) {
      respawnAt(tourWorldClamped)
      return
    }
    if (!practiced || !beat) return
    // A completed study-to-revive spends one of the level's revives.
    if (ret.revive) recordReviveUsed(tourWorldClamped)
    const progress = selectTrackProgress(viewProgress, beat.trackId)
    if (progress.practiceComplete) {
      // On a fresh run the review-return consumer above owns the leg-complete
      // milestone (it also advances the replay trail) — don't overwrite it.
      if (freshRun) return
      const track = NEETCODE_150_TRACK_BY_ID.get(beat.trackId)
      setMilestone({
        title: `${track?.title ?? 'Topic'} secured!`,
        body: ret.revive
          ? 'Your revival mission finished the whole leg — this checkpoint is yours. Follow the trail onward.'
          : 'Every mission on this leg is restored. Follow the trail onward — the next street is already lighting up.',
      })
    } else if (ret.revive) {
      showCityToast(
        `Knowledge revived you — ${beat.title} counts toward the gate (${progress.practicedProblems}/${progress.totalProblems}).`,
      )
    } else {
      showCityToast(
        `Mission restored — ${beat.title} (${progress.practicedProblems}/${progress.totalProblems} on this leg).`,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  function persistSpawn(save: SpawnSave) {
    savedPosRef.current = save
    try {
      sessionStorage.setItem(POS_KEY, JSON.stringify(save))
    } catch {
      /* ignore */
    }
  }

  function setSpawn(here: Vec2, next: Vec2 | null) {
    const h = next ? Math.atan2(next.x - here.x, next.z - here.z) : 0
    persistSpawn({ x: here.x, z: here.z, h })
  }

  // Due-review pointers for the arcade's empty state (the WarmupPage rule:
  // learning-event dueness ∪ practiced missions whose retention is now due).
  function buildArcadeDuePointers(): ArcadeDuePointer[] {
    const ids = new Set(dueProblemIds.filter((id) => id.startsWith('problem:')))
    for (const problemId of Object.keys(academyProgress.missionPractices)) {
      if (
        isMissionRetentionDue(
          academyProgress,
          problemId as `problem:${string}`,
          Date.now(),
        )
      ) {
        ids.add(problemId as `problem:${string}`)
      }
    }
    return [...ids]
      .map((id) => NEETCODE_150_PROBLEM_BY_ID.get(id as `problem:${string}`))
      .filter((problem) => !!problem)
      .slice(0, 6)
      .map((problem) => ({ id: problem.id, label: problem.title }))
  }

  // Follow a due-review pointer out of the arcade into its mission.
  function openDueMission(problemId: string) {
    const problem = NEETCODE_150_PROBLEM_BY_ID.get(
      problemId as `problem:${string}`,
    )
    if (!problem) return
    setCityOverlay(null)
    grantAcademyTrackEntry(problem.realmId, problem.trackId)
    navigate(academyMissionPath(problem.realmId, problem.trackId, problem.leetcodeSlug))
  }

  /**
   * The E key, routed through the city registry: one pure resolver decides
   * what this press means (see cityInteractions.ts), the switch below runs
   * the side effects. Dojo/boss keep the hold-out siege seal on the ACTIVE
   * objective; revisits and city-life interactions skip it.
   */
  function interact() {
    if (overlayPausedRef.current) return
    const target = nearbyRef.current
    const interactable = target ? (cityByKey.get(target.key) ?? null) : null
    const { decision, dismount } = resolveCityInteraction(interactable, {
      hoverboardMounted: rideRef.current.mounted,
      courierRunActive: !!courierRunRef.current,
    })
    if (dismount) setMounted(false)
    switch (decision.action) {
      case 'blocked': {
        // Pressing E on a locked street mission answers out loud (the beats
        // are spread across the district now — players will find future ones).
        if (interactable?.payload.kind === 'beat') {
          const active = activeBeatRef.current
          showCityToast(
            active
              ? `Mission not unlocked yet — finish “${active.title}” first. Follow the trail!`
              : 'Mission not unlocked yet — follow the trail to your current objective first.',
          )
        }
        return
      }
      case 'none':
      case 'dismountOnly':
        return
      case 'enterDojo': {
        // Data Dojos are DECOMMISSIONED (July 2026): the gate no longer
        // routes anywhere — checkpoints complete themselves the moment a
        // leg's street missions are all restored (see the auto-complete
        // milestone below). The 2D dojo routes are being removed in
        // parallel; nothing in the overworld references them anymore.
        showCityToast(
          activeBeatRef.current
            ? 'The gate seals itself these days — restore the street missions and this checkpoint completes on its own. Follow the trail!'
            : 'Checkpoint gates complete on their own now — nothing to enter here.',
        )
        return
      }
      case 'enterBoss': {
        const { realmId, worldIndex } = decision
        // The hold-out siege is gone — reaching the boss objective (all three
        // checkpoint legs auto-completed) is the only gate.
        persistSpawn(spawnAfterQuestEntry(worldIndex, BOSS_STAGE))
        grantAcademyBossEntry(realmId)
        prefetchBossBattle()
        navigate(`/battle/${CHECKPOINTS_3D[worldIndex].world.id}`)
        return
      }
      case 'harvestCrystal': {
        const problem = NEETCODE_150_PROBLEM_BY_ID.get(decision.problemId)
        if (!problem) return
        if (decision.cloudCheck) {
          // Completed-awaiting-cloud: kick a sync alongside the review flow.
          void syncLearningNow().catch(() => {})
        }
        // Return where you harvested, not at a gate.
        const p = playerPosRef.current
        persistSpawn({ x: p.x, z: p.z, h: headingRef.current })
        grantAcademyTrackEntry(problem.realmId, problem.trackId)
        navigate(
          academyMissionPath(problem.realmId, problem.trackId, problem.leetcodeSlug),
        )
        return
      }
      case 'openArcade': {
        const daily = readCityDaily(undefined, new Date(), identityId)
        let session: QuizChainQuestion[] = []
        let remaining = arcadeSessionsRemaining(daily)
        if (hasHistory && remaining > 0) {
          const start = startArcadeSession({ identityId })
          if (start.allowed) {
            session = buildWarmupSession(learnerModel, ARCADE_QUESTIONS_PER_SESSION)
          }
          remaining = start.remainingToday
        }
        setCityOverlay({
          kind: 'arcade',
          session,
          remaining,
          duePointers: buildArcadeDuePointers(),
        })
        return
      }
      case 'openNpc': {
        // One paid chain per district per local day (the glyph mirrors this).
        if (chattedDistricts.has(decision.districtIndex)) {
          showCityToast(
            `${decision.npcName} is out of fresh questions — swing by tomorrow!`,
          )
          return
        }
        const { districtIndex, npcName, trackId } = decision
        setChattedDistricts(
          new Set(markNpcChatToday(districtIndex, { identityId })),
        )
        // The question bank is text-heavy — load it with the overlay chunk.
        void import('../content/districtQuestions').then(
          ({ districtQuestionChain }) => {
            setCityOverlay({
              kind: 'npc',
              npcName,
              districtTitle:
                CHECKPOINTS_3D[districtIndex]?.world.name ?? 'Code City',
              questions: districtQuestionChain(trackId),
            })
          },
        )
        return
      }
      case 'startCourier': {
        const routeIds =
          interactable?.payload.kind === 'courier'
            ? interactable.payload.routeIds
            : []
        const run = startCourierRun(
          routeIds,
          readCityLifetime({ identityId }).courierDeliveries,
          Date.now(),
        )
        if (!run) return
        setCourierRun(run)
        const route = courierRouteById(run.routeId)
        showCityToast(
          route
            ? `Delivery accepted — ${route.label}. Follow the beacon!`
            : 'Delivery accepted — follow the beacon!',
        )
        return
      }
      case 'cancelCourier': {
        setCourierRun(null)
        setCourierDist(null)
        showCityToast('Delivery cancelled — the parcel goes back on the shelf.')
        return
      }
      case 'mountBoard':
        setMounted(true)
        return
      case 'dismountBoard':
        // The dismount flag above already handled it.
        return
      case 'openPhoto':
        setPhotoSpotIndex(decision.spotIndex)
        return
      case 'openBeat': {
        const beat = beatForProblem(decision.problemId)
        if (!beat) return
        // Terminal + bounty beats unlock behind their own 30s defense; the
        // countdown lives in the checkpoint HUD element while it runs.
        if (beat.kind !== 'rescue' && !siegedBeatsRef.current.has(beat.id)) {
          const live = beatSiegeRef.current
          showCityToast(
            live && live.beatId === beat.id
              ? `Defend! ${Math.max(1, Math.ceil(live.left))}s until the ${
                  beat.kind === 'terminal' ? 'terminal restores' : 'shard stabilizes'
                }.`
              : 'Stand your ground here — the defense starts when you arrive.',
          )
          return
        }
        // Bounty / rescue beats also demand their fight; the combat system
        // reports the win, which flips encounterCleared on the next build.
        if (!decision.encounterCleared) {
          showCityToast(
            decision.beatKind === 'bounty'
              ? 'Kill the Elite Glitch first — the red shard unlocks after it falls.'
              : 'Kill all 5 zombies in the ring first — the citizen is rescued the moment the last one falls.',
          )
          return
        }
        openBeatMission(beat, false)
        return
      }
    }
  }

  const interactRef = useRef(interact)
  interactRef.current = interact
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // No nearby guard: E with nothing around steps off the hoverboard.
      if (e.key !== 'Enter' && e.key !== 'e' && e.key !== 'E') return
      // Keys aimed at a focused control belong to that control: Enter
      // activates buttons/links (graphics panel, HUD), and typing fields
      // swallow everything.
      const target = e.target as HTMLElement | null
      const tag = target?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Enter' && (tag === 'BUTTON' || tag === 'A')) return
      interactRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // City sweep ticker (~150ms, outside the render loop): bit auto-collect
  // around the hero and courier arrival at the destination beacon. Rewards
  // settle through cityLife's capped claims; XP lands via addXp.
  const bitSpawnsRef = useRef(bitSpawns)
  bitSpawnsRef.current = bitSpawns
  const collectedBitIdsRef = useRef(collectedBitIds)
  collectedBitIdsRef.current = collectedBitIds
  const cityLifeOnRef = useRef(cityLifeOn)
  cityLifeOnRef.current = cityLifeOn
  const identityIdRef = useRef(identityId)
  identityIdRef.current = identityId
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!cityLifeOnRef.current || overlayPausedRef.current || deadRef.current) {
        return
      }
      const p = playerPosRef.current
      const identity = identityIdRef.current

      // Bits: sweep, settle against the daily soft cap, persist the id set.
      const swept = collectBitsNear(
        bitSpawnsRef.current,
        collectedBitIdsRef.current,
        p.x,
        p.z,
      )
      if (swept.length > 0) {
        const pickup = claimBitPickups(swept.length, { identityId: identity })
        if (pickup.xp > 0) addXp(pickup.xp)
        setCollectedBitIds(
          new Set(recordCollectedBitIds(swept, { identityId: identity })),
        )
      }

      // Courier: live distance readout + arrival settlement.
      const run = courierRunRef.current
      if (!run) return
      const route = courierRouteById(run.routeId)
      if (!route) {
        setCourierRun(null)
        return
      }
      const dist = Math.round(Math.hypot(route.to.x - p.x, route.to.z - p.z))
      setCourierDist((prev) => (prev === dist ? prev : dist))
      if (courierArrived(route.to, p.x, p.z)) {
        const result = claimCourierDelivery(
          run.routeId,
          courierElapsedSeconds(run, Date.now()),
          { identityId: identity },
        )
        if (result.xp > 0) addXp(result.xp)
        setCourierRun(null)
        setCourierDist(null)
        setCourierBurstKey((k) => k + 1)
        setVehicleUnlocked(true)
        showCityToast(
          result.xp > 0
            ? `Delivery complete! +${result.xp} XP`
            : 'Delivery complete! Daily courier XP is spent — see you tomorrow.',
        )
      }
    }, 150)
    return () => window.clearInterval(id)
  }, [addXp, showCityToast])

  // Photo capture: snapshot the live canvas, download it, toast the result.
  const handlePhotoCapture = useCallback(
    (selection: PhotoSelection) => {
      const capture = captureApiRef.current
      const spot = photoSpotIndexRef.current
      if (!capture || spot == null) return
      try {
        const dataUrl = capture()
        const anchor = document.createElement('a')
        anchor.href = dataUrl
        anchor.download = photoFileName(spot, selection.frameId, new Date())
        anchor.click()
        showCityToast('Photo saved to your downloads.')
      } catch {
        showCityToast('The camera hiccuped — try that shot again.')
      }
    },
    [showCityToast],
  )

  // Cosmetics unlocked right now (read fresh each time photo mode opens).
  const unlockedCosmeticIds = useMemo(
    () =>
      photoSpotIndex != null
        ? unlockedPhotoCosmeticIds(readCityMilestones({ identityId }))
        : [],
    [photoSpotIndex, identityId],
  )

  // Boss-clear celebration on return.
  const [celebrateWorld, setCelebrateWorld] = useState<World | null>(null)
  useEffect(() => {
    if (celebrateWorld) return
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
  }, [celebrateWorld, states])

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
  // City overlays (arcade / NPC chat / photo mode) pause the world too.
  const overlayPaused =
    !bootReady ||
    !!celebrateWorld ||
    dead ||
    showIntro ||
    !!milestone ||
    finaleVisible ||
    !!surge ||
    !!cityOverlay ||
    photoSpotIndex != null
  overlayPausedRef.current = overlayPaused

  // Phase 2 — weather: seeded rain fronts (~every 3rd–4th day cycle). The
  // scheduler clock shares the overlay pause, so storms freeze during dialogs
  // and the finale is never rained on. LOW profiles disable it entirely.
  const weather = useWeatherScheduler({
    enabled: profile.rainParticles > 0,
    pausedRef: overlayPausedRef,
  })

  // Combo decays: once the chain window lapses with no new kill, drop it to
  // zero. Ref-only now (KoComboChips reads comboRef for display) — a single
  // always-on 300ms interval, no page state / re-render involved.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (comboRef.current > 0 && performance.now() - lastKillRef.current > COMBO_WINDOW_MS) {
        comboRef.current = 0
      }
    }, 300)
    return () => window.clearInterval(id)
  }, [])

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
          : activeBeat
            ? { x: activeBeat.x, z: activeBeat.z }
            : questDoor(WORLD_GATES[tourWorldClamped][stageClamped]),
    [tourDone, atBoss, tourWorldClamped, stageClamped, activeBeat],
  )
  guidePosRef.current = guidePos
  const guideColor = tourWorldMeta?.theme.accent ?? '#6d4afe'

  // Trail anchor: where the player finished the PREVIOUS objective. The leg
  // origin only anchors mission 1 — after that each cleared mission hands the
  // trail to the next one (and the capstone hands it to the gate). With the
  // serpentine beat spread (July 2026) the old fixed leg-origin anchor routed
  // the whole trail from the spawn plaza, nowhere near the player standing at
  // the mission they just finished — the guidance visually vanished after
  // mission 1. Still deterministic per objective, so the carved trail never
  // jitters with player movement.
  const legStart = useMemo<Vec2 | null>(() => {
    if (tourDone) return null
    if (!atBoss) {
      const beats = legBeats(tourWorldClamped, stageClamped)
      const prev = activeBeat
        ? beats[activeBeat.index - 1]
        : beats[beats.length - 1] // leg restored: capstone → checkpoint gate
      if (prev) return { x: prev.x, z: prev.z }
    }
    return legOrigin(tourWorldClamped, stageClamped, atBoss)
  }, [tourDone, tourWorldClamped, stageClamped, atBoss, activeBeat])

  // The city interactable under the prompt (registry copy: verb + labels).
  const nearbyCity = nearby ? (cityByKey.get(nearby.key) ?? null) : null
  const nearbyIsCityLife =
    !!nearbyCity &&
    nearbyCity.payload.kind !== 'dojo' &&
    nearbyCity.payload.kind !== 'boss'
  // A defeated boss door is a rematch offer, never a demand — the run has
  // already moved past it (mastery claim may still be pending elsewhere).
  const nearbyBossDefeated =
    nearbyCity?.payload.kind === 'boss' &&
    realmProgress(nearbyCity.payload.realmId).bossDefeated

  const guideLine = tourDone
    ? allCleared
      ? 'You cleared Code City — you are the Code Master!'
      : 'Tour complete — explore the city or revisit any level.'
    : nearby && !nearby.locked
      ? nearbyIsCityLife && nearbyCity
        ? `${nearbyCity.prompt.label} — press E to ${nearbyCity.prompt.verb.toLowerCase()}!`
        : nearby.kind === 'boss'
          ? nearbyBossDefeated
            ? `${nearby.world.boss.name} is already defeated — press E for an optional rematch. The trail ahead is open!`
            : `${positionLabel} — press E for the realm assessment and boss fight!`
          : `${positionLabel} — press E to open the academy!`
      : nearby && nearby.locked
        ? // A locked street mission: say why, and point Bit back at the live
          // objective (players wander into future beats now they're spread
          // across the whole district).
          nearbyCity?.payload.kind === 'beat' && activeBeat
          ? `This mission isn’t unlocked yet — finish “${activeBeat.title}” first. Follow the trail!`
          : (nearbyCity?.prompt.lockedLabel ??
            aheadOfTourLabel(tourWorldClamped, nearby.world.index))
        : atBoss
          ? `${positionLabel}: all three topics complete — reach the Boss! Horde ${hordeTier}.`
          : activeBeat
            ? `${BEAT_GUIDE_LINE[activeBeat.kind]} — “${activeBeat.title}”. Follow the trail! Horde ${hordeTier}.`
            : `${positionLabel}: missions restored — survive the siege and the gate unseals. Horde ${hordeTier}.`

  // Always-visible location readout: level/realm, checkpoint-in-realm, and
  // the concrete next objective. Display-only — every value already drives
  // gameplay elsewhere (positionLabel, holdbar, guide line).
  const locationRealmLine = tourDone
    ? 'All levels complete'
    : `Level ${levelNum}${activeRealm ? ` · ${activeRealm.title}` : ''}`
  const locationCheckpointLine = tourDone
    ? 'Code City is yours — explore freely'
    : atBoss
      ? 'Final gate · Realm boss'
      : `Checkpoint ${checkpointNum ?? 1} of ${CHECKPOINTS_PER_LEVEL}${activeTrack ? ` · ${activeTrack.title}` : ''}`
  const locationNextLine = tourDone
    ? 'Tour complete!'
    : atBoss
      ? `Boss: ${tourWorldMeta?.boss.name ?? 'Realm assessment'}`
      : activeBeat && legMissions
        ? `Next: mission ${Math.min(legMissions.cleared + 1, Math.max(1, legMissions.total))} of ${legMissions.total} — ${activeBeat.title}`
        : 'Checkpoint restoring — the trail moves on'

  return (
    <div className="page over3d-page">
      <AppHeader />

      {/* Boot veil: same loader the route shows while progress hydrates, held
          until the 3D scene reports its first stable frames. Without it the
          player lands in a frozen city while shaders compile. */}
      {!bootReady && (
        <Loader
          label={
            meshyPreload.started && meshyPreload.total > 0 && meshyPreload.loaded < meshyPreload.total
              ? `Rendering Code City · ${Math.round((meshyPreload.loaded / meshyPreload.total) * 100)}% (${meshyPreload.loaded}/${meshyPreload.total} models)`
              : 'Rendering Code City'
          }
          night
        />
      )}

      {celebrateWorld && (
        <PowerUnlock
          world={celebrateWorld}
          clearedCount={clearedCount}
          isFinal={celebrateWorld.index === WORLDS.length - 1}
          onClose={closeCelebration}
        />
      )}

      <div
        className={`over3d-stage is-clean-grade ${photoSpotIndex != null ? 'is-photo-mode' : ''}`}
      >
        <Canvas
          key={glGeneration}
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
            // Dev-only perf instrumentation: e2e specs read renderer.info
            // (draw calls / triangles) through this handle. Stripped in prod.
            if (import.meta.env.DEV) {
              ;(window as unknown as { __alphaGl?: unknown }).__alphaGl = gl
            }
            // WebGL context-loss recovery. By spec the browser only re-issues a
            // context if `preventDefault()` is called on the loss event — without
            // this, a transient GPU hiccup leaves the canvas permanently black
            // (HUD survives — "buildings don't render") until a full reload.
            const canvas = gl.domElement
            const onLost = (e: Event) => {
              e.preventDefault()
              // R3F's unmount teardown calls forceContextLoss() ~500ms after
              // the canvas leaves the DOM (route change away from /quest).
              // That synthetic loss must NOT demote — otherwise every trip to
              // a 2D page persists the safety floor and re-entry boots ugly
              // and janky while the governor climbs back up.
              if (!canvas.isConnected) return
              // A loss while the tab is HIDDEN is routine GPU eviction of a
              // backgrounded page (macOS memory pressure), not proof the
              // notch is too heavy — restore silently, keep the quality.
              if (document.visibilityState === 'hidden') {
                console.warn('[gfx] WebGL context lost in background — will restore without demoting')
                return
              }
              // Demote hard: the loss itself is proof the current notch is too
              // heavy. Persist so a refresh doesn't re-boot into the same crash.
              writeNotchHint(GOVERNOR_MAX_NOTCH)
              governorRef.current = initialGovernorState(GOVERNOR_MAX_NOTCH)
              setGfxNotch(GOVERNOR_MAX_NOTCH)
              console.warn('[gfx] WebGL context lost — demoting to safety floor')
            }
            const onRestored = () => {
              // Defer the remount past the restore handshake — tearing down the
              // canvas inside the event callback can re-lose the context.
              requestAnimationFrame(() => {
                mountedAtRef.current = performance.now()
                lastSampleRef.current = 0
                // The Canvas remount re-mounts the controller too — carry the
                // LIVE hero transform over so a restore never teleports the
                // player back to the leg origin (no state loss on resume).
                savedPosRef.current = {
                  x: playerPosRef.current.x,
                  z: playerPosRef.current.z,
                  h: headingRef.current,
                }
                // The veil is once-per-mount (owner directive): the remount
                // recompiles shaders with a couple of janky seconds in view,
                // but gameplay is never re-blocked by the loading screen.
                setGlGeneration((g) => g + 1)
              })
            }
            canvas.addEventListener('webglcontextlost', onLost, false)
            canvas.addEventListener('webglcontextrestored', onRestored, false)
          }}
        >
          <PerformanceMonitor
            onDecline={() => {
              // Hidden-tab / just-returned fps is garbage — never shed
              // resolution over it (the visible resize reads as a re-render).
              if (perfSignalsBlocked()) return
              setDpr((d) => Math.max(profile.dpr.min, Math.round((d - 0.2) * 100) / 100))
            }}
            onIncline={() => {
              if (perfSignalsBlocked()) return
              setDpr((d) => Math.min(profile.dpr.max, Math.round((d + 0.2) * 100) / 100))
            }}
            onChange={handlePerfChange}
          />
          {/* Long-frame (jank) demote signal — armed only after the boot veil
              has dropped, so compile/decode jank behind the veil never counts. */}
          <JankMeter enabled={bootReady} onFrame={handleJankFrame} />
          {!bootStable && <BootWarmup gate={preloadReady} onStable={handleBootStable} />}
          {/* Clear-air fog (the driver re-writes it every frame). */}
          <fog attach="fog" args={['#c6d4e0', 135, 460]} />
          {/* The baked sky env (SkyEnvironment) carries the ambient light;
              these are gentle shape-fills that ride the night blend down so
              night belongs to the emissives. */}
          <FillLights dimAtNight />

          <Suspense fallback={null}>
            <SimulationDriver
              nightRef={nightRef}
              rainTargetRef={weather.rainTargetRef}
              tier={simTier}
              driveFog
              clearAir
              playerPosRef={playerPosRef}
              fogFarCap={profile.cullRadius}
              nightFloor={NIGHT_AMBIENT_FLOOR}
            />
            <DistrictStreamer playerPosRef={playerPosRef} tier={profile.tier} />
            <SimulationSky radius={SKY_RADIUS} />
            <SkyEnvironment hdri={hdriMode(profile.tier, profile.hdriEnvironment)} />
            <CascadedSunlight
              cascades={profile.shadowCascades}
              playerPosRef={playerPosRef}
              mapScale={profile.shadowMapScale}
              crisp
            />
            {profile.rainParticles > 0 && <RainSystem count={profile.rainParticles} />}
            <Ground />
            <Roads />
            {profile.streetDecals && <StreetDecals />}
            <InstancedWorld
              tier={simTier}
              buildingShadows={profile.buildingShadowCasters}
              facadeMode={profile.facadeMode}
              facadeAtlasFull={profile.facadeAtlasFull}
              cullRadius={profile.cullRadius}
            />
            {profile.facadeMode !== 'legacy' && <DistrictAprons />}

            {/* Phase 3 — ambient city life (all tier-gated instance budgets;
                each system is 1–2 draws and zero-to-tiny per-frame CPU). */}
            {profile.cityLife.traffic > 0 && <HoverTraffic count={profile.cityLife.traffic} />}
            {profile.cityLife.citizens > 0 && (
              <Suspense fallback={null}>
                <CitizenCrowd count={profile.cityLife.citizens} />
              </Suspense>
            )}
            {(profile.cityLife.birds > 0 ||
              profile.cityLife.steam > 0 ||
              profile.cityLife.leaves > 0) && (
              <AmbientLife
                birds={profile.cityLife.birds}
                steam={profile.cityLife.steam}
                leaves={profile.cityLife.leaves}
              />
            )}

            {/* Meshy prop library: citywide street shell, plaza dressing,
                landmark swaps, showpieces, hero walkers. Mounted at EVERY
                notch (graphics-purity floor — see meshyTier above): the
                governor thins density but never brings the primitives back. */}
            {meshyLayerExpected && (
              <Suspense fallback={null}>
                <MeshyCityLayer tier={meshyTier} playerPosRef={playerPosRef} />
              </Suspense>
            )}

            <LandmarkField cullRadius={profile.cullRadius} />

            {/* Current lesson part — enterable building in a cleared plaza.
                Gated like everything else: the guide trail + minimap lead the
                player there; the building materializes out of the fog. */}
            {!tourDone && !atBoss && (
              <DistanceGate
                x={WORLD_GATES[tourWorldClamped][stageClamped].x}
                z={WORLD_GATES[tourWorldClamped][stageClamped].z}
                radius={profile.cullRadius}
              >
                <GateBuilding
                  pos={WORLD_GATES[tourWorldClamped][stageClamped]}
                  color={tourWorldMeta?.theme.accent ?? '#6d4afe'}
                  active
                />
              </DistanceGate>
            )}

            <QuestSites
              states={states}
              tourDone={tourDone}
              atBoss={atBoss}
              tourWorldClamped={tourWorldClamped}
              isGuest={isGuest}
              cullRadius={profile.cullRadius}
            />

            {/* Living Code City interaction layer — crystals, arcade, NPCs,
                courier, hoverboard, photo spots, weekly bits. Registry-driven
                (same source as the press-E targets), tier-gated by the
                unified profile, absent for guests and on LOW entirely. */}
            {cityLifeOn && (
              <CityWorldObjects
                interactables={cityInteractables}
                crystals={crystals}
                arcadeDueCount={arcadeDue}
                npcChainDistricts={npcChainDistricts}
                bitWeekAnchor={bitWeekAnchor}
                collectedBitIds={collectedBitIds}
                courierDestination={courierDestination}
                courierBurstKey={courierBurstKey}
                hoverboardMounted={hoverboardMounted}
                hoverboardPoseRef={hoverboardPoseRef}
                activePhotoSpotIndex={photoSpotIndex}
                quality={profile}
              />
            )}
            {cityLifeOn && <CaptureBridge apiRef={captureApiRef} />}

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
                    {/* Additive light column: standing INSIDE no longer films
                        the whole view mint (normal-blend 0.3 did exactly that
                        — the old "safe zone soup"); light adds gently now. */}
                    <mesh position={[0, 40, 0]}>
                      <cylinderGeometry args={[SHELTER_R, SHELTER_R, 80, 24, 1, true]} />
                      <meshBasicMaterial
                        color={isNearest ? '#3ba98f' : '#2f7f8f'}
                        transparent
                        opacity={isNearest ? 0.22 : 0.1}
                        blending={THREE.AdditiveBlending}
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

            {/* Dev-only QA seam (?nohorde): scripted probes traverse the whole
                city measuring collision/streaming/pacing without the horde
                cutting runs short. Guarded by DEV — never in production. */}
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
              rideRef={rideRef}
              hoverboardPoseRef={hoverboardPoseRef}
              deadRef={deadRef}
            />
            <FloorPath from={legStart} target={guidePos} color={guideColor} />
            {!probeNoHorde && (
            <CombatSystem
              key={`combat-${runId}`}
              playerPosRef={playerPosRef}
              dashRef={dashRef}
              stealthRef={stealthRef}
              gunHeatRef={gunHeatRef}
              apiRef={combatApi}
              paused={overlayPaused}
              difficulty={effectiveHordeTier}
              heartBonus={combatAdjust.heartBonus}
              intensity={beatSiege ? 0.9 : 0}
              wantGlitch={!tourDone && !!targetConceptId}
              night={night}
              zombieShadows={simTier !== 'low'}
              shelters={SHELTERS}
              onKill={handleKill}
              onPlayerHit={handlePlayerHit}
              onHeal={handleHeal}
              onGlitchKill={handleGlitchKill}
              shakeRef={shakeRef}
              hitstopRef={hitstopRef}
              encounter={combatEncounter}
              onEncounterCleared={handleEncounterCleared}
            />
            )}
            <EncounterBeatField beats={beatVisuals} />

            <OverworldEffects
              tier={effectsTier}
              shakeRef={shakeRef}
              godRays={profile.godRays}
              cleanGrade={profile.tier !== 'low'}
            />
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
            night={night}
            shelterTarget={shelterInfo}
          />
          {/* The Graphics settings panel (tier picker + FPS readout) was
              removed on the owner's directive: everyone runs ULTRA and the
              invisible FPS governor is the only quality authority. */}
        </div>

        {/* hurt flash + i-frame shield shimmer + low-health vignette */}
        <div className={`over3d-hurt ${hurt ? 'is-on' : ''}`} aria-hidden="true" />
        <div className={`over3d-iframe ${invuln ? 'is-on' : ''}`} aria-hidden="true" />
        <div className={`over3d-lowhp ${hp <= 3 && !dead ? 'is-on' : ''}`} aria-hidden="true" />
        {/* Night darkening — tints the whole view after dusk. */}
        <div className={`over3d-night ${night ? 'is-on' : ''}`} aria-hidden="true" />

        {/* Checkpoint status — ONE centered element: level/realm, checkpoint-
            in-realm, mission progress, the next objective, and (while a
            terminal/bounty defense runs) the per-mission unlock countdown.
            Expanded while it matters; a slim one-liner otherwise. */}
        {!tourDone && !dead && !night && (
          <div
            className={`over3d-holdbar ${checkpointOpen ? 'is-open' : ''} ${beatSiege ? 'is-denied' : ''} ${checkpointFocus ? '' : 'is-idle'}`}
          >
            {checkpointFocus ? (
              <>
                <span className="over3d-holdbar-realm">{locationRealmLine}</span>
                <span className="over3d-holdbar-title">{locationCheckpointLine}</span>
                {beatSiege ? (
                  <>
                    <span className="over3d-holdbar-state">
                      ⚔️ DEFEND —{' '}
                      {beatSiege.kind === 'terminal'
                        ? 'the terminal restores in'
                        : 'the shard stabilizes in'}
                    </span>
                    <span className="over3d-holdbar-timer">
                      {Math.max(0, Math.ceil(beatSiege.left))}s
                    </span>
                    <span className="over3d-holdbar-track" aria-hidden="true">
                      <span
                        className="over3d-holdbar-fill"
                        style={{
                          width: `${Math.round((1 - beatSiege.left / BEAT_SIEGE_SECONDS) * 100)}%`,
                        }}
                      />
                    </span>
                  </>
                ) : checkpointOpen ? (
                  <span className="over3d-holdbar-state is-open-state">
                    ✅ Missions restored — checkpoint completing
                  </span>
                ) : (
                  <span className="over3d-holdbar-state">
                    {!atBoss && legMissions && legMissions.total > 0
                      ? `🔒 Missions ${legMissions.cleared}/${legMissions.total}`
                      : '🔒 SEALED'}
                  </span>
                )}
                <span className="over3d-holdbar-hint">
                  <IconCompass size={12} />
                  <span>
                    {locationNextLine}
                    <ObjDistReadout guidePosRef={guidePosRef} playerPosRef={playerPosRef} bold />
                    {` · Horde ${effectiveHordeTier}`}
                  </span>
                </span>
              </>
            ) : (
              // A running defense always forces the expanded view, so the
              // mini line never needs the countdown.
              <span className="over3d-holdbar-mini">
                {atBoss
                  ? '👑 Final gate'
                  : `CP ${checkpointNum ?? 1}/${CHECKPOINTS_PER_LEVEL}`}
                {checkpointOpen
                  ? ' · ✅ done'
                  : ` · 🔒${
                      !atBoss && legMissions && legMissions.total > 0
                        ? ` ${legMissions.cleared}/${legMissions.total}`
                        : ''
                    }`}
                <ObjDistReadout guidePosRef={guidePosRef} playerPosRef={playerPosRef} />
              </span>
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
              <ShelterCompass
                target={shelterInfo}
                playerPosRef={playerPosRef}
                headingRef={headingRef}
              />
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
            {/* The location/checkpoint readout moved into the single centered
                checkpoint element above — the top-left keeps only the
                player-status cluster (hearts · rank · combat chips). */}
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
              {/* Player rank sits right beside the hearts so the whole
                  player-status cluster reads as one group. */}
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
              <div className="over3d-stats">
                {/* KO + combo poll their refs directly (self-contained leaf) so
                    racking up kills never re-renders this page. */}
                <KoComboChips killsRef={killsRef} comboRef={comboRef} />
                {stealthOn && (
                  <span className="over3d-chip over3d-chip-ko" title="Laying low — the horde loses track of you">
                    🥷 Hidden
                  </span>
                )}
                {weather.raining && (
                  <span
                    className="over3d-chip over3d-chip-ko"
                    title={night ? 'Night storm — watch for lightning' : 'A rain front is passing through'}
                  >
                    {night ? '⛈️ Storm' : '🌧️ Rain'}
                  </span>
                )}
                {courierRoute && (
                  <span
                    className="over3d-chip over3d-chip-courier"
                    title="Delivery under way — carry the parcel to the drop beacon"
                  >
                    📦 {courierRoute.label}
                    {courierDist != null && <b> · {courierDist}m</b>}
                  </span>
                )}
                {hoverboardMounted && (
                  <span
                    className="over3d-chip over3d-chip-ko"
                    title="Riding the hover scooter — Shift boosts, E steps off"
                  >
                    🛹 Riding
                  </span>
                )}
                {/* Slim gun-heat readout — self-polling leaf (reads gunHeatRef)
                    so firing heat never re-renders the page. Fades in while
                    warm, shouts only when jammed. */}
                <GunHeatBar gunHeatRef={gunHeatRef} />
              </div>
            </div>
          </div>
        </div>

        {/* Game over — study to revive in place, or drop back to the realm start */}
        {dead && !reviveQuiz && (
          <div className="over3d-death">
            <div className="over3d-death-card">
              <h2>You were overwhelmed!</h2>
              <p>
                {revivesRemaining <= 0
                  ? 'The horde took you down — and this level\u2019s revives are spent. Drop back to the level start and push again.'
                  : reviveBeat
                    ? 'The horde took you down — but knowledge revives. Complete your next mission and you get back up right here, and it counts toward the gate.'
                    : 'The horde took you down. Prove your knowledge to get back up right here, or drop back to the realm start.'}{' '}
                Solved academy missions stay saved.
              </p>
              <div className="over3d-death-stats">
                <span>KOs this run: <strong>{killsRef.current}</strong></span>
                <span>Reached: <strong>{positionLabel}</strong></span>
                <span>Revives left: <strong>{revivesRemaining}</strong></span>
              </div>
              <div className="over3d-death-actions">
                {revivesRemaining > 0 &&
                  (reviveBeat ? (
                    <button
                      type="button"
                      className="over3d-death-btn"
                      onClick={() => openBeatMission(reviveBeat, true)}
                    >
                      📖 Study to revive — {reviveBeat.title}
                    </button>
                  ) : (
                    hasHistory && (
                      <button
                        type="button"
                        className="over3d-death-btn"
                        onClick={startReviveQuiz}
                      >
                        ⚡ Knowledge Surge revive — 3 questions
                      </button>
                    )
                  ))}
                <button
                  type="button"
                  className={`over3d-death-btn${revivesRemaining > 0 && (reviveBeat || hasHistory) ? ' over3d-death-btn-ghost' : ''}`}
                  onClick={restartLevel}
                >
                  Restart Level {levelNumber(tourWorldClamped)}
                </button>
                {tourWorldClamped > 0 && (
                  <button
                    type="button"
                    className="over3d-death-btn over3d-death-btn-ghost"
                    onClick={restartGame}
                  >
                    Reset current run
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Knowledge Surge revive — 3 questions, 2+ correct gets you back up */}
        {dead && reviveQuiz && (
          <div className="over3d-death">
            <div className="over3d-death-card over3d-surge-card">
              {reviveQuiz.failed ? (
                <>
                  <span className="over3d-surge-tag">⚡ Knowledge Surge</span>
                  <h2 className="over3d-surge-q">
                    Not enough — {reviveQuiz.correct}/{reviveQuiz.questions.length} correct.
                  </h2>
                  <p className="over3d-surge-msg is-wrong">
                    Those concepts are queued for review. Back to the realm start.
                  </p>
                  <div className="over3d-death-actions">
                    <button type="button" className="over3d-death-btn" onClick={restartLevel}>
                      Restart Level {levelNumber(tourWorldClamped)}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="over3d-surge-tag">
                    ⚡ Revive {reviveQuiz.index + 1}/{reviveQuiz.questions.length} — need 2 correct
                  </span>
                  <h2 className="over3d-surge-q">
                    {reviveQuiz.questions[reviveQuiz.index].prompt}
                  </h2>
                  <div className="over3d-surge-choices">
                    {reviveQuiz.questions[reviveQuiz.index].choices.map((choice, i) => (
                      <button
                        key={i}
                        type="button"
                        className="over3d-surge-choice"
                        onClick={() => answerReviveQuiz(i)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </>
              )}
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

        {/* How to play — short tutorial when you enter the city each session */}
        {showIntro && (
          <div className="over3d-quest-intro" role="dialog" aria-labelledby="quest-intro-title">
            <div className="over3d-quest-card">
              <span className="over3d-quest-tag">How to play</span>
              <h2 id="quest-intro-title">Welcome to Code City</h2>

              <ol className="over3d-quest-steps">
                <li>
                  Follow the trail — <strong>cyan / yellow / red</strong> markers. Clear
                  what’s in the way, then press <strong>E</strong>.
                </li>
                <li>
                  <strong>Gun</strong> for range, <strong>sword (Q)</strong> for swarms.
                  Hold <strong>C</strong> to lay low.
                </li>
                <li>
                  At <strong>night</strong>, get to a glowing <strong>safe house</strong>.
                  Die? Finish the next mission to revive.
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
                {milestone.cta ?? 'Got it'}
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
                All 150 missions across 18 topics and {WORLD_COUNT} realms are cleared.
                Code City is whole again.
              </p>
              <div className="over3d-finale-stats">
                <div className="over3d-finale-stat">
                  <strong>{totalBadgeCount}</strong>
                  <span>Badges</span>
                </div>
                <div className="over3d-finale-stat">
                  <strong>150/150</strong>
                  <span>Missions</span>
                </div>
                <div className="over3d-finale-stat">
                  <strong>18/18</strong>
                  <span>Topics</span>
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

        {/* Interaction prompt — registry copy (verb + label + locked line) */}
        {nearby && (
          <div className={`over3d-prompt ${nearby.locked ? 'is-locked' : ''}`}>
            {nearby.locked ? (
              <span>
                <strong>
                  {nearbyCity?.prompt.label ??
                    (nearby.kind === 'boss' ? nearby.world.boss.name : nearby.world.name)}
                </strong>{' '}
                — {nearbyCity?.prompt.lockedLabel ?? 'sealed'}
              </span>
            ) : nearbyCity ? (
              <span>
                <kbd>E</kbd>{' '}
                {nearbyCity.payload.kind === 'vehicle' && hoverboardMounted
                  ? 'Dismount'
                  : nearbyCity.payload.kind === 'courier' && courierRun
                    ? 'Cancel delivery'
                    : nearbyCity.prompt.verb}{' '}
                <strong>{nearbyCity.prompt.label}</strong>
              </span>
            ) : nearby.kind === 'boss' ? (
              <span>
                <kbd>E</kbd> {nearbyBossDefeated ? 'to rematch' : 'to challenge'}{' '}
                <strong>{nearby.world.boss.name}</strong>
              </span>
            ) : (
              <span>
                <kbd>E</kbd> enter{' '}
                <strong>{positionLabel}</strong>
              </span>
            )}
          </div>
        )}

        {/* City toast — delivery complete, photo saved, cloud check… */}
        {cityToast && <div className="over3d-city-toast">{cityToast}</div>}

        {/* Pattern Arcade — due-review warmup chain in a cabinet overlay */}
        {cityOverlay?.kind === 'arcade' && (
          <Suspense fallback={null}>
            <ArcadeOverlay
              session={cityOverlay.session}
              sessionsRemainingToday={cityOverlay.remaining}
              duePointers={cityOverlay.duePointers}
              onAnswer={recordConceptResult}
              onXp={addXp}
              onClose={() => setCityOverlay(null)}
              onPointerSelect={openDueMission}
            />
          </Suspense>
        )}

        {/* District NPC chat — 3-question side-challenge chain */}
        {cityOverlay?.kind === 'npc' && (
          <Suspense fallback={null}>
            <NpcDialogOverlay
              npcName={cityOverlay.npcName}
              districtTitle={cityOverlay.districtTitle}
              questions={cityOverlay.questions}
              onAnswer={recordConceptResult}
              onXp={addXp}
              onClose={() => setCityOverlay(null)}
            />
          </Suspense>
        )}

        {/* Photo mode — HUD hides (stage class), scene shows through */}
        {photoSpotIndex != null && (
          <Suspense fallback={null}>
            <PhotoModeOverlay
              cosmetics={PHOTO_COSMETICS}
              unlockedIds={unlockedCosmeticIds}
              capture={handlePhotoCapture}
              onClose={() => setPhotoSpotIndex(null)}
            />
          </Suspense>
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

        {/* Controls — aligned keycap rows, auto-collapsed after the first
            minute behind the "?" chip. (E prompts appear contextually.) */}
        {controlsOpen && (
          <div className="over3d-controls-hint">
            <span>
              <i className="over3d-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></i>
              move · turn
            </span>
            <span><i className="over3d-keys"><kbd>Shift</kbd></i>sprint</span>
            <span><i className="over3d-keys"><kbd>Space</kbd></i>jump</span>
            <span><i className="over3d-keys"><kbd>F</kbd></i>shoot</span>
            <span><i className="over3d-keys"><kbd>Q</kbd></i>blade dash</span>
            <span><i className="over3d-keys"><kbd>C</kbd></i>lay low</span>
            <span><i className="over3d-keys"><kbd>E</kbd></i>interact</span>
          </div>
        )}
        <button
          type="button"
          className={`over3d-controls-toggle ${controlsOpen ? 'is-on' : ''}`}
          onClick={() => setControlsOpen((o) => !o)}
          aria-expanded={controlsOpen}
          title="Controls"
        >
          ?
        </button>
      </div>
    </div>
  )
}
