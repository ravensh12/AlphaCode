import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { useKeys } from './useKeys'
import { playShot } from '../../lib/soundFx'
import { GROUND_HALF, START_3D, collidersNear } from './layout'
import { radialGlowTexture } from './proceduralTextures'
import type { World } from '../../content/adventure'

export type Target = {
  key: string
  world: World
  kind: 'lesson' | 'boss'
  x: number
  z: number
  locked: boolean
  cleared: boolean
  /** For split lessons: which checkpoint part (0-based) this gate opens. */
  part?: number
}

/**
 * Shared blade-dash state, written by the controller every frame and read by
 * the CombatSystem so the dash can slice the horde + grant i-frames (dodging).
 */
export type DashState = {
  /** Is the player mid-dash right now? (i-frames + the slicing sweep are live.) */
  active: boolean
  /** Live player position — the centre of the slicing sweep. */
  x: number
  z: number
  /** Slice radius around the player while dashing. */
  radius: number
  /** Cooldown progress, 0 = just used .. 1 = ready again (for the HUD button). */
  cd01: number
  /** Convenience flag: dash is off cooldown and ready to fire. */
  ready: boolean
}

/** Virtual-joystick channel: the on-screen stick writes it, the controller
 *  reads it every frame. fwd/str are -1..1 (forward / strafe-right), mag is
 *  the stick deflection 0..1 — pushed to the edge = sprint. */
export type TouchMoveState = { fwd: number; str: number; mag: number }

const RUN_SPEED = 8
const SPRINT_SPEED = 15
const HEADING_LERP = 0.3 // how fast the hero turns to face the aim direction
const TURN_RATE = 2.5 // rad/s when turning with the arrow keys
const CAM_DIST = 5.2
const CAM_HEIGHT = 2.7
const AIM_AHEAD = 14 // look far ahead so the view is near-level and bullets carry
const AIM_HEIGHT = 1.7 // aim-point height; keeps the hero low in frame
const JUMP_V = 7
const GRAVITY = -21
const BOUND = GROUND_HALF - 8
const ENTER_RADIUS = 7.5
const BODY_R = 0.7 // hero collision radius vs. building footprints

// --- Blade dash: a precise dodge-lunge that cuts what you pass THROUGH ------
// Tuned as a skill tool, not a panic button: a real cooldown means you must time
// it to dodge a slam/acid or carve an escape lane — not spam it to nuke packs.
const DASH_SPEED = 30 // m/s burst while dashing
const DASH_TIME = 0.32 // seconds the lunge + i-frames last
const DASH_CD = 2.4 // meaningful cooldown — the dash is a committed decision
const DASH_RADIUS = 2.8 // tighter sweep — cuts what you dash through, not the whole field

// --- M5 game feel (camera-only; movement/controls tuning untouched) --------
const SPRINT_FOV_ADD = 5 // sprint widens the lens a touch — speed reads on screen
const DASH_FOV_KICK = 7 // extra punch-in bloom of speed on a blade dash
const BOB_AMP = 0.034 // running head-bob, position-only and tiny
const LAND_SHAKE = 0.12 // micro-shake magnitude on touchdown

/* ---------------------------------------------------------------- Foot dust */

// Pooled, instanced dust puffs: footfalls while running kick up a soft ring of
// dust; landings burst a bigger one. One instanced draw, a fixed ring buffer,
// zero allocations — spawning just rewrites a slot.
const DUST_POOL = 26
const DUST_LIFE = 0.55
const DUST_STRIDE = 2.3 // meters of ground covered between footfall puffs

type DustSlot = { x: number; z: number; born: number; big: number; rot: number }

function FootDust({
  playerPosRef,
  animRef,
}: {
  playerPosRef: MutableRefObject<THREE.Vector3>
  animRef: MutableRefObject<AvatarAnim>
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const slots = useMemo<DustSlot[]>(
    () => Array.from({ length: DUST_POOL }, () => ({ x: 0, z: 0, born: -10, big: 0, rot: 0 })),
    [],
  )
  const cursor = useRef(0)
  const distAcc = useRef(0)
  const side = useRef(1)
  const prev = useMemo(() => new THREE.Vector3(), [])
  const prevY = useRef(0)
  const started = useRef(false)

  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.5, 14)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#a89e8c',
        transparent: true,
        opacity: 0.55,
        alphaMap: radialGlowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])

  const scratch = useMemo(() => ({ o: new THREE.Object3D(), col: new THREE.Color() }), [])

  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const now = state.clock.elapsedTime
    const p = playerPosRef.current
    if (!started.current) {
      started.current = true
      prev.copy(p)
      prevY.current = p.y
    }

    const spawn = (x: number, z: number, big: number) => {
      const s = slots[cursor.current]
      cursor.current = (cursor.current + 1) % DUST_POOL
      s.x = x
      s.z = z
      s.born = now
      s.big = big
      s.rot = (x * 13.7 + z * 7.9) % Math.PI
    }

    // Footfall cadence: a puff every stride-length of actual ground covered.
    const grounded = p.y < 0.02
    const a = animRef.current
    if (grounded && (a === 'run' || a === 'walk' || a === 'dash')) {
      distAcc.current += Math.hypot(p.x - prev.x, p.z - prev.z)
      const stride = a === 'dash' ? 1.6 : DUST_STRIDE
      if (distAcc.current >= stride) {
        distAcc.current = 0
        side.current = -side.current
        // Slight lateral alternation so puffs track left/right footfalls.
        const lat = side.current * 0.16
        const dxn = p.x - prev.x
        const dzn = p.z - prev.z
        const len = Math.hypot(dxn, dzn) || 1
        spawn(p.x + (-dzn / len) * lat, p.z + (dxn / len) * lat, a === 'dash' ? 0.5 : 0)
      }
    } else {
      distAcc.current = 0
    }
    // Landing burst: falling → grounded this frame.
    if (prevY.current > 0.12 && p.y <= 0.02) {
      spawn(p.x + 0.3, p.z, 1)
      spawn(p.x - 0.25, p.z + 0.22, 1)
      spawn(p.x, p.z - 0.3, 0.6)
    }
    prev.copy(p)
    prevY.current = p.y

    const { o, col } = scratch
    for (let i = 0; i < DUST_POOL; i++) {
      const s = slots[i]
      const t = (now - s.born) / (DUST_LIFE * (1 + s.big * 0.5))
      if (t >= 1 || t < 0) {
        o.position.set(0, -10, 0)
        o.scale.setScalar(0.0001)
        o.rotation.set(0, 0, 0)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
        continue
      }
      const size = (0.4 + t * 1.15) * (1 + s.big * 0.9)
      o.position.set(s.x, 0.06, s.z)
      o.rotation.set(0, s.rot, 0)
      o.scale.setScalar(size)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      // Additive fade: color → black reads as dust settling.
      col.setScalar((1 - t) * (0.5 + s.big * 0.3))
      m.setColorAt(i, col)
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={mesh} args={[geo, mat, DUST_POOL]} frustumCulled={false} />
}

/** Slide the hero out of any building/car footprint (circle vs. AABB). */
function resolveCollisions(p: THREE.Vector3) {
  // Only the colliders bucketed into the hero's grid cell can possibly overlap,
  // so this is a handful of tests per frame instead of the full ~2.8k scan.
  const near = collidersNear(p.x, p.z)
  for (let i = 0; i < near.length; i++) {
    const c = near[i]
    const dx = p.x - c.x
    const dz = p.z - c.z
    // Broad reject.
    if (Math.abs(dx) > c.hw + BODY_R || Math.abs(dz) > c.hd + BODY_R) continue
    const insideX = Math.abs(dx) <= c.hw
    const insideZ = Math.abs(dz) <= c.hd
    if (insideX && insideZ) {
      // Center is inside the box — pop out along the shallowest axis.
      const penX = c.hw - Math.abs(dx) + BODY_R
      const penZ = c.hd - Math.abs(dz) + BODY_R
      if (penX < penZ) p.x = c.x + (dx < 0 ? -1 : 1) * (c.hw + BODY_R)
      else p.z = c.z + (dz < 0 ? -1 : 1) * (c.hd + BODY_R)
      continue
    }
    // Closest point on the AABB.
    const nx = c.x + Math.max(-c.hw, Math.min(dx, c.hw))
    const nz = c.z + Math.max(-c.hd, Math.min(dz, c.hd))
    const ox = p.x - nx
    const oz = p.z - nz
    const d2 = ox * ox + oz * oz
    if (d2 < BODY_R * BODY_R && d2 > 1e-6) {
      const d = Math.sqrt(d2)
      const push = (BODY_R - d) / d
      p.x += ox * push
      p.z += oz * push
    }
  }
}

function ThirdPersonControllerImpl({
  playerPosRef,
  headingRef,
  accent,
  targets,
  onNearbyChange,
  paused,
  onFire,
  faceTarget,
  startPos,
  startHeading,
  dashRef,
  stealthRef,
  onStealthChange,
  shakeRef,
  hitstopRef,
  touchMoveRef,
}: {
  playerPosRef: MutableRefObject<THREE.Vector3>
  headingRef?: MutableRefObject<number>
  accent?: string
  targets: Target[]
  onNearbyChange: (t: Target | null) => void
  paused: boolean
  onFire?: (origin: THREE.Vector3, dir: THREE.Vector3) => boolean | void
  /** On spawn / respawn, face this map point (usually the next checkpoint gate). */
  faceTarget?: { x: number; z: number } | null
  /** Restore the hero here (e.g. returning from the list). Defaults to START_3D. */
  startPos?: { x: number; z: number } | null
  /** Restore facing (radians) when resuming. Overrides faceTarget. */
  startHeading?: number | null
  /** Shared blade-dash state for the combat system + HUD. */
  dashRef?: MutableRefObject<DashState>
  /** Shared stealth state — set active while the player holds crouch (C). */
  stealthRef?: MutableRefObject<{ active: boolean }>
  /** Notifies the HUD when stealth toggles (throttled to real changes). */
  onStealthChange?: (active: boolean) => void
  /** Camera-shake impulse channel (magnitude written by combat; decayed here). */
  shakeRef?: MutableRefObject<number>
  /** Hit-stop channel: a future clock time during which the scene runs in slow-mo. */
  hitstopRef?: MutableRefObject<number>
  /** Virtual joystick (touch devices) — read every frame alongside the keys. */
  touchMoveRef?: MutableRefObject<TouchMoveState>
}) {
  const { camera, gl } = useThree()
  const enabledRef = useRef(true)
  const keys = useKeys(enabledRef)

  const fireReq = useRef(false)
  // Held-trigger: while the mouse button or F is down, the hero auto-fires
  // (the gun's own cooldown sets the rate). Feels like a real rapid-fire blaster.
  const holdFire = useRef(false)
  const fireRef = useRef(-10)
  const tmpOrigin = useRef(new THREE.Vector3())

  // Direction the next shot travels (kept horizontal so bullets carry to the horde).
  const shootDir = useRef(new THREE.Vector3(0, 0, 1))

  // Animation state lives in a ref and is read by the Avatar every frame, so a
  // walk/run/jump transition NEVER triggers a React re-render from inside the
  // render loop.
  const animRef = useRef<AvatarAnim>('idle')

  const group = useRef<THREE.Group>(null)
  const startX = startPos?.x ?? START_3D.x
  const startZ = startPos?.z ?? START_3D.z
  const pos = useRef(new THREE.Vector3(startX, 0, startZ))
  const spawnYaw =
    startHeading != null
      ? startHeading
      : faceTarget != null
        ? Math.atan2(faceTarget.x - startX, faceTarget.z - startZ)
        : 0
  const heading = useRef(spawnYaw)
  const camYaw = useRef(spawnYaw)
  const velY = useRef(0)
  const grounded = useRef(true)
  const jumpReq = useRef(false)
  const squash = useRef(0) // landing squash timer
  const lastNearby = useRef<string | null>(null)

  // Crouch / lay-low (stealth): held key. While down the hero moves slowly and
  // the horde loses its lock on you (handled in CombatSystem via stealthRef).
  const crouchHeld = useRef(false)
  const stealthOn = useRef(false)

  // Blade dash.
  const dashReq = useRef(false)
  const dashUntil = useRef(-10) // clock time the lunge ends
  const dashCdUntil = useRef(-10) // clock time the dash is ready again
  const dashDir = useRef(new THREE.Vector3(0, 0, 1))
  const slashRef = useRef(-10) // clock time the most recent slash started (drives the sword)

  const tmpForward = useRef(new THREE.Vector3())
  const tmpRight = useRef(new THREE.Vector3())
  const tmpMove = useRef(new THREE.Vector3())
  const camTarget = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())

  // M5 camera feel: FOV breathes with speed (sprint widen + dash kick) and a
  // tiny position-only head-bob ticks with the stride. Purely additive — the
  // follow/damping constants and all movement tuning are untouched.
  const baseFov = useRef(0)
  const fovNow = useRef(0)
  const bobPhase = useRef(0)
  const bobAmp = useRef(0)

  function want(a: AvatarAnim) {
    animRef.current = a
  }

  // Left button: drag to orbit the camera, or a quick click to loose an arrow.
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    function down(e: PointerEvent) {
      if (e.button !== 0) return
      dragging = true
      // Hold to rapid-fire; you can still drag to aim while firing. Touch
      // drags only steer — firing on touch is the on-screen Fire button, so
      // aiming with a finger doesn't waste ammo/heat.
      if (e.pointerType !== 'touch') holdFire.current = true
    }
    function move(e: PointerEvent) {
      if (!dragging) return
      camYaw.current -= e.movementX * 0.0045
    }
    function up() {
      dragging = false
      holdFire.current = false
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl])

  // Keyboard shooting (hold F) as an accessible alternative to the mouse.
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') holdFire.current = true
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') holdFire.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  // Jump key (space) — separate so it doesn't repeat-fire.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' && !paused) {
        jumpReq.current = true
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused])

  // Blade dash key (Q). One-shot per press; the cooldown is enforced in-frame.
  // The on-screen Dash button dispatches a synthetic 'q' keydown so both paths
  // share this exact handler.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'q' || e.key === 'Q') && !e.repeat && !paused) {
        dashReq.current = true
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused])

  // Crouch / lay-low key (C) — held. Releasing stands back up.
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      if (e.key === 'c' || e.key === 'C') crouchHeld.current = true
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === 'c' || e.key === 'C') crouchHeld.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  useEffect(() => {
    const yaw = spawnYaw
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    camera.position.set(startX - fwd.x * CAM_DIST, CAM_HEIGHT, startZ - fwd.z * CAM_DIST)
    lookTarget.current.set(startX + fwd.x * AIM_AHEAD, AIM_HEIGHT, startZ + fwd.z * AIM_AHEAD)
    camera.lookAt(lookTarget.current)
    shootDir.current.copy(fwd)
    const pc = camera as THREE.PerspectiveCamera
    // Latch the base FOV, but ONLY a sane value. There is an init-order race:
    // this controller lives inside the overworld's <Suspense>, so while the hero
    // GLB streams in, the very first useFrame can fire BEFORE this mount effect.
    // If we (or that frame) ever store a 0 here, the perspective projection
    // matrix goes NaN and the entire canvas renders black. Never latch 0.
    if (pc.fov > 1) {
      baseFov.current = pc.fov
      fovNow.current = pc.fov
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useFrame((state, dtRaw) => {
    const nowClock = state.clock.elapsedTime
    // Hit-stop: match the combat system's slow-mo so the hero crawls in sync with
    // the horde during an impact beat (reads as punch, not lag).
    const slowed = hitstopRef ? nowClock < hitstopRef.current : false
    const dt = Math.min(dtRaw, 0.05) * (slowed ? 0.18 : 1)
    const k = paused ? {} : keys.current

    // Left/right arrows turn the hero (so the game is fully playable on arrows
    // alone); mouse-drag also turns. Up/down move forward/back.
    const turn = (k['arrowright'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0)
    if (turn !== 0) camYaw.current -= turn * TURN_RATE * dt

    // Camera-relative basis from the orbit yaw.
    // forward = where the camera (and crosshair) points; right = screen-right.
    tmpForward.current.set(Math.sin(camYaw.current), 0, Math.cos(camYaw.current))
    tmpRight.current.set(-tmpForward.current.z, 0, tmpForward.current.x)

    // --- Blade dash: a fast forward lunge with i-frames that slices the horde.
    const now = state.clock.elapsedTime
    let dashing = now < dashUntil.current
    if (dashReq.current) {
      dashReq.current = false
      if (!dashing && now >= dashCdUntil.current && !paused) {
        dashDir.current.copy(tmpForward.current)
        dashDir.current.y = 0
        if (dashDir.current.lengthSq() < 1e-4) {
          dashDir.current.set(Math.sin(heading.current), 0, Math.cos(heading.current))
        }
        dashDir.current.normalize()
        dashUntil.current = now + DASH_TIME
        dashCdUntil.current = now + DASH_CD
        slashRef.current = now
        dashing = true
      }
    }

    // Crouch / lay-low: slow, quiet movement that breaks the horde's lock.
    const crouching = crouchHeld.current && !dashing && !paused

    // Move along the aim direction: W/↑ forward, S/↓ backward (no spinning),
    // A/D strafe. The virtual joystick adds its analog vector on top, and
    // pushing it to the rim sprints. A dash overrides everything with a lunge.
    const touch = paused ? null : touchMoveRef?.current
    const touchActive = !!touch && touch.mag > 0.12
    const fwd =
      (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0) + (touchActive ? touch.fwd : 0)
    const str = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0) + (touchActive ? touch.str : 0)
    const sprintHeld = !!k['shift'] || (touchActive && touch.mag > 0.85)

    let moving: boolean
    if (dashing) {
      const ds = DASH_SPEED * dt
      pos.current.x += dashDir.current.x * ds
      pos.current.z += dashDir.current.z * ds
      moving = true
    } else {
      tmpMove.current.set(0, 0, 0)
      tmpMove.current.addScaledVector(tmpForward.current, fwd)
      tmpMove.current.addScaledVector(tmpRight.current, str)
      moving = tmpMove.current.lengthSq() > 0.001
      if (moving) {
        tmpMove.current.normalize()
        const baseSpeed = crouching
          ? RUN_SPEED * 0.6
          : sprintHeld
            ? SPRINT_SPEED
            : RUN_SPEED
        const speed = baseSpeed * dt
        pos.current.x += tmpMove.current.x * speed
        pos.current.z += tmpMove.current.z * speed
      }
    }

    // Facing: snap to the lunge direction while dashing, otherwise ease toward
    // the camera aim (a smooth Disney arc).
    if (dashing) {
      heading.current = Math.atan2(dashDir.current.x, dashDir.current.z)
    } else {
      let hd = camYaw.current - heading.current
      hd = Math.atan2(Math.sin(hd), Math.cos(hd))
      heading.current += hd * HEADING_LERP
    }

    // Block movement through buildings / cars.
    if (moving) resolveCollisions(pos.current)

    // Clamp to map.
    const r = Math.hypot(pos.current.x, pos.current.z)
    if (r > BOUND) {
      pos.current.x *= BOUND / r
      pos.current.z *= BOUND / r
    }

    // Jump + gravity.
    if (jumpReq.current) {
      jumpReq.current = false
      if (grounded.current) {
        velY.current = JUMP_V
        grounded.current = false
      }
    }
    if (!grounded.current) {
      velY.current += GRAVITY * dt
      pos.current.y += velY.current * dt
      if (pos.current.y <= 0) {
        pos.current.y = 0
        grounded.current = true
        velY.current = 0
        squash.current = 1 // trigger landing squash
        // Touchdown micro-shake (shared channel — the decay below handles it).
        if (shakeRef) shakeRef.current = Math.max(shakeRef.current, LAND_SHAKE)
      }
    }
    if (squash.current > 0) squash.current = Math.max(0, squash.current - dt * 4)

    // Animation state.
    if (dashing) want('dash')
    else if (!grounded.current) want('jump')
    else if (crouching) want('crouch')
    else if (moving) want('run')
    else want('idle')

    // Apply transform with Disney secondary motion.
    const g = group.current
    if (g) {
      g.position.copy(pos.current)
      g.rotation.y = heading.current
      // Lean into a forward run a touch (anticipation/secondary action).
      const targetLean = fwd > 0 && grounded.current ? 0.1 : 0
      g.rotation.x += (targetLean - g.rotation.x) * 0.12
      // Squash & stretch on landing: wider + shorter, then settle.
      const amt = squash.current
      g.scale.set(1 + amt * 0.25, 1 - amt * 0.22, 1 + amt * 0.25)
    }

    // Held trigger → keep requesting shots; the gun cooldown paces the rate.
    if (holdFire.current && !paused) fireReq.current = true

    // Shooting: resolve a queued shot here where camera + clock are available.
    if (fireReq.current) {
      fireReq.current = false
      if (!paused && onFire) {
        // Muzzle sits in front of the hero, a touch to the gun-hand side.
        tmpOrigin.current.set(
          pos.current.x + tmpForward.current.x * 0.6 + tmpRight.current.x * 0.2,
          pos.current.y + 1.25,
          pos.current.z + tmpForward.current.z * 0.6 + tmpRight.current.z * 0.2,
        )
        // Fire exactly along the laser sight so bullets follow the reticle.
        // Only register a shot (recoil + sound) when a bolt actually leaves the
        // barrel — the gun's cooldown can swallow held-trigger frames.
        const didFire = onFire(tmpOrigin.current, shootDir.current)
        if (didFire !== false) {
          playShot()
          fireRef.current = state.clock.elapsedTime
        }
      }
    }

    // Share position with the rest of the scene (companion, beams, minimap).
    playerPosRef.current.copy(pos.current)
    if (headingRef) headingRef.current = heading.current

    // Publish dash state for the combat sweep + the HUD cooldown readout.
    if (dashRef) {
      const dsr = dashRef.current
      dsr.active = dashing
      dsr.x = pos.current.x
      dsr.z = pos.current.z
      dsr.radius = DASH_RADIUS
      dsr.cd01 = THREE.MathUtils.clamp(1 - (dashCdUntil.current - now) / DASH_CD, 0, 1)
      dsr.ready = now >= dashCdUntil.current
    }

    // Publish stealth state for the combat system + HUD.
    if (stealthRef) stealthRef.current.active = crouching
    if (crouching !== stealthOn.current) {
      stealthOn.current = crouching
      onStealthChange?.(crouching)
    }

    // Camera follows directly behind the aim direction (eased — slow in/out),
    // and looks at a point AHEAD of the hero. This drops the hero into the lower
    // frame so the centered crosshair sits above the hero, right on target.
    camTarget.current.set(
      pos.current.x - tmpForward.current.x * CAM_DIST,
      pos.current.y + CAM_HEIGHT,
      pos.current.z - tmpForward.current.z * CAM_DIST,
    )
    camera.position.lerp(camTarget.current, 0.12)

    // Running head-bob: a tiny vertical tick synced to the stride, position
    // only, applied before lookAt so the aim stays rock-solid on target.
    const groundSpeed = dashing
      ? 0
      : moving
        ? crouching
          ? RUN_SPEED * 0.6
          : sprintHeld
            ? SPRINT_SPEED
            : RUN_SPEED
        : 0
    const bobTarget = moving && grounded.current && !dashing ? 1 : 0
    bobAmp.current += (bobTarget - bobAmp.current) * Math.min(1, dt * 8)
    bobPhase.current += dt * Math.min(16, groundSpeed * 1.3)
    camera.position.y += Math.sin(bobPhase.current) * BOB_AMP * bobAmp.current

    lookTarget.current.set(
      pos.current.x + tmpForward.current.x * AIM_AHEAD,
      pos.current.y + AIM_HEIGHT,
      pos.current.z + tmpForward.current.z * AIM_AHEAD,
    )
    camera.lookAt(lookTarget.current)

    // FOV breathing: sprint widens the lens a touch; a dash slams it open and
    // it eases back — speed you can FEEL without touching movement values.
    const sprintingNow = moving && grounded.current && !crouching && !dashing && sprintHeld
    const dashKick = dashing
      ? DASH_FOV_KICK * THREE.MathUtils.clamp((dashUntil.current - now) / DASH_TIME, 0, 1)
      : 0
    const pc = camera as THREE.PerspectiveCamera
    // Self-healing base-FOV latch: if the mount effect hasn't run yet (or a race
    // ever left the refs at 0), seed them from the live camera fov — clamped to a
    // real lens. A 0 FOV makes the projection matrix NaN and blacks out the view.
    if (baseFov.current < 1) {
      baseFov.current = pc.fov > 1 ? pc.fov : 60
      fovNow.current = baseFov.current
    }
    const targetFov = baseFov.current + (sprintingNow ? SPRINT_FOV_ADD : 0) + dashKick
    fovNow.current += (targetFov - fovNow.current) * Math.min(1, dtRaw * 6.5)
    // Guard the write too: never push an invalid FOV to the camera.
    if (fovNow.current > 1 && Math.abs(fovNow.current - pc.fov) > 0.02) {
      pc.fov = fovNow.current
      pc.updateProjectionMatrix()
    }

    // Camera shake — a quick positional jitter after impacts, then a smooth,
    // frame-rate-independent decay so it never lingers or stutters.
    if (shakeRef && shakeRef.current > 0.004) {
      const s = shakeRef.current
      camera.position.x += (Math.random() * 2 - 1) * s * 0.6
      camera.position.y += (Math.random() * 2 - 1) * s * 0.45
      camera.position.z += (Math.random() * 2 - 1) * s * 0.6
      shakeRef.current = s * Math.exp(-dtRaw * 9)
      if (shakeRef.current < 0.004) shakeRef.current = 0
    }

    // The shot travels horizontally along the hero's facing (muzzle and zombies sit
    // at ~1.2m, so a level shot reaches the horde at any range).
    shootDir.current.copy(tmpForward.current)

    // Proximity.
    let nearest: Target | null = null
    let nd = ENTER_RADIUS
    for (const t of targets) {
      const d = Math.hypot(t.x - pos.current.x, t.z - pos.current.z)
      if (d < nd) {
        nd = d
        nearest = t
      }
    }
    const id = nearest?.key ?? null
    if (id !== lastNearby.current) {
      lastNearby.current = id
      onNearbyChange(nearest)
    }
  })

  return (
    <>
      <group ref={group}>
        <Avatar animRef={animRef} accent={accent} fireRef={fireRef} slashRef={slashRef} />
      </group>
      {/* world-space dust: footfalls + landings kick up pooled instanced puffs */}
      <FootDust playerPosRef={playerPosRef} animRef={animRef} />
    </>
  )
}

// Memoized so the frequent HUD-driven re-renders of the overworld page don't
// reconcile the controller + hero rig. All changing inputs (paused, targets,
// faceTarget) arrive as props with stable identities.
export const ThirdPersonController = memo(ThirdPersonControllerImpl)
