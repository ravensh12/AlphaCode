import { memo, useMemo, useRef, type MutableRefObject } from 'react'
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

/** A gun tier. The first is deliberately awful; each checkpoint upgrades it. */
export type Gun = {
  name: string
  /** Seconds between shots (lower = faster). */
  cooldown: number
  /** Damage per bolt (zombies have 2+ HP). */
  damage: number
  /** Bolts fired per trigger pull. */
  pellets: number
  /** Random inaccuracy in radians (higher = worse). */
  spread: number
  /** Angle between pellets in a multi-shot, radians. */
  fan: number
  /** Auto-aim cone, stored as cos(half-angle). Bigger angle = more help. */
  aimConeCos: number
  /** Bolt travel speed (m/s). */
  boltSpeed: number
}

/** One gun per checkpoint (index 0 = Checkpoint 1). Weak → devastating. */
// Auto-aim is deliberately SLIGHT now — it only nudges a near-miss onto a target,
// it won't snap across the screen. Your own aim carries the shot, so precision +
// tracking are real skills (Fortnite-style), while early guns still feel clumsy.
export const GUNS: Gun[] = [
  { name: 'Rusty Slinger', cooldown: 0.85, damage: 1, pellets: 1, spread: 0.14, fan: 0, aimConeCos: Math.cos(0.04), boltSpeed: 44 },
  { name: 'Scrap Pistol', cooldown: 0.55, damage: 1, pellets: 1, spread: 0.085, fan: 0, aimConeCos: Math.cos(0.07), boltSpeed: 60 },
  { name: 'Bolt Repeater', cooldown: 0.36, damage: 2, pellets: 1, spread: 0.05, fan: 0, aimConeCos: Math.cos(0.10), boltSpeed: 76 },
  { name: 'Twin Blaster', cooldown: 0.30, damage: 2, pellets: 2, spread: 0.05, fan: 0.06, aimConeCos: Math.cos(0.12), boltSpeed: 88 },
  { name: 'Pulse Rifle', cooldown: 0.18, damage: 3, pellets: 2, spread: 0.03, fan: 0.05, aimConeCos: Math.cos(0.14), boltSpeed: 102 },
  { name: 'Pattern Cannon', cooldown: 0.11, damage: 3, pellets: 3, spread: 0.035, fan: 0.07, aimConeCos: Math.cos(0.16), boltSpeed: 118 },
]

export function gunForLevel(level: number): Gun {
  return GUNS[Math.max(0, Math.min(GUNS.length - 1, level))]
}

type ZombieSlot = {
  active: boolean
  state: 'walk' | 'die'
  pos: THREE.Vector3
  facing: number
  hp: number
  dieAt: number
  /** Time of the last non-fatal arrow hit, for a stagger + pop. */
  hitAt: number
  /** Time the zombie spawned, for a rise-from-the-ground entrance. */
  bornAt: number
  seed: number
  /** Which breed this is — drives speed, toughness, size, colour + contact damage. */
  variant: number
  /** Spitters/brutes: clock time the next ranged shot / slam may begin. */
  cd: number
  /** >0 while winding up a telegraphed attack (acid charge or brute slam); the
   *  attack resolves at `castAt + windup`. 0 = not casting. */
  castAt: number
}

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
const MAX_ZOMBIES = 90
const MAX_ARROWS = 90
const MAX_SPITS = 48 // enemy acid projectiles in flight at once
const ZOMBIE_SPEED = 3.7 // fast + tough from the start — the horde really chases you down
const ZOMBIE_HP = 4 // tougher to kill than before
const SPAWN_EVERY = 0.3 // the horde appears noticeably faster
const ATTACK_DIST = 1.9

// --- Spitter (ranged) tuning ---------------------------------------------
const SPIT_SPEED = 16 // acid bolt travel speed (fast, but dodgeable)
const SPIT_LIFE = 2.6
const SPIT_HIT_R = 1.15
const SPIT_HIT_R_SQ = SPIT_HIT_R * SPIT_HIT_R
const SPIT_RANGE = 19 // spitters open fire inside this range
const SPIT_STANDOFF = 11 // ...and try to hold this distance, retreating if crowded
const SPIT_INTERVAL = 1.7 // base seconds between shots (kept readable / dodgeable)
const DESPAWN_DIST = 150
const DIE_DURATION = 1.1
const STAGGER_TIME = 0.22 // brief freeze after an arrow connects
const SPAWN_RISE = 0.5 // seconds to rise out of the ground
/** Max travel distance for the best gun; weaker guns reach less far (same lifetime). */
const ARROW_MAX_RANGE = 48
const ARROW_LIFE = ARROW_MAX_RANGE / GUNS[GUNS.length - 1].boltSpeed
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
const CRIT_DMG_MULT = 2
const CRIT_CHANCE_AIMED = 0.5
const CRIT_CHANCE_ASSISTED = 0.12

// --- Spitter acid telegraph ----------------------------------------------
const SPIT_WINDUP = 0.42 // glow/charge time before an acid bolt actually launches

// --- Brute slam ----------------------------------------------------------
const SLAM_RANGE = 6.5 // brute begins a slam wind-up inside this range
const SLAM_RANGE_SQ = SLAM_RANGE * SLAM_RANGE
const SLAM_WINDUP = 0.7 // telegraph time before the shockwave lands
const SLAM_HIT_R = 4.2 // shockwave radius when it lands
const SLAM_HIT_R_SQ = SLAM_HIT_R * SLAM_HIT_R
const SLAM_DMG = 2
const SLAM_CD = 2.4 // min seconds between a brute's slams

// --- Health drops --------------------------------------------------------
const MAX_PICKUPS = 14
const PICKUP_LIFE = 12 // seconds a dropped heart lingers before fading
const PICKUP_R = 1.7 // collection radius
const PICKUP_R_SQ = PICKUP_R * PICKUP_R
const DROP_CHANCE = [0.06, 0.05, 0.32, 0.09, 0.07] // per-variant heart drop odds

// --- Gun heat / overheat (Phase 9: skill + sword-vs-gun decisions) -------
// The blaster builds heat as you fire and JAMS if you redline it, so you can't
// just hold the trigger forever — you must fire in disciplined bursts or switch
// to the sword. Fast/overcharged guns heat up quicker, making them a trade-off.
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

/* ----------------------------------------------------------- Zombie breeds
 * The horde is no longer one kind of shambler — it's a mix of distinct,
 * dangerous breeds, each with its own speed, toughness, size, gait, colour and
 * contact damage. This is the "twist": you have to read the crowd and prioritise
 * targets (drop the runners before they reach you, kite the brutes, etc.).
 */
const VAR_NORMAL = 0 // green shambler — the baseline
const VAR_RUNNER = 1 // lean, sickly-yellow sprinter: very fast, very fragile
const VAR_BRUTE = 2 // bloated dark-crimson tank: slow, huge, soaks damage, hits hard
const VAR_MUTANT = 3 // glowing toxic mutant: quick, lunges, tougher than it looks
const VAR_SPITTER = 4 // purple caster: hangs back and lobs acid bolts you must dodge
const VAR_GLITCH = 5 // cyan "knowledge glitch": a special carrier — killing it triggers a concept question

type VariantDef = {
  speedMul: number
  hpMul: number
  hpAdd: number
  scale: number
  /** Hearts removed when this breed reaches the player. */
  dmg: number
  /** Walk-cycle speed multiplier (brutes lumber, runners scramble). */
  gait: number
  /** Does it put on a closing burst of speed when it gets near? */
  lunge: boolean
  /** Ranged caster — holds its distance and fires acid bolts instead of rushing. */
  ranged: boolean
}

const VARIANTS: VariantDef[] = [
  { speedMul: 1.0, hpMul: 1.0, hpAdd: 0, scale: 1.0, dmg: 1, gait: 1.0, lunge: false, ranged: false },
  { speedMul: 1.9, hpMul: 0.5, hpAdd: -1, scale: 0.82, dmg: 1, gait: 1.9, lunge: true, ranged: false },
  { speedMul: 0.58, hpMul: 2.4, hpAdd: 5, scale: 1.55, dmg: 2, gait: 0.64, lunge: false, ranged: false },
  { speedMul: 1.4, hpMul: 1.3, hpAdd: 1, scale: 1.06, dmg: 1, gait: 1.35, lunge: true, ranged: false },
  { speedMul: 0.95, hpMul: 1.1, hpAdd: 1, scale: 0.98, dmg: 1, gait: 1.0, lunge: false, ranged: true },
  // Glitch carrier — slow, conspicuous, tanky so the player must commit to it.
  { speedMul: 0.7, hpMul: 2.0, hpAdd: 4, scale: 1.25, dmg: 1, gait: 1.1, lunge: false, ranged: false },
]

// --- Knowledge glitch (Phase 5) ------------------------------------------
const GLITCH_SPAWN_EVERY = 26 // seconds between glitch spawns (when one is wanted)
const GLITCH_SPAWN_R = 40 // distance from the player a glitch rises at

// --- Weapon crates (Phase 7) ---------------------------------------------
const MAX_CRATES = 2
const CRATE_LIFE = 40 // seconds a crate lingers before fading
const CRATE_R = 2.6 // collection radius
const CRATE_R_SQ = CRATE_R * CRATE_R
const CRATE_SPAWN_EVERY = 9 // try to keep one weapon chest beckoning at all times
const CRATE_MIN_DIST = 30 // chests appear at a distance — you go get them
const CRATE_MAX_DIST = 58

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
  gunLevel = 0,
  heartBonus = 0,
  intensity = 0,
  wantGlitch = false,
  night = false,
  shelters,
  onKill,
  onPlayerHit,
  onHeal,
  onGlitchKill,
  onChest,
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
  /** Current gun tier (0 = worst). Improves each checkpoint. */
  gunLevel?: number
  /** Extra heart-drop chance per kill (learner-adaptive mercy for strugglers). */
  heartBonus?: number
  /** 0..1 progress through the current checkpoint siege — escalates the waves. */
  intensity?: number
  /** When true, the system seeds occasional Glitch carriers (knowledge-zombies). */
  wantGlitch?: boolean
  /** Night phase — zombies turn fast + deadly and the player must hide. */
  night?: boolean
  /** Safe-house positions; standing inside one during night = total safety. */
  shelters?: { x: number; z: number }[]
  onKill: () => void
  /** Called when a zombie/acid reaches the player; `damage` = hearts lost (breed-specific). */
  onPlayerHit: (damage?: number) => void
  /** Called when the player walks over a dropped heart. */
  onHeal?: () => void
  /** Called when a Glitch carrier is destroyed — triggers a knowledge surge. */
  onGlitchKill?: () => void
  /** Called when the player collects a weapon crate — triggers an overcharge. */
  onChest?: () => void
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
  const onChestRef = useRef(onChest)
  onChestRef.current = onChest
  const glitchTimer = useRef(0)
  const glitchActive = useRef(false)
  const crateTimer = useRef(CRATE_SPAWN_EVERY * 0.5)
  const gunRef = useRef(GUNS[0])
  gunRef.current = gunForLevel(gunLevel)
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
      hitAt: -10,
      bornAt: 0,
      seed: Math.random() * 10,
      variant: VAR_NORMAL,
      cd: 0,
      castAt: 0,
    }))
    // Restore the horde that was alive before a trip to the list view so it
    // doesn't all vanish and respawn. Negative born/hit times = "already risen,
    // not staggered" under the fresh clock.
    const snap = loadZombieSnapshot()
    if (snap) {
      for (let i = 0; i < snap.length && i < pool.length; i++) {
        const s = snap[i]
        const z = pool[i]
        z.active = true
        z.state = 'walk'
        z.hp = s.hp
        z.pos.set(s.x, 0, s.z)
        z.facing = s.facing
        z.bornAt = -100
        z.hitAt = -100
        z.dieAt = 0
        z.seed = Math.random() * 10
        z.variant = s.variant ?? VAR_NORMAL
        z.cd = 0
        z.castAt = 0
      }
    }
    return pool
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

  // Weapon crates the player can detour for — collecting one overcharges the gun.
  const crates = useMemo<PickupSlot[]>(
    () =>
      Array.from({ length: MAX_CRATES }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        bornAt: 0,
      })),
    [],
  )

  function spawnCrate(px: number, pz: number, now: number) {
    for (let i = 0; i < crates.length; i++) {
      if (crates[i].active) continue
      const ang = Math.random() * Math.PI * 2
      const r = CRATE_MIN_DIST + Math.random() * (CRATE_MAX_DIST - CRATE_MIN_DIST)
      let x = px + Math.cos(ang) * r
      let z = pz + Math.sin(ang) * r
      const edge = GROUND_HALF - 8
      const d = Math.hypot(x, z)
      if (d > edge) {
        x *= edge / d
        z *= edge / d
      }
      crates[i].active = true
      crates[i].pos.set(x, 0, z)
      crates[i].bornAt = now
      return
    }
  }

  // Player i-frames + audio throttles (clock times). Live in refs so they never
  // trigger a React re-render from inside the frame loop.
  const invulnUntil = useRef(-10)
  const lastHitSfx = useRef(-10)
  const lastKillSfx = useRef(-10)

  function kick(now: number, shake: number, stopFor = 0) {
    if (shakeRef && shake > shakeRef.current) shakeRef.current = shake
    if (hitstopRef && stopFor > 0) hitstopRef.current = Math.max(hitstopRef.current, now + stopFor)
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
  }

  // --- Instanced render targets -------------------------------------------
  const torsoRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const eyesRef = useRef<THREE.InstancedMesh>(null)
  const armLRef = useRef<THREE.InstancedMesh>(null)
  const armRRef = useRef<THREE.InstancedMesh>(null)
  const legLRef = useRef<THREE.InstancedMesh>(null)
  const legRRef = useRef<THREE.InstancedMesh>(null)
  const boltCoreRef = useRef<THREE.InstancedMesh>(null)
  const boltHeadRef = useRef<THREE.InstancedMesh>(null)
  const boltTailRef = useRef<THREE.InstancedMesh>(null)
  const spitRef = useRef<THREE.InstancedMesh>(null)
  const pickupRef = useRef<THREE.InstancedMesh>(null)
  const crateRef = useRef<THREE.InstancedMesh>(null)
  const crateBeamRef = useRef<THREE.InstancedMesh>(null)

  const geo = useMemo(() => {
    const torso = new THREE.BoxGeometry(0.52, 0.7, 0.36)
    const head = new THREE.BoxGeometry(0.34, 0.38, 0.34)
    const eyes = new THREE.BoxGeometry(0.26, 0.07, 0.04)
    // Arms / legs pivot at the shoulder / hip, so bake the hang into the geo.
    const arm = new THREE.CapsuleGeometry(0.085, 0.5, 4, 8)
    arm.translate(0, -0.35, 0)
    const leg = new THREE.CapsuleGeometry(0.12, 0.56, 4, 8)
    leg.translate(0, -0.42, 0)
    // Bolt parts, baked so each shares one oriented instance matrix.
    const boltCore = new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8)
    boltCore.rotateX(Math.PI / 2)
    const boltHead = new THREE.SphereGeometry(0.09, 10, 10)
    boltHead.translate(0, 0, 0.3)
    const boltTail = new THREE.ConeGeometry(0.07, 0.9, 8)
    boltTail.rotateX(-Math.PI / 2)
    boltTail.translate(0, 0, -0.45)
    // Spitter acid bolt — a glob of toxic sludge.
    const spit = new THREE.SphereGeometry(0.16, 10, 10)
    // Dropped health orb — a single glowing gem (one instanced draw call for the
    // whole drop pool). Reads as a pickup via its pink glow + bob/spin.
    const heart = new THREE.OctahedronGeometry(0.32, 0)
    // Weapon chest — a chunky glowing supply box…
    const crate = new THREE.BoxGeometry(1.1, 1.1, 1.1)
    // …with a tall light beam so you can spot it from across the city.
    const crateBeam = new THREE.CylinderGeometry(0.7, 0.7, 40, 12, 1, true)
    crateBeam.translate(0, 20, 0)
    return { torso, head, eyes, arm, leg, boltCore, boltHead, boltTail, spit, heart, crate, crateBeam }
  }, [])

  const mats = useMemo(() => {
    // Skin meshes stay white so per-instance instanceColor drives the real tint
    // (and the red hit-flash). Legs / eyes / bolts are uniform, no per-instance.
    return {
      torso: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
      head: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
      arm: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
      leg: new THREE.MeshStandardMaterial({ color: '#3d4f25', roughness: 0.95 }),
      eyes: new THREE.MeshStandardMaterial({ color: '#fff1a8', emissive: '#ffcf3a', emissiveIntensity: 1.6 }),
      boltCore: new THREE.MeshBasicMaterial({ color: '#d6fbff', toneMapped: false, fog: false }),
      boltHead: new THREE.MeshBasicMaterial({ color: '#eafdff', toneMapped: false, fog: false }),
      boltTail: new THREE.MeshBasicMaterial({ color: '#46d6ff', transparent: true, opacity: 0.4, toneMapped: false, fog: false }),
      spit: new THREE.MeshStandardMaterial({ color: '#b6ff3a', emissive: '#7dff1a', emissiveIntensity: 1.4, roughness: 0.5, toneMapped: false }),
      heart: new THREE.MeshStandardMaterial({ color: '#ff5b7e', emissive: '#ff2d6a', emissiveIntensity: 1.6, roughness: 0.35, toneMapped: false }),
      crate: new THREE.MeshStandardMaterial({ color: '#ffcf57', emissive: '#ff9b1a', emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.3, toneMapped: false }),
      crateBeam: new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false }),
    }
  }, [])

  // Scratch objects reused every frame — zero per-frame allocations.
  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      mBody: new THREE.Matrix4(),
      mTorso: new THREE.Matrix4(),
      mHead: new THREE.Matrix4(),
      mNode: new THREE.Matrix4(),
      hidden: (() => {
        const m = new THREE.Matrix4()
        m.makeScale(0, 0, 0)
        return m
      })(),
      q: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 0, 1),
      dir: new THREE.Vector3(),
      col: new THREE.Color(),
      // Per-breed body colours, indexed by variant. Normal green shambler,
      // sickly-yellow runner, dark-blood brute, toxic-green glowing mutant.
      varTorso: [
        new THREE.Color('#5f7a3a'),
        new THREE.Color('#9a9b3c'),
        new THREE.Color('#5a2526'),
        new THREE.Color('#27a83a'),
        new THREE.Color('#553a86'),
        new THREE.Color('#16c7d6'),
      ],
      varHead: [
        new THREE.Color('#82a554'),
        new THREE.Color('#c6c651'),
        new THREE.Color('#7a3433'),
        new THREE.Color('#5cf06a'),
        new THREE.Color('#9a73e0'),
        new THREE.Color('#5ef2ff'),
      ],
      varArm: [
        new THREE.Color('#6f8f49'),
        new THREE.Color('#a8a83c'),
        new THREE.Color('#642a2a'),
        new THREE.Color('#3fae49'),
        new THREE.Color('#6f4fae'),
        new THREE.Color('#2bd6e6'),
      ],
      glitchGlow: new THREE.Color('#7af7ff'),
      flash: new THREE.Color('#ff5630'),
      // Telegraph glows: spitters charge acid-green, brutes rear up molten-orange.
      spitGlow: new THREE.Color('#e6ff7a'),
      slamGlow: new THREE.Color('#ff8a2a'),
    }),
    [],
  )

  // Expose the fire() handle.
  apiRef.current = {
    fire(origin, dir) {
      const gun = gunRef.current
      // Rate of fire — weak guns shoot slowly, top guns rip.
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

      // Kid-friendly auto-aim: bend toward the nearest zombie inside the gun's
      // cone. Early guns have almost no assist, so they feel clumsy.
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
        const fanOff = (p - (gun.pellets - 1) / 2) * gun.fan
        const jitter = (Math.random() * 2 - 1) * gun.spread
        const ang = baseAng + fanOff + jitter
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
      return zombies
        .filter((z) => z.active && z.state === 'walk')
        .map((z) => ({ x: z.pos.x, z: z.pos.z, hp: z.hp, facing: z.facing, variant: z.variant }))
    },
  }

  useFrame((state, dtRaw) => {
    if (!inited.current) {
      inited.current = true
      const zMeshes = [torsoRef, headRef, eyesRef, armLRef, armRRef, legLRef, legRRef]
      for (const r of zMeshes) {
        const m = r.current
        if (!m) continue
        for (let i = 0; i < MAX_ZOMBIES; i++) m.setMatrixAt(i, scratch.hidden)
        m.instanceMatrix.needsUpdate = true
      }
      const bMeshes = [boltCoreRef, boltHeadRef, boltTailRef]
      for (const r of bMeshes) {
        const m = r.current
        if (!m) continue
        for (let i = 0; i < MAX_ARROWS; i++) m.setMatrixAt(i, scratch.hidden)
        m.instanceMatrix.needsUpdate = true
      }
      if (spitRef.current) {
        for (let i = 0; i < MAX_SPITS; i++) spitRef.current.setMatrixAt(i, scratch.hidden)
        spitRef.current.instanceMatrix.needsUpdate = true
      }
      if (pickupRef.current) {
        for (let i = 0; i < MAX_PICKUPS; i++) pickupRef.current.setMatrixAt(i, scratch.hidden)
        pickupRef.current.instanceMatrix.needsUpdate = true
      }
      if (crateRef.current) {
        for (let i = 0; i < MAX_CRATES; i++) crateRef.current.setMatrixAt(i, scratch.hidden)
        crateRef.current.instanceMatrix.needsUpdate = true
      }
      if (crateBeamRef.current) {
        for (let i = 0; i < MAX_CRATES; i++) crateBeamRef.current.setMatrixAt(i, scratch.hidden)
        crateBeamRef.current.instanceMatrix.needsUpdate = true
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
    const speed =
      Math.min(8.4, ZOMBIE_SPEED + (tier - 1) * 0.26 + inten * 1.2) *
      (isNight ? NIGHT_SPEED_MUL : 1)
    const spawnEvery =
      Math.max(0.2, (SPAWN_EVERY - (tier - 1) * 0.03) * (1 - inten * 0.4)) *
      (isNight ? NIGHT_SPAWN_MUL : 1)
    const spawnHp = ZOMBIE_HP + Math.min(7, Math.floor((tier - 1) / 2)) + Math.round(inten * 2)

    // --- Spawning ---------------------------------------------------------
    // Laying low pauses the wave spawner, so hiding actually thins the horde.
    spawnTimer.current += dt
    if (!stealthed && spawnTimer.current >= spawnEvery) {
      spawnTimer.current = 0
      // Hordes — spawn big packs even early so there's always plenty to blast.
      const burst = (tier >= 8 ? 12 : tier >= 3 ? 10 : 7) + Math.round(inten * 5)
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
        slot.bornAt = now
        slot.seed = Math.random() * 10
        slot.castAt = 0
        // Spitters wait a beat before their first shot so they don't all volley at once.
        slot.cd = variant === VAR_SPITTER ? now + 0.5 + Math.random() * 0.9 : 0
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
          slot.bornAt = now
          slot.seed = Math.random() * 10
          slot.castAt = 0
          slot.cd = 0
          glitchActive.current = true
        }
      }
    }

    // --- Weapon chest: always keep one beckoning objective on the map -----
    crateTimer.current += dt
    if (crateTimer.current >= CRATE_SPAWN_EVERY) {
      crateTimer.current = 0
      const anyCrate = crates.some((c) => c.active)
      if (!anyCrate) spawnCrate(player.x, player.z, now)
    }

    // --- Zombies ----------------------------------------------------------
    for (let zi = 0; zi < zombies.length; zi++) {
      const z = zombies[zi]
      if (!z.active) continue
      if (z.state === 'die') {
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
          spawnBurst(z.pos.x, z.pos.z, now)
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

      if (d2 > DESPAWN_DIST_SQ) {
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
        if (z.variant === VAR_GLITCH) glitchActive.current = false
        spawnBurst(z.pos.x, z.pos.z, now)
        continue
      }
      // Freeze briefly after being struck so hits feel like they land.
      if (now - z.hitAt < STAGGER_TIME) continue

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
          const step = (speed * vdef.speedMul * dir * dt) / dist
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
      let vspeed = speed * vdef.speedMul
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
          if (crit) {
            playCrit()
            kick(now, 0.18)
          }
          if (z.hp > 0) {
            if (now - lastHitSfx.current > HIT_SFX_GAP) {
              lastHitSfx.current = now
              playEnemyHit()
            }
            // Knockback along the arrow's travel direction.
            const len = Math.hypot(a.vel.x, a.vel.z) || 1
            z.pos.x += (a.vel.x / len) * 0.6
            z.pos.z += (a.vel.z / len) * 0.6
          } else {
            z.state = 'die'
            z.dieAt = now
            spawnBurst(z.pos.x, z.pos.z, now, crit)
            if (now - lastKillSfx.current > KILL_SFX_GAP) {
              lastKillSfx.current = now
              playEnemyKill()
            }
            // Brutes are a slog, so they pay out — a heart on top of a small shake.
            if (z.variant === VAR_BRUTE) kick(now, 0.3, 0.05)
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
        s.active = false
        continue
      }
      // Dash i-frames bat any bolt inside the sweep out of the air.
      if (dashActive && dash) {
        const ddx = s.pos.x - dash.x
        const ddz = s.pos.z - dash.z
        if (ddx * ddx + ddz * ddz <= dashR2) {
          s.active = false
          continue
        }
      }
      const hdx = s.pos.x - player.x
      const hdy = s.pos.y - (player.y + 1.1)
      const hdz = s.pos.z - player.z
      if (hdx * hdx + hdy * hdy + hdz * hdz < SPIT_HIT_R_SQ) {
        s.active = false
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

    // --- Weapon crates: fade out over time, collect on contact -----------
    for (let ci = 0; ci < crates.length; ci++) {
      const cr = crates[ci]
      if (!cr.active) continue
      if (now - cr.bornAt > CRATE_LIFE) {
        cr.active = false
        continue
      }
      const cdx = cr.pos.x - player.x
      const cdz = cr.pos.z - player.z
      if (cdx * cdx + cdz * cdz < CRATE_R_SQ) {
        cr.active = false
        kick(now, 0.25, 0.04)
        onChestRef.current?.()
      }
    }

    // --- One instanced visual pass for the whole horde -------------------
    const torso = torsoRef.current
    const head = headRef.current
    const eyes = eyesRef.current
    const armL = armLRef.current
    const armR = armRRef.current
    const legL = legLRef.current
    const legR = legRRef.current
    const {
      o, mBody, mTorso, mHead, mNode, hidden, col, varTorso, varHead, varArm, flash,
      spitGlow, slamGlow, glitchGlow,
    } = scratch

    if (torso && head && eyes && armL && armR && legL && legR) {
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i]
        if (!z.active) {
          torso.setMatrixAt(i, hidden)
          head.setMatrixAt(i, hidden)
          eyes.setMatrixAt(i, hidden)
          armL.setMatrixAt(i, hidden)
          armR.setMatrixAt(i, hidden)
          legL.setMatrixAt(i, hidden)
          legR.setMatrixAt(i, hidden)
          continue
        }

        // Telegraph progress (0..1) while this breed winds up an attack.
        const casting = z.state === 'walk' && z.castAt > 0
        const castWindup = z.variant === VAR_BRUTE ? SLAM_WINDUP : SPIT_WINDUP
        const castP = casting ? THREE.MathUtils.clamp((now - z.castAt) / castWindup, 0, 1) : 0

        let bodyY: number
        let rotX = 0
        let rotZ = 0
        let yawExtra = 0
        let sx = 1
        let sy = 1
        let sz = 1
        let torsoZ = 0
        let torsoBob = 0
        let headX = 0.18
        let headZ = 0
        let armLx = -1.3
        let armLz = 0.12
        let armRx = -1.5
        let armRz = -0.2
        let legLx = 0
        let legRx = -0.18
        let flashAmt = 0

        if (z.state === 'die') {
          const p = THREE.MathUtils.clamp((now - z.dieAt) / DIE_DURATION, 0, 1)
          bodyY = -p * 1.4
          rotX = -p * 1.6
          yawExtra = p * 0.6
          rotZ = p * 0.3
          const s = 1 - p * 0.25
          sx = s
          sy = s
          sz = s
        } else {
          const rise = THREE.MathUtils.clamp((now - z.bornAt) / SPAWN_RISE, 0, 1)
          bodyY = (rise - 1) * 1.6
          const sinceHit = now - z.hitAt
          const pop = sinceHit >= 0 && sinceHit < 0.2 ? Math.sin((sinceHit / 0.2) * Math.PI) : 0
          sx = 1 + pop * 0.2
          sy = 1 - pop * 0.16
          sz = 1 + pop * 0.2
          flashAmt = sinceHit >= 0 && sinceHit < 0.18 ? 1 - sinceHit / 0.18 : 0

          const t = now * 5.4 * VARIANTS[z.variant].gait + z.seed
          const sway = Math.sin(t)
          legLx = sway * 0.62
          legRx = -sway * 0.32 - 0.18
          armLx = -1.3 + Math.sin(t + 1.1) * 0.18
          armLz = 0.12 + Math.sin(t * 0.6) * 0.06
          armRx = -1.5 + Math.sin(t * 0.9) * 0.14
          armRz = -0.2
          torsoZ = sway * 0.1
          torsoBob = Math.abs(Math.sin(t)) * 0.05
          headZ = Math.sin(t * 0.7) * 0.22
          headX = 0.18 + Math.sin(t * 1.3) * 0.08
        }

        // Body root — each breed has its own overall size (brutes loom, runners
        // are small and wiry). A telegraphing attacker swells as it charges.
        const windScale = casting
          ? z.variant === VAR_BRUTE
            ? 1 + 0.22 * castP
            : 1 + 0.12 * Math.sin(castP * Math.PI)
          : 1
        const vscale = VARIANTS[z.variant].scale * windScale
        o.position.set(z.pos.x, bodyY, z.pos.z)
        o.rotation.set(rotX, z.facing + yawExtra, rotZ)
        o.scale.set(sx * vscale, sy * vscale, sz * vscale)
        o.updateMatrix()
        mBody.copy(o.matrix)

        // Torso group (sway + bob), shared parent for head + arms.
        o.position.set(0, torsoBob, 0)
        o.rotation.set(0, 0, torsoZ)
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        mTorso.multiplyMatrices(mBody, o.matrix)

        // Torso mesh (hunched).
        o.position.set(0, 1.04, 0.05)
        o.rotation.set(0.34, 0, 0)
        o.updateMatrix()
        mNode.multiplyMatrices(mTorso, o.matrix)
        torso.setMatrixAt(i, mNode)

        // Head group.
        o.position.set(0.04, 1.56, 0.14)
        o.rotation.set(headX, 0, headZ)
        o.updateMatrix()
        mHead.multiplyMatrices(mTorso, o.matrix)
        head.setMatrixAt(i, mHead)

        // Glowing eyes ride the head front.
        o.position.set(0, 0.0, 0.18)
        o.rotation.set(0, 0, 0)
        o.updateMatrix()
        mNode.multiplyMatrices(mHead, o.matrix)
        eyes.setMatrixAt(i, mNode)

        // Arms (reach forward), parented to the torso.
        o.position.set(-0.34, 1.34, 0.05)
        o.rotation.set(armLx, 0, armLz)
        o.updateMatrix()
        mNode.multiplyMatrices(mTorso, o.matrix)
        armL.setMatrixAt(i, mNode)

        o.position.set(0.34, 1.34, 0.05)
        o.rotation.set(armRx, 0, armRz)
        o.updateMatrix()
        mNode.multiplyMatrices(mTorso, o.matrix)
        armR.setMatrixAt(i, mNode)

        // Legs, parented to the body root (don't sway with the torso).
        o.position.set(-0.15, 0.82, 0)
        o.rotation.set(legLx, 0, 0)
        o.updateMatrix()
        mNode.multiplyMatrices(mBody, o.matrix)
        legL.setMatrixAt(i, mNode)

        o.position.set(0.15, 0.82, 0)
        o.rotation.set(legRx, 0, 0)
        o.updateMatrix()
        mNode.multiplyMatrices(mBody, o.matrix)
        legR.setMatrixAt(i, mNode)

        // Per-breed tint + red hit-flash + a pulsing telegraph glow while casting.
        // Glitch carriers pulse cyan constantly so they read as "special".
        const vi = z.variant
        const teleAmt = casting ? (0.35 + 0.5 * Math.abs(Math.sin(now * 16))) * castP : 0
        const teleCol = z.variant === VAR_BRUTE ? slamGlow : spitGlow
        const glitchAmt =
          z.variant === VAR_GLITCH && z.state === 'walk'
            ? 0.3 + 0.45 * Math.abs(Math.sin(now * 6 + z.seed))
            : 0
        col.copy(varTorso[vi]).lerp(flash, flashAmt)
        if (teleAmt > 0) col.lerp(teleCol, teleAmt)
        if (glitchAmt > 0) col.lerp(glitchGlow, glitchAmt)
        torso.setColorAt(i, col)
        col.copy(varHead[vi]).lerp(flash, flashAmt)
        if (teleAmt > 0) col.lerp(teleCol, teleAmt)
        if (glitchAmt > 0) col.lerp(glitchGlow, glitchAmt)
        head.setColorAt(i, col)
        col.copy(varArm[vi]).lerp(flash, flashAmt)
        if (teleAmt > 0) col.lerp(teleCol, teleAmt)
        if (glitchAmt > 0) col.lerp(glitchGlow, glitchAmt)
        armL.setColorAt(i, col)
        armR.setColorAt(i, col)
      }

      torso.instanceMatrix.needsUpdate = true
      head.instanceMatrix.needsUpdate = true
      eyes.instanceMatrix.needsUpdate = true
      armL.instanceMatrix.needsUpdate = true
      armR.instanceMatrix.needsUpdate = true
      legL.instanceMatrix.needsUpdate = true
      legR.instanceMatrix.needsUpdate = true
      if (torso.instanceColor) torso.instanceColor.needsUpdate = true
      if (head.instanceColor) head.instanceColor.needsUpdate = true
      if (armL.instanceColor) armL.instanceColor.needsUpdate = true
      if (armR.instanceColor) armR.instanceColor.needsUpdate = true
    }

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

    // --- Acid bolts (instanced) ------------------------------------------
    const spitMesh = spitRef.current
    if (spitMesh) {
      for (let i = 0; i < spits.length; i++) {
        const s = spits[i]
        if (!s.active) {
          spitMesh.setMatrixAt(i, hidden)
          continue
        }
        const wob = 1 + Math.sin(now * 28 + i) * 0.14 // a queasy pulsing glob
        o.position.copy(s.pos)
        o.quaternion.identity()
        o.scale.set(wob, wob, wob)
        o.updateMatrix()
        spitMesh.setMatrixAt(i, o.matrix)
      }
      spitMesh.instanceMatrix.needsUpdate = true
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

    // --- Weapon chests + their guiding light beams (instanced) -----------
    const crMesh = crateRef.current
    const beamMesh = crateBeamRef.current
    if (crMesh) {
      for (let i = 0; i < crates.length; i++) {
        const cr = crates[i]
        if (!cr.active) {
          crMesh.setMatrixAt(i, hidden)
          if (beamMesh) beamMesh.setMatrixAt(i, hidden)
          continue
        }
        const age = now - cr.bornAt
        const remain = THREE.MathUtils.clamp((CRATE_LIFE - age) / 2, 0, 1)
        o.position.set(cr.pos.x, 0.6 + Math.sin(now * 2 + i) * 0.14, cr.pos.z)
        o.rotation.set(0, now * 1.1 + i, 0)
        o.scale.set(remain, remain, remain)
        o.updateMatrix()
        crMesh.setMatrixAt(i, o.matrix)
        if (beamMesh) {
          const pulse = 0.85 + Math.sin(now * 3 + i) * 0.15
          o.position.set(cr.pos.x, 0, cr.pos.z)
          o.rotation.set(0, 0, 0)
          o.scale.set(pulse, 1, pulse)
          o.updateMatrix()
          beamMesh.setMatrixAt(i, o.matrix)
        }
      }
      crMesh.instanceMatrix.needsUpdate = true
      if (beamMesh) beamMesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      {/* Whole horde = a fixed handful of instanced draw calls. Never frustum
          cull: instances roam the map but the base bounding sphere sits at the
          origin, so culling would blink the crowd out as the camera turns. */}
      <instancedMesh ref={torsoRef} args={[geo.torso, mats.torso, MAX_ZOMBIES]} frustumCulled={false} />
      <instancedMesh ref={headRef} args={[geo.head, mats.head, MAX_ZOMBIES]} frustumCulled={false} />
      <instancedMesh ref={eyesRef} args={[geo.eyes, mats.eyes, MAX_ZOMBIES]} frustumCulled={false} />
      <instancedMesh ref={armLRef} args={[geo.arm, mats.arm, MAX_ZOMBIES]} frustumCulled={false} />
      <instancedMesh ref={armRRef} args={[geo.arm, mats.arm, MAX_ZOMBIES]} frustumCulled={false} />
      <instancedMesh ref={legLRef} args={[geo.leg, mats.leg, MAX_ZOMBIES]} frustumCulled={false} />
      <instancedMesh ref={legRRef} args={[geo.leg, mats.leg, MAX_ZOMBIES]} frustumCulled={false} />

      <instancedMesh ref={boltCoreRef} args={[geo.boltCore, mats.boltCore, MAX_ARROWS]} frustumCulled={false} />
      <instancedMesh ref={boltHeadRef} args={[geo.boltHead, mats.boltHead, MAX_ARROWS]} frustumCulled={false} />
      <instancedMesh ref={boltTailRef} args={[geo.boltTail, mats.boltTail, MAX_ARROWS]} frustumCulled={false} />

      <instancedMesh ref={spitRef} args={[geo.spit, mats.spit, MAX_SPITS]} frustumCulled={false} />

      <instancedMesh ref={pickupRef} args={[geo.heart, mats.heart, MAX_PICKUPS]} frustumCulled={false} />

      <instancedMesh ref={crateRef} args={[geo.crate, mats.crate, MAX_CRATES]} frustumCulled={false} />
      <instancedMesh ref={crateBeamRef} args={[geo.crateBeam, mats.crateBeam, MAX_CRATES]} frustumCulled={false} />

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
