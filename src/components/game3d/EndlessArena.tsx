import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { useKeys } from './useKeys'
import { ZombieHorde } from './ZombieHorde'
import { CombatFx, type CombatFxApi } from './CombatFx'
import {
  EnemyProjectiles,
  ImpactFlashes,
  type EnemyProjectilesHandle,
  type ImpactFlashesHandle,
} from './projectileFx'
import { MAX_TIER_WEAPON, weaponPelletYaw } from './weaponProfile'
import {
  isCoarsePointer,
  joystickActive,
  joystickVector,
  TOUCH_MOVE_REST,
  type TouchMoveVector,
} from './touchControls'
import {
  VARIANTS,
  VAR_NORMAL,
  VAR_BRUTE,
  DIE_DURATION,
  STAGGER_TIME,
  KNOCKBACK_DAMP,
  KNOCKBACK_MAX,
  SPIT_WINDUP,
  type ZombieSlot,
} from './zombieTypes'
import {
  waveConfig,
  waveZombieHp,
  pickWaveVariant,
} from '../../lib/endlessWaves'
import {
  playShot,
  playEnemyHit,
  playEnemyKill,
  playPlayerHurt,
  playHeartPickup,
  playSpitCharge,
} from '../../lib/soundFx'
import {
  meetsTier,
  resolveQualityProfile,
} from '../../lib/graphicsQuality'

// Meshy arena set dressing (MEDIUM+) — lazy so its GLB loader stack never
// weighs down the endless-siege route chunk.
const MeshyArenaDressing = lazy(() => import('./meshy/MeshyArenaDressing'))

/* ============================================================================
   ENDLESS SIEGE — a standalone wave-survival arena (post-campaign mode).

   Deliberately self-contained, modeled on BossArena's structure: its own
   <Canvas>, a lean light rig (baked one-frame IBL + key/fill), and its own
   post stack — no CinematicStage, no SimulationDriver coupling. The horde
   itself reuses the ZombieHorde VAT crowd renderer (2 instanced bodies +
   shadow twins + 1 blob draw for the whole pack), so the entire scene stays
   inside the established draw-call budget. Every pooled geometry/material is
   disposed on unmount.

   XP only: this component records nothing — the page grants a flat XP reward.
   ========================================================================== */

const WEAPON = MAX_TIER_WEAPON

export const ENDLESS_MAX_HEARTS = 8

const ARENA_R = 26
const BOUND = 22
const RUN_SPEED = 9
const HEADING_LERP = 0.24

// Camera: a high 3/4 follow view so threats from every direction stay readable.
const CAM_HEIGHT = 15.5
const CAM_BACK = 11.5
const CAM_FOLLOW = 0.16

const MAX_ZOMBIES = 60
const MAX_BOLTS = 64
const MAX_SPITS = 32
const MAX_PICKUPS = 8

const BOLT_SPEED = WEAPON.boltSpeed
const BOLT_LIFE = 44 / BOLT_SPEED
const BOLT_COOLDOWN = WEAPON.cooldown
const HIT_RADIUS_SQ = 1.7 * 1.7
const AIM_RANGE_SQ = 46 * 46
/** Impulse (m/s) a bolt adds along its travel direction — damped at
 *  KNOCKBACK_DAMP this slides the body back ~0.5m (the arena's old snap
 *  distance) instead of teleporting it in a single frame. */
const KNOCKBACK_IMPULSE = 4.5
/** Seconds after hit-stun ends to ease back up to full seek speed. */
const SEEK_RECOVER = 0.25
/** Brutes wear bolt-deflecting plate (same matchup as the overworld). */
const BRUTE_BULLET_MUL = 0.34

const CONTACT_DIST_SQ = 1.9 * 1.9
const PLAYER_IFRAME = 0.7

const SPIT_SPEED = 15
const SPIT_LIFE = 2.4
const SPIT_HIT_R_SQ = 1.15 * 1.15
const SPIT_RANGE = 17
const SPIT_STANDOFF = 10
const SPIT_INTERVAL = 1.8
// Spitter projectile look (visual only — hitbox/speed/damage untouched).
// Chartreuse, NOT teal-green — must sit apart from the city's mint/teal accents.
const ACID_GLOW = '#b4ff14'
const ACID_CORE = '#faffd8'
const ACID_SPLASH = '#d0ff32'

const PICKUP_R_SQ = 1.8 * 1.8
/** Heart pickups dropped at each wave clear (collect during the breather). */
const PICKUPS_PER_WAVE = 2

/** Seconds of breather between waves (and before wave 1). */
export const ENDLESS_BREAK_SECONDS = 5
const FIRST_BREAK_SECONDS = 3

const HIT_SFX_GAP = 0.05
const KILL_SFX_GAP = 0.06

type Bolt = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number; damage: number }
type Spit = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number }
type Pickup = { active: boolean; pos: THREE.Vector3; bornAt: number }

export type EndlessRunResult = {
  /** Wave the run ended on (the highest wave reached). */
  wave: number
  kills: number
}

/* --------------------------------------------------------------- The floor */

const SiegeFloor = memo(function SiegeFloor({ accent }: { accent: string }) {
  // Lean, fully local materials — no simulation shader coupling.
  const mats = useMemo(
    () => ({
      base: new THREE.MeshStandardMaterial({ color: '#4a4168', roughness: 0.94, metalness: 0.05 }),
      disk: new THREE.MeshStandardMaterial({ color: '#3d365c', roughness: 0.9, metalness: 0.04 }),
      ring: new THREE.MeshStandardMaterial({ color: '#2e2947', roughness: 0.95, transparent: true, opacity: 0.65, depthWrite: false }),
      wall: new THREE.MeshStandardMaterial({ color: '#514873', side: THREE.BackSide, roughness: 0.9, metalness: 0.08 }),
      trim: new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }),
      bound: new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }),
      pillar: new THREE.MeshStandardMaterial({ color: '#453d63', flatShading: true, roughness: 0.85 }),
    }),
    [accent],
  )
  const geos = useMemo(
    () => ({
      base: new THREE.CylinderGeometry(ARENA_R + 4, ARENA_R + 4, 0.6, 72),
      disk: new THREE.CircleGeometry(18, 96),
      ring: new THREE.RingGeometry(9.4, 9.55, 96),
      ring2: new THREE.RingGeometry(15.4, 15.55, 96),
      wall: new THREE.CylinderGeometry(ARENA_R + 2.6, ARENA_R + 2.6, 13, 72, 1, true),
      trim: new THREE.RingGeometry(ARENA_R + 1.7, ARENA_R + 2.6, 80),
      bound: new THREE.RingGeometry(BOUND - 0.5, BOUND + 0.45, 64),
      pillar: new THREE.BoxGeometry(1.05, 6.4, 1.05),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose()
      for (const g of Object.values(geos)) g.dispose()
    },
    [mats, geos],
  )

  // Framing pillars as one instanced draw.
  const pillarRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = pillarRef.current
    if (!mesh) return
    const o = new THREE.Object3D()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      o.position.set(Math.cos(a) * (ARENA_R + 2.35), 2.9, Math.sin(a) * (ARENA_R + 2.35))
      o.rotation.set(0, 0, 0)
      o.scale.set(1, 1, 1)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      {/* Base slab — a cylinder is already a horizontal disk; top face at y=0. */}
      <mesh position={[0, -0.3, 0]} receiveShadow geometry={geos.base} material={mats.base} />
      {/* Inner combat disk + scale rings */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow geometry={geos.disk} material={mats.disk} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} geometry={geos.ring} material={mats.ring} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} geometry={geos.ring2} material={mats.ring} />
      {/* Enclosing wall + glowing trim + play boundary */}
      <mesh position={[0, 5.9, 0]} geometry={geos.wall} material={mats.wall} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} geometry={geos.trim} material={mats.trim} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} geometry={geos.bound} material={mats.bound} />
      <instancedMesh ref={pillarRef} args={[geos.pillar, mats.pillar, 10]} castShadow frustumCulled={false} />
    </group>
  )
})

/* ------------------------------------------------------------------ Scene */

const SiegeScene = memo(function SiegeScene({
  accent,
  wave,
  running,
  frozen,
  touchMoveRef,
  touchFireRef,
  onKill,
  onPlayerHit,
  onHeal,
  onWaveCleared,
}: {
  accent: string
  /** Current wave number (1-based). */
  wave: number
  /** True while the wave is live (false during breathers and after death). */
  running: boolean
  /** True once the run has ended — input and the horde stop. */
  frozen: boolean
  /** Virtual joystick channel (touch devices) — read alongside the keys. */
  touchMoveRef?: React.MutableRefObject<TouchMoveVector>
  /** On-screen fire button channel (touch devices) — OR'd with hold-fire. */
  touchFireRef?: React.MutableRefObject<boolean>
  onKill: () => void
  onPlayerHit: (damage: number) => void
  onHeal: () => void
  onWaveCleared: () => void
}) {
  const { camera, gl } = useThree()

  // ---- Live tuning readable from useFrame without re-subscribing ----------
  const cfg = useMemo(() => waveConfig(wave), [wave])
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const runningRef = useRef(running)
  runningRef.current = running
  const frozenRef = useRef(frozen)
  frozenRef.current = frozen
  const onKillRef = useRef(onKill)
  onKillRef.current = onKill
  const onPlayerHitRef = useRef(onPlayerHit)
  onPlayerHitRef.current = onPlayerHit
  const onHealRef = useRef(onHeal)
  onHealRef.current = onHeal
  const onWaveClearedRef = useRef(onWaveCleared)
  onWaveClearedRef.current = onWaveCleared

  // ---- Player ----
  const playerGroup = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 6))
  const heading = useRef(Math.PI)
  const playerAnimRef = useRef<AvatarAnim>('idle')
  const fireRef = useRef(0)
  const enabledRef = useRef(true)
  enabledRef.current = !frozen
  const keys = useKeys(enabledRef)
  const holdFire = useRef(false)
  const cooldown = useRef(0)
  const invulnUntil = useRef(-10)

  // ---- Pools (all mutation happens in refs — zero setState in useFrame) ----
  const zombies = useMemo<ZombieSlot[]>(
    () =>
      Array.from({ length: MAX_ZOMBIES }, () => ({
        active: false,
        state: 'walk' as const,
        pos: new THREE.Vector3(),
        facing: 0,
        hp: 1,
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
      })),
    [],
  )
  const bolts = useMemo<Bolt[]>(
    () =>
      Array.from({ length: MAX_BOLTS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: WEAPON.damage,
      })),
    [],
  )
  const spits = useMemo<Spit[]>(
    () =>
      Array.from({ length: MAX_SPITS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
      })),
    [],
  )
  const pickups = useMemo<Pickup[]>(
    () =>
      Array.from({ length: MAX_PICKUPS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        bornAt: 0,
      })),
    [],
  )

  // Wave lifecycle bookkeeping.
  const startedWave = useRef(0)
  const clearedWave = useRef(0)
  const spawnQueue = useRef(0)
  const spawnTimer = useRef(0)

  // Audio throttles.
  const lastHitSfx = useRef(-10)
  const lastKillSfx = useRef(-10)

  const fxRef = useRef<CombatFxApi | null>(null)

  // ---- Instanced render targets -------------------------------------------
  const boltMesh = useRef<THREE.InstancedMesh>(null)
  const spitFx = useRef<EnemyProjectilesHandle>(null)
  const impactFx = useRef<ImpactFlashesHandle>(null)
  const pickupMesh = useRef<THREE.InstancedMesh>(null)
  const inited = useRef(false)

  const geo = useMemo(() => {
    const bolt = new THREE.CylinderGeometry(0.055, 0.055, 0.7, 8)
    bolt.rotateX(Math.PI / 2)
    // (Spitter acid renders through the shared <EnemyProjectiles> layers.)
    const heart = new THREE.OctahedronGeometry(0.32, 0)
    return { bolt, heart }
  }, [])
  const mats = useMemo(
    () => ({
      bolt: new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, fog: false }),
      heart: new THREE.MeshStandardMaterial({ color: '#ff5b7e', emissive: '#ff2d6a', emissiveIntensity: 1.6, roughness: 0.35, toneMapped: false }),
    }),
    [accent],
  )
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose()
      for (const m of Object.values(mats)) m.dispose()
    },
    [geo, mats],
  )

  // Scratch objects — hoisted so useFrame never allocates.
  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      q: new THREE.Quaternion(),
      fwd: new THREE.Vector3(0, 0, 1),
      dir: new THREE.Vector3(),
      move: new THREE.Vector3(),
      cam: new THREE.Vector3(),
    }),
    [],
  )

  // Hold mouse or F to rapid-fire (auto-aim picks the nearest threat).
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
    camera.position.set(0, CAM_HEIGHT, 6 + CAM_BACK)
    camera.lookAt(0, 0.8, 6)
  }, [camera])

  function spawnZombie(now: number) {
    const slot = zombies.find((z) => !z.active)
    if (!slot) return
    const config = cfgRef.current
    // Rise at the arena rim, biased away from the player's current position.
    let ang = Math.random() * Math.PI * 2
    const px = pos.current.x
    const pz = pos.current.z
    const r = BOUND - 1.2 - Math.random() * 2.5
    let x = Math.cos(ang) * r
    let z = Math.sin(ang) * r
    if (Math.hypot(x - px, z - pz) < 9) {
      ang += Math.PI
      x = Math.cos(ang) * r
      z = Math.sin(ang) * r
    }
    const variant = pickWaveVariant(config, Math.random())
    slot.active = true
    slot.state = 'walk'
    slot.variant = variant
    slot.hp = waveZombieHp(config, variant)
    slot.pos.set(x, 0, z)
    slot.facing = Math.atan2(px - x, pz - z)
    slot.hitAt = -10
    slot.kbX = 0
    slot.kbZ = 0
    slot.bornAt = now
    slot.dieAt = 0
    slot.dieHow = 'shot'
    slot.seed = Math.random() * 10
    slot.castAt = 0
    slot.cd = VARIANTS[variant].ranged ? now + 0.6 + Math.random() * 0.9 : 0
  }

  function spawnWavePickups() {
    let dropped = 0
    for (let i = 0; i < pickups.length && dropped < PICKUPS_PER_WAVE; i++) {
      const p = pickups[i]
      if (p.active) continue
      const ang = Math.random() * Math.PI * 2
      const r = 3.5 + Math.random() * 6
      p.active = true
      p.pos.set(Math.cos(ang) * r, 0, Math.sin(ang) * r)
      p.bornAt = performance.now()
      dropped++
    }
  }

  function fireSpit(zx: number, zz: number, px: number, pz: number) {
    const slot = spits.find((s) => !s.active)
    if (!slot) return
    const dx = px - zx
    const dy = -0.1
    const dz = pz - zz
    const len = Math.hypot(dx, dy, dz) || 1
    slot.active = true
    slot.life = SPIT_LIFE
    slot.pos.set(zx, 1.2, zz)
    slot.vel.set(dx / len, dy / len, dz / len).multiplyScalar(SPIT_SPEED)
    // Brief muzzle glow at the spitter so the release reads at range.
    impactFx.current?.spawn(zx, 1.2, zz, ACID_SPLASH, 0.8, 3)
  }

  useFrame((state, dtRaw) => {
    const now = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const { o, hidden, q, fwd, dir, move, cam } = scratch
    const config = cfgRef.current
    const isFrozen = frozenRef.current
    const isRunning = runningRef.current && !isFrozen

    // First frame: hide every instanced slot so nothing piles at the origin.
    if (!inited.current) {
      inited.current = true
      const meshes = [boltMesh.current, pickupMesh.current]
      const counts = [MAX_BOLTS, MAX_PICKUPS]
      meshes.forEach((m, mi) => {
        if (!m) return
        for (let i = 0; i < counts[mi]; i++) m.setMatrixAt(i, hidden)
        m.instanceMatrix.needsUpdate = true
      })
    }

    // ---- Wave lifecycle ----------------------------------------------------
    if (isRunning && startedWave.current !== config.wave) {
      startedWave.current = config.wave
      spawnQueue.current = config.count
      spawnTimer.current = config.spawnEvery // first batch lands immediately
    }
    if (isRunning && spawnQueue.current > 0) {
      spawnTimer.current += dt
      if (spawnTimer.current >= config.spawnEvery) {
        spawnTimer.current = 0
        const batch = Math.min(config.batch, spawnQueue.current)
        for (let b = 0; b < batch; b++) spawnZombie(now)
        spawnQueue.current -= batch
      }
    }

    // ---- Player movement (screen-relative under the fixed high camera) -----
    const k = isFrozen ? {} : keys.current
    let strX = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0)
    let strZ = (k['s'] || k['arrowdown'] ? 1 : 0) - (k['w'] || k['arrowup'] ? 1 : 0)
    // Virtual joystick adds its analog vector on top (screen axes match).
    const touch = touchMoveRef?.current
    if (!isFrozen && touch && joystickActive(touch)) {
      strX += touch.strX
      strZ += touch.strZ
    }
    move.set(strX, 0, strZ)
    const moving = move.lengthSq() > 0.001
    if (moving) {
      move.normalize()
      pos.current.x += move.x * RUN_SPEED * dt
      pos.current.z += move.z * RUN_SPEED * dt
      const r = Math.hypot(pos.current.x, pos.current.z)
      if (r > BOUND) {
        pos.current.x *= BOUND / r
        pos.current.z *= BOUND / r
      }
    }
    playerAnimRef.current = moving ? 'run' : 'idle'

    // ---- Firing: nearest active walker inside range, else straight ahead ---
    cooldown.current -= dt
    const firingHeld = holdFire.current || !!touchFireRef?.current
    let target: ZombieSlot | null = null
    if (!isFrozen && firingHeld && cooldown.current <= 0) {
      let bestD2 = AIM_RANGE_SQ
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i]
        if (!z.active || z.state !== 'walk') continue
        const dx = z.pos.x - pos.current.x
        const dz = z.pos.z - pos.current.z
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) {
          bestD2 = d2
          target = z
        }
      }
      cooldown.current = BOLT_COOLDOWN
      if (target) {
        dir
          .set(
            target.pos.x - pos.current.x,
            1.1 - 1.2,
            target.pos.z - pos.current.z,
          )
          .normalize()
      } else {
        dir.set(Math.sin(heading.current), 0, Math.cos(heading.current))
      }
      const horiz = Math.hypot(dir.x, dir.z) || 1
      const baseAng = Math.atan2(dir.x, dir.z)
      let fired = false
      for (let pellet = 0; pellet < WEAPON.pellets; pellet++) {
        const b = bolts.find((x) => !x.active)
        if (!b) break
        b.active = true
        b.life = BOLT_LIFE
        b.damage = WEAPON.damage
        b.pos.set(pos.current.x + dir.x * 0.7, 1.2, pos.current.z + dir.z * 0.7)
        const ang = baseAng + weaponPelletYaw(pellet, Math.random(), WEAPON)
        b.vel
          .set(Math.sin(ang) * horiz, dir.y, Math.cos(ang) * horiz)
          .normalize()
          .multiplyScalar(BOLT_SPEED)
        fired = true
      }
      if (fired) {
        fireRef.current = now
        playShot()
      }
    }

    // Face the fire target while shooting, else the travel direction.
    let targetHeading = heading.current
    if (target) {
      targetHeading = Math.atan2(target.pos.x - pos.current.x, target.pos.z - pos.current.z)
    } else if (moving) {
      targetHeading = Math.atan2(move.x, move.z)
    }
    let hd = targetHeading - heading.current
    hd = Math.atan2(Math.sin(hd), Math.cos(hd))
    heading.current += hd * HEADING_LERP

    const g = playerGroup.current
    if (g) {
      g.position.copy(pos.current)
      g.rotation.y = heading.current
    }

    // ---- Camera: smooth high 3/4 follow ------------------------------------
    cam.set(pos.current.x, CAM_HEIGHT, pos.current.z + CAM_BACK)
    camera.position.lerp(cam, CAM_FOLLOW)
    camera.lookAt(pos.current.x, 0.8, pos.current.z)

    // ---- Zombies ------------------------------------------------------------
    const invuln = now < invulnUntil.current
    let walkers = 0
    for (let zi = 0; zi < zombies.length; zi++) {
      const z = zombies[zi]
      if (!z.active) continue
      if (z.state === 'die') {
        if (now - z.dieAt > DIE_DURATION) z.active = false
        continue
      }
      walkers++
      // Damped knockback slide (see CombatSystem): impulses decay instead of
      // teleporting the body, so hits rock the zombie back along the shot line.
      if (!isFrozen && (z.kbX !== 0 || z.kbZ !== 0)) {
        z.pos.x += z.kbX * dt
        z.pos.z += z.kbZ * dt
        const kbDamp = Math.exp(-KNOCKBACK_DAMP * dt)
        z.kbX *= kbDamp
        z.kbZ *= kbDamp
        if (z.kbX * z.kbX + z.kbZ * z.kbZ < 0.01) {
          z.kbX = 0
          z.kbZ = 0
        }
        // A shove can't push a body out through the arena wall.
        const kr = Math.hypot(z.pos.x, z.pos.z)
        if (kr > BOUND) {
          z.pos.x *= BOUND / kr
          z.pos.z *= BOUND / kr
        }
      }
      if (isFrozen) continue
      const vdef = VARIANTS[z.variant]
      const dx = pos.current.x - z.pos.x
      const dz = pos.current.z - z.pos.z
      const d2 = dx * dx + dz * dz
      z.facing = Math.atan2(dx, dz)

      // Contact: the attacker spends itself on the hit (same as the overworld).
      if (d2 <= CONTACT_DIST_SQ) {
        if (invuln) {
          const d = Math.sqrt(d2) || 1
          z.pos.x -= (dx / d) * 2.2
          z.pos.z -= (dz / d) * 2.2
          continue
        }
        onPlayerHitRef.current(vdef.dmg)
        invulnUntil.current = now + PLAYER_IFRAME
        z.state = 'die'
        z.dieAt = now
        z.dieHow = 'contact'
        continue
      }
      const sinceStagger = now - z.hitAt
      if (sinceStagger < STAGGER_TIME) continue
      // Ease back into pursuit after the hit-stun instead of snapping.
      const recover = Math.min(1, (sinceStagger - STAGGER_TIME) / SEEK_RECOVER)

      // Spitters hold a standoff ring and lob telegraphed acid.
      if (vdef.ranged) {
        const dist = Math.sqrt(d2) || 1
        if (z.castAt > 0) {
          if (now >= z.castAt + SPIT_WINDUP) {
            fireSpit(z.pos.x, z.pos.z, pos.current.x, pos.current.z)
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
        let dirSign = 0
        if (dist > SPIT_RANGE) dirSign = 1
        else if (dist < SPIT_STANDOFF) dirSign = -0.85
        if (dirSign !== 0) {
          const step = (config.speed * vdef.speedMul * recover * dirSign * dt) / dist
          z.pos.x += dx * step
          z.pos.z += dz * step
          // A retreating spitter must never back out through the arena wall.
          const sr = Math.hypot(z.pos.x, z.pos.z)
          if (sr > BOUND) {
            z.pos.x *= BOUND / sr
            z.pos.z *= BOUND / sr
          }
        }
        continue
      }

      // Melee breeds chase; lungers put on a closing burst.
      let vspeed = config.speed * vdef.speedMul * recover
      if (vdef.lunge && d2 < 15 * 15) vspeed *= 1.3
      const step = (vspeed * dt) / (Math.sqrt(d2) || 1)
      z.pos.x += dx * step
      z.pos.z += dz * step
      const zr = Math.hypot(z.pos.x, z.pos.z)
      if (zr > BOUND) {
        z.pos.x *= BOUND / zr
        z.pos.z *= BOUND / zr
      }
    }

    // Wave cleared: queue drained and no walker left standing.
    if (
      isRunning &&
      startedWave.current === config.wave &&
      clearedWave.current !== config.wave &&
      spawnQueue.current <= 0 &&
      walkers === 0
    ) {
      clearedWave.current = config.wave
      spawnWavePickups()
      onWaveClearedRef.current()
    }

    // ---- Bolts + hits --------------------------------------------------------
    for (let bi = 0; bi < bolts.length; bi++) {
      const b = bolts[bi]
      if (!b.active) continue
      b.life -= dt
      b.pos.addScaledVector(b.vel, dt)
      if (b.life <= 0 || b.pos.y < 0) {
        b.active = false
        continue
      }
      for (let zi = 0; zi < zombies.length; zi++) {
        const z = zombies[zi]
        if (!z.active || z.state !== 'walk') continue
        const hx = z.pos.x - b.pos.x
        const hy = z.pos.y + 1.1 - b.pos.y
        const hz = z.pos.z - b.pos.z
        if (hx * hx + hy * hy + hz * hz < HIT_RADIUS_SQ) {
          b.active = false
          let dmg = b.damage
          if (z.variant === VAR_BRUTE) dmg = Math.max(1, Math.round(dmg * BRUTE_BULLET_MUL))
          z.hp -= dmg
          z.hitAt = now
          fxRef.current?.impact(b.pos.x, b.pos.y, b.pos.z, dmg, false, z.hp <= 0)
          if (z.hp > 0) {
            if (now - lastHitSfx.current > HIT_SFX_GAP) {
              lastHitSfx.current = now
              playEnemyHit()
            }
            // Impulse along the bolt's travel line, clamped under rapid fire.
            const len = Math.hypot(b.vel.x, b.vel.z) || 1
            z.kbX += (b.vel.x / len) * KNOCKBACK_IMPULSE
            z.kbZ += (b.vel.z / len) * KNOCKBACK_IMPULSE
            const kbLen = Math.hypot(z.kbX, z.kbZ)
            if (kbLen > KNOCKBACK_MAX) {
              z.kbX *= KNOCKBACK_MAX / kbLen
              z.kbZ *= KNOCKBACK_MAX / kbLen
            }
          } else {
            z.state = 'die'
            z.dieAt = now
            z.dieHow = 'shot'
            if (now - lastKillSfx.current > KILL_SFX_GAP) {
              lastKillSfx.current = now
              playEnemyKill()
            }
            onKillRef.current()
          }
          break
        }
      }
    }

    // ---- Acid bolts ----------------------------------------------------------
    for (let si = 0; si < spits.length; si++) {
      const s = spits[si]
      if (!s.active) continue
      s.life -= dt
      s.pos.addScaledVector(s.vel, dt)
      if (s.life <= 0 || s.pos.y < 0) {
        // Acid that lands splats on the deck instead of blinking out.
        if (s.pos.y < 0.4) impactFx.current?.spawn(s.pos.x, 0.14, s.pos.z, ACID_SPLASH, 0.8, 5)
        s.active = false
        continue
      }
      const hdx = s.pos.x - pos.current.x
      const hdy = s.pos.y - 1.1
      const hdz = s.pos.z - pos.current.z
      if (hdx * hdx + hdy * hdy + hdz * hdz < SPIT_HIT_R_SQ) {
        s.active = false
        impactFx.current?.spawn(s.pos.x, s.pos.y, s.pos.z, ACID_SPLASH, 1.2, 8)
        if (!isFrozen && now >= invulnUntil.current) {
          onPlayerHitRef.current(1)
          invulnUntil.current = now + PLAYER_IFRAME
        }
      }
    }

    // ---- Heart pickups --------------------------------------------------------
    for (let pi = 0; pi < pickups.length; pi++) {
      const p = pickups[pi]
      if (!p.active) continue
      const pdx = p.pos.x - pos.current.x
      const pdz = p.pos.z - pos.current.z
      if (!isFrozen && pdx * pdx + pdz * pdz < PICKUP_R_SQ) {
        p.active = false
        onHealRef.current()
        playHeartPickup()
      }
    }

    // ---- Instanced visuals -----------------------------------------------------
    const bm = boltMesh.current
    if (bm) {
      for (let i = 0; i < bolts.length; i++) {
        const b = bolts[i]
        if (!b.active) {
          bm.setMatrixAt(i, hidden)
          continue
        }
        dir.copy(b.vel).normalize()
        q.setFromUnitVectors(fwd, dir)
        o.position.copy(b.pos)
        o.quaternion.copy(q)
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        bm.setMatrixAt(i, o.matrix)
      }
      bm.instanceMatrix.needsUpdate = true
    }
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
    const pm = pickupMesh.current
    if (pm) {
      for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i]
        if (!p.active) {
          pm.setMatrixAt(i, hidden)
          continue
        }
        o.position.set(p.pos.x, 0.72 + Math.sin(now * 3 + i) * 0.14, p.pos.z)
        o.rotation.set(0, now * 2.2 + i, 0)
        o.scale.set(1, 1, 1)
        o.updateMatrix()
        pm.setMatrixAt(i, o.matrix)
      }
      pm.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <SiegeFloor accent={accent} />

      <group ref={playerGroup}>
        <Avatar animRef={playerAnimRef} accent={accent} fireRef={fireRef} />
      </group>

      {/* The whole horde: 2 instanced skinned bodies + shadow twins + blobs. */}
      <Suspense fallback={null}>
        <ZombieHorde zombies={zombies} paused={frozen} shadows />
      </Suspense>
      <CombatFx ref={fxRef} />

      <instancedMesh ref={boltMesh} args={[geo.bolt, mats.bolt, MAX_BOLTS]} frustumCulled={false} />
      {/* Spitter acid — toxic plasma core + glow + trail, plus splash flashes. */}
      <EnemyProjectiles ref={spitFx} organic pool={MAX_SPITS} color={ACID_GLOW} coreColor={ACID_CORE} size={0.26} trail={0.85} />
      <ImpactFlashes ref={impactFx} pool={10} />
      <instancedMesh ref={pickupMesh} args={[geo.heart, mats.heart, MAX_PICKUPS]} frustumCulled={false} />
    </group>
  )
})

/* ------------------------------------------------------------ Touch controls */

/**
 * On-screen controls for coarse-pointer devices: an analog joystick (writes
 * the shared move ref every pointer move — no React state on the hot path)
 * and a hold-to-fire button. Mirrors the overworld's touch pattern, kept
 * local so the arena stays self-contained.
 */
const SiegeTouchControls = memo(function SiegeTouchControls({
  accent,
  moveRef,
  fireRef,
}: {
  accent: string
  moveRef: React.MutableRefObject<TouchMoveVector>
  fireRef: React.MutableRefObject<boolean>
}) {
  const baseRef = useRef<HTMLDivElement>(null)
  const nubRef = useRef<HTMLDivElement>(null)
  const activeId = useRef<number | null>(null)
  const [firePressed, setFirePressed] = useState(false)

  function apply(e: React.PointerEvent) {
    const base = baseRef.current
    const nub = nubRef.current
    if (!base || !nub) return
    const rect = base.getBoundingClientRect()
    const vector = joystickVector(e.clientX, e.clientY, rect)
    moveRef.current = vector
    const r = rect.width / 2
    nub.style.transform = `translate(${vector.strX * r * 0.55}px, ${vector.strZ * r * 0.55}px)`
  }

  function release() {
    activeId.current = null
    moveRef.current = { ...TOUCH_MOVE_REST }
    if (nubRef.current) nubRef.current.style.transform = 'translate(0px, 0px)'
  }

  const startFire = () => {
    fireRef.current = true
    setFirePressed(true)
  }
  const endFire = () => {
    fireRef.current = false
    setFirePressed(false)
  }

  return (
    <>
      <div
        ref={baseRef}
        aria-label="Move"
        style={{
          position: 'absolute',
          left: 18,
          bottom: 96,
          zIndex: 8,
          width: 124,
          height: 124,
          borderRadius: '50%',
          border: '2px solid rgba(140, 200, 255, 0.35)',
          background:
            'radial-gradient(circle, rgba(20, 28, 48, 0.35) 0%, rgba(20, 28, 48, 0.6) 100%)',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 22px rgba(0, 0, 0, 0.35)',
        }}
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
        <div
          ref={nubRef}
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(150, 210, 255, 0.55)',
            border: '2px solid rgba(255, 255, 255, 0.55)',
            boxShadow: '0 0 18px rgba(120, 190, 255, 0.45)',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        />
      </div>
      <button
        type="button"
        aria-pressed={firePressed}
        title="Hold to fire (or hold F)"
        style={{
          position: 'absolute',
          right: 18,
          bottom: 108,
          zIndex: 8,
          width: 84,
          height: 84,
          borderRadius: '50%',
          border: `2px solid ${firePressed ? 'rgba(255, 220, 180, 0.8)' : 'rgba(255, 170, 120, 0.55)'}`,
          background: firePressed ? '#b8451f' : 'rgba(48, 26, 23, 0.78)',
          color: '#ffd9c4',
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: 1,
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          boxShadow: firePressed
            ? `0 0 28px ${accent}55, 0 8px 22px rgba(0, 0, 0, 0.5)`
            : '0 8px 22px rgba(0, 0, 0, 0.45)',
          transform: firePressed ? 'scale(0.94)' : 'none',
        }}
        onPointerDown={(e) => {
          e.preventDefault()
          startFire()
        }}
        onPointerUp={endFire}
        onPointerLeave={endFire}
        onPointerCancel={endFire}
      >
        FIRE
      </button>
    </>
  )
})

/* --------------------------------------------------------------- Component */

export function EndlessArena({
  accent = '#37e6ff',
  onEnd,
  onExit,
}: {
  accent?: string
  /** Fired once when the hero falls, with the final wave + kill tally. */
  onEnd: (result: EndlessRunResult) => void
  onExit?: () => void
}): JSX.Element {
  const [hearts, setHearts] = useState(ENDLESS_MAX_HEARTS)
  const [wave, setWave] = useState(1)
  const [kills, setKills] = useState(0)
  const [phase, setPhase] = useState<'break' | 'wave'>('break')
  const [breakLeft, setBreakLeft] = useState(FIRST_BREAK_SECONDS)
  const [hurt, setHurt] = useState(0)
  const dead = hearts <= 0
  // Meshy set dressing rides the unified graphics profile (MEDIUM+).
  const meshyDressing = useMemo(
    () => meetsTier(resolveQualityProfile().tier, 'medium'),
    [],
  )
  // Touch: on-screen joystick + fire button where the pointer is a finger.
  const [touchUi] = useState(isCoarsePointer)
  const touchMoveRef = useRef<TouchMoveVector>({ ...TOUCH_MOVE_REST })
  const touchFireRef = useRef(false)
  const endedRef = useRef(false)
  // The run report reads through refs: bolts still in flight can land kills
  // after death, and those must neither retrigger nor cancel the end timer.
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd
  const waveRef = useRef(wave)
  waveRef.current = wave
  const killsRef = useRef(kills)
  killsRef.current = kills

  const onPlayerHit = useCallback((damage: number) => {
    setHurt((h) => h + 1)
    setHearts((h) => Math.max(0, h - damage))
    playPlayerHurt()
  }, [])
  const onKill = useCallback(() => setKills((c) => c + 1), [])
  const onHeal = useCallback(
    () => setHearts((h) => Math.min(ENDLESS_MAX_HEARTS, h + 1)),
    [],
  )
  const onWaveCleared = useCallback(() => {
    setWave((w) => w + 1)
    setPhase('break')
    setBreakLeft(ENDLESS_BREAK_SECONDS)
  }, [])

  // Breather countdown between waves.
  useEffect(() => {
    if (phase !== 'break' || dead) return
    if (breakLeft <= 0) {
      setPhase('wave')
      return
    }
    const id = window.setTimeout(() => setBreakLeft((b) => b - 1), 1000)
    return () => window.clearTimeout(id)
  }, [phase, breakLeft, dead])

  // Death → one beat for the fall to read, then report the run.
  useEffect(() => {
    if (!dead || endedRef.current) return
    endedRef.current = true
    const id = window.setTimeout(
      () => onEndRef.current({ wave: waveRef.current, kills: killsRef.current }),
      1200,
    )
    return () => window.clearTimeout(id)
  }, [dead])

  // Hurt flash auto-fade.
  const [flashOn, setFlashOn] = useState(false)
  useEffect(() => {
    if (hurt === 0) return
    setFlashOn(true)
    const id = window.setTimeout(() => setFlashOn(false), 200)
    return () => window.clearTimeout(id)
  }, [hurt])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        dpr={[1, 1.7]}
        gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        camera={{ position: [0, CAM_HEIGHT, 6 + CAM_BACK], fov: 55, near: 0.1, far: 150 }}
      >
        <color attach="background" args={['#37315a']} />
        <fog attach="fog" args={['#37315a', 32, 96]} />
        {/* Baked one-frame IBL: warm key / cool rim formers, same recipe as the
            boss arenas — real reflections without a live env pass. */}
        <Environment frames={1} resolution={128}>
          <Lightformer form="rect" intensity={0.6} color="#4a4468" scale={[40, 40, 1]} position={[0, 0, -16]} />
          <Lightformer form="rect" intensity={4.2} color="#ffe2b0" scale={[12, 9, 1]} position={[8, 12, -7]} target={[0, 1, 0]} />
          <Lightformer form="rect" intensity={2.6} color="#8fb4ff" scale={[12, 6, 1]} position={[-9, 6, 9]} target={[0, 1, 0]} />
          <Lightformer form="ring" intensity={1.4} color="#f4ecff" scale={7} position={[0, 15, 0]} target={[0, 0, 0]} />
        </Environment>
        <hemisphereLight args={['#d2d8f2', '#3f375c', 0.55]} />
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[9, 19, 7]}
          intensity={1.05}
          color="#ffe9c8"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-radius={4}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
          shadow-camera-near={2}
          shadow-camera-far={60}
          shadow-camera-left={-26}
          shadow-camera-right={26}
          shadow-camera-top={26}
          shadow-camera-bottom={-26}
        />
        <directionalLight position={[0, 28, -2]} intensity={0.5} color="#e6d9ff" />

        <SiegeScene
          accent={accent}
          wave={wave}
          running={phase === 'wave' && !dead}
          frozen={dead}
          touchMoveRef={touchMoveRef}
          touchFireRef={touchFireRef}
          onKill={onKill}
          onPlayerHit={onPlayerHit}
          onHeal={onHeal}
          onWaveCleared={onWaveCleared}
        />

        {/* Meshy edge dressing (visual only; sits between boundary + wall). */}
        {meshyDressing && (
          <Suspense fallback={null}>
            <MeshyArenaDressing arenaRadius={ARENA_R} />
          </Suspense>
        )}

        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.36} luminanceThreshold={0.92} luminanceSmoothing={0.16} />
          <Vignette eskil={false} offset={0.28} darkness={0.52} />
          <SMAA />
        </EffectComposer>
      </Canvas>

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

      {/* Wave + kills HUD */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 26, letterSpacing: 2, textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
          WAVE {wave}
        </div>
        <div style={{ color: accent, fontWeight: 800, fontSize: 14, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>
          {kills} kills
        </div>
      </div>

      {/* Break banner */}
      {phase === 'break' && !dead && (
        <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 30, textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
            Wave {wave} incoming — {Math.max(0, breakLeft)}
          </div>
          {wave > 1 && (
            <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 15, marginTop: 6, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              Grab the hearts!
            </div>
          )}
        </div>
      )}

      {/* Hearts */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, pointerEvents: 'none' }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 6, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>You</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {Array.from({ length: ENDLESS_MAX_HEARTS }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: i < hearts ? '#ff5a6a' : 'rgba(255,255,255,0.18)',
                boxShadow: i < hearts ? '0 0 8px rgba(255,90,106,0.7)' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Controls hint */}
      <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,0.7)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        {touchUi
          ? 'Drag the stick to move · hold FIRE to shoot'
          : 'WASD move · hold click / F to shoot'}
      </div>

      {/* Touch controls: analog joystick + hold-to-fire button */}
      {touchUi && !dead && (
        <SiegeTouchControls
          accent={accent}
          moveRef={touchMoveRef}
          fireRef={touchFireRef}
        />
      )}

      {onExit && (
        <button
          onClick={onExit}
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
          Abandon
        </button>
      )}
    </div>
  )
}
