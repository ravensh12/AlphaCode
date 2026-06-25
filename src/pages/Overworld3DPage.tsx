import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { AppHeader } from '../components/AppHeader'
import { PowerUnlock } from '../components/game/PowerUnlock'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { grantBossEntry, grantLessonEntry } from '../lib/gameAccess'
import { BOSS_DONE_KEY, clearQuestRun, INTRO_KEY, PART_DONE_KEY, POS_KEY, TOUR_KEY } from '../lib/questSession'
import {
  CHECKPOINTS_PER_LEVEL,
  checkpointNumber,
  levelNumber,
  questPositionLabel,
} from '../lib/questLabels'
import { isMuted, startMusic, stopMusic, toggleMusic } from '../lib/themeMusic'
import { LESSON_CATALOG } from '../content/catalog'
import { WORLDS, WORLD_COUNT, type World } from '../content/adventure'
import { getWorldState } from '../lib/questState'
import {
  hordeTierAtPosition,
  questHordeTier,
} from '../lib/hordeTier'
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
import { ThirdPersonController, type Target } from '../components/game3d/ThirdPersonController'
import { CombatSystem, type CombatApi } from '../components/game3d/CombatSystem'
import {
  CHECKPOINTS_3D,
  START_3D,
  GROUND_HALF,
  LANDMARKS,
  WORLD_GATES,
  GATES_PER_WORLD,
  questDoor,
  roadRoute,
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

// stage 0..GATES_PER_WORLD-1 = a lesson-part gate; stage === GATES_PER_WORLD = boss.
type TourSave = { world: number; stage: number }

const BOSS_STAGE = GATES_PER_WORLD
/** One fixed gun for the whole game (index into GUNS) — a rapid-fire blaster. */
const FIXED_GUN_LEVEL = 4

/** Effective travel pace (m/s) while fighting through the horde toward a goal. */
const TRAVEL_SPEED = 5.0
/** Base slack (seconds) on top of travel time for aiming + clearing zombies. */
const LEG_BUFFER = 22

function routeLength(pts: Vec2[]): number {
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
  }
  return total
}

/** Where the player begins the given leg (previous objective door). */
function legOrigin(world: number, stage: number, atBoss: boolean): Vec2 {
  if (atBoss) return WORLD_GATES[world][GATES_PER_WORLD - 1]
  if (stage === 0) return world === 0 ? START_3D : CHECKPOINTS_3D[world - 1].boss
  return WORLD_GATES[world][stage - 1]
}

/**
 * Seconds allowed for one leg — scaled to the actual road distance so every
 * checkpoint is comfortably reachable, with a slight per-level tightening so the
 * run keeps getting harder without ever feeling unfair.
 */
function legSeconds(world: number, stage: number, atBoss: boolean, fromX?: number, fromZ?: number): number {
  const target = atBoss ? CHECKPOINTS_3D[world].boss : WORLD_GATES[world][stage]
  // Measure from where the player actually is (falls back to the leg's spawn
  // point) so the budget is always honestly proportional to the road distance.
  const from =
    fromX != null && fromZ != null ? { x: fromX, z: fromZ } : legOrigin(world, stage, atBoss)
  const dist = routeLength(roadRoute(from, target))
  const tighten = 1 - Math.min(0.1, world * 0.02) // only ~10% tighter by Level 6
  const raw = (dist / TRAVEL_SPEED + LEG_BUFFER) * tighten
  return Math.max(24, Math.round(raw))
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

function SkyDome() {
  const tex = useTexture('/sky/game-sky.png')
  return (
    <mesh>
      <sphereGeometry args={[GROUND_HALF * 2.6, 48, 32]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  )
}

function FollowLight({ playerPosRef }: { playerPosRef: React.MutableRefObject<THREE.Vector3> }) {
  const light = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    const p = playerPosRef.current
    const l = light.current
    if (l) {
      l.position.set(p.x + 28, 46, p.z + 22)
      l.target.position.set(p.x, 0, p.z)
      l.target.updateMatrixWorld()
    }
  })
  return (
    <directionalLight
      ref={light}
      intensity={1.7}
      color="#fff0d2"
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-radius={4}
      shadow-camera-left={-46}
      shadow-camera-right={46}
      shadow-camera-top={46}
      shadow-camera-bottom={-46}
      shadow-camera-near={1}
      shadow-camera-far={150}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  )
}

const MAX_HP = 10

type WorldStateEntry = { world: World; state: ReturnType<typeof getWorldState> }

function MiniMap({
  playerPosRef,
  headingRef,
  states,
  activeIndex,
}: {
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  headingRef: React.MutableRefObject<number>
  states: WorldStateEntry[]
  activeIndex: number
}) {
  const SIZE = 152
  const R = GROUND_HALF
  const [me, setMe] = useState({ x: 50, y: 50, deg: 0 })

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerPosRef.current
      setMe({
        x: (p.x / R / 2 + 0.5) * SIZE,
        y: (p.z / R / 2 + 0.5) * SIZE,
        deg: (headingRef.current * 180) / Math.PI,
      })
    }, 120)
    return () => clearInterval(id)
  }, [playerPosRef, headingRef, R])

  const proj = (v: Vec2) => ({ x: (v.x / R / 2 + 0.5) * SIZE, y: (v.z / R / 2 + 0.5) * SIZE })

  return (
    <div className="over3d-minimap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
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

export function Overworld3DPage() {
  const navigate = useNavigate()
  const { isGuest } = useAuth()
  const { getLessonProgress, isLessonUnlocked, totalBadgeCount, lessons } = useProgress()

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

  // Combat: pooled zombies + arrows live in CombatSystem; we keep score/HP here.
  const combatApi = useRef<CombatApi | null>(null)
  const [kills, setKills] = useState(0)
  const [hp, setHp] = useState(MAX_HP)
  const [hurt, setHurt] = useState(false)
  const [dead, setDead] = useState(false)
  const [deathReason, setDeathReason] = useState<'zombies' | 'time'>('zombies')
  // Bumping this remounts the controller + combat: clear zombies on a fresh run.
  const [runId, setRunId] = useState(0)
  const hurtTimer = useRef<number | null>(null)
  const deadRef = useRef(false)
  deadRef.current = dead

  // Same gun the whole game — a solid all-rounder. Zombies scale, not the gun.
  const gunLevel = FIXED_GUN_LEVEL

  function handleKill() {
    if (deadRef.current) return
    setKills((k) => k + 1)
  }
  function handlePlayerHit() {
    if (deadRef.current) return
    setHurt(true)
    if (hurtTimer.current) window.clearTimeout(hurtTimer.current)
    hurtTimer.current = window.setTimeout(() => setHurt(false), 260)
    setHp((h) => {
      const next = h - 1
      if (next <= 0) {
        setDeathReason('zombies')
        setDead(true)
        return 0
      }
      return next
    })
  }

  // Any death = restart the whole run at Level 1, ALWAYS from the same spawn
  // plaza facing the first checkpoint. Hearts and timer reset; lessons stay saved.
  function restartGame() {
    clearQuestRun()
    savedPosRef.current = null
    playerPosRef.current.set(START_3D.x, 0, START_3D.z)
    const firstDoor = questDoor(WORLD_GATES[0][0])
    headingRef.current = Math.atan2(firstDoor.x - START_3D.x, firstDoor.z - START_3D.z)
    setTourWorld(0)
    setTourStage(0)
    setHp(MAX_HP)
    setKills(0)
    setHurt(false)
    setDead(false)
    setShowIntro(true)
    setRunId((r) => r + 1)
  }

  // Live distance to the current objective for the guide readout.
  const [objDist, setObjDist] = useState<number | null>(null)
  const [hordeTier, setHordeTier] = useState(1)
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
      setObjDist(g ? Math.round(Math.hypot(g.x - p.x, g.z - p.z)) : null)
      setHordeTier(
        hordeTierAtPosition(p.x, p.z, worldEntriesRef.current, questTierRef.current),
      )
      // Remember map position so popping over to the list returns you here.
      try {
        sessionStorage.setItem(
          POS_KEY,
          JSON.stringify({ x: p.x, z: p.z, h: headingRef.current }),
        )
      } catch {
        /* ignore */
      }
    }, 200)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tutorial popup — shown at the start of every run (including Restart game).
  const [showIntro, setShowIntro] = useState(() => !introAlreadySeen())

  // --- Countdown to the next checkpoint -----------------------------------
  // Reach each objective before the clock runs out, or the whole run resets.
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timeLeftRef = useRef<number | null>(null)
  timeLeftRef.current = timeLeft
  const tourDoneRef = useRef(tourDone)
  tourDoneRef.current = tourDone

  // A unique id for the current leg of the journey. Changes whenever the
  // objective (gate / boss) or the run resets — that's when we reset the clock.
  const objectiveKey = tourDone
    ? 'done'
    : `${tourWorldClamped}:${stageClamped}:${atBoss ? 'boss' : 'gate'}:${runId}`

  // Pause the clock whenever any overlay is up (assigned after those flags
  // exist, below). The ref is read inside the tick effect.
  const overlayPausedRef = useRef(false)

  // New leg → set a fresh time budget scaled to the distance you must cover.
  useEffect(() => {
    if (tourDone) {
      setTimeLeft(null)
      return
    }
    // Time budget tracks the real road distance from the player to the goal,
    // eased down a little each level so later runs are tighter but always fair.
    const p = playerPosRef.current
    setTimeLeft(legSeconds(tourWorldClamped, stageClamped, atBoss, p.x, p.z))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectiveKey])

  // Tick the clock; hitting zero is a game over (full restart).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (overlayPausedRef.current || deadRef.current || tourDoneRef.current) return
      const cur = timeLeftRef.current
      if (cur == null) return
      const next = cur - 0.25
      if (next <= 0) {
        timeLeftRef.current = 0
        setTimeLeft(0)
        setDeathReason('time')
        setDead(true)
      } else {
        setTimeLeft(next)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [])
  const [musicMuted, setMusicMuted] = useState(isMuted())

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

  function handleNearby(t: Target | null) {
    nearbyRef.current = t
    setNearby(t)
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
    !!celebrateWorld || dead || showIntro || !!milestone || finaleVisible
  overlayPausedRef.current = overlayPaused

  const guidePos: Vec2 | null = tourDone
    ? null
    : atBoss
      ? questDoor(CHECKPOINTS_3D[tourWorldClamped].boss, 6)
      : questDoor(WORLD_GATES[tourWorldClamped][stageClamped])
  guidePosRef.current = guidePos
  const guideColor = tourWorldMeta?.theme.accent ?? '#6d4afe'

  // Fixed start of the current leg (the spawn point), so the carved trail stays
  // stable for the whole leg instead of jittering as the player moves.
  const legStart: Vec2 | null = tourDone
    ? null
    : legOrigin(tourWorldClamped, stageClamped, atBoss)

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
          dpr={[1, 1.6]}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          camera={{ fov: 60, near: 0.3, far: 3200, position: [START_3D.x, 2.6, START_3D.z - 10] }}
        >
          <fog attach="fog" args={['#c6d4e0', 42, 220]} />
          <hemisphereLight args={['#fff1d6', '#7a8a6a', 0.85]} />
          <ambientLight intensity={0.3} />
          {/* cool fill from the opposite side for form + depth */}
          <directionalLight position={[-40, 30, -28]} intensity={0.35} color="#9fc2ff" />

          <Suspense fallback={null}>
            <SkyDome />
            <FollowLight playerPosRef={playerPosRef} />
            <Ground />
            <Roads />
            <InstancedWorld />

            {LANDMARKS.map((l) => (
              <LandmarkMesh key={`lm-${l.index}`} landmark={l} />
            ))}

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

            <ThirdPersonController
              key={`ctrl-${runId}`}
              playerPosRef={playerPosRef}
              headingRef={headingRef}
              accent={tourWorldMeta?.theme.accent}
              targets={targets}
              onNearbyChange={handleNearby}
              paused={overlayPaused}
              onFire={(o, d) => combatApi.current?.fire(o, d)}
              faceTarget={guidePos}
              startPos={savedPosRef.current}
              startHeading={savedPosRef.current?.h ?? null}
            />
            <FloorPath from={legStart} target={guidePos} color={guideColor} />
            <CombatSystem
              key={`combat-${runId}`}
              playerPosRef={playerPosRef}
              apiRef={combatApi}
              paused={overlayPaused}
              difficulty={hordeTier}
              gunLevel={gunLevel}
              onKill={handleKill}
              onPlayerHit={handlePlayerHit}
            />

            <EffectComposer multisampling={0} enableNormalPass={false}>
              <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.7} luminanceSmoothing={0.25} />
              <Vignette eskil={false} offset={0.22} darkness={0.55} />
              <SMAA />
            </EffectComposer>
          </Suspense>
        </Canvas>

        <MiniMap
          playerPosRef={playerPosRef}
          headingRef={headingRef}
          states={states}
          activeIndex={tourDone ? -1 : tourWorldClamped}
        />

        {/* hurt flash */}
        <div className={`over3d-hurt ${hurt ? 'is-on' : ''}`} aria-hidden="true" />

        {/* HUD */}
        <div className="over3d-hud">
          <div className="over3d-hud-left">
            {!tourDone && (
              <div className="over3d-quest-progress" aria-live="polite">
                <span className="over3d-quest-progress-label">{positionLabel}</span>
                {!atBoss && checkpointNum != null && (
                  <span className="over3d-quest-progress-sub">
                    Checkpoint {checkpointNum} of {CHECKPOINTS_PER_LEVEL} in this level
                  </span>
                )}
                {atBoss && (
                  <span className="over3d-quest-progress-sub">
                    All {CHECKPOINTS_PER_LEVEL} checkpoints done — reach the Boss
                  </span>
                )}
              </div>
            )}
            <div className="over3d-hud-row">
              <div className="over3d-objective">
                <IconCompass size={16} />
                <span>
                  {tourDone
                    ? 'Tour complete!'
                    : `${objDist != null ? `${objDist}m to goal` : 'Follow the trail'} · Horde ${hordeTier}`}
                </span>
              </div>
              <div className="over3d-stats">
                {!tourDone && timeLeft != null && (
                  <span className={`over3d-chip over3d-chip-timer ${timeLeft <= 10 ? 'is-low' : ''}`}>
                    {Math.ceil(timeLeft)}s
                  </span>
                )}
                <span className="over3d-chip">
                  <IconBolt size={14} />
                  Lv {levelNum}/{WORLD_COUNT}
                </span>
                <span className="over3d-chip over3d-chip-ko">Horde {hordeTier}</span>
                <span className="over3d-chip over3d-chip-ko">KO {kills}</span>
                <button
                  type="button"
                  className="over3d-chip over3d-chip-music"
                  onClick={() => setMusicMuted(toggleMusic())}
                  title={musicMuted ? 'Unmute music' : 'Mute music'}
                >
                  {musicMuted ? '\u266A off' : '\u266A on'}
                </button>
                <Link className="over3d-chip over3d-chip-link" to="/quest/list">
                  <IconGrid size={14} />
                  List
                </Link>
              </div>
            </div>
          </div>

          <div className="over3d-hud-right">
            {/* Health bar — 10 hits ends the run */}
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
          </div>
        </div>

        {/* Game over — any death restarts the whole run at Checkpoint 1 */}
        {dead && (
          <div className="over3d-death">
            <div className="over3d-death-card">
              <h2>{deathReason === 'time' ? 'Out of time!' : 'You were overwhelmed!'}</h2>
              <p>
                {deathReason === 'time'
                  ? 'You didn’t reach the checkpoint before the timer ran out. '
                  : 'The horde took you down. '}
                The whole run resets to <strong>Level 1 · Checkpoint 1</strong>.
                Finished lessons stay saved.
              </p>
              <div className="over3d-death-stats">
                <span>KOs this run: <strong>{kills}</strong></span>
                <span>Reached: <strong>{positionLabel}</strong></span>
              </div>
              <button type="button" className="over3d-death-btn" onClick={restartGame}>
                Restart from Level 1
              </button>
            </div>
          </div>
        )}

        {/* How to play — tutorial when you enter the city each session */}
        {showIntro && (
          <div className="over3d-quest-intro" role="dialog" aria-labelledby="quest-intro-title">
            <div className="over3d-quest-card">
              <span className="over3d-quest-tag">How to play</span>
              <h2 id="quest-intro-title">Welcome to Code City</h2>
              <p>
                Six levels of coding skills are scattered across Code City. Each level has{' '}
                {CHECKPOINTS_PER_LEVEL} checkpoints — fight zombies, beat the clock, and press{' '}
                <kbd>E</kbd> at each building to learn.
              </p>

              <ol className="over3d-quest-steps">
                <li>
                  <strong>Beat the timer</strong> to every checkpoint. Zombies get faster and stronger
                  as you progress. If time runs out or you lose all hearts, the{' '}
                  <strong>whole run restarts at Level 1</strong>.
                </li>
                <li>
                  Each level has <strong>{CHECKPOINTS_PER_LEVEL} checkpoints</strong> (buildings) plus a{' '}
                  <strong>Boss</strong>. Press <kbd>E</kbd> at each checkpoint to do that part of
                  the lesson.
                </li>
                <li>
                  <strong>Blast the horde!</strong> Tons of zombies roam the streets — early ones are
                  slow and weak, but they get faster and tougher every level.
                </li>
                <li>
                  <strong>Hearts don&rsquo;t refill</strong> between checkpoints — guard your health for
                  the whole run.
                </li>
                <li>
                  Beat all {WORLD_COUNT} levels to become the <strong>Code Master</strong>. Finished
                  lessons stay saved even if you wipe.
                </li>
              </ol>

              <p className="over3d-quest-hint">
                <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>←</kbd><kbd>→</kbd> turn · click or{' '}
                <kbd>F</kbd> shoot · <kbd>E</kbd> enter buildings · <kbd>Space</kbd> jump
              </p>
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
                Keep exploring to fight the horde and climb the ranks, or revisit any Academy to
                sharpen a skill.
              </p>
              <div className="over3d-finale-actions">
                <button type="button" className="over3d-quest-btn" onClick={dismissFinale}>
                  Take a victory lap
                </button>
                <Link className="over3d-finale-link" to="/quest/list" onClick={dismissFinale}>
                  Review all skills
                </Link>
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

        {/* Controls hint */}
        <div className="over3d-controls-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>←</kbd><kbd>→</kbd> turn</span>
          <span><kbd>Space</kbd> jump</span>
          <span>Click / <kbd>F</kbd> shoot</span>
          <span><kbd>E</kbd> enter</span>
        </div>
      </div>
    </div>
  )
}
