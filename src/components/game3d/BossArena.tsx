import { memo, useCallback, useEffect, useMemo, useRef, useState, type JSX, type MutableRefObject } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { Boss3D, type BossAnim } from './Boss3D'
import { useKeys } from './useKeys'
import { SimulationDriver } from './SimulationDriver'
import { applyArenaPulse } from './simulation'
import { concreteMaps } from './proceduralTextures'
import { playShot } from '../../lib/soundFx'
import type { BonusQuestion } from '../../content/bonusQuestions'
import './BossArena.css'

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

const BOLT_SPEED = 72
const BOLT_LIFE = 1.6
const BOLT_COOLDOWN = 0.14 // rapid-fire blaster — hold to melt the boss
const BOLT_POOL = 28
const BOSS_HIT_R = 2.4
/** Villain stands a touch taller than the hero — menacing but human-scale. */
const BOSS_SCALE = 1.18

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

const ArenaFloor = memo(function ArenaFloor({ accent }: { accent: string }) {
  // Living Simulation (M8): the combat disk streams accent-colored data rings
  // out from the arena center — clock-uniform driven, one shared material.
  // The disk also wears the shared concrete PBR detail so boss-fight lighting
  // has real micro-surface to bite into.
  const diskMat = useMemo(() => {
    const maps = concreteMaps()
    const normal = maps.normal.clone()
    const rough = maps.roughness.clone()
    normal.repeat.set(9, 9)
    rough.repeat.set(9, 9)
    return applyArenaPulse(
      new THREE.MeshStandardMaterial({
        color: '#4d456a',
        roughness: 0.9,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughnessMap: rough,
      }),
      accent,
    )
  }, [accent])
  useEffect(() => () => diskMat.dispose(), [diskMat])

  // Every flat floor decoration is stacked at a slightly higher Y than the one
  // below it so nothing is buried inside the base slab or z-fights. The base
  // slab's TOP surface sits exactly at y = 0 (the plane the fighters stand on).
  return (
    <group>
      {/* Large base floor — a cylinder is ALREADY a horizontal disk (axis = Y), so it
          must NOT be rotated, or it tips onto its side into a giant vertical wall that
          stands in the middle of the arena and hides the boss. Its top face is at y=0
          (height 0.6, centered at -0.3). */}
      <mesh position={[0, -0.3, 0]} receiveShadow>
        <cylinderGeometry args={[ARENA_R + 4, ARENA_R + 4, 0.6, 72]} />
        <meshStandardMaterial color="#564d72" roughness={0.94} metalness={0.04} />
      </mesh>

      {/* Inner combat disk — thin plate laid just on top of the base floor. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow material={diskMat}>
        <circleGeometry args={[16.5, 96]} />
      </mesh>

      {/* Subtle concentric panel rings for scale (sit above the inner disk). */}
      {[8, 12.5, 15.8].map((r, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
          <ringGeometry args={[r - 0.06, r + 0.06, 96]} />
          <meshStandardMaterial color="#352f4c" roughness={0.95} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}

      {/* Enclosing arena wall — lighter stone so edges don't vanish into black */}
      <mesh position={[0, 7.5, 0]}>
        <cylinderGeometry args={[ARENA_R + 2.6, ARENA_R + 2.6, 16.5, 72, 1, true]} />
        <meshStandardMaterial color="#564d76" side={THREE.BackSide} roughness={0.9} metalness={0.08} />
      </mesh>

      {/* Inner wall rim band (subtle architectural detail near the top) */}
      <mesh position={[0, 14.2, 0]}>
        <cylinderGeometry args={[ARENA_R + 2.55, ARENA_R + 2.55, 0.9, 72, 1, true]} />
        <meshStandardMaterial color="#665d86" side={THREE.BackSide} roughness={0.85} />
      </mesh>

      {/* Domed ceiling — lighter vault so the upper frame has presence. */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[ARENA_R + 3.8, 48, 28, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#7a6f9c" side={THREE.BackSide} roughness={0.95} />
      </mesh>

      {/* Glowing trim where wall meets floor — clear boundary without glare */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
        <ringGeometry args={[ARENA_R + 1.7, ARENA_R + 2.6, 80]} />
        <meshBasicMaterial color={accent} side={THREE.DoubleSide} transparent opacity={0.45} depthWrite={false} />
      </mesh>

      {/* Play boundary ring (the "wall" you can't cross) — visible but calm */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[BOUND - 0.55, BOUND + 0.5, 64]} />
        <meshBasicMaterial color={accent} side={THREE.DoubleSide} transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Center marker — small and non-intrusive */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[2.8, 3.15, 48]} />
        <meshBasicMaterial color={accent} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.25} depthWrite={false} />
      </mesh>

      {/* Framing pillars — out near the wall, short + light so they define the
          circle without cutting across the view. */}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * (ARENA_R + 2.35), 3.0, Math.sin(a) * (ARENA_R + 2.35)]} castShadow>
            <boxGeometry args={[1.05, 6.6, 1.05]} />
            <meshStandardMaterial color="#4f476a" flatShading roughness={0.85} />
          </mesh>
        )
      })}
    </group>
  )
})

/* ----------------------------------------------------------------- Scene */

const ArenaScene = memo(function ArenaScene({
  accent,
  variant,
  dead,
  frozen,
  hitRef,
  attackRef,
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
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
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

  // One geometry + one material shared by every bolt / orb mesh, instead of a
  // fresh sphere geometry + material per pooled mesh (28 bolts + 16 orbs = 44 of
  // each). That collapses ~88 GPU buffer/material allocations at fight mount down
  // to 4 — less upload work + GC churn on the frame the arena appears.
  const boltGeo = useMemo(() => new THREE.SphereGeometry(0.13, 8, 8), [])
  const boltMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, fog: false }), [accent])
  const orbColor = ORB_COLORS[variant % ORB_COLORS.length]
  const orbGeo = useMemo(() => new THREE.SphereGeometry(0.34, 10, 10), [])
  const orbMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: orbColor, toneMapped: false, fog: false }),
    [orbColor],
  )
  useEffect(
    () => () => {
      boltGeo.dispose()
      boltMat.dispose()
      orbGeo.dispose()
      orbMat.dispose()
    },
    [boltGeo, boltMat, orbGeo, orbMat],
  )

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
    const k = frozen ? {} : keys.current

    // --- Lock-on movement: the hero always faces the boss so it stays framed.
    // Aim axis = direction from hero to boss; left/right strafe (orbit) around it,
    // up/down advance or retreat. This guarantees the boss is always on screen.
    tmpDir.current.set(bossPos.current.x - pos.current.x, 0, bossPos.current.z - pos.current.z)
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
    if (moving) {
      tmpMove.current.normalize()
      const speed = RUN_SPEED * dt
      let nx = pos.current.x + tmpMove.current.x * speed
      let nz = pos.current.z + tmpMove.current.z * speed
      // Keep a minimum gap from the boss so we never overlap or clip the camera.
      const ndb = Math.hypot(bossPos.current.x - nx, bossPos.current.z - nz)
      if (ndb > 2.6) {
        pos.current.x = nx
        pos.current.z = nz
      }
      const r = Math.hypot(pos.current.x, pos.current.z)
      if (r > BOUND) {
        pos.current.x *= BOUND / r
        pos.current.z *= BOUND / r
      }
    }
    playerAnimRef.current = moving ? 'run' : 'idle'

    // Face the boss.
    let hd = camYaw.current - heading.current
    hd = Math.atan2(Math.sin(hd), Math.cos(hd))
    heading.current += hd * HEADING_LERP

    const g = playerGroup.current
    if (g) {
      g.position.copy(pos.current)
      g.rotation.y = heading.current
    }

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
    if (bg) {
      // Render feet at chest - CHEST_H so the humanoid stands on the floor.
      bg.position.set(bossPos.current.x, bossPos.current.y - CHEST_H, bossPos.current.z)
      bg.rotation.y = bossHeading.current
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
    tmpFwd.current.set(
      bossPos.current.x - pos.current.x,
      0,
      bossPos.current.z - pos.current.z,
    )
    if (tmpFwd.current.lengthSq() < 1e-6) tmpFwd.current.set(0, 0, 1)
    tmpFwd.current.normalize()
    tmpRight.current.set(-tmpFwd.current.z, 0, tmpFwd.current.x)

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
    // Snappy follow so during fast circling or leaps the boss never slips out of frame.
    camera.position.x += (tx - camera.position.x) * 0.34
    camera.position.z += (tz - camera.position.z) * 0.34
    camera.position.y += (CAM_HEIGHT - camera.position.y) * 0.24
    camera.lookAt(
      bossPos.current.x,
      bossPos.current.y * 0.5 + AIM_HEIGHT,
      bossPos.current.z,
    )

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
        <Avatar animRef={playerAnimRef} accent={accent} fireRef={fireRef} />
      </group>

      <group ref={bossGroup} scale={BOSS_SCALE}>
        <Boss3D
          accent={accent}
          variant={variant}
          animRef={bossAnimRef}
          hitRef={hitRef}
          attackRef={attackRef}
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
          geometry={boltGeo}
          material={boltMat}
        />
      ))}

      {orbs.map((_, i) => (
        <mesh
          key={`o${i}`}
          ref={(el) => {
            orbRefs.current[i] = el
          }}
          visible={false}
          geometry={orbGeo}
          material={orbMat}
        />
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
})

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
  const [dead, setDead] = useState(false)
  const [hurt, setHurt] = useState(0)
  const endedRef = useRef(false)

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

  const onBossHit = useCallback(() => {
    hitRef.current += 1
    setHitCount((c) => c + 1)
    setBossHp((hp) => Math.max(0, hp - 1))
  }, [])
  const onPlayerHit = useCallback(() => {
    setHurt((h) => h + 1)
    setPlayerHp((hp) => Math.max(0, hp - 1))
  }, [])
  const onBossAttack = useCallback(() => {
    attackRef.current += 1
  }, [])

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
        <color attach="background" args={['#463e65']} />
        <fog attach="fog" args={['#463e65', 29, 92]} />
        {/* Ticks the shared simulation clock for the pulse floor + rim shaders.
            No nightRef: arenas always read as "inside the program", day state. */}
        <SimulationDriver />
        {/* M8 — baked IBL (one-time, frames=1): warm key / cool rim formers so
            armor, floors and the boss pick up REAL reflections instead of
            living off flat ambient. Ambient terms drop to shape-fill duty. */}
        <Environment frames={1} resolution={128}>
          <Lightformer form="rect" intensity={0.6} color="#4a4468" scale={[40, 40, 1]} position={[0, 0, -16]} />
          <Lightformer form="rect" intensity={4.4} color="#ffe2b0" scale={[12, 9, 1]} position={[8, 12, -7]} target={[0, 1, 0]} />
          <Lightformer form="rect" intensity={2.8} color="#8fb4ff" scale={[12, 6, 1]} position={[-9, 6, 9]} target={[0, 1, 0]} />
          <Lightformer form="ring" intensity={1.5} color="#f4ecff" scale={7} position={[0, 15, 0]} target={[0, 0, 0]} />
        </Environment>
        <hemisphereLight args={['#d2d8f2', '#3f375c', 0.55]} />
        <ambientLight intensity={0.35} />
        {/* Main angled key light (warm). The shadow camera is explicitly sized to
            the play area so shadows are crisp and there is no dark "patch" or
            popping in the middle of the arena from an undersized shadow frustum. */}
        <directionalLight
          position={[9, 19, 7]}
          intensity={1.1}
          color="#ffe9c8"
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
        {/* Soft overhead fill so the arena doesn't have a dark "middle" even when camera is low. */}
        <directionalLight
          position={[0, 28, -2]}
          intensity={0.55}
          color="#e6d9ff"
        />
        <ArenaScene
          accent={accent}
          variant={variant}
          dead={dead}
          frozen={frozen}
          hitRef={hitRef}
          attackRef={attackRef}
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
          <Bloom mipmapBlur intensity={0.38} luminanceThreshold={0.92} luminanceSmoothing={0.16} />
          <Vignette eskil={false} offset={0.28} darkness={0.5} />
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <span style={{ color: '#fff', fontWeight: 800, letterSpacing: 0.5, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
            {bossName}
          </span>
          <span style={{ color: accent, fontWeight: 800, fontSize: 14, textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>
            {bossHp} / {bossHpMax} HP
          </span>
        </div>
        <div style={{ height: 16, borderRadius: 9, background: 'rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.25)', overflow: 'hidden', boxShadow: hurtBoss ? `0 0 16px ${accent}` : 'none', transition: 'box-shadow 0.18s ease' }}>
          <div style={{ height: '100%', width: `${bossPct}%`, background: accent, transition: 'width 0.18s ease' }} />
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
        ↑↓ advance · ←→ circle · click / F shoot
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
