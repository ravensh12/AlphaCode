import { memo, Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GROUND_HALF } from './layout'
import { COMBAT_SNAP_KEY } from '../../lib/questSession'
import {
  playEnemyHit,
  playEnemyKill,
  playCrit,
  playSlamWindup,
  playSpitCharge,
} from '../../lib/soundFx'
import type { DashState } from './ThirdPersonController'
import { ZombieHorde } from './ZombieHorde'
import { CombatFx, type CombatFxApi } from './CombatFx'
import {
  EnemyProjectiles,
  ImpactFlashes,
  type EnemyProjectilesHandle,
  type ImpactFlashesHandle,
} from './projectileFx'
import {
  resolveEquippedWeapon,
  weaponPelletYaw,
} from './weaponProfile'
import {
  VARIANTS,
  VAR_NORMAL,
  VAR_RUNNER,
  VAR_BRUTE,
  VAR_MUTANT,
  VAR_SPITTER,
  VAR_GLITCH,
  DIE_DURATION,
  STAGGER_TIME,
  KNOCKBACK_DAMP,
  KNOCKBACK_MAX,
  SPIT_WINDUP,
  SLAM_WINDUP,
  type ZombieSlot,
} from './zombieTypes'

const WEAPON = resolveEquippedWeapon({ run: 'default' })

/** How many snapshot zombies to re-activate per frame after a remount. */
const RESTORE_PER_FRAME = 4

export type ZombieSnap = { x: number; z: number; hp: number; facing: number; variant?: number }

/** Live walking zombies persisted across an in-app trip (e.g. to the list view). */
function loadZombieSnapshot(): ZombieSnap[] | null {
  try {
    const raw = sessionStorage.getItem(COMBAT_SNAP_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as ZombieSnap[]) : null
  } catch {
    return null
  }
}

/** Imperative handle the controller uses to loose an arrow. */
export type CombatApi = {
  /** Returns true only when a bolt actually fired (past the cooldown). */
  fire: (origin: THREE.Vector3, dir: THREE.Vector3) => boolean
  /** Current live (walking) horde, for persisting across navigation. */
  snapshot: () => ZombieSnap[]
}

/**
 * A scripted encounter fight anchored to a mission beat: a lone bounty ELITE
 * (a hulking, high-HP glitch that guards a data shard) or a RESCUE ring of
 * zombies pinning a trapped citizen. The system spawns it when the player
 * approaches the anchor and reports back once every member is destroyed.
 */
export type EncounterSpawn = {
  id: string
  kind: 'bounty' | 'rescue'
  x: number
  z: number
}

// --- Encounter tuning ------------------------------------------------------
const BOUNTY_TRIGGER_SQ = 46 * 46 // elite rises when the player gets this close
const RESCUE_TRIGGER_SQ = 30 * 30 // rescue ring wakes a little later
const BOUNTY_HP_MULT = 4 // elite = a real duel, not a popcorn kill
const RESCUE_RING_SIZE = 5

type SpitSlot = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
}

type ArrowSlot = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
  /** True when the player aimed this themselves (auto-aim didn't bend it). */
  aimed: boolean
}

/** A dropped heart pickup that tops the player's HP back up. */
type PickupSlot = {
  active: boolean
  pos: THREE.Vector3
  bornAt: number
}

// The whole horde renders as a handful of INSTANCED meshes (one per body part)
// instead of ~26 individual meshes per zombie. That collapses thousands of
// draw calls + per-frame matrix updates down to a fixed handful, which is the
// single biggest win for a churning crowd of undead.
// ELITE-HORDE RETUNE: fewer zombies on the field, but each one is tougher and
// every kill lands harder (hitstop + shake + burst + knockback). A 28-body cap
// also cuts the horde's camera + shadow vertex cost by two thirds vs the old
// 90 — the single biggest per-frame line item.
const MAX_ZOMBIES = 28
const MAX_ARROWS = 90
const MAX_SPITS = 48 // enemy acid projectiles in flight at once
// GLOBAL PACE PASS: 3.9 → 3.43 (×0.88) in lockstep with the player's
// RUN/SPRINT/DASH slowdown in ThirdPersonController — every breed's chase
// matchup (speedMul × this base) keeps its exact relative speed.
const ZOMBIE_SPEED = 3.43 // fast + tough from the start — the horde really chases you down
const ZOMBIE_HP = 9 // elite bodies: a real exchange per kill, not popcorn
const SPAWN_EVERY = 0.9 // sparse, deliberate pressure — every body on screen matters
const ATTACK_DIST = 1.9

// --- Spitter (ranged) tuning ---------------------------------------------
const SPIT_SPEED = 16 // acid bolt travel speed (fast, but dodgeable)
const SPIT_LIFE = 2.6
const SPIT_HIT_R = 1.15
const SPIT_HIT_R_SQ = SPIT_HIT_R * SPIT_HIT_R
const SPIT_RANGE = 19 // spitters open fire inside this range
const SPIT_STANDOFF = 11 // ...and try to hold this distance, retreating if crowded
const SPIT_INTERVAL = 1.7 // base seconds between shots (kept readable / dodgeable)
// Spitter projectile look (visual only — hitbox/speed/damage untouched).
// Chartreuse, NOT teal-green: the night city's ambient accents (HUD, terminals,
// traffic lights) live in mint/teal, so the threat color must sit apart.
const ACID_GLOW = '#b4ff14' // sickly chartreuse plasma
const ACID_CORE = '#faffd8' // hot pale center (burned over-unity by the FX layer)
const ACID_SPLASH = '#d0ff32'
const DESPAWN_DIST = 150
/** Max travel distance for the always-equipped Pattern Cannon. */
const ARROW_MAX_RANGE = 48
const ARROW_LIFE = ARROW_MAX_RANGE / WEAPON.boltSpeed
const AIM_MAX_RANGE = ARROW_MAX_RANGE + 4
const AIM_MAX_RANGE_SQ = AIM_MAX_RANGE * AIM_MAX_RANGE
const HIT_RADIUS = 1.7
const HIT_RADIUS_SQ = HIT_RADIUS * HIT_RADIUS
const GROUND_HALF_SQ = GROUND_HALF * GROUND_HALF
const DESPAWN_DIST_SQ = DESPAWN_DIST * DESPAWN_DIST

const DEATH_BURST = 0.5 // seconds the death poof plays
const BURST_POOL = 20 // overlapping death poofs handled by a small ring buffer

// --- Player invulnerability (i-frames) -----------------------------------
// After taking a hit the player can't be damaged again for a short beat, so a
// pack arriving together can't chunk you from full to dead in one frame. The
// overworld mirrors this exact window for the blink/flash tell.
const PLAYER_IFRAME = 0.7

// --- Weak-point / precision crits ----------------------------------------
// A bolt the player lined up themselves (auto-aim didn't have to bend it) is a
// "clean" shot and crits more often — aiming is rewarded, button-mashing less so.
// With the tougher elite bodies, a crit is a real event: triple damage turns a
// three-hit exchange into a one-two finish when your aim is true.
const CRIT_DMG_MULT = 3
const CRIT_CHANCE_AIMED = 0.5
const CRIT_CHANCE_ASSISTED = 0.12
/** Impulse (m/s) a non-fatal bolt adds along its travel direction. Damped at
 *  KNOCKBACK_DAMP it slides the body back ~0.9m over ~0.3s — a readable shove
 *  instead of the old 1m same-frame position snap. */
const HIT_KNOCKBACK_IMPULSE = 8
/** Seconds after hit-stun ends to ease back up to full seek speed (no snap). */
const SEEK_RECOVER = 0.25
/** Impulse (m/s) the killing blow launches the corpse with before it falls
 *  (~1.6m of damped slide — the same launch distance as the old snap). */
const KILL_KNOCKBACK_IMPULSE = 14.4

// --- Brute slam ----------------------------------------------------------
const SLAM_RANGE = 6.5 // brute begins a slam wind-up inside this range
const SLAM_RANGE_SQ = SLAM_RANGE * SLAM_RANGE
const SLAM_HIT_R = 4.2 // shockwave radius when it lands
const SLAM_HIT_R_SQ = SLAM_HIT_R * SLAM_HIT_R
const SLAM_DMG = 2
const SLAM_CD = 2.4 // min seconds between a brute's slams

// --- Health drops --------------------------------------------------------
const MAX_PICKUPS = 14
const PICKUP_LIFE = 12 // seconds a dropped heart lingers before fading
const PICKUP_R = 1.7 // collection radius
const PICKUP_R_SQ = PICKUP_R * PICKUP_R
// Per-variant heart odds — a touch richer than the old flood tuning, since
// far fewer (but tougher) kills now carry the whole heal economy.
const DROP_CHANCE = [0.1, 0.08, 0.4, 0.13, 0.11]

// --- Gun heat / overheat (Phase 9: skill + sword-vs-gun decisions) -------
// The blaster builds heat as you fire and JAMS if you redline it, so you can't
// just hold the trigger forever — you must fire in disciplined bursts or switch
// to the sword.
const HEAT_PER_SHOT = 0.075 // heat added per trigger pull (0..1 scale)
const HEAT_DECAY = 0.55 // heat shed per second while not firing
const OVERHEAT_MS = 1500 // jam duration once the gun redlines

// --- Armor matchups ------------------------------------------------------
// Brutes wear bullet-deflecting plate: bolts barely dent them, but a sword dash
// cleaves straight through. Reading the crowd and picking the right tool is the
// core skill. (Spitters kite at range, so they're the gun's job.)
const BRUTE_BULLET_MUL = 0.34 // brutes take ~1/3 bolt damage

// --- Audio throttle ------------------------------------------------------
// 90 zombies can generate a torrent of hit/kill events; cap the voices so the
// mixer stays clean and the fight reads instead of becoming white noise.
const HIT_SFX_GAP = 0.05
const KILL_SFX_GAP = 0.06

/* Zombie breeds (VAR_* + VARIANTS) live in zombieTypes.ts, shared with the
 * ZombieHorde renderer so the sim and the visuals can never drift apart. */

// --- Knowledge glitch (Phase 5) ------------------------------------------
const GLITCH_SPAWN_EVERY = 26 // seconds between glitch spawns (when one is wanted)
const GLITCH_SPAWN_R = 40 // distance from the player a glitch rises at

// --- Stealth (Phase 7) ---------------------------------------------------
// While the player is laying low, zombies beyond this range lose their lock and
// drift, and spawns pause — so hiding actually lets the horde thin out.
const STEALTH_LOSE_DIST = 8 // crouch breaks the lock on anything past this range
const STEALTH_LOSE_DIST_SQ = STEALTH_LOSE_DIST * STEALTH_LOSE_DIST

// --- Nightfall (Phase 8) -------------------------------------------------
const NIGHT_SPEED_MUL = 1.7 // zombies turn frighteningly fast after dark
const NIGHT_SPAWN_MUL = 0.62 // ...and pour out faster (lower interval)
const SHELTER_R = 6.5 // radius of a safe house — inside it the player is untouchable
const SHELTER_R_SQ = SHELTER_R * SHELTER_R

/** Closing-burst trigger range (squared) for lungers. */
const LUNGE_DIST_SQ = 15 * 15

/**
 * Pick a breed for a fresh spawn. The horde is now a SHOOTER gallery: ranged
 * spitters are the most common threat (you out-shoot + dodge them), runners are
 * rare so it's less of a melee chase, with brutes + mutants as heavier accents.
 */
function pickVariant(tier: number): number {
  const r = Math.random()
  // Lots of ranged shooters — available even at tier 1.
  if (r < (tier >= 2 ? 0.36 : 0.3)) return VAR_SPITTER
  if (tier >= 2 && r < 0.48) return VAR_BRUTE // ~12% tanks
  if (tier >= 3 && r < 0.58) return VAR_MUTANT // ~10% mutants
  // Runners are now the minority (a sprinkle of melee pressure, not a swarm).
  if (r < (tier >= 2 ? 0.66 : 0.45)) return VAR_RUNNER
  return VAR_NORMAL
}

/* --------------------------------------------------------------- Manager */

function CombatSystemImpl({
  playerPosRef,
  apiRef,
  paused,
  difficulty = 0,
  heartBonus = 0,
  intensity = 0,
  wantGlitch = false,
  night = false,
  zombieShadows = true,
  shelters,
  encounter = null,
  onEncounterCleared,
  onKill,
  onPlayerHit,
  onHeal,
  onGlitchKill,
  dashRef,
  stealthRef,
  gunHeatRef,
  shakeRef,
  hitstopRef,
}: {
  playerPosRef: MutableRefObject<THREE.Vector3>
  apiRef: MutableRefObject<CombatApi | null>
  paused: boolean
  /** Ramps as the player clears checkpoints — faster, tougher, more frequent. */
  difficulty?: number
  /** Extra heart-drop chance per kill (learner-adaptive mercy for strugglers). */
  heartBonus?: number
  /** 0..1 progress through the current checkpoint siege — escalates the waves. */
  intensity?: number
  /** When true, the system seeds occasional Glitch carriers (knowledge-zombies). */
  wantGlitch?: boolean
  /** Night phase — zombies turn fast + deadly and the player must hide. */
  night?: boolean
  /** Real sun shadows for the horde (disabled on the LOW quality tier). */
  zombieShadows?: boolean
  /** Safe-house positions; standing inside one during night = total safety. */
  shelters?: { x: number; z: number }[]
  /** Pending mission-beat fight (bounty elite / rescue ring), if any. */
  encounter?: EncounterSpawn | null
  /** Fired once when every member of the active encounter is destroyed. */
  onEncounterCleared?: (id: string) => void
  onKill: () => void
  /** Called when a zombie/acid reaches the player; `damage` = hearts lost (breed-specific). */
  onPlayerHit: (damage?: number) => void
  /** Called when the player walks over a dropped heart. */
  onHeal?: () => void
  /** Called when a Glitch carrier is destroyed — triggers a knowledge surge. */
  onGlitchKill?: () => void
  /** Shared blade-dash state — drives the slicing sweep + i-frames. */
  dashRef?: MutableRefObject<DashState>
  /** Shared stealth state — when active, spawns pause and far zombies lose lock. */
  stealthRef?: MutableRefObject<{ active: boolean }>
  /** Shared gun-heat readout for the HUD (0..1 heat + overheated/jammed flag). */
  gunHeatRef?: MutableRefObject<{ heat: number; overheated: boolean }>
  /** Camera-shake impulse channel (write magnitude; the controller decays it). */
  shakeRef?: MutableRefObject<number>
  /** Hit-stop channel: set to a future clock time to briefly slow the whole scene. */
  hitstopRef?: MutableRefObject<number>
}) {
  const diffRef = useRef(0)
  diffRef.current = difficulty
  const heartBonusRef = useRef(0)
  heartBonusRef.current = heartBonus
  const intensityRef = useRef(0)
  intensityRef.current = intensity
  const wantGlitchRef = useRef(false)
  wantGlitchRef.current = wantGlitch
  const nightRef = useRef(false)
  nightRef.current = night
  const sheltersRef = useRef(shelters)
  sheltersRef.current = shelters
  const onGlitchKillRef = useRef(onGlitchKill)
  onGlitchKillRef.current = onGlitchKill
  const encounterRef = useRef<EncounterSpawn | null>(null)
  encounterRef.current = encounter
  const onEncounterClearedRef = useRef(onEncounterCleared)
  onEncounterClearedRef.current = onEncounterCleared
  // Live encounter fight: which beat it belongs to and its member slots.
  const encState = useRef<{
    id: string | null
    spawned: boolean
    members: ZombieSlot[]
  }>({ id: null, spawned: false, members: [] })
  const glitchTimer = useRef(0)
  const glitchActive = useRef(false)
  const lastFire = useRef(-9999)
  // Gun heat (0..1) + the clock time the gun is jammed until after a redline.
  const heatAmt = useRef(0)
  const overheatUntil = useRef(0)
  const zombies = useMemo<ZombieSlot[]>(() => {
    const pool: ZombieSlot[] = Array.from({ length: MAX_ZOMBIES }, () => ({
      active: false,
      state: 'walk' as const,
      pos: new THREE.Vector3(),
      facing: 0,
      hp: ZOMBIE_HP,
      dieAt: 0,
      dieHow: 'shot' as const,
      hitAt: -10,
      kbX: 0,
      kbZ: 0,
      bornAt: 0,
      seed: Math.random() * 10,
      variant: VAR_NORMAL,
      cd: 0,
      castAt: 0,
    }))
    return pool
  }, [])

  // Restore the horde that was alive before a trip to the list view so it
  // doesn't all vanish and respawn — but staggered over frames from the frame
  // loop below: re-activating ~28 skinned zombies in a single frame causes a
  // visible hitch right as the remounted world fades in.
  const restoreQueue = useMemo<{ snaps: ZombieSnap[]; next: number } | null>(() => {
    const snap = loadZombieSnapshot()
    return snap && snap.length > 0 ? { snaps: snap, next: 0 } : null
  }, [])

  const arrows = useMemo<ArrowSlot[]>(
    () =>
      Array.from({ length: MAX_ARROWS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 1,
        aimed: false,
      })),
    [],
  )

  // Dropped hearts the player can run over to recover HP.
  const pickups = useMemo<PickupSlot[]>(
    () =>
      Array.from({ length: MAX_PICKUPS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        bornAt: 0,
      })),
    [],
  )

  // Player i-frames + audio throttles (clock times). Live in refs so they never
  // trigger a React re-render from inside the frame loop.
  const invulnUntil = useRef(-10)
  const lastHitSfx = useRef(-10)
  const lastKillSfx = useRef(-10)

  function kick(now: number, shake: number, stopFor = 0) {
    if (shakeRef && shake > shakeRef.current) shakeRef.current = shake
    if (hitstopRef && stopFor > 0) hitstopRef.current = Math.max(hitstopRef.current, now + stopFor)
  }

  // Encounter members must ALWAYS get a body: prefer a free slot, else evict
  // the wave zombie farthest from the player (never a fellow member or the
  // glitch carrier). A full pool used to silently skip members, leaving
  // bounty beats with nothing to kill.
  function claimEncounterSlot(px: number, pz: number): ZombieSlot | null {
    const free = zombies.find((z) => !z.active)
    if (free) return free
    let best: ZombieSlot | null = null
    let bestD = -1
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i]
      if (z.encMember || z.variant === VAR_GLITCH) continue
      const dx = z.pos.x - px
      const dz = z.pos.z - pz
      const d2 = dx * dx + dz * dz
      if (d2 > bestD) {
        bestD = d2
        best = z
      }
    }
    return best
  }

  function dropHeart(x: number, z: number, now: number) {
    for (let i = 0; i < pickups.length; i++) {
      if (!pickups[i].active) {
        pickups[i].active = true
        pickups[i].pos.set(x, 0, z)
        pickups[i].bornAt = now
        return
      }
    }
  }

  // Enemy acid bolts lobbed by spitters — the player has to dodge (or dash) them.
  const spits = useMemo<SpitSlot[]>(
    () =>
      Array.from({ length: MAX_SPITS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
      })),
    [],
  )

  const spawnTimer = useRef(0)
  const fireDir = useRef(new THREE.Vector3())
  // Impact juice (splatter + damage numbers) — pooled instanced systems.
  const fxRef = useRef<CombatFxApi | null>(null)
  // Instanced meshes default to identity matrices (all instances stacked at the
  // origin). Hide them on the first frame so a paused-at-mount scene never shows
  // a pile of zombies at the city centre behind an overlay.
  const inited = useRef(false)

  // --- Death poofs: a small ring buffer of expanding shockwaves ------------
  type Burst = { active: boolean; at: number; x: number; z: number; crit: boolean }
  const bursts = useMemo<Burst[]>(
    () => Array.from({ length: BURST_POOL }, () => ({ active: false, at: 0, x: 0, z: 0, crit: false })),
    [],
  )
  const burstCursor = useRef(0)
  const burstRefs = useMemo(
    () => Array.from({ length: BURST_POOL }, () => ({ current: null as THREE.Mesh | null })),
    [],
  )
  const burstMatRefs = useMemo(
    () => Array.from({ length: BURST_POOL }, () => ({ current: null as THREE.MeshBasicMaterial | null })),
    [],
  )
  function spawnBurst(x: number, z: number, now: number, crit = false) {
    const i = burstCursor.current
    burstCursor.current = (i + 1) % BURST_POOL
    const b = bursts[i]
    b.active = true
    b.at = now
    b.x = x
    b.z = z
    b.crit = crit
  }

  // Spitter looses an acid bolt from its chest toward the player's chest.
  function fireSpit(zx: number, zz: number, px: number, pz: number) {
    let slot: SpitSlot | null = null
    for (let i = 0; i < spits.length; i++) {
      if (!spits[i].active) {
        slot = spits[i]
        break
      }
    }
    if (!slot) return
    const dx = px - zx
    const dy = 1.1 - 1.2 // player chest vs muzzle height (slight downward)
    const dz = pz - zz
    const len = Math.hypot(dx, dy, dz) || 1
    slot.active = true
    slot.life = SPIT_LIFE
    slot.pos.set(zx, 1.2, zz)
    slot.vel.set(dx / len, dy / len, dz / len).multiplyScalar(SPIT_SPEED)
    // Brief muzzle glow at the spitter so the release reads at range.
    impactFx.current?.spawn(zx, 1.2, zz, ACID_SPLASH, 0.8, 3)
  }

  // --- Instanced render targets -------------------------------------------
  // (The zombies themselves render in <ZombieHorde> — real crowd-skinned
  // bodies on one instanced draw — driven by the same `zombies` slots.)
  const boltCoreRef = useRef<THREE.InstancedMesh>(null)
  const boltHeadRef = useRef<THREE.InstancedMesh>(null)
  const boltTailRef = useRef<THREE.InstancedMesh>(null)
  const spitFx = useRef<EnemyProjectilesHandle>(null)
  const impactFx = useRef<ImpactFlashesHandle>(null)
  const pickupRef = useRef<THREE.InstancedMesh>(null)

  const geo = useMemo(() => {
    // Bolt parts, baked so each shares one oriented instance matrix.
    const boltCore = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8)
    boltCore.rotateX(Math.PI / 2)
    const boltHead = new THREE.SphereGeometry(0.09, 10, 10)
    boltHead.translate(0, 0, 0.3)
    const boltTail = new THREE.ConeGeometry(0.07, 0.9, 8)
    boltTail.rotateX(-Math.PI / 2)
    boltTail.translate(0, 0, -0.45)
    // (Spitter acid renders through the shared <EnemyProjectiles> layers.)
    // Dropped health orb — a single glowing gem (one instanced draw call for the
    // whole drop pool). Reads as a pickup via its pink glow + bob/spin.
    const heart = new THREE.OctahedronGeometry(0.32, 0)
    return { boltCore, boltHead, boltTail, heart }
  }, [])

  const mats = useMemo(() => {
    return {
      boltCore: new THREE.MeshBasicMaterial({ color: '#d6fbff', toneMapped: false, fog: false }),
      boltHead: new THREE.MeshBasicMaterial({ color: '#eafdff', toneMapped: false, fog: false }),
      boltTail: new THREE.MeshBasicMaterial({ color: '#46d6ff', transparent: true, opacity: 0.4, toneMapped: false, fog: false }),
      heart: new THREE.MeshStandardMaterial({ color: '#ff5b7e', emissive: '#ff2d6a', emissiveIntensity: 1.6, roughness: 0.35, toneMapped: false }),
    }
  }, [])

  // three.js frees nothing on React unmount. CombatSystem remounts on every
  // run (its `key` is bumped on respawn) and on every trip to the overworld, so
  // its pooled geometries and materials must be disposed explicitly or they
  // accumulate on the GPU.
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose()
      for (const m of Object.values(mats)) m.dispose()
    },
    [geo, mats],
  )

  // Scratch objects reused every frame — zero per-frame allocations.
  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      hidden: (() => {
        const m = new THREE.Matrix4()
        m.makeScale(0, 0, 0)
        return m
      })(),
      q: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 0, 1),
      dir: new THREE.Vector3(),
    }),
    [],
  )

  // Expose the fire() handle.
  apiRef.current = {
    fire(origin, dir) {
      const gun = WEAPON
      const now = performance.now()
      // Jammed: the gun redlined and is venting heat — reach for the sword (Q).
      if (now < overheatUntil.current) return false
      if (now - lastFire.current < gun.cooldown * 1000) return false
      lastFire.current = now

      // Build heat; redline = a forced cooldown so you can't hold-fire forever.
      heatAmt.current += HEAT_PER_SHOT
      if (heatAmt.current >= 1) {
        heatAmt.current = 1
        overheatUntil.current = now + OVERHEAT_MS
        if (shakeRef) shakeRef.current = Math.max(shakeRef.current, 0.3)
      }

      // Travel along the laser sight the player sees.
      const v = fireDir.current.copy(dir).normalize()

      // Kid-friendly auto-aim: bend a near-miss toward the nearest zombie inside
      // the Pattern Cannon's established top-tier assist cone.
      let best: ZombieSlot | null = null
      let bestDot = gun.aimConeCos
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i]
        if (!z.active || z.state !== 'walk') continue
        const ax = z.pos.x - origin.x
        const az = z.pos.z - origin.z
        const d2 = ax * ax + az * az
        if (d2 < 1 || d2 > AIM_MAX_RANGE_SQ) continue
        const inv = 1 / Math.sqrt(d2)
        const dot = ax * inv * v.x + az * inv * v.z
        if (dot > bestDot) {
          bestDot = dot
          best = z
        }
      }
      // A "clean" shot = the player already had a zombie under the reticle, so
      // auto-aim didn't have to bend the bolt. Those reward precision with crits.
      const aimed = best === null
      if (best) {
        v.set(best.pos.x - origin.x, best.pos.y + 1.1 - origin.y, best.pos.z - origin.z).normalize()
      }

      // Fire one or more bolts with a fan + random spread (inaccuracy).
      const horiz = Math.hypot(v.x, v.z) || 1
      const baseAng = Math.atan2(v.x, v.z)
      for (let p = 0; p < gun.pellets; p++) {
        const slot = arrows.find((a) => !a.active)
        if (!slot) break
        const ang = baseAng + weaponPelletYaw(p, Math.random(), gun)
        slot.active = true
        slot.life = ARROW_LIFE
        slot.damage = gun.damage
        slot.aimed = aimed
        slot.pos.copy(origin)
        slot.vel
          .set(Math.sin(ang) * horiz, v.y, Math.cos(ang) * horiz)
          .normalize()
          .multiplyScalar(gun.boltSpeed)
      }
      return true
    },
    snapshot() {
      // Encounter members are excluded: the beat respawns its own fight on
      // return, so restoring them too would duplicate the elite / ring.
      return zombies
        .filter((z) => z.active && z.state === 'walk' && !z.encMember)
        .map((z) => ({ x: z.pos.x, z: z.pos.z, hp: z.hp, facing: z.facing, variant: z.variant }))
    },
  }

  useFrame((state, dtRaw) => {
    if (!inited.current) {
      inited.current = true
      const bMeshes = [boltCoreRef, boltHeadRef, boltTailRef]
      for (const r of bMeshes) {
        const m = r.current
        if (!m) continue
        for (let i = 0; i < MAX_ARROWS; i++) m.setMatrixAt(i, scratch.hidden)
        m.instanceMatrix.needsUpdate = true
      }
      if (pickupRef.current) {
        for (let i = 0; i < MAX_PICKUPS; i++) pickupRef.current.setMatrixAt(i, scratch.hidden)
        pickupRef.current.instanceMatrix.needsUpdate = true
      }
    }
    // Drain the saved-horde snapshot a few zombies per frame instead of all at
    // once. Negative born/hit times = "already risen, not staggered" under the
    // fresh clock, so restored walkers pop in fully upright, just spread out.
    if (restoreQueue && restoreQueue.next < restoreQueue.snaps.length) {
      let budget = RESTORE_PER_FRAME
      while (budget > 0 && restoreQueue.next < restoreQueue.snaps.length) {
        const s = restoreQueue.snaps[restoreQueue.next++]
        for (let i = 0; i < zombies.length; i++) {
          const z = zombies[i]
          if (z.active) continue
          z.active = true
          z.state = 'walk'
          z.hp = s.hp
          z.pos.set(s.x, 0, s.z)
          z.facing = s.facing
          z.bornAt = -100
          z.hitAt = -100
          z.kbX = 0
          z.kbZ = 0
          z.dieAt = 0
          z.dieHow = 'shot'
          z.seed = Math.random() * 10
          z.variant = s.variant ?? VAR_NORMAL
          z.cd = 0
          z.castAt = 0
          z.encMember = false
          z.encAnchorX = undefined
          z.encAnchorZ = undefined
          break
        }
        budget--
      }
    }
    if (paused) return
    const now = state.clock.elapsedTime
    // Hit-stop: briefly slow the whole simulation right after a big impact so
    // hits read as weighty. Scales time, so zombies, bolts and acid all crawl
    // together for a few frames — reads as punch, not lag.
    const slowed = hitstopRef ? now < hitstopRef.current : false
    const dt = Math.min(dtRaw, 0.05) * (slowed ? 0.18 : 1)
    const player = playerPosRef.current
    const isNight = nightRef.current

    // Safe house: inside any shelter zone during the night, the player is
    // completely untouchable — the heart of "find shelter or die".
    let sheltered = false
    if (isNight && sheltersRef.current) {
      const sh = sheltersRef.current
      for (let i = 0; i < sh.length; i++) {
        const sdx = sh[i].x - player.x
        const sdz = sh[i].z - player.z
        if (sdx * sdx + sdz * sdz <= SHELTER_R_SQ) {
          sheltered = true
          break
        }
      }
    }
    // Sheltering counts as full invulnerability for every damage source below.
    const invuln = now < invulnUntil.current || sheltered

    // Gun heat cools over time; publish it (and the jammed flag) for the HUD.
    const nowMs = performance.now()
    const overheated = nowMs < overheatUntil.current
    heatAmt.current = Math.max(
      0,
      heatAmt.current - HEAT_DECAY * (overheated ? 0.6 : 1) * dt,
    )
    if (gunHeatRef) {
      gunHeatRef.current.heat = heatAmt.current
      gunHeatRef.current.overheated = overheated
    }

    // Blade-dash sweep (slices walkers + grants i-frames against contact + acid).
    const dash = dashRef?.current
    const dashActive = !!dash && dash.active
    const dashR2 = dash ? dash.radius * dash.radius : 0

    // Stealth: while laying low, spawns pause and far zombies lose their lock.
    // Sheltering makes ALL zombies disengage, not just distant ones.
    const stealthed = !!stealthRef?.current?.active

    // Difficulty tier (1 = first checkpoint). Already punchy at tier 1 to hook the
    // player, then a gentle climb so later levels aren't a brick wall.
    const tier = Math.max(1, diffRef.current)
    // Siege escalation: the deeper into a checkpoint's hold-out you are, the
    // thicker and faster the waves get — building to a frantic climax.
    const inten = intensityRef.current
    // After dark the horde turns fast + relentless — standing your ground is death.
    // Pace pass: cap 8.4→7.39, tier ramp 0.26→0.23, intensity 1.2→1.06 — the
    // whole escalation curve is ×0.88, matching the player slowdown exactly.
    const speed =
      Math.min(7.39, ZOMBIE_SPEED + (tier - 1) * 0.23 + inten * 1.06) *
      (isNight ? NIGHT_SPEED_MUL : 1)
    const spawnEvery =
      Math.max(0.4, (SPAWN_EVERY - (tier - 1) * 0.03) * (1 - inten * 0.4)) *
      (isNight ? NIGHT_SPAWN_MUL : 1)
    const spawnHp = ZOMBIE_HP + Math.min(7, Math.floor((tier - 1) / 2)) + Math.round(inten * 2)

    // --- Spawning ---------------------------------------------------------
    // Laying low pauses the wave spawner, so hiding actually thins the horde.
    spawnTimer.current += dt
    if (!stealthed && spawnTimer.current >= spawnEvery) {
      spawnTimer.current = 0
      // Elite squads: 2-3 bodies at a time, ramping with tier + siege heat.
      // Small numbers keep each zombie legible and worth a real exchange.
      const burst = (tier >= 8 ? 4 : tier >= 3 ? 3 : 2) + Math.round(inten * 2)
      for (let b = 0; b < burst; b++) {
        const slot = zombies.find((z) => !z.active)
        if (!slot) break
        const ang = Math.random() * Math.PI * 2
        const r = 56 + Math.random() * 26
        let x = player.x + Math.cos(ang) * r
        let z = player.z + Math.sin(ang) * r
        const edge = GROUND_HALF - 6
        const d = Math.hypot(x, z)
        if (d > edge) {
          x *= edge / d
          z *= edge / d
        }
        const variant = pickVariant(tier)
        const vdef = VARIANTS[variant]
        slot.active = true
        slot.state = 'walk'
        slot.variant = variant
        slot.hp = Math.max(1, Math.round(spawnHp * vdef.hpMul) + vdef.hpAdd)
        slot.pos.set(x, 0, z)
        slot.hitAt = -10
        slot.kbX = 0
        slot.kbZ = 0
        slot.bornAt = now
        slot.seed = Math.random() * 10
        slot.castAt = 0
        slot.encMember = false
        slot.encAnchorX = undefined
        slot.encAnchorZ = undefined
        // Spitters wait a beat before their first shot so they don't all volley at once.
        slot.cd = variant === VAR_SPITTER ? now + 0.5 + Math.random() * 0.9 : 0
      }
    }

    // --- Mission-beat encounter: bounty elite / rescue ring ----------------
    // Spawns once when the player nears the beat's anchor; reports the win
    // the moment every member has fallen. Members are exempt from distance
    // despawn so the fight can't be cheesed by walking away.
    const enc = encounterRef.current
    if (!enc) {
      if (encState.current.id) {
        encState.current = { id: null, spawned: false, members: [] }
      }
    } else {
      if (encState.current.id !== enc.id) {
        encState.current = { id: enc.id, spawned: false, members: [] }
      }
      const live = encState.current
      if (!live.spawned) {
        const pdx = player.x - enc.x
        const pdz = player.z - enc.z
        const trigger =
          enc.kind === 'bounty' ? BOUNTY_TRIGGER_SQ : RESCUE_TRIGGER_SQ
        if (pdx * pdx + pdz * pdz <= trigger) {
          const count = enc.kind === 'bounty' ? 1 : RESCUE_RING_SIZE
          // Top up from however many members exist (0 on the first pass): if a
          // frame ever fails to place the full roster, the next one retries
          // instead of declaring a half-spawned (or empty) fight live.
          for (let m = live.members.length; m < count; m++) {
            const slot = claimEncounterSlot(player.x, player.z)
            if (!slot) break
            const ang = (m / count) * Math.PI * 2 + 0.6
            const r = enc.kind === 'bounty' ? 6 : 4.2 + (m % 2) * 1.4
            const variant =
              enc.kind === 'bounty'
                ? VAR_BRUTE
                : m === 0
                  ? VAR_SPITTER
                  : m % 2 === 0
                    ? VAR_RUNNER
                    : VAR_NORMAL
            const vdef = VARIANTS[variant]
            slot.active = true
            slot.state = 'walk'
            slot.variant = variant
            slot.hp =
              enc.kind === 'bounty'
                ? Math.round(
                    (spawnHp * vdef.hpMul + vdef.hpAdd) * BOUNTY_HP_MULT,
                  )
                : Math.max(1, Math.round(spawnHp * vdef.hpMul) + vdef.hpAdd)
            // Keep the spawn point on the playfield even for beats that sit
            // near the map rim, so a member can't rise out of reach.
            let mx = enc.x + Math.cos(ang) * r
            let mz = enc.z + Math.sin(ang) * r
            const edge = GROUND_HALF - 6
            const md = Math.hypot(mx, mz)
            if (md > edge) {
              mx *= edge / md
              mz *= edge / md
            }
            slot.pos.set(mx, 0, mz)
            slot.hitAt = -10
            slot.kbX = 0
            slot.kbZ = 0
            slot.bornAt = now
            slot.seed = Math.random() * 10
            slot.castAt = 0
            slot.cd = variant === VAR_SPITTER ? now + 0.8 : 0
            slot.encMember = true
            // Rescue rings menace their trapped citizen until the player is
            // close enough to fight (see the lunge theater in the sim loop).
            if (enc.kind === 'rescue') {
              slot.encAnchorX = enc.x
              slot.encAnchorZ = enc.z
            } else {
              slot.encAnchorX = undefined
              slot.encAnchorZ = undefined
            }
            live.members.push(slot)
          }
          // Only a full roster counts as spawned — a partial pass retries.
          live.spawned = live.members.length >= count
        }
      } else if (live.members.length > 0) {
        // A member still standing keeps the fight alive; a slot that died (or
        // was recycled by the wave spawner, which clears encMember) is down.
        let down = true
        for (const member of live.members) {
          if (member.active && member.state === 'walk' && member.encMember) {
            down = false
            break
          }
        }
        if (down) {
          live.members = []
          kick(now, 0.5, 0.1)
          onEncounterClearedRef.current?.(enc.id)
        }
      }
    }

    // --- Knowledge glitch: a single special carrier when one is wanted ----
    if (wantGlitchRef.current && !glitchActive.current && !stealthed) {
      glitchTimer.current += dt
      if (glitchTimer.current >= GLITCH_SPAWN_EVERY) {
        glitchTimer.current = 0
        const slot = zombies.find((z) => !z.active)
        if (slot) {
          const ang = Math.random() * Math.PI * 2
          let x = player.x + Math.cos(ang) * GLITCH_SPAWN_R
          let z = player.z + Math.sin(ang) * GLITCH_SPAWN_R
          const edge = GROUND_HALF - 6
          const d = Math.hypot(x, z)
          if (d > edge) {
            x *= edge / d
            z *= edge / d
          }
          const vdef = VARIANTS[VAR_GLITCH]
          slot.active = true
          slot.state = 'walk'
          slot.variant = VAR_GLITCH
          slot.hp = Math.max(1, Math.round(spawnHp * vdef.hpMul) + vdef.hpAdd)
          slot.pos.set(x, 0, z)
          slot.hitAt = -10
          slot.kbX = 0
          slot.kbZ = 0
          slot.bornAt = now
          slot.seed = Math.random() * 10
          slot.castAt = 0
          slot.cd = 0
          slot.encMember = false
          slot.encAnchorX = undefined
          slot.encAnchorZ = undefined
          glitchActive.current = true
        }
      }
    }

    // --- Zombies ----------------------------------------------------------
    for (let zi = 0; zi < zombies.length; zi++) {
      const z = zombies[zi]
      if (!z.active) continue
      if (z.state === 'die') {
        // Corpses keep their damped knockback slide (the kill launch).
        if (z.kbX !== 0 || z.kbZ !== 0) {
          z.pos.x += z.kbX * dt
          z.pos.z += z.kbZ * dt
          const kbDamp = Math.exp(-KNOCKBACK_DAMP * dt)
          z.kbX *= kbDamp
          z.kbZ *= kbDamp
        }
        if (now - z.dieAt > DIE_DURATION) z.active = false
        continue
      }
      const vdef = VARIANTS[z.variant]
      const dx = player.x - z.pos.x
      const dz = player.z - z.pos.z
      const d2 = dx * dx + dz * dz
      z.facing = Math.atan2(dx, dz)

      // Blade dash carves through any walker it sweeps over.
      if (dashActive && dash) {
        const sdx = z.pos.x - dash.x
        const sdz = z.pos.z - dash.z
        if (sdx * sdx + sdz * sdz <= dashR2) {
          z.state = 'die'
          z.dieAt = now
          z.dieHow = 'dash'
          fxRef.current?.impact(z.pos.x, 1.2, z.pos.z, 0, false, true)
          spawnBurst(z.pos.x, z.pos.z, now)
          // Slicing through a body mid-dash lands its own beat.
          kick(now, 0.2, 0.05)
          if (now - lastKillSfx.current > KILL_SFX_GAP) {
            lastKillSfx.current = now
            playEnemyKill()
          }
          if (Math.random() < (DROP_CHANCE[z.variant] ?? 0.06) + heartBonusRef.current)
            dropHeart(z.pos.x, z.pos.z, now)
          if (z.variant === VAR_GLITCH) {
            glitchActive.current = false
            onGlitchKillRef.current?.()
          }
          onKill()
          continue
        }
      }

      if (d2 > DESPAWN_DIST_SQ && !z.encMember) {
        z.active = false
        if (z.variant === VAR_GLITCH) glitchActive.current = false
        continue
      }
      // Inside a safe house, EVERY zombie disengages and idles.
      if (sheltered) continue
      // Laying low fools the shamblers: melee breeds past close range lose your
      // trail and wander AWAY, so crouching shakes a chase. BUT spitters are
      // SENSORS — they keep their lock and keep sniping, so you can't just hide
      // from everything; you still have to deal with the ranged casters.
      if (stealthed && d2 > STEALTH_LOSE_DIST_SQ && !vdef.ranged) {
        const d = Math.sqrt(d2) || 1
        z.pos.x -= (dx / d) * speed * 0.35 * dt
        z.pos.z -= (dz / d) * speed * 0.35 * dt
        z.facing = Math.atan2(-dx, -dz)
        continue
      }
      if (d2 <= ATTACK_DIST * ATTACK_DIST) {
        // Reaches the player: deal this breed's damage unless the player is
        // dashing or still inside their post-hit i-frames. During i-frames the
        // attacker is shoved back instead so it can't camp and instantly re-hit.
        if (dashActive || invuln) {
          const d = Math.sqrt(d2) || 1
          z.pos.x -= (dx / d) * 2.2
          z.pos.z -= (dz / d) * 2.2
          continue
        }
        onPlayerHit(vdef.dmg + (isNight ? 1 : 0))
        invulnUntil.current = now + PLAYER_IFRAME
        kick(now, 0.6, 0.07)
        z.state = 'die'
        z.dieAt = now
        z.dieHow = 'contact'
        if (z.variant === VAR_GLITCH) glitchActive.current = false
        spawnBurst(z.pos.x, z.pos.z, now)
        continue
      }
      // ---- Hit reaction ----------------------------------------------------
      // A bolt adds a velocity impulse (never a position snap); it decays
      // exponentially so the body slides back a short beat along the shot line
      // and settles — no teleport jitter, no fighting the seek AI.
      if (z.kbX !== 0 || z.kbZ !== 0) {
        z.pos.x += z.kbX * dt
        z.pos.z += z.kbZ * dt
        const kbDamp = Math.exp(-KNOCKBACK_DAMP * dt)
        z.kbX *= kbDamp
        z.kbZ *= kbDamp
        if (z.kbX * z.kbX + z.kbZ * z.kbZ < 0.01) {
          z.kbX = 0
          z.kbZ = 0
        }
      }
      // Hit-stun: seek pauses briefly so the shove reads clean...
      const sinceStagger = now - z.hitAt
      if (sinceStagger < STAGGER_TIME) continue
      // ...then pursuit eases back up to full speed instead of snapping.
      const recover = Math.min(1, (sinceStagger - STAGGER_TIME) / SEEK_RECOVER)

      // Rescue-ring THEATER: while the player is still far, ring members
      // menace the trapped citizen — lunging in at them and backing off —
      // instead of beelining across the map. Pure staging; the moment the
      // player closes in they turn and fight for real.
      if (z.encAnchorX !== undefined && z.encAnchorZ !== undefined && d2 > 14 * 14) {
        const ax = z.encAnchorX - z.pos.x
        const az = z.encAnchorZ - z.pos.z
        const ad = Math.hypot(ax, az) || 1
        // Each member breathes on its own phase: in to ~1.6m (a lunge at the
        // citizen), back out to ~4.6m, forever.
        const wantR = 3.1 + Math.sin(now * 1.7 + z.seed * 6.3) * 1.5
        const err = ad - wantR
        z.pos.x += (ax / ad) * THREE.MathUtils.clamp(err, -1, 1) * speed * 0.55 * dt
        z.pos.z += (az / ad) * THREE.MathUtils.clamp(err, -1, 1) * speed * 0.55 * dt
        z.facing = Math.atan2(ax, az) // menace the citizen, not the player
        continue
      }

      // Spitters hold their distance and lob acid — but only after a visible
      // wind-up (a charge glow) so the player can read it and dodge.
      if (vdef.ranged) {
        const dist = Math.sqrt(d2) || 1
        if (z.castAt > 0) {
          // Mid-charge: stand and deliver, then fire when the wind-up completes.
          if (now >= z.castAt + SPIT_WINDUP) {
            fireSpit(z.pos.x, z.pos.z, player.x, player.z)
            z.castAt = 0
          }
          continue
        }
        if (now >= z.cd && dist <= SPIT_RANGE) {
          z.castAt = now
          z.cd = now + SPIT_INTERVAL * (0.9 + Math.random() * 0.6)
          playSpitCharge()
          continue
        }
        let dir = 0
        if (dist > SPIT_RANGE) dir = 1 // close in until in range
        else if (dist < SPIT_STANDOFF) dir = -0.85 // crowded — back away
        if (dir !== 0) {
          const step = (speed * vdef.speedMul * recover * dir * dt) / dist
          z.pos.x += dx * step
          z.pos.z += dz * step
        }
        continue
      }

      // Brutes telegraph a ground-slam when they lumber into range: they rear up
      // (wind-up glow), then drop a shockwave. Out-spaced = punished, kited = safe.
      if (z.variant === VAR_BRUTE) {
        if (z.castAt > 0) {
          if (now >= z.castAt + SLAM_WINDUP) {
            z.castAt = 0
            z.cd = now + SLAM_CD
            spawnBurst(z.pos.x, z.pos.z, now)
            kick(now, 0.45, 0.05)
            const sdx = player.x - z.pos.x
            const sdz = player.z - z.pos.z
            if (sdx * sdx + sdz * sdz <= SLAM_HIT_R_SQ && !dashActive && !invuln) {
              onPlayerHit(SLAM_DMG)
              invulnUntil.current = now + PLAYER_IFRAME
              kick(now, 0.7, 0.08)
            }
          }
          continue // rooted mid-slam
        }
        if (now >= z.cd && d2 <= SLAM_RANGE_SQ) {
          z.castAt = now
          playSlamWindup()
          continue
        }
      }

      // Each melee breed has its own pace; runners + mutants put on a closing burst.
      let vspeed = speed * vdef.speedMul * recover
      if (vdef.lunge && d2 < LUNGE_DIST_SQ) vspeed *= 1.3
      const step = (vspeed * dt) / (Math.sqrt(d2) || 1)
      z.pos.x += dx * step
      z.pos.z += dz * step
    }

    // --- Arrows + collisions ---------------------------------------------
    for (let ai = 0; ai < arrows.length; ai++) {
      const a = arrows[ai]
      if (!a.active) continue
      a.life -= dt
      a.pos.addScaledVector(a.vel, dt)
      if (
        a.life <= 0 ||
        a.pos.y < 0 ||
        a.pos.x * a.pos.x + a.pos.z * a.pos.z > GROUND_HALF_SQ
      ) {
        a.active = false
        continue
      }
      for (let zi = 0; zi < zombies.length; zi++) {
        const z = zombies[zi]
        if (!z.active || z.state !== 'walk') continue
        const hx = z.pos.x - a.pos.x
        const hy = z.pos.y + 1.1 - a.pos.y
        const hz = z.pos.z - a.pos.z
          if (hx * hx + hy * hy + hz * hz < HIT_RADIUS_SQ) {
          a.active = false
          // Precision/weak-point crit: clean (self-aimed) shots crit far more.
          const crit = Math.random() < (a.aimed ? CRIT_CHANCE_AIMED : CRIT_CHANCE_ASSISTED)
          let dmg = crit ? a.damage * CRIT_DMG_MULT : a.damage
          // Brutes are bullet-armored — chip them with bolts or (better) sword them.
          if (z.variant === VAR_BRUTE) dmg = Math.max(1, Math.round(dmg * BRUTE_BULLET_MUL))
          z.hp -= dmg
          z.hitAt = now
          // Impact feedback: data-splatter shards + a floating damage number.
          fxRef.current?.impact(a.pos.x, a.pos.y, a.pos.z, dmg, crit, z.hp <= 0)
          if (crit) {
            playCrit()
            kick(now, 0.18)
          }
          if (z.hp > 0) {
            if (now - lastHitSfx.current > HIT_SFX_GAP) {
              lastHitSfx.current = now
              playEnemyHit()
            }
            // Knockback impulse along the bolt's travel direction (staggers
            // too, via hitAt) — every connected bolt visibly rocks the body,
            // and the damped slide replaces the old same-frame position snap.
            const len = Math.hypot(a.vel.x, a.vel.z) || 1
            z.kbX += (a.vel.x / len) * HIT_KNOCKBACK_IMPULSE
            z.kbZ += (a.vel.z / len) * HIT_KNOCKBACK_IMPULSE
            // Rapid fire stacks pressure, not physics: cap the total speed.
            const kbLen = Math.hypot(z.kbX, z.kbZ)
            if (kbLen > KNOCKBACK_MAX) {
              z.kbX *= KNOCKBACK_MAX / kbLen
              z.kbZ *= KNOCKBACK_MAX / kbLen
            }
          } else {
            z.state = 'die'
            z.dieAt = now
            z.dieHow = 'shot'
            // Launch the corpse along the killing bolt before it drops.
            const len = Math.hypot(a.vel.x, a.vel.z) || 1
            z.kbX = (a.vel.x / len) * KILL_KNOCKBACK_IMPULSE
            z.kbZ = (a.vel.z / len) * KILL_KNOCKBACK_IMPULSE
            spawnBurst(z.pos.x, z.pos.z, now, crit)
            if (now - lastKillSfx.current > KILL_SFX_GAP) {
              lastKillSfx.current = now
              playEnemyKill()
            }
            // EVERY kill lands a beat: a hitstop tick + shake, bigger on crits.
            // With the elite retune each body takes a real exchange, so the
            // payoff has to feel like an event — not a popcorn pop.
            if (z.variant === VAR_BRUTE) kick(now, 0.42, 0.11)
            else kick(now, crit ? 0.3 : 0.2, crit ? 0.09 : 0.06)
            if (Math.random() < (DROP_CHANCE[z.variant] ?? 0.06) + heartBonusRef.current)
              dropHeart(z.pos.x, z.pos.z, now)
            if (z.variant === VAR_GLITCH) {
              glitchActive.current = false
              onGlitchKillRef.current?.()
            }
            onKill()
          }
          break
        }
      }
    }

    // --- Enemy acid bolts (spitters) -------------------------------------
    for (let si = 0; si < spits.length; si++) {
      const s = spits[si]
      if (!s.active) continue
      s.life -= dt
      s.pos.addScaledVector(s.vel, dt)
      if (
        s.life <= 0 ||
        s.pos.y < 0 ||
        s.pos.x * s.pos.x + s.pos.z * s.pos.z > GROUND_HALF_SQ
      ) {
        // Acid that lands splats on the pavement instead of blinking out.
        if (s.pos.y < 0.4) impactFx.current?.spawn(s.pos.x, 0.14, s.pos.z, ACID_SPLASH, 0.8, 5)
        s.active = false
        continue
      }
      // Dash i-frames bat any bolt inside the sweep out of the air.
      if (dashActive && dash) {
        const ddx = s.pos.x - dash.x
        const ddz = s.pos.z - dash.z
        if (ddx * ddx + ddz * ddz <= dashR2) {
          s.active = false
          impactFx.current?.spawn(s.pos.x, s.pos.y, s.pos.z, ACID_SPLASH, 0.9, 6)
          continue
        }
      }
      const hdx = s.pos.x - player.x
      const hdy = s.pos.y - (player.y + 1.1)
      const hdz = s.pos.z - player.z
      if (hdx * hdx + hdy * hdy + hdz * hdz < SPIT_HIT_R_SQ) {
        s.active = false
        impactFx.current?.spawn(s.pos.x, s.pos.y, s.pos.z, ACID_SPLASH, 1.2, 8)
        if (!dashActive && !invuln) {
          onPlayerHit(isNight ? 2 : 1)
          invulnUntil.current = now + PLAYER_IFRAME
          kick(now, 0.5, 0.06)
        }
      }
    }

    // --- Heart pickups: bob, fade, and collect on contact ----------------
    for (let pi = 0; pi < pickups.length; pi++) {
      const pk = pickups[pi]
      if (!pk.active) continue
      if (now - pk.bornAt > PICKUP_LIFE) {
        pk.active = false
        continue
      }
      const pdx = pk.pos.x - player.x
      const pdz = pk.pos.z - player.z
      if (pdx * pdx + pdz * pdz < PICKUP_R_SQ) {
        pk.active = false
        onHeal?.()
      }
    }

    // (Zombie bodies render in <ZombieHorde/> below — it reads these slots.)
    const { o, hidden } = scratch

    // --- Bolts (instanced) -----------------------------------------------
    const boltCore = boltCoreRef.current
    const boltHead = boltHeadRef.current
    const boltTail = boltTailRef.current
    if (boltCore && boltHead && boltTail) {
      const { q, up, dir } = scratch
      for (let i = 0; i < arrows.length; i++) {
        const a = arrows[i]
        if (!a.active) {
          boltCore.setMatrixAt(i, hidden)
          boltHead.setMatrixAt(i, hidden)
          boltTail.setMatrixAt(i, hidden)
          continue
        }
        dir.copy(a.vel).normalize()
        q.setFromUnitVectors(up, dir)
        o.position.copy(a.pos)
        o.quaternion.copy(q)
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        boltCore.setMatrixAt(i, o.matrix)
        boltHead.setMatrixAt(i, o.matrix)
        boltTail.setMatrixAt(i, o.matrix)
      }
      boltCore.instanceMatrix.needsUpdate = true
      boltHead.instanceMatrix.needsUpdate = true
      boltTail.instanceMatrix.needsUpdate = true
    }

    // --- Acid bolts (layered core / halo / trail) -------------------------
    {
      const fx = spitFx.current
      fx?.begin(state.camera.quaternion)
      for (let i = 0; i < spits.length; i++) {
        const s = spits[i]
        if (!s.active) {
          fx?.hide(i)
          continue
        }
        fx?.set(i, s.pos, s.vel.x, s.vel.y, s.vel.z, now)
      }
      fx?.commit()
    }

    // --- Death poofs ------------------------------------------------------
    for (let i = 0; i < bursts.length; i++) {
      const b = bursts[i]
      const mesh = burstRefs[i].current
      const mat = burstMatRefs[i].current
      if (!mesh) continue
      if (!b.active) {
        if (mesh.visible) mesh.visible = false
        continue
      }
      const bp = THREE.MathUtils.clamp((now - b.at) / DEATH_BURST, 0, 1)
      if (bp >= 1) {
        b.active = false
        if (mesh.visible) mesh.visible = false
        continue
      }
      mesh.visible = true
      mesh.position.set(b.x, 0.08, b.z)
      const s = 0.4 + bp * 2.6
      mesh.scale.set(s, s, s)
      if (mat) {
        mat.opacity = (1 - bp) * 0.95
        mat.color.set(b.crit ? '#ffd65c' : '#b6ff5c')
      }
    }

    // --- Heart pickups (instanced) ---------------------------------------
    const pkMesh = pickupRef.current
    if (pkMesh) {
      for (let i = 0; i < pickups.length; i++) {
        const pk = pickups[i]
        if (!pk.active) {
          pkMesh.setMatrixAt(i, hidden)
          continue
        }
        const age = now - pk.bornAt
        const remain = THREE.MathUtils.clamp((PICKUP_LIFE - age) / 1.5, 0, 1)
        o.position.set(pk.pos.x, 0.7 + Math.sin(now * 3 + i) * 0.14, pk.pos.z)
        o.rotation.set(0, now * 2.2 + i, 0)
        o.scale.set(remain, remain, remain)
        o.updateMatrix()
        pkMesh.setMatrixAt(i, o.matrix)
      }
      pkMesh.instanceMatrix.needsUpdate = true
    }

  })

  return (
    <group>
      {/* The horde: real crowd-skinned zombies, one instanced draw call for
          all 90 bodies (+1 for blob shadows). Suspense holds it back while the
          GLB + baked animation texture stream in — combat sim runs regardless. */}
      <Suspense fallback={null}>
        <ZombieHorde zombies={zombies} paused={paused} shadows={zombieShadows} nearShadowOnly />
      </Suspense>
      <CombatFx ref={fxRef} />

      <instancedMesh ref={boltCoreRef} args={[geo.boltCore, mats.boltCore, MAX_ARROWS]} frustumCulled={false} />
      <instancedMesh ref={boltHeadRef} args={[geo.boltHead, mats.boltHead, MAX_ARROWS]} frustumCulled={false} />
      <instancedMesh ref={boltTailRef} args={[geo.boltTail, mats.boltTail, MAX_ARROWS]} frustumCulled={false} />

      {/* Spitter acid — toxic plasma core + glow + trail, plus splash flashes. */}
      <EnemyProjectiles ref={spitFx} organic pool={MAX_SPITS} color={ACID_GLOW} coreColor={ACID_CORE} size={0.26} trail={0.85} />
      <ImpactFlashes ref={impactFx} pool={12} />

      <instancedMesh ref={pickupRef} args={[geo.heart, mats.heart, MAX_PICKUPS]} frustumCulled={false} />

      {bursts.map((_, i) => (
        <mesh
          key={`burst${i}`}
          ref={(el) => {
            burstRefs[i].current = el
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
        >
          <ringGeometry args={[0.45, 0.85, 22]} />
          <meshBasicMaterial
            ref={(m) => {
              burstMatRefs[i].current = m
            }}
            color="#b6ff5c"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// Memoized: the overworld page re-renders several times a second (HUD distance /
// timer / horde readouts), and all this component's changing inputs (paused,
// difficulty) come through props, so a shallow prop compare safely skips the
// reconcile pass when nothing relevant changed.
export const CombatSystem = memo(CombatSystemImpl)
