import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Avatar } from './Avatar'
import { Boss3D } from './Boss3D'
import { useKeys } from './useKeys'
import { playShot } from '../../lib/soundFx'
import type { BonusQuestion } from '../../content/bonusQuestions'
import './BossArena.css'

const PLAYER_HP = 8
// Boss is a real fight but beatable: rapid-fire melts it if you keep dodging.
const BOSS_HP_BASE = 26
const BOSS_HP_PER_LEVEL = 4

const ARENA_R = 23
const BOUND = 20
const CAM_DIST = 5.4
const CAM_HEIGHT = 2.7
const AIM_AHEAD = 12
const AIM_HEIGHT = 1.7
const RUN_SPEED = 9
const TURN_RATE = 2.6
const HEADING_LERP = 0.2

const BOLT_SPEED = 72
const BOLT_LIFE = 1.6
const BOLT_COOLDOWN = 0.14 // rapid-fire blaster — hold to melt the boss
const BOLT_POOL = 28
const BOSS_HIT_R = 2.4
/** Villain stands a touch taller than the hero — menacing but human-scale. */
const BOSS_SCALE = 1.12

const ORB_LIFE = 5
const ORB_POOL = 16
const PLAYER_HIT_R = 1.35

/** Bonus-question power blast: a beam + shockwave that lasts this long (s). */
const BLAST_DUR = 0.95
const UP = new THREE.Vector3(0, 1, 0)

/** Distinct orb colors so each boss's attack reads differently. */
const ORB_COLORS = ['#b6ff5c', '#36e0ff', '#b48cff', '#ffb44a', '#ff5a6a', '#5aa8ff']

type Bolt = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number }
type Orb = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; life: number }

/* --------------------------------------------------------------- The arena */

function ArenaFloor({ accent }: { accent: string }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <cylinderGeometry args={[ARENA_R, ARENA_R + 1.5, 0.6, 48]} />
        <meshStandardMaterial color="#2c2548" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.26, 0]}>
        <ringGeometry args={[BOUND - 0.6, BOUND + 0.4, 56]} />
        <meshBasicMaterial color={accent} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.2, 0]}>
        <ringGeometry args={[3, 3.4, 40]} />
        <meshBasicMaterial color={accent} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.3} />
      </mesh>
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * (ARENA_R + 1), 3.2, Math.sin(a) * (ARENA_R + 1)]} castShadow>
            <boxGeometry args={[1.4, 9, 1.4]} />
            <meshStandardMaterial color="#3a3160" flatShading roughness={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ----------------------------------------------------------------- Scene */

function ArenaScene({
  accent,
  variant,
  dead,
  frozen,
  hitCount,
  attackCount,
  attackEvery,
  orbSpeed,
  bossMoveMul,
  multiShot,
  blastCount,
  onBossHit,
  onPlayerHit,
  onBossAttack,
}: {
  accent: string
  variant: number
  dead: boolean
  frozen: boolean
  hitCount: number
  attackCount: number
  attackEvery: number
  orbSpeed: number
  bossMoveMul: number
  multiShot: number
  blastCount: number
  onBossHit: () => void
  onPlayerHit: () => void
  onBossAttack: () => void
}) {
  const { camera, gl } = useThree()

  // Player
  const playerGroup = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 12))
  const heading = useRef(Math.PI) // face -Z (toward boss)
  const camYaw = useRef(Math.PI)
  const fireRef = useRef(0)
  const [anim, setAnim] = useState<'idle' | 'run'>('idle')

  // Boss — a grounded, human-scale villain that strafes and leaps. bossPos is the
  // CHEST/aim point; feet are CHEST_H below it. y rises when it jumps.
  const bossGroup = useRef<THREE.Group>(null)
  const bossPos = useRef(new THREE.Vector3(0, 1.3, -6))
  const bossVelY = useRef(0)
  const bossGrounded = useRef(true)
  const leapTimer = useRef(1.6)
  const orbitDir = useRef(1)
  const bossHeading = useRef(0)
  const [bossAnim, setBossAnim] = useState<'idle' | 'run' | 'jump'>('idle')

  // Input
  const enabledRef = useRef(true)
  enabledRef.current = !frozen
  const keys = useKeys(enabledRef)
  const fireReq = useRef(false)
  const dragging = useRef(false)

  // Projectile pools
  const bolts = useMemo<Bolt[]>(
    () => Array.from({ length: BOLT_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 })),
    [],
  )
  const orbs = useMemo<Orb[]>(
    () => Array.from({ length: ORB_POOL }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 })),
    [],
  )
  const boltRefs = useRef<(THREE.Mesh | null)[]>([])
  const orbRefs = useRef<(THREE.Mesh | null)[]>([])
  const cooldown = useRef(0)
  const atkTimer = useRef(1.2)

  const tmpFwd = useRef(new THREE.Vector3())
  const tmpRight = useRef(new THREE.Vector3())
  const tmpMove = useRef(new THREE.Vector3())
  const tmpDir = useRef(new THREE.Vector3())

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
    }
  }, [blastCount])

  // Hold mouse or F to rapid-fire; drag to aim.
  const holdFire = useRef(false)
  useEffect(() => {
    const el = gl.domElement
    const onDown = () => {
      dragging.current = true
      holdFire.current = true
    }
    const onUp = () => {
      dragging.current = false
      holdFire.current = false
    }
    const onMove = (e: PointerEvent) => {
      if (dragging.current && !frozen) camYaw.current -= e.movementX * 0.004
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') holdFire.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') holdFire.current = false
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [gl, frozen])

  useEffect(() => {
    camera.position.set(0, CAM_HEIGHT, 12 + CAM_DIST)
  }, [camera])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const k = frozen ? {} : keys.current

    // --- Turn + move ---
    const turn = (k['arrowright'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0)
    if (turn !== 0) camYaw.current -= turn * TURN_RATE * dt

    tmpFwd.current.set(Math.sin(camYaw.current), 0, Math.cos(camYaw.current))
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)

    const fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
    const str = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
    tmpMove.current.set(0, 0, 0)
    tmpMove.current.addScaledVector(tmpFwd.current, fwd)
    tmpMove.current.addScaledVector(tmpRight.current, str)
    const moving = tmpMove.current.lengthSq() > 0.001
    if (moving) {
      tmpMove.current.normalize()
      const speed = RUN_SPEED * dt
      pos.current.x += tmpMove.current.x * speed
      pos.current.z += tmpMove.current.z * speed
      const r = Math.hypot(pos.current.x, pos.current.z)
      if (r > BOUND) {
        pos.current.x *= BOUND / r
        pos.current.z *= BOUND / r
      }
    }
    if (anim !== (moving ? 'run' : 'idle')) setAnim(moving ? 'run' : 'idle')

    // Face the aim direction.
    let hd = camYaw.current - heading.current
    hd = Math.atan2(Math.sin(hd), Math.cos(hd))
    heading.current += hd * HEADING_LERP

    const g = playerGroup.current
    if (g) {
      g.position.copy(pos.current)
      g.rotation.y = heading.current
    }

    // Camera follow.
    camera.position.x += (pos.current.x - tmpFwd.current.x * CAM_DIST - camera.position.x) * 0.18
    camera.position.z += (pos.current.z - tmpFwd.current.z * CAM_DIST - camera.position.z) * 0.18
    camera.position.y += (CAM_HEIGHT - camera.position.y) * 0.18
    camera.lookAt(
      pos.current.x + tmpFwd.current.x * AIM_AHEAD,
      AIM_HEIGHT,
      pos.current.z + tmpFwd.current.z * AIM_AHEAD,
    )

    // --- Boss movement: grounded villain that strafes, chases and LEAPS ---
    const bg = bossGroup.current
    const CHEST_H = 1.3
    if (!dead) {
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
        // Landing near the player = a melee slam.
        if (wasAir && distP < 3.2 && !frozen) onPlayerHit()
      }

      // Decide a leap toward the player every couple seconds.
      leapTimer.current -= dt
      if (bossGrounded.current && leapTimer.current <= 0) {
        leapTimer.current = Math.max(1.4, 3.0 - variant * 0.18)
        bossVelY.current = 9.5
        bossGrounded.current = false
        orbitDir.current = Math.random() < 0.5 ? 1 : -1
        // Lunge horizontally toward the player as it takes off.
        bossPos.current.x += tmpDir.current.x * 1.4
        bossPos.current.z += tmpDir.current.z * 1.4
      }

      // Horizontal: chase to a comfortable range, plus a strafe so it circles.
      let approach = 0
      if (distP > 9) approach = 1
      else if (distP < 5) approach = -1
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

      bossHeading.current = Math.atan2(
        pos.current.x - bossPos.current.x,
        pos.current.z - bossPos.current.z,
      )
      const moving = approach !== 0 || true
      const want = !bossGrounded.current ? 'jump' : moving ? 'run' : 'idle'
      if (bossAnim !== want) setBossAnim(want)
    }
    if (bg) {
      // Render feet at chest - CHEST_H so the humanoid stands on the floor.
      bg.position.set(bossPos.current.x, bossPos.current.y - CHEST_H, bossPos.current.z)
      bg.rotation.y = bossHeading.current
    }

    // --- Player firing ---
    cooldown.current -= dt
    if (holdFire.current && !frozen) fireReq.current = true
    if (fireReq.current) {
      fireReq.current = false
      if (cooldown.current <= 0 && !frozen) {
        cooldown.current = BOLT_COOLDOWN
        const b = bolts.find((x) => !x.active)
        if (b) {
          b.active = true
          b.life = BOLT_LIFE
          b.pos.set(
            pos.current.x + tmpFwd.current.x * 0.7,
            1.2,
            pos.current.z + tmpFwd.current.z * 0.7,
          )
          tmpDir.current.set(bossPos.current.x - b.pos.x, bossPos.current.y - b.pos.y, bossPos.current.z - b.pos.z).normalize()
          b.vel.copy(tmpDir.current).multiplyScalar(BOLT_SPEED)
          fireRef.current = t
          playShot()
        }
      }
    }

    // Advance bolts (slight homing) + hit test vs boss.
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i]
      const m = boltRefs.current[i]
      if (!b.active) {
        if (m) m.visible = false
        continue
      }
      if (!dead) {
        tmpDir.current.set(bossPos.current.x - b.pos.x, bossPos.current.y - b.pos.y, bossPos.current.z - b.pos.z).normalize()
        b.vel.lerp(tmpDir.current.multiplyScalar(BOLT_SPEED), 0.12)
      }
      b.pos.addScaledVector(b.vel, dt)
      b.life -= dt
      const hitD = Math.hypot(b.pos.x - bossPos.current.x, b.pos.y - bossPos.current.y, b.pos.z - bossPos.current.z)
      if (!dead && hitD < BOSS_HIT_R) {
        b.active = false
        if (m) m.visible = false
        onBossHit()
        continue
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
    if (!dead && !frozen) {
      atkTimer.current -= dt
      if (atkTimer.current <= 0) {
        atkTimer.current = attackEvery
        // Aim at the player, then spread a small fan when multiShot > 1.
        tmpDir.current.set(pos.current.x - bossPos.current.x, 0, pos.current.z - bossPos.current.z).normalize()
        const baseAng = Math.atan2(tmpDir.current.x, tmpDir.current.z)
        let fired = false
        for (let s = 0; s < multiShot; s++) {
          const o = orbs.find((x) => !x.active)
          if (!o) break
          const fan = (s - (multiShot - 1) / 2) * 0.16
          const ang = baseAng + fan
          o.active = true
          o.life = ORB_LIFE
          o.pos.set(bossPos.current.x, bossPos.current.y, bossPos.current.z)
          o.vel.set(Math.sin(ang) * orbSpeed, 0, Math.cos(ang) * orbSpeed)
          fired = true
        }
        if (fired) onBossAttack()
      }
    }

    // Advance orbs (slight homing) + hit test vs player.
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]
      const m = orbRefs.current[i]
      if (!o.active) {
        if (m) m.visible = false
        continue
      }
      if (!frozen) {
        tmpDir.current.set(pos.current.x - o.pos.x, 1.1 - o.pos.y, pos.current.z - o.pos.z).normalize()
        o.vel.lerp(tmpDir.current.multiplyScalar(orbSpeed), 0.05)
      }
      o.pos.addScaledVector(o.vel, dt)
      o.life -= dt
      const d = Math.hypot(o.pos.x - pos.current.x, o.pos.y - 1.1, o.pos.z - pos.current.z)
      if (!frozen && d < PLAYER_HIT_R) {
        o.active = false
        if (m) m.visible = false
        onPlayerHit()
        continue
      }
      if (o.life <= 0) {
        o.active = false
        if (m) m.visible = false
        continue
      }
      if (m) {
        m.visible = true
        m.position.copy(o.pos)
      }
    }

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
  })

  return (
    <group>
      <ArenaFloor accent={accent} />

      <group ref={playerGroup}>
        <Avatar anim={anim} accent={accent} fireRef={fireRef} />
      </group>

      <group ref={bossGroup} scale={BOSS_SCALE}>
        <Boss3D
          accent={accent}
          variant={variant}
          anim={bossAnim}
          hitCount={hitCount}
          attackCount={attackCount}
          dead={dead}
        />
      </group>

      {bolts.map((_, i) => (
        <mesh
          key={`b${i}`}
          ref={(el) => {
            boltRefs.current[i] = el
          }}
          visible={false}
        >
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshBasicMaterial color={accent} toneMapped={false} fog={false} />
        </mesh>
      ))}

      {orbs.map((_, i) => (
        <mesh
          key={`o${i}`}
          ref={(el) => {
            orbRefs.current[i] = el
          }}
          visible={false}
        >
          <sphereGeometry args={[0.34, 10, 10]} />
          <meshBasicMaterial color={ORB_COLORS[variant % ORB_COLORS.length]} toneMapped={false} fog={false} />
        </mesh>
      ))}

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
}

/* ------------------------------------------------------------- Component */

export function BossArena({
  accent,
  variant,
  bossName,
  bonusQuestion,
  onWin,
  onLose,
  onFlee,
}: {
  accent: string
  variant: number
  bossName: string
  bonusQuestion?: BonusQuestion | null
  onWin: () => void
  onLose: () => void
  onFlee?: () => void
}): JSX.Element {
  // Difficulty: punchy but fair — rapid-fire can win if you keep dodging orbs.
  const bossHpMax = BOSS_HP_BASE + variant * BOSS_HP_PER_LEVEL
  const attackEvery = Math.max(0.95, 1.7 - variant * 0.1)
  const orbSpeed = 11 + variant * 0.8
  const bossMoveMul = 1.05 + variant * 0.05
  const multiShot = variant < 2 ? 1 : variant < 4 ? 2 : 3

  const [playerHp, setPlayerHp] = useState(PLAYER_HP)
  const [bossHp, setBossHp] = useState(bossHpMax)
  const [hitCount, setHitCount] = useState(0)
  const [attackCount, setAttackCount] = useState(0)
  const [dead, setDead] = useState(false)
  const [hurt, setHurt] = useState(0)
  const endedRef = useRef(false)

  // Mid-fight bonus strike: pauses the fight at half HP for one lesson question.
  const [bonusPhase, setBonusPhase] = useState<'pending' | 'active' | 'done'>(
    bonusQuestion ? 'pending' : 'done',
  )
  const [bonusPicked, setBonusPicked] = useState<number | null>(null)
  const [bonusResult, setBonusResult] = useState<'correct' | 'wrong' | null>(null)
  const [blastCount, setBlastCount] = useState(0)
  const [blastFlash, setBlastFlash] = useState(false)

  const onBossHit = useCallback(() => {
    setHitCount((c) => c + 1)
    setBossHp((hp) => Math.max(0, hp - 1))
  }, [])
  const onPlayerHit = useCallback(() => {
    setHurt((h) => h + 1)
    setPlayerHp((hp) => Math.max(0, hp - 1))
  }, [])
  const onBossAttack = useCallback(() => setAttackCount((c) => c + 1), [])

  useEffect(() => {
    if (bossHp <= 0 && !dead) setDead(true)
  }, [bossHp, dead])

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
      setBlastCount((c) => c + 1)
      setHitCount((c) => c + 1)
      setBlastFlash(true)
      window.setTimeout(() => setBlastFlash(false), 600)
      const dmg = Math.max(1, Math.ceil(bossHpMax * 0.3))
      window.setTimeout(() => setBossHp((hp) => Math.max(0, hp - dmg)), 240)
      window.setTimeout(() => {
        setBonusPhase('done')
        setBonusResult(null)
        setBonusPicked(null)
      }, 1300)
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
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        camera={{ position: [0, CAM_HEIGHT, 17], fov: 50, near: 0.1, far: 140 }}
      >
        <color attach="background" args={['#221b3a']} />
        <fog attach="fog" args={['#221b3a', 20, 64]} />
        <hemisphereLight args={['#aab6e0', '#2a2440', 0.7]} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[8, 18, 6]}
          intensity={1.25}
          color="#fff0d6"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-radius={4}
          shadow-normalBias={0.02}
        />
        <ArenaScene
          accent={accent}
          variant={variant}
          dead={dead}
          frozen={frozen}
          hitCount={hitCount}
          attackCount={attackCount}
          attackEvery={attackEvery}
          orbSpeed={orbSpeed}
          bossMoveMul={bossMoveMul}
          multiShot={multiShot}
          blastCount={blastCount}
          onBossHit={onBossHit}
          onPlayerHit={onPlayerHit}
          onBossAttack={onBossAttack}
        />

        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.6} luminanceSmoothing={0.25} />
          <Vignette eskil={false} offset={0.2} darkness={0.7} />
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
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 86%)', textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ color: '#fff', fontWeight: 800, letterSpacing: 0.5, marginBottom: 6, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
          {bossName}
        </div>
        <div style={{ height: 14, borderRadius: 8, background: 'rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${bossPct}%`, background: accent, transition: 'width 0.2s ease' }} />
        </div>
      </div>

      {/* Player HP */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, pointerEvents: 'none' }}>
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

      {/* Controls hint */}
      <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: 600, textShadow: '0 2px 6px rgba(0,0,0,0.7)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        ↑↓ move · ←→ turn · click / F shoot
      </div>

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
