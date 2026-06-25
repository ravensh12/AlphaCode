import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GROUND_HALF } from './layout'

/** Imperative handle the controller uses to loose an arrow. */
export type CombatApi = {
  /** Returns true only when a bolt actually fired (past the cooldown). */
  fire: (origin: THREE.Vector3, dir: THREE.Vector3) => boolean
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
export const GUNS: Gun[] = [
  { name: 'Rusty Slinger', cooldown: 0.85, damage: 1, pellets: 1, spread: 0.14, fan: 0, aimConeCos: Math.cos(0.07), boltSpeed: 44 },
  { name: 'Scrap Pistol', cooldown: 0.55, damage: 1, pellets: 1, spread: 0.085, fan: 0, aimConeCos: Math.cos(0.16), boltSpeed: 60 },
  { name: 'Bolt Repeater', cooldown: 0.36, damage: 2, pellets: 1, spread: 0.05, fan: 0, aimConeCos: Math.cos(0.24), boltSpeed: 76 },
  { name: 'Twin Blaster', cooldown: 0.30, damage: 2, pellets: 2, spread: 0.05, fan: 0.06, aimConeCos: Math.cos(0.30), boltSpeed: 88 },
  { name: 'Pulse Rifle', cooldown: 0.18, damage: 3, pellets: 2, spread: 0.03, fan: 0.05, aimConeCos: Math.cos(0.36), boltSpeed: 102 },
  { name: 'Pattern Cannon', cooldown: 0.11, damage: 3, pellets: 3, spread: 0.035, fan: 0.07, aimConeCos: Math.cos(0.42), boltSpeed: 118 },
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
}

type ArrowSlot = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
}

const MAX_ZOMBIES = 170
const MAX_ARROWS = 110
const ZOMBIE_SPEED = 2.6 // tougher from the start, but still fun to mow down
const ZOMBIE_HP = 2
const SPAWN_EVERY = 0.4
const ATTACK_DIST = 1.9
const DESPAWN_DIST = 150
const DIE_DURATION = 1.1
const STAGGER_TIME = 0.22 // brief freeze after an arrow connects
const SPAWN_RISE = 0.5 // seconds to rise out of the ground
const ARROW_LIFE = 1.6
const HIT_RADIUS = 1.7

/* ----------------------------------------------------------------- Zombie */

const DEATH_BURST = 0.5 // seconds the death poof plays

function ZombieMesh({ slot }: { slot: ZombieSlot }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const burst = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const jaw = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const skinMat = useRef<THREE.MeshStandardMaterial>(null)
  const headMat = useRef<THREE.MeshStandardMaterial>(null)

  useFrame((state) => {
    const r = root.current
    const g = body.current
    if (!r || !g) return
    if (!slot.active) {
      if (r.visible) r.visible = false
      return
    }
    r.visible = true

    if (slot.state === 'die') {
      const now = state.clock.elapsedTime
      const p = THREE.MathUtils.clamp((now - slot.dieAt) / DIE_DURATION, 0, 1)
      g.position.set(slot.pos.x, -p * 1.4, slot.pos.z)
      // crumple backwards with a final twist
      g.rotation.set(-p * 1.6, slot.facing + p * 0.6, p * 0.3)
      g.scale.setScalar(1 - p * 0.25)
      // Death poof: an expanding, fading ring + debris bursting from the body.
      const bu = burst.current
      if (bu) {
        const bp = THREE.MathUtils.clamp((now - slot.dieAt) / DEATH_BURST, 0, 1)
        if (bp < 1) {
          bu.visible = true
          bu.position.set(slot.pos.x, 0.25, slot.pos.z)
          const s = 0.4 + bp * 2.6
          bu.scale.set(s, s, s)
          const o = (1 - bp) * 0.95
          bu.traverse((child) => {
            const m = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
            if (m && 'opacity' in m) m.opacity = o
          })
        } else if (bu.visible) {
          bu.visible = false
        }
      }
      return
    }
    if (burst.current && burst.current.visible) burst.current.visible = false

    const now = state.clock.elapsedTime
    // Rise out of the ground when freshly spawned.
    const rise = THREE.MathUtils.clamp((now - slot.bornAt) / SPAWN_RISE, 0, 1)
    // Quick squash-pop when a bolt connects.
    const sinceHit = now - slot.hitAt
    const pop = sinceHit >= 0 && sinceHit < 0.2 ? Math.sin((sinceHit / 0.2) * Math.PI) : 0
    g.scale.set(1 + pop * 0.2, 1 - pop * 0.16, 1 + pop * 0.2)
    g.position.set(slot.pos.x, (rise - 1) * 1.6, slot.pos.z)
    g.rotation.set(0, slot.facing, 0)

    // Red impact flash on the skin when struck.
    const flash = sinceHit >= 0 && sinceHit < 0.18 ? 1 - sinceHit / 0.18 : 0
    if (skinMat.current) skinMat.current.emissiveIntensity = flash * 2.2
    if (headMat.current) headMat.current.emissiveIntensity = flash * 2.2

    // Shambling, limping walk: heavy, off-kilter, head lolling, arms reaching.
    const t = now * 5.4 + slot.seed
    const sway = Math.sin(t)
    // Uneven gait — one leg drags (limp).
    if (legL.current) legL.current.rotation.x = sway * 0.62
    if (legR.current) legR.current.rotation.x = -sway * 0.32 - 0.18
    if (armL.current) {
      armL.current.rotation.x = -1.3 + Math.sin(t + 1.1) * 0.18
      armL.current.rotation.z = 0.12 + Math.sin(t * 0.6) * 0.06
    }
    if (armR.current) {
      armR.current.rotation.x = -1.5 + Math.sin(t * 0.9) * 0.14
      armR.current.rotation.z = -0.2
    }
    if (torso.current) {
      torso.current.rotation.z = sway * 0.1
      torso.current.position.y = Math.abs(Math.sin(t)) * 0.05
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.7) * 0.22
      head.current.rotation.x = 0.18 + Math.sin(t * 1.3) * 0.08
    }
    if (jaw.current) jaw.current.rotation.x = 0.12 + Math.abs(Math.sin(t * 1.6)) * 0.34
  })

  return (
    <group ref={root} visible={false}>
      {/* Death poof — expanding shockwave ring + flung debris. */}
      <group ref={burst} visible={false}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.45, 0.85, 22]} />
          <meshBasicMaterial
            color="#b6ff5c"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
            fog={false}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.4, 10, 10]} />
          <meshBasicMaterial color="#e9ffb0" transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        {[
          [0.5, 0.35, 0.1],
          [-0.45, 0.45, 0.2],
          [0.2, 0.55, -0.45],
          [-0.3, 0.3, -0.4],
          [0.4, 0.25, 0.45],
        ].map((d, i) => (
          <mesh key={i} position={[d[0], d[1], d[2]]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshBasicMaterial color="#6f8f49" transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        ))}
      </group>

      <group ref={body}>
      <group ref={torso}>
        {/* hunched torso */}
        <mesh position={[0, 1.04, 0.05]} rotation={[0.34, 0, 0]} castShadow>
          <boxGeometry args={[0.52, 0.66, 0.34]} />
          <meshStandardMaterial ref={skinMat} color="#5f7a3a" emissive="#ff2a2a" emissiveIntensity={0} roughness={0.95} />
        </mesh>
        {/* torn, rotting shirt */}
        <mesh position={[0, 1.02, 0.23]} rotation={[0.34, 0, 0]}>
          <boxGeometry args={[0.4, 0.34, 0.05]} />
          <meshStandardMaterial color="#39341f" roughness={1} />
        </mesh>
        {/* exposed ribs hint */}
        <mesh position={[0.12, 1.06, 0.25]} rotation={[0.34, 0, 0]}>
          <boxGeometry args={[0.12, 0.22, 0.03]} />
          <meshStandardMaterial color="#cfc6a4" roughness={1} />
        </mesh>
        {/* slumped shoulders */}
        <mesh position={[0, 1.36, 0.02]} castShadow>
          <boxGeometry args={[0.56, 0.16, 0.3]} />
          <meshStandardMaterial color="#54702f" roughness={0.95} />
        </mesh>

        {/* head (lolls), tilted on the neck */}
        <group ref={head} position={[0.04, 1.56, 0.14]}>
          <mesh castShadow>
            <boxGeometry args={[0.32, 0.36, 0.33]} />
            <meshStandardMaterial ref={headMat} color="#82a554" emissive="#ff2a2a" emissiveIntensity={0} roughness={0.9} />
          </mesh>
          {/* sunken brow */}
          <mesh position={[0, 0.12, 0.15]}>
            <boxGeometry args={[0.3, 0.07, 0.06]} />
            <meshStandardMaterial color="#566f33" roughness={1} />
          </mesh>
          {/* glowing sunken eyes */}
          <mesh position={[-0.08, 0.0, 0.16]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#fff1a8" emissive="#ffcf3a" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0.08, 0.0, 0.16]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#fff1a8" emissive="#ffcf3a" emissiveIntensity={1.6} />
          </mesh>
          {/* hanging jaw */}
          <group ref={jaw} position={[0, -0.16, 0.08]}>
            <mesh position={[0, -0.04, 0.04]}>
              <boxGeometry args={[0.26, 0.1, 0.2]} />
              <meshStandardMaterial color="#6f8f49" roughness={0.95} />
            </mesh>
          </group>
        </group>

        {/* arms reaching forward (pivot at shoulder), uneven */}
        <group ref={armL} position={[-0.34, 1.34, 0.05]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.32, 3, 8]} />
            <meshStandardMaterial color="#6f8f49" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.46, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.26, 3, 8]} />
            <meshStandardMaterial color="#7fa052" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.62, 0.02]}>
            <boxGeometry args={[0.1, 0.1, 0.14]} />
            <meshStandardMaterial color="#84a857" roughness={1} />
          </mesh>
        </group>
        <group ref={armR} position={[0.34, 1.34, 0.05]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.32, 3, 8]} />
            <meshStandardMaterial color="#6f8f49" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.46, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.26, 3, 8]} />
            <meshStandardMaterial color="#7fa052" roughness={0.95} />
          </mesh>
          <mesh position={[0, -0.62, 0.02]}>
            <boxGeometry args={[0.1, 0.1, 0.14]} />
            <meshStandardMaterial color="#84a857" roughness={1} />
          </mesh>
        </group>
      </group>

      {/* legs (pivot at hip), tattered trousers */}
      <group ref={legL} position={[-0.15, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.5, 3, 8]} />
          <meshStandardMaterial color="#3d4f25" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.74, 0.05]} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.26]} />
          <meshStandardMaterial color="#2b3320" roughness={1} />
        </mesh>
      </group>
      <group ref={legR} position={[0.15, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow>
          <capsuleGeometry args={[0.11, 0.5, 3, 8]} />
          <meshStandardMaterial color="#46592c" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.74, 0.05]} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.26]} />
          <meshStandardMaterial color="#2b3320" roughness={1} />
        </mesh>
      </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------- Bolt */

function BoltMesh({ slot }: { slot: ArrowSlot }) {
  const root = useRef<THREE.Group>(null)
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const g = root.current
    if (!g) return
    if (!slot.active) {
      if (g.visible) g.visible = false
      return
    }
    g.visible = true
    g.position.copy(slot.pos)
    dir.copy(slot.vel).normalize()
    q.setFromUnitVectors(up, dir)
    g.quaternion.copy(q)
  })

  return (
    <group ref={root} visible={false}>
      {/* hot core aligned along travel axis (+Z) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.55, 8]} />
        <meshBasicMaterial color="#d6fbff" toneMapped={false} fog={false} />
      </mesh>
      {/* bright leading bolt */}
      <mesh position={[0, 0, 0.3]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#eafdff" toneMapped={false} fog={false} />
      </mesh>
      {/* trailing tracer streak (tapers back) */}
      <mesh position={[0, 0, -0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.9, 8]} />
        <meshBasicMaterial color="#46d6ff" transparent opacity={0.4} toneMapped={false} fog={false} />
      </mesh>
    </group>
  )
}

/* --------------------------------------------------------------- Manager */

export function CombatSystem({
  playerPosRef,
  apiRef,
  paused,
  difficulty = 0,
  gunLevel = 0,
  onKill,
  onPlayerHit,
}: {
  playerPosRef: MutableRefObject<THREE.Vector3>
  apiRef: MutableRefObject<CombatApi | null>
  paused: boolean
  /** Ramps as the player clears checkpoints — faster, tougher, more frequent. */
  difficulty?: number
  /** Current gun tier (0 = worst). Improves each checkpoint. */
  gunLevel?: number
  onKill: () => void
  onPlayerHit: () => void
}) {
  const diffRef = useRef(0)
  diffRef.current = difficulty
  const gunRef = useRef(GUNS[0])
  gunRef.current = gunForLevel(gunLevel)
  const lastFire = useRef(-9999)
  const zombies = useMemo<ZombieSlot[]>(
    () =>
      Array.from({ length: MAX_ZOMBIES }, () => ({
        active: false,
        state: 'walk' as const,
        pos: new THREE.Vector3(),
        facing: 0,
        hp: ZOMBIE_HP,
        dieAt: 0,
        hitAt: -10,
        bornAt: 0,
        seed: Math.random() * 10,
      })),
    [],
  )
  const arrows = useMemo<ArrowSlot[]>(
    () =>
      Array.from({ length: MAX_ARROWS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 1,
      })),
    [],
  )

  const spawnTimer = useRef(0)
  const tmp = useRef(new THREE.Vector3())

  // Expose the fire() handle.
  apiRef.current = {
    fire(origin, dir) {
      const gun = gunRef.current
      // Rate of fire — weak guns shoot slowly, top guns rip.
      const now = performance.now()
      if (now - lastFire.current < gun.cooldown * 1000) return false
      lastFire.current = now

      // Travel along the laser sight the player sees.
      const v = dir.clone().normalize()

      // Kid-friendly auto-aim: bend toward the nearest zombie inside the gun's
      // cone. Early guns have almost no assist, so they feel clumsy.
      let best: ZombieSlot | null = null
      let bestDot = gun.aimConeCos
      for (const z of zombies) {
        if (!z.active || z.state !== 'walk') continue
        tmp.current.set(z.pos.x - origin.x, 0, z.pos.z - origin.z)
        const dist = tmp.current.length()
        if (dist < 1 || dist > 90) continue
        tmp.current.normalize()
        const dot = tmp.current.x * v.x + tmp.current.z * v.z
        if (dot > bestDot) {
          bestDot = dot
          best = z
        }
      }
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
        slot.pos.copy(origin)
        slot.vel
          .set(Math.sin(ang) * horiz, v.y, Math.cos(ang) * horiz)
          .normalize()
          .multiplyScalar(gun.boltSpeed)
      }
      return true
    },
  }

  useFrame((state, dtRaw) => {
    if (paused) return
    const dt = Math.min(dtRaw, 0.05)
    const player = playerPosRef.current
    const now = state.clock.elapsedTime

    // Difficulty tier (1 = first checkpoint). Already punchy at tier 1 to hook the
    // player, then a gentle climb so later levels aren't a brick wall.
    const tier = Math.max(1, diffRef.current)
    const speed = Math.min(5.6, ZOMBIE_SPEED + (tier - 1) * 0.18)
    const spawnEvery = Math.max(0.28, SPAWN_EVERY - (tier - 1) * 0.025)
    const spawnHp = ZOMBIE_HP + Math.min(6, Math.floor((tier - 1) / 3))

    // --- Spawning ---------------------------------------------------------
    spawnTimer.current += dt
    if (spawnTimer.current >= spawnEvery) {
      spawnTimer.current = 0
      // Hordes — spawn big packs even early so there's always plenty to blast.
      const burst = tier >= 8 ? 12 : tier >= 3 ? 10 : 7
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
        slot.active = true
        slot.state = 'walk'
        slot.hp = spawnHp
        slot.pos.set(x, 0, z)
        slot.hitAt = -10
        slot.bornAt = now
        slot.seed = Math.random() * 10
      }
    }

    // --- Zombies ----------------------------------------------------------
    for (const z of zombies) {
      if (!z.active) continue
      if (z.state === 'die') {
        if (now - z.dieAt > DIE_DURATION) z.active = false
        continue
      }
      const dx = player.x - z.pos.x
      const dz = player.z - z.pos.z
      const dist = Math.hypot(dx, dz)
      z.facing = Math.atan2(dx, dz)
      if (dist > DESPAWN_DIST) {
        z.active = false
        continue
      }
      if (dist <= ATTACK_DIST) {
        // Lunge resolved instantly: poke the player, then crumple.
        onPlayerHit()
        z.state = 'die'
        z.dieAt = now
        continue
      }
      // Freeze briefly after being struck so hits feel like they land.
      if (now - z.hitAt < STAGGER_TIME) continue
      const step = (speed * dt) / (dist || 1)
      z.pos.x += dx * step
      z.pos.z += dz * step
    }

    // --- Arrows + collisions ---------------------------------------------
    for (const a of arrows) {
      if (!a.active) continue
      a.life -= dt
      a.pos.addScaledVector(a.vel, dt)
      if (a.life <= 0 || Math.hypot(a.pos.x, a.pos.z) > GROUND_HALF || a.pos.y < 0) {
        a.active = false
        continue
      }
      for (const z of zombies) {
        if (!z.active || z.state !== 'walk') continue
        const hx = z.pos.x - a.pos.x
        const hy = z.pos.y + 1.1 - a.pos.y
        const hz = z.pos.z - a.pos.z
        if (hx * hx + hy * hy + hz * hz < HIT_RADIUS * HIT_RADIUS) {
          a.active = false
          z.hp -= a.damage
          z.hitAt = now
          if (z.hp > 0) {
            // Knockback along the arrow's travel direction.
            const len = Math.hypot(a.vel.x, a.vel.z) || 1
            z.pos.x += (a.vel.x / len) * 0.6
            z.pos.z += (a.vel.z / len) * 0.6
          } else {
            z.state = 'die'
            z.dieAt = now
            onKill()
          }
          break
        }
      }
    }
  })

  return (
    <group>
      {zombies.map((z, i) => (
        <ZombieMesh key={`z${i}`} slot={z} />
      ))}
      {arrows.map((a, i) => (
        <BoltMesh key={`a${i}`} slot={a} />
      ))}
    </group>
  )
}
