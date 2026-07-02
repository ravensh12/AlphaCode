import { memo, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, SMAA, Noise } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { SimulationDriver } from './SimulationDriver'
import { applyHologramResolve } from './simulation'
import { playShot } from '../../lib/soundFx'

/**
 * A self-contained, AUTO-PLAYING 3D opening cinematic — "Code City has fallen".
 *
 * This is NOT the interactive game. It runs a fully scripted timeline driven by a
 * clock captured on the first frame, so it replays identically every mount. The
 * hero (reused `Avatar`) mows down a shambling horde of lightweight cinematic
 * zombies down a ruined neon street while a scripted camera pushes, chases,
 * orbits and finally settles on a heroic low angle.
 *
 * R3F discipline: everything animates in `useFrame`, scaled by delta; per-frame
 * data lives in refs; projectiles + zombies are pooled; scratch vectors are
 * hoisted (no per-frame allocations).
 */

/** Heroic cyan-lime so the hero pops against the rotting-green horde. */
const HERO_ACCENT = '#5ef0c4'

const MAX_ZOMBIES = 22
const MAX_BOLTS = 18
const DIE_DURATION = 1.1
const DEATH_BURST = 0.5
const BOLT_SPEED = 62
const BOLT_LIFE = 1.5
const HIT_R = 1.7
const HERO_Z = 2

/** Total scripted runtime in seconds (the page auto-advances a beat after this). */
export const CINEMATIC_DURATION = 18

type ZombieSlot = {
  active: boolean
  state: 'walk' | 'die'
  pos: THREE.Vector3
  facing: number
  dieAt: number
  bornAt: number
  speed: number
  seed: number
}

type BoltSlot = {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  target: number
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/* --------------------------------------------------------- Cinematic zombie */

const ZOMBIE_DEBRIS = [
  [0.5, 0.35, 0.1],
  [-0.45, 0.45, 0.2],
  [0.2, 0.55, -0.45],
  [-0.3, 0.3, -0.4],
  [0.4, 0.25, 0.45],
]

const CinematicZombie = memo(function CinematicZombie({
  slot,
  startRef,
}: {
  slot: ZombieSlot
  startRef: React.MutableRefObject<number>
}) {
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

  useFrame((state) => {
    const r = root.current
    const g = body.current
    if (!r || !g) return
    if (!slot.active) {
      if (r.visible) r.visible = false
      return
    }
    r.visible = true
    const t = state.clock.elapsedTime - startRef.current

    if (slot.state === 'die') {
      const p = THREE.MathUtils.clamp((t - slot.dieAt) / DIE_DURATION, 0, 1)
      g.position.set(slot.pos.x, -p * 1.4, slot.pos.z)
      g.rotation.set(-p * 1.6, slot.facing + p * 0.6, p * 0.3)
      g.scale.setScalar(1 - p * 0.25)
      const bu = burst.current
      if (bu) {
        const bp = THREE.MathUtils.clamp((t - slot.dieAt) / DEATH_BURST, 0, 1)
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

    const rise = THREE.MathUtils.clamp((t - slot.bornAt) / 0.5, 0, 1)
    g.scale.setScalar(1)
    g.position.set(slot.pos.x, (rise - 1) * 1.6, slot.pos.z)
    g.rotation.set(0, slot.facing, 0)

    // Shambling, off-kilter limp.
    const tt = state.clock.elapsedTime * 5.4 + slot.seed
    const sway = Math.sin(tt)
    if (legL.current) legL.current.rotation.x = sway * 0.62
    if (legR.current) legR.current.rotation.x = -sway * 0.32 - 0.18
    if (armL.current) {
      armL.current.rotation.x = -1.3 + Math.sin(tt + 1.1) * 0.18
      armL.current.rotation.z = 0.12 + Math.sin(tt * 0.6) * 0.06
    }
    if (armR.current) {
      armR.current.rotation.x = -1.5 + Math.sin(tt * 0.9) * 0.14
      armR.current.rotation.z = -0.2
    }
    if (torso.current) {
      torso.current.rotation.z = sway * 0.1
      torso.current.position.y = Math.abs(Math.sin(tt)) * 0.05
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(tt * 0.7) * 0.22
      head.current.rotation.x = 0.18 + Math.sin(tt * 1.3) * 0.08
    }
    if (jaw.current) jaw.current.rotation.x = 0.12 + Math.abs(Math.sin(tt * 1.6)) * 0.34
  })

  return (
    <group ref={root} visible={false}>
      {/* Death poof — expanding lime shockwave ring + flung debris. */}
      <group ref={burst} visible={false}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.45, 0.85, 22]} />
          <meshBasicMaterial color="#b6ff5c" transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} fog={false} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.4, 10, 10]} />
          <meshBasicMaterial color="#e9ffb0" transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        {ZOMBIE_DEBRIS.map((d, i) => (
          <mesh key={i} position={[d[0], d[1], d[2]]}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshBasicMaterial color="#6f8f49" transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        ))}
      </group>

      <group ref={body}>
        <group ref={torso}>
          <mesh position={[0, 1.04, 0.05]} rotation={[0.34, 0, 0]} castShadow>
            <boxGeometry args={[0.52, 0.66, 0.34]} />
            <meshStandardMaterial color="#5f7a3a" roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.02, 0.23]} rotation={[0.34, 0, 0]}>
            <boxGeometry args={[0.4, 0.34, 0.05]} />
            <meshStandardMaterial color="#39341f" roughness={1} />
          </mesh>
          <mesh position={[0, 1.36, 0.02]} castShadow>
            <boxGeometry args={[0.56, 0.16, 0.3]} />
            <meshStandardMaterial color="#54702f" roughness={0.95} />
          </mesh>

          <group ref={head} position={[0.04, 1.56, 0.14]}>
            <mesh castShadow>
              <boxGeometry args={[0.32, 0.36, 0.33]} />
              <meshStandardMaterial color="#82a554" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.12, 0.15]}>
              <boxGeometry args={[0.3, 0.07, 0.06]} />
              <meshStandardMaterial color="#566f33" roughness={1} />
            </mesh>
            <mesh position={[-0.08, 0.0, 0.16]}>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshStandardMaterial color="#fff1a8" emissive="#ffcf3a" emissiveIntensity={1.6} />
            </mesh>
            <mesh position={[0.08, 0.0, 0.16]}>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshStandardMaterial color="#fff1a8" emissive="#ffcf3a" emissiveIntensity={1.6} />
            </mesh>
            <group ref={jaw} position={[0, -0.16, 0.08]}>
              <mesh position={[0, -0.04, 0.04]}>
                <boxGeometry args={[0.26, 0.1, 0.2]} />
                <meshStandardMaterial color="#6f8f49" roughness={0.95} />
              </mesh>
            </group>
          </group>

          <group ref={armL} position={[-0.34, 1.34, 0.05]}>
            <mesh position={[0, -0.22, 0]} castShadow>
              <capsuleGeometry args={[0.08, 0.32, 3, 8]} />
              <meshStandardMaterial color="#6f8f49" roughness={0.95} />
            </mesh>
            <mesh position={[0, -0.46, 0]} castShadow>
              <capsuleGeometry args={[0.07, 0.26, 3, 8]} />
              <meshStandardMaterial color="#7fa052" roughness={0.95} />
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
          </group>
        </group>

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
})

/* ----------------------------------------------------------------- Bolt */

const BoltMesh = memo(function BoltMesh({ slot }: { slot: BoltSlot }) {
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
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.55, 8]} />
        <meshBasicMaterial color="#d6fbff" toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 0, 0.3]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshBasicMaterial color="#eafdff" toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 0, -0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.9, 8]} />
        <meshBasicMaterial color="#46d6ff" transparent opacity={0.4} toneMapped={false} fog={false} />
      </mesh>
    </group>
  )
})

/* --------------------------------------------------------------- Environment */

function CodeCity() {
  // ONE shared hologram-resolve material for the whole skyline (M8): distant
  // towers render as compiling holograms, exactly like the overworld — the
  // city is literally still being written when the story opens.
  const towerMat = useMemo(
    () =>
      applyHologramResolve(
        new THREE.MeshStandardMaterial({ color: '#171a26', roughness: 0.85, metalness: 0.1 }),
      ),
    [],
  )

  // Stylized low-poly skyscraper silhouettes flanking a central street that runs
  // along -Z. Deterministic layout so the ruined skyline reads the same each run.
  const towers = useMemo(() => {
    const out: { x: number; z: number; w: number; d: number; h: number; lit: boolean }[] = []
    let seed = 1337
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 9; i++) {
        const z = 4 - i * 7 - rnd() * 2
        const x = side * (10 + rnd() * 8)
        const w = 4 + rnd() * 4
        const d = 4 + rnd() * 4
        const h = 10 + rnd() * 34
        out.push({ x, z, w, d, h, lit: rnd() < 0.5 })
      }
    }
    return out
  }, [])

  return (
    <group>
      {/* Asphalt street + ground */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -22]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#0c0f17" roughness={1} metalness={0} />
      </mesh>
      {/* Central street strip */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -18]} receiveShadow>
        <planeGeometry args={[14, 130]} />
        <meshStandardMaterial color="#15171f" roughness={1} />
      </mesh>
      {/* Lane dashes glowing faintly */}
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.02, 4 - i * 6]}>
          <planeGeometry args={[0.4, 2.4]} />
          <meshBasicMaterial color="#3a4a3a" toneMapped={false} fog={false} />
        </mesh>
      ))}

      {towers.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.h / 2, 0]} castShadow material={towerMat}>
            <boxGeometry args={[t.w, t.h, t.d]} />
          </mesh>
          {/* a few lit windows on the street-facing side */}
          {t.lit &&
            Array.from({ length: 4 }).map((_, w) => (
              <mesh key={w} position={[(w % 2 ? 1 : -1) * t.w * 0.28, t.h * (0.3 + 0.15 * Math.floor(w / 2)), t.d / 2 + 0.02]}>
                <planeGeometry args={[0.8, 1.2]} />
                <meshBasicMaterial color="#caa14a" toneMapped={false} fog={false} transparent opacity={0.55} />
              </mesh>
            ))}
        </group>
      ))}

      {/* Distant skyline backdrop wall (dark silhouette) */}
      <mesh position={[0, 18, -58]}>
        <planeGeometry args={[170, 70]} />
        <meshBasicMaterial color="#0a0c14" fog={false} />
      </mesh>
    </group>
  )
}

/* ----------------------------------------------------------------- Scene */

const CinematicScene = memo(function CinematicScene() {
  const { camera } = useThree()

  const start = useRef(-1)
  const heroPos = useRef(new THREE.Vector3(0, 0, HERO_Z))
  const heroGroup = useRef<THREE.Group>(null)
  const fireRef = useRef(0)
  const fireTimer = useRef(0)
  const spawnTimer = useRef(0)
  const [anim, setAnim] = useState<AvatarAnim>('idle')
  const animRef = useRef<AvatarAnim>('idle')

  const muzzleLight = useRef<THREE.PointLight>(null)
  const rimLight = useRef<THREE.DirectionalLight>(null)
  const lampA = useRef<THREE.PointLight>(null)
  const lampB = useRef<THREE.PointLight>(null)

  // Smoothed camera state (kept in refs, no re-renders).
  const camPos = useRef(new THREE.Vector3(2.4, 6.8, 28))
  const camLook = useRef(new THREE.Vector3(0, 1.5, -10))

  // Scratch — hoisted, reused every frame.
  const dPos = useRef(new THREE.Vector3())
  const dLook = useRef(new THREE.Vector3())
  const muzzle = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())

  const zombies = useMemo<ZombieSlot[]>(
    () =>
      Array.from({ length: MAX_ZOMBIES }, () => ({
        active: false,
        state: 'walk' as const,
        pos: new THREE.Vector3(),
        facing: 0,
        dieAt: 0,
        bornAt: 0,
        speed: 2,
        seed: 0,
      })),
    [],
  )
  const bolts = useMemo<BoltSlot[]>(
    () =>
      Array.from({ length: MAX_BOLTS }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        target: -1,
      })),
    [],
  )

  // Deterministic spawner state.
  const spawnRnd = useRef(98765)
  const rand = () => {
    spawnRnd.current = (spawnRnd.current * 1664525 + 1013904223) >>> 0
    return spawnRnd.current / 4294967296
  }
  const initialized = useRef(false)

  function spawnZombie(now: number, far: boolean) {
    const z = zombies.find((s) => !s.active)
    if (!z) return
    z.active = true
    z.state = 'walk'
    z.pos.set((rand() * 2 - 1) * 6, 0, (far ? -36 - rand() * 12 : -14 - rand() * 22))
    z.facing = 0
    z.bornAt = now
    z.dieAt = 0
    z.speed = 1.8 + rand() * 1.0
    z.seed = rand() * 10
  }

  function nearestWalking(): number {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i]
      if (!z.active || z.state !== 'walk') continue
      const d = z.pos.z // closest to hero = largest z (least negative); want max z
      if (-d < bestD && z.pos.z < heroPos.current.z - 2) {
        bestD = -d
        best = i
      }
    }
    return best
  }

  function fireAt(target: number, rawT: number) {
    const b = bolts.find((x) => !x.active)
    if (!b) return
    const z = zombies[target]
    muzzle.current.set(heroPos.current.x - 0.2, 1.2, heroPos.current.z - 0.8)
    b.active = true
    b.life = BOLT_LIFE
    b.target = target
    b.pos.copy(muzzle.current)
    tmpDir.current.set(z.pos.x - muzzle.current.x, 1.1 - muzzle.current.y, z.pos.z - muzzle.current.z).normalize()
    b.vel.copy(tmpDir.current).multiplyScalar(BOLT_SPEED)
    fireRef.current = rawT
    playShot()
  }

  function setAnimSafe(a: AvatarAnim) {
    if (animRef.current !== a) {
      animRef.current = a
      setAnim(a)
    }
  }

  useFrame((state, dtRaw) => {
    if (start.current < 0) start.current = state.clock.elapsedTime
    const rawT = state.clock.elapsedTime
    const t = rawT - start.current
    const dt = Math.min(dtRaw, 0.05)

    // First-frame prespawn of a shambling crowd down the far street.
    if (!initialized.current) {
      initialized.current = true
      for (let i = 0; i < 14; i++) spawnZombie(t, false)
      // Spread them across the street depth.
      let k = 0
      for (const z of zombies) {
        if (!z.active) continue
        z.pos.set((rand() * 2 - 1) * 6, 0, -12 - k * 2.4 - rand() * 4)
        z.bornAt = -1 // already risen
        k++
      }
    }

    // Brief slow-mo on a big multi-kill mid-action.
    const slow = t > 9.5 && t < 10.3 ? 0.4 : 1
    const adt = dt * slow

    /* ---------------------------------------------------- Hero scripting */
    const strafeAmp = smoothstep(7, 7.8, t) * (1 - smoothstep(11.2, 12, t)) * 2.3
    heroPos.current.x = Math.sin((t - 7) * 1.7) * strafeAmp
    heroPos.current.z = HERO_Z

    if (t < 3.4) setAnimSafe('idle')
    else if (t < 7) setAnimSafe('idle')
    else if (t < 12) setAnimSafe('run')
    else if (t < 13.3) setAnimSafe('idle')
    else setAnimSafe('wave')

    const hg = heroGroup.current
    if (hg) {
      hg.position.copy(heroPos.current)
      hg.rotation.y = Math.PI // face down the street (-Z), gun forward
    }

    /* ---------------------------------------------------- Spawning */
    spawnTimer.current += dt
    if (t < 11 && spawnTimer.current > 0.55) {
      spawnTimer.current = 0
      spawnZombie(t, true)
      if (t > 7 && t < 11) spawnZombie(t, true)
    }

    /* ---------------------------------------------------- Hero firing */
    // Fire cadence ramps with the action beats; silent otherwise.
    let cadence = Infinity
    if (t >= 4 && t < 6.8) cadence = 0.62
    else if (t >= 7 && t < 12) cadence = 0.3
    else if (t >= 12.1 && t < 13.4) cadence = 0.5
    fireTimer.current -= dt
    if (cadence !== Infinity && fireTimer.current <= 0) {
      const target = nearestWalking()
      if (target >= 0) {
        fireTimer.current = cadence
        fireAt(target, rawT)
      } else {
        fireTimer.current = 0.15
      }
    }

    /* ---------------------------------------------------- Zombies */
    for (const z of zombies) {
      if (!z.active) continue
      if (z.state === 'die') {
        if (t - z.dieAt > DIE_DURATION) z.active = false
        continue
      }
      const dx = heroPos.current.x - z.pos.x
      const dz = heroPos.current.z - z.pos.z
      const dist = Math.hypot(dx, dz) || 1
      z.facing = Math.atan2(dx, dz)
      // Shamble toward the hero but stop short so they crowd the street.
      if (dist > 4.5) {
        const step = (z.speed * adt) / dist
        z.pos.x += dx * step
        z.pos.z += dz * step
      }
    }

    /* ---------------------------------------------------- Bolts + impacts */
    for (const b of bolts) {
      if (!b.active) continue
      b.life -= adt
      b.pos.addScaledVector(b.vel, adt)
      const z = b.target >= 0 ? zombies[b.target] : null
      if (z && z.active && z.state === 'walk') {
        const hx = z.pos.x - b.pos.x
        const hy = z.pos.y + 1.1 - b.pos.y
        const hz = z.pos.z - b.pos.z
        if (hx * hx + hy * hy + hz * hz < HIT_R * HIT_R) {
          z.state = 'die'
          z.dieAt = t
          b.active = false
          continue
        }
      }
      if (b.life <= 0 || b.pos.z < -60) b.active = false
    }

    /* ---------------------------------------------------- Muzzle flash light */
    if (muzzleLight.current) {
      const kick = THREE.MathUtils.clamp(1 - (rawT - fireRef.current) / 0.12, 0, 1)
      muzzleLight.current.intensity = kick * 14
      muzzleLight.current.position.set(heroPos.current.x - 0.2, 1.25, heroPos.current.z - 1.2)
    }

    /* ---------------------------------------------------- Lights mood */
    // Flickering street lamps.
    if (lampA.current) lampA.current.intensity = 5 + Math.sin(rawT * 31) * 1.6 * (Math.sin(rawT * 7) > -0.6 ? 1 : 0.2)
    if (lampB.current) lampB.current.intensity = 4 + Math.sin(rawT * 23 + 2) * 1.4
    // Heroic accent rim light swells in the final beat.
    if (rimLight.current) {
      const swell = 1 + smoothstep(12.5, 15.5, t) * 2.2
      rimLight.current.intensity = 0.9 * swell
    }

    /* ---------------------------------------------------- Camera scripting */
    const hx = heroPos.current.x
    const hz = heroPos.current.z
    if (t < 3.2) {
      // Slow push-in over the ruined street toward the horde.
      const k = smoothstep(0, 3.2, t)
      dPos.current.set(2.4 - k * 1.2, 6.8 - k * 2.4, 28 - k * 11)
      dLook.current.set(0, 1.5, -10 - k * 5)
    } else if (t < 7) {
      // Drop behind the hero: low 3/4 chase.
      dPos.current.set(hx + 2.9, 3.0, hz + 7.2)
      dLook.current.set(hx, 1.45, hz - 7)
    } else if (t < 12) {
      // Action: punchy orbit + dolly around the hero.
      const a = Math.PI * 0.18 + (t - 7) * 0.5
      const R = 7.6
      dPos.current.set(hx + Math.sin(a) * R, 3.2 + Math.sin((t - 7) * 0.8) * 0.6, hz + Math.cos(a) * R)
      dLook.current.set(hx, 1.4, hz - 3)
    } else if (t < 16) {
      // Heroic low angle pushing in, looking up at the hero.
      const k = smoothstep(12, 15, t)
      dPos.current.set(hx + 1.7 - k * 0.5, 1.45, hz + 6.4 - k * 1.6)
      dLook.current.set(hx, 2.0, hz - 1.5)
    } else {
      // Settle for the title card.
      dPos.current.set(hx + 1.0, 1.7, hz + 6.0)
      dLook.current.set(hx, 2.0, hz - 1)
    }

    // Framerate-independent smoothing toward the desired pose.
    const posRate = t < 3.2 ? 1.4 : t < 7 ? 3.2 : t < 12 ? 4.0 : 2.4
    const kp = 1 - Math.exp(-dt * posRate)
    const kl = 1 - Math.exp(-dt * (posRate + 1))
    camPos.current.lerp(dPos.current, kp)
    camLook.current.lerp(dLook.current, kl)
    camera.position.copy(camPos.current)
    camera.lookAt(camLook.current)
  })

  return (
    <group>
      <CodeCity />

      <group ref={heroGroup}>
        <Avatar anim={anim} accent={HERO_ACCENT} fireRef={fireRef} />
      </group>

      {zombies.map((z, i) => (
        <CinematicZombie key={`z${i}`} slot={z} startRef={start} />
      ))}
      {bolts.map((b, i) => (
        <BoltMesh key={`b${i}`} slot={b} />
      ))}

      {/* Muzzle flash punch light (driven imperatively). */}
      <pointLight ref={muzzleLight} color="#bdfcff" intensity={0} distance={16} decay={2} />
      {/* Flickering street lamps either side. */}
      <pointLight ref={lampA} color="#ffba6a" position={[6, 5.5, -6]} intensity={5} distance={26} decay={2} />
      <pointLight ref={lampB} color="#ff8a5a" position={[-6, 5, -16]} intensity={4} distance={26} decay={2} />
    </group>
  )
})

/* --------------------------------------------------------------- Component */

export function IntroCinematic() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      // SMAA (below) handles edge AA inside the composer, so the default
      // framebuffer doesn't need its own (wasted) multisampling.
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [2.4, 6.8, 28], fov: 52, near: 0.1, far: 160 }}
    >
      <color attach="background" args={['#070912']} />
      <fog attach="fog" args={['#0a0d18', 16, 70]} />

      {/* Ticks the shared simulation clock for the hologram skyline. */}
      <SimulationDriver />

      {/* M8 — baked IBL: a cold moon sheet + neon street bounce so the hero's
          armor and the wet-looking street pick up real reflections. */}
      <Environment frames={1} resolution={128}>
        <Lightformer form="rect" intensity={0.4} color="#131a30" scale={[40, 40, 1]} position={[0, 0, -18]} />
        <Lightformer form="rect" intensity={2.6} color="#a8c4ff" scale={[10, 12, 1]} position={[-8, 14, 6]} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.8} color={HERO_ACCENT} scale={[8, 4, 1]} position={[4, 4, -20]} target={[0, 1, 0]} />
      </Environment>
      {/* Dark night base. */}
      <hemisphereLight args={['#2a3350', '#05060a', 0.32]} />
      <ambientLight intensity={0.12} />
      {/* Cool moonlight key with shadows. */}
      <directionalLight
        position={[-10, 22, 6]}
        intensity={0.7}
        color="#8fb4ff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={2}
        shadow-camera-far={70}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      {/* Heroic accent rim light from down the street (swells at the climax). */}
      <directionalLight position={[4, 6, -24]} intensity={0.9} color={HERO_ACCENT} />

      <CinematicScene />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.7} luminanceSmoothing={0.2} />
        <Vignette eskil={false} offset={0.22} darkness={0.72} />
        <Noise opacity={0.05} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  )
}
