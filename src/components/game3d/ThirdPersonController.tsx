import { memo, useEffect, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { useKeys } from './useKeys'
import { playShot } from '../../lib/soundFx'
import { GROUND_HALF, START_3D, collidersNear } from './layout'
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

// --- Blade dash: a fast forward lunge that slashes through everything ------
const DASH_SPEED = 32 // m/s burst while dashing (covers a long slicing corridor)
const DASH_TIME = 0.34 // seconds the lunge + i-frames last
const DASH_CD = 0.85 // short cooldown so the dash is a core, repeatable tool
const DASH_RADIUS = 4.8 // wide slicing sweep — clears whole packs in one pass

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
  shakeRef,
  hitstopRef,
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
  /** Camera-shake impulse channel (magnitude written by combat; decayed here). */
  shakeRef?: MutableRefObject<number>
  /** Hit-stop channel: a future clock time during which the scene runs in slow-mo. */
  hitstopRef?: MutableRefObject<number>
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
      // Hold to rapid-fire; you can still drag to aim while firing.
      holdFire.current = true
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

  useEffect(() => {
    const yaw = spawnYaw
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    camera.position.set(startX - fwd.x * CAM_DIST, CAM_HEIGHT, startZ - fwd.z * CAM_DIST)
    lookTarget.current.set(startX + fwd.x * AIM_AHEAD, AIM_HEIGHT, startZ + fwd.z * AIM_AHEAD)
    camera.lookAt(lookTarget.current)
    shootDir.current.copy(fwd)
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

    // Move along the aim direction: W/↑ forward, S/↓ backward (no spinning),
    // A/D strafe. A dash overrides this with a fast forward lunge.
    const fwd = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0)
    const str = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)

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
        const speed = (k['shift'] ? SPRINT_SPEED : RUN_SPEED) * dt
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
      }
    }
    if (squash.current > 0) squash.current = Math.max(0, squash.current - dt * 4)

    // Animation state.
    if (dashing) want('dash')
    else if (!grounded.current) want('jump')
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

    // Camera follows directly behind the aim direction (eased — slow in/out),
    // and looks at a point AHEAD of the hero. This drops the hero into the lower
    // frame so the centered crosshair sits above the hero, right on target.
    camTarget.current.set(
      pos.current.x - tmpForward.current.x * CAM_DIST,
      pos.current.y + CAM_HEIGHT,
      pos.current.z - tmpForward.current.z * CAM_DIST,
    )
    camera.position.lerp(camTarget.current, 0.12)
    lookTarget.current.set(
      pos.current.x + tmpForward.current.x * AIM_AHEAD,
      pos.current.y + AIM_HEIGHT,
      pos.current.z + tmpForward.current.z * AIM_AHEAD,
    )
    camera.lookAt(lookTarget.current)

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
    <group ref={group}>
      <Avatar animRef={animRef} accent={accent} fireRef={fireRef} slashRef={slashRef} />
    </group>
  )
}

// Memoized so the frequent HUD-driven re-renders of the overworld page don't
// reconcile the controller + hero rig. All changing inputs (paused, targets,
// faceTarget) arrive as props with stable identities.
export const ThirdPersonController = memo(ThirdPersonControllerImpl)
