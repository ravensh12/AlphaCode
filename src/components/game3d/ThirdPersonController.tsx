import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Avatar, type AvatarAnim } from './Avatar'
import { useKeys } from './useKeys'
import { playShot } from '../../lib/soundFx'
import { GROUND_HALF, START_3D, VAULT_CLEAR_TOP, collidersNear } from './layout'
import { radialGlowTexture } from './proceduralTextures'
import type { World } from '../../content/adventure'
import type { CityTargetKind } from './city/interactables'
import {
  hoverboardTargetSpeed,
  stepHoverboardSpeed,
  type HoverboardPose,
} from './city/hoverboardCore'

/**
 * The city interactables registry emits a structural superset of this shape
 * (`CityTarget`), so `buildCityInteractables(...).map(i => i.target)` feeds
 * straight in. Legacy 'lesson'/'boss' targets keep working: without a radius
 * they use ENTER_RADIUS, without a priority they tie-break by distance alone.
 */
export type Target = {
  key: string
  world: World
  kind: CityTargetKind
  x: number
  z: number
  locked: boolean
  cleared: boolean
  /** For split lessons / dojo gates: which checkpoint part (0-based). */
  part?: number
  /** Interaction radius in metres (defaults to ENTER_RADIUS). */
  radius?: number
  /** Higher wins when several targets overlap; ties go to the nearest. */
  priority?: number
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

// GLOBAL PACE PASS (owner directive): every ground speed below is the old
// value × 0.88 — a uniform ~12% slowdown. The zombie sim (CombatSystem
// ZOMBIE_SPEED + its tier/intensity ramp) is scaled by the SAME factor so
// every chase matchup (shambler vs walk, runner vs run, night horde vs
// sprint) keeps its exact relative speed.
const RUN_SPEED = 7.04 // was 8
const SPRINT_SPEED = 13.2 // was 15
// Turn / follow easing expressed as CONTINUOUS rates (per second), applied via
// 1 - exp(-rate·dt) so the ease covers the same ground in real time whether the
// frame rate is 30 or 120. Fixed per-frame factors (the old 0.3 / 0.12) made the
// hero snap-turn and the camera lag/jerk exactly when the frame rate wobbled.
const HEADING_RATE = 21 // hero turns to face the aim direction (~0.3 @ 60fps)
const LEAN_RATE = 8 // run-lean settle (~0.12 @ 60fps)
const CAM_FOLLOW_RATE = 7.7 // camera chases the follow point (~0.12 @ 60fps)
const TURN_RATE = 2.5 // rad/s when turning with the arrow keys
const CAM_DIST = 5.2
const CAM_HEIGHT = 2.7
const AIM_AHEAD = 14 // look far ahead so the view is near-level and bullets carry
const AIM_HEIGHT = 1.7 // aim-point height; keeps the hero low in frame
// Jump arc: asymmetric gravity (floatier rise, heavy fall) — the classic
// action-game curve. Old symmetric -21 read as "moon jump": too slow up, too
// slow down, and the body hung at the apex. Rise 7.8/24 ≈ 0.33s to a 1.27m
// apex, fall √(2·1.27/40) ≈ 0.25s — ~0.6s total airtime with real weight.
const JUMP_V = 7.8
const GRAVITY_RISE = -24
const GRAVITY_FALL = -40
// Console-feel garnish on that curve:
// - a brief low-gravity window right at the apex (the "hang" every platformer
//   fakes) so the top of the arc breathes instead of ticking over,
// - releasing Space early trims the rise for a short hop (variable height),
// - a press in the last ~0.12s of a fall is BUFFERED and fires on touchdown
//   instead of being swallowed — chained jumps come out the frame you land.
const APEX_SPEED = 1.6 // |velY| below this counts as the apex hang window
const APEX_GRAVITY_MUL = 0.55
const JUMP_CUT_MUL = 0.45 // early release keeps 45% of the remaining rise
// Floor on the trimmed rise. A quick TAP releases Space before the takeoff
// frame even runs, so the cut used to land on the same frame as the launch and
// squashed the whole jump to a ~0.26m blip — "Space does nothing". Never trim
// below ~0.56m of apex: taps read as a real hop, holds still get full height.
const JUMP_CUT_MIN_V = 5.2
const JUMP_BUFFER = 0.12 // seconds a mid-air Space press waits for the ground
// Contextual PARKOUR HURDLE (the headline maneuver): Space while facing a LOW
// obstacle (a parked car, bench, planter — small collider footprint) turns
// the jump into a committed speed-vault that carries the hero over it. The
// rig plays the Meshy Parkour Vault 2 clip (lateral speed-vault); the
// controller OWNS the whole carry:
//   - the probe reaches further the faster you run (sprint catches the car
//     earlier, so the plant lines up with the bumper instead of the roof),
//   - while airborne the vault direction + speed are LOCKED (launch speed +
//     VAULT_DRIVE) — no mid-air steering into the car's side, no jump-cut,
//   - collision pushout is skipped for the airtime, and the locked carry
//     guarantees the far edge clears before touchdown (no clipping).
const VAULT_PROBE_BASE = 1.3 // metres ahead the probe starts looking
// 0.13 → 0.15 with the pace pass: the slower sprint (13.2) must still probe
// ~3.25m ahead so the plant keeps lining up with the bumper, not the roof.
const VAULT_PROBE_PER_MS = 0.15 // extra probe metres per m/s of ground speed
const VAULT_MAX_HALF = 3 // collider half-extent ceiling that counts as "low"
// 4.5 → 4.0 keeps the TOTAL vault carry (launch speed + drive) at exactly
// 0.88× its old reach across the whole launch-speed band — the arc still
// clears a car's far edge (airtime is unchanged; VAULT_V untouched).
const VAULT_DRIVE = 4.0 // forward m/s added on top of the locked launch speed
// The hurdle launches HIGHER than a plain jump (apex ~2.0m vs 1.27m): the
// body must visibly sail ABOVE a car/van roof — at plain jump height the feet
// pass through the sheet metal — and the longer airtime (~0.8s) gives the
// speed-vault clip room to play its plant → sail → running-recovery phases.
const VAULT_V = 9.8
const SQUASH_RATE = 9 // landing squash recovers in ~0.11s (was ~0.25s)
const LOOK_Y_RATE = 9 // vertical camera/look smoothing through the arc
const BOUND = GROUND_HALF - 8
const ENTER_RADIUS = 7.5
const BODY_R = 0.7 // hero collision radius vs. building footprints

// --- Blade dash: a precise dodge-lunge that cuts what you pass THROUGH ------
// Tuned as a skill tool, not a panic button: a real cooldown means you must time
// it to dodge a slam/acid or carve an escape lane — not spam it to nuke packs.
const DASH_SPEED = 26.4 // m/s burst while dashing (was 30 — global pace pass)
const DASH_TIME = 0.32 // seconds the lunge + i-frames last
const DASH_CD = 2.4 // meaningful cooldown — the dash is a committed decision
const DASH_RADIUS = 2.8 // tighter sweep — cuts what you dash through, not the whole field

// --- Hoverboard ride -------------------------------------------------------
// While mounted the hero stands on the board deck; speeds come from
// hoverboardCore (cruise 15 → boost 24 m/s with asymmetric accel/brake), and
// jump / dash / crouch are parked — the board is pure traversal.
const RIDE_DECK_HEIGHT = 0.42 // hero foot height on the deck (m)
const RIDE_GLIDE_EPSILON = 0.05 // below this ground speed the board is "still"

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
    if (
      grounded &&
      (a === 'run' ||
        a === 'walk' ||
        a === 'sprint' ||
        a === 'dash' ||
        a === 'strafeL' ||
        a === 'strafeR' ||
        a === 'back')
    ) {
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

/** Slide the hero out of any building/car footprint (circle vs. AABB).
 *  `tallOnly` runs during vault airtime: hurdle-height colliders are skipped
 *  (the pushout would shove the hero off the locked arc), but anything
 *  taller than the arc stays a WALL — without this, a vault triggered off a
 *  low prop carried the hero clean through the kiosk/shelter behind it. */
function resolveCollisions(p: THREE.Vector3, tallOnly = false) {
  // Only the colliders bucketed into the hero's grid cell can possibly overlap,
  // so this is a handful of tests per frame instead of the full ~2.8k scan.
  const near = collidersNear(p.x, p.z)
  for (let i = 0; i < near.length; i++) {
    const c = near[i]
    // Mid-vault wall test: explicit tall props by height; height-less
    // colliders (buildings, quest boxes, landmarks) by footprint — anything
    // too big to be a hurdle target is a wall.
    if (tallOnly) {
      const wall =
        c.top !== undefined
          ? c.top > VAULT_CLEAR_TOP
          : Math.max(c.hw, c.hd) > VAULT_MAX_HALF
      if (!wall) continue
    }
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
  rideRef,
  hoverboardPoseRef,
  deadRef,
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
  /** Hoverboard mount flag — the page toggles it, this controller reads it. */
  rideRef?: MutableRefObject<{ mounted: boolean }>
  /** While mounted, the board pose is written here every frame (never state). */
  hoverboardPoseRef?: MutableRefObject<HoverboardPose>
  /** PRESENTATION-ONLY death flag: while true, the rig plays its collapse and
   *  holds the body on the ground. The page owns the actual death/respawn
   *  logic (hearts, overlay, `paused`) — this only routes the visual. Pages
   *  wire it as `deadRef={deadRef}` alongside their existing pause-on-death. */
  deadRef?: MutableRefObject<boolean>
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
  const jumpCutReq = useRef(false) // Space released → trim the rise (short hop)
  const jumpBufUntil = useRef(-10) // clock time a buffered mid-air press expires
  const squash = useRef(0) // landing squash timer
  const vaulting = useRef(false) // mid-vault: locked carry + collision skip
  const vaultDir = useRef(new THREE.Vector3(0, 0, 1))
  const vaultSpeed = useRef(0) // locked ground speed carried through the vault
  // Ground speed measured last frame (m/s) — sizes the vault probe + carry.
  const prevXZ = useRef(new THREE.Vector3())
  const groundSpd = useRef(0)
  // Takeoff counter (same ref pattern as fireRef/slashRef): bumped on every
  // launch so the Avatar re-arms its airborne one-shot even on buffered
  // chained hops, where the anim state never leaves 'jump'.
  const jumpSeqRef = useRef(0)
  const lookY = useRef(AIM_HEIGHT) // smoothed vertical look point through the arc
  const lastNearby = useRef<string | null>(null)

  // Crouch / lay-low (stealth): held key. While down the hero moves slowly and
  // the horde loses its lock on you (handled in CombatSystem via stealthRef).
  const crouchHeld = useRef(false)
  const stealthOn = useRef(false)

  // Turn-in-place state (0 = not turning, 1 = left, -1 = right) with
  // hysteresis so a stationary aim drag plays the lean without flickering.
  const turnDir = useRef(0)

  // Blade dash.
  const dashReq = useRef(false)
  const dashUntil = useRef(-10) // clock time the lunge ends
  const dashCdUntil = useRef(-10) // clock time the dash is ready again
  const dashDir = useRef(new THREE.Vector3(0, 0, 1))
  const slashRef = useRef(-10) // clock time the most recent slash started (drives the sword)

  // Hoverboard ride state: integrated ground speed, the glide direction the
  // board keeps between inputs, and an edge detector for mount/dismount.
  const boardSpeed = useRef(0)
  const boardDir = useRef(new THREE.Vector3(0, 0, 1))
  const wasRiding = useRef(false)

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
    // Losing focus mid-drag (alt-tab, OS switcher) never delivers a pointerup,
    // so the hero used to keep orbiting + auto-firing after you came back.
    // Mirror useKeys' blur reset so held pointer state can't get stuck.
    function blur() {
      dragging = false
      holdFire.current = false
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('blur', blur)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('blur', blur)
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
    // Alt-tab / OS switch while holding F never delivers a keyup — clear the
    // held trigger on blur so the hero doesn't auto-fire forever on return.
    function blur() {
      holdFire.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // Jump key (space) — separate so it doesn't repeat-fire. Release trims the
  // rise (variable-height short hop, resolved in the frame loop).
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !e.repeat && !paused) {
        jumpReq.current = true
        e.preventDefault()
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === 'Space') jumpCutReq.current = true
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
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
    // Held-crouch would otherwise stick "on" after an alt-tab (no keyup fires
    // when the window is unfocused) — the hero stayed slow + in stealth forever.
    function blur() {
      crouchHeld.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', blur)
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

    // Hoverboard mount state (page-owned flag, read every frame). Mount and
    // dismount edges reset the speed curve and snap the hero on/off the deck.
    const riding = rideRef?.current.mounted === true
    if (riding !== wasRiding.current) {
      wasRiding.current = riding
      boardSpeed.current = 0
      if (riding) {
        boardDir.current.set(Math.sin(heading.current), 0, Math.cos(heading.current))
        pos.current.y = RIDE_DECK_HEIGHT
        velY.current = 0
        grounded.current = true
      } else {
        pos.current.y = 0
      }
    }

    // Left/right arrows turn the hero (so the game is fully playable on arrows
    // alone); mouse-drag also turns. Up/down move forward/back.
    const turn = (k['arrowright'] ? 1 : 0) - (k['arrowleft'] ? 1 : 0)
    if (turn !== 0) camYaw.current -= turn * TURN_RATE * dt

    // Camera-relative basis from the orbit yaw.
    // forward = where the camera (and crosshair) points; right = screen-right.
    tmpForward.current.set(Math.sin(camYaw.current), 0, Math.cos(camYaw.current))
    tmpRight.current.set(-tmpForward.current.z, 0, tmpForward.current.x)

    // Aim the next shot along THIS frame's facing (tmpForward is already unit
    // length + horizontal). Publishing shootDir at frame END lagged every shot
    // by one frame — the fire block below runs earlier in the same frame, so it
    // used to read the PREVIOUS frame's aim and bullets trailed the crosshair
    // during a fast aim drag. Set it up-front so click/hold fires exactly where
    // the reticle points, with the muzzle origin (also tmpForward) in agreement.
    shootDir.current.copy(tmpForward.current)

    // --- Blade dash: a fast forward lunge with i-frames that slices the horde.
    // Parked while riding — the board is traversal, the sword stays sheathed.
    const now = state.clock.elapsedTime
    let dashing = now < dashUntil.current
    if (dashReq.current) {
      dashReq.current = false
      if (!dashing && now >= dashCdUntil.current && !paused && !riding) {
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
    // Not available on the board — you can't lay low at 15 m/s.
    const crouching = crouchHeld.current && !dashing && !paused && !riding

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
    } else if (vaulting.current && !grounded.current) {
      // Committed parkour hurdle: the locked launch speed + drive carries the
      // hero over the obstacle. Input steering is parked for the airtime so
      // the arc can't be bent into the obstacle's side mid-vault.
      const vs = (vaultSpeed.current + VAULT_DRIVE) * dt
      pos.current.x += vaultDir.current.x * vs
      pos.current.z += vaultDir.current.z * vs
      moving = true
    } else if (riding) {
      // Hoverboard traversal: integrate the core's speed curve (cruise 15,
      // boost 24 via the sprint key, exponential accel/brake) and glide along
      // the last commanded direction — releasing the stick coasts to a stop.
      tmpMove.current.set(0, 0, 0)
      tmpMove.current.addScaledVector(tmpForward.current, fwd)
      tmpMove.current.addScaledVector(tmpRight.current, str)
      const steering = tmpMove.current.lengthSq() > 0.001
      if (steering) boardDir.current.copy(tmpMove.current).normalize()
      const target = paused
        ? 0
        : hoverboardTargetSpeed({ moving: steering, boosting: sprintHeld })
      boardSpeed.current = stepHoverboardSpeed(boardSpeed.current, target, dt)
      moving = boardSpeed.current > RIDE_GLIDE_EPSILON
      if (moving) {
        const step = boardSpeed.current * dt
        pos.current.x += boardDir.current.x * step
        pos.current.z += boardDir.current.z * step
      }
      pos.current.y = RIDE_DECK_HEIGHT
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

    // Facing: snap to the lunge direction while dashing, LOCK to the vault
    // direction for the hurdle's airtime (a camera drag mid-vault must not
    // twist the planted body), otherwise ease toward the camera aim.
    if (dashing) {
      heading.current = Math.atan2(dashDir.current.x, dashDir.current.z)
    } else if (vaulting.current && !grounded.current) {
      heading.current = Math.atan2(vaultDir.current.x, vaultDir.current.z)
    } else {
      let hd = camYaw.current - heading.current
      hd = Math.atan2(Math.sin(hd), Math.cos(hd))
      heading.current += hd * (1 - Math.exp(-HEADING_RATE * dt))
    }

    // Measured ground speed (m/s, eased) — sizes the vault probe + carry so a
    // sprint hurdle reaches further than a standing one.
    if (dt > 0) {
      const gs = Math.min(
        SPRINT_SPEED,
        Math.hypot(pos.current.x - prevXZ.current.x, pos.current.z - prevXZ.current.z) / dt,
      )
      groundSpd.current += (gs - groundSpd.current) * Math.min(1, dt * 12)
    }
    prevXZ.current.copy(pos.current)

    // Block movement through buildings / cars. A vault sails OVER its car —
    // the pushout would otherwise shove the hero off the arc mid-air — but
    // wall-height obstacles keep blocking even mid-vault.
    if (moving) resolveCollisions(pos.current, vaulting.current)

    // Clamp to map.
    const r = Math.hypot(pos.current.x, pos.current.z)
    if (r > BOUND) {
      pos.current.x *= BOUND / r
      pos.current.z *= BOUND / r
    }

    // Jump + gravity. The board hovers at a fixed deck height — jump requests
    // are swallowed while riding (dismount first, then jump).
    if (jumpReq.current) {
      jumpReq.current = false
      if (grounded.current && !riding) {
        velY.current = JUMP_V
        grounded.current = false
        squash.current = 0 // takeoff cancels any leftover landing squash
        jumpSeqRef.current++
        // Contextual parkour hurdle: a LOW obstacle (car-sized collider)
        // ahead turns this jump into a vault over it. The probe reaches
        // further with speed and samples two points along the facing so a
        // sprint at a car's corner still catches.
        const fx = Math.sin(heading.current)
        const fz = Math.cos(heading.current)
        const probeDist = VAULT_PROBE_BASE + groundSpd.current * VAULT_PROBE_PER_MS
        outer: for (const frac of [0.55, 1]) {
          const probeX = pos.current.x + fx * probeDist * frac
          const probeZ = pos.current.z + fz * probeDist * frac
          for (const c of collidersNear(probeX, probeZ)) {
            if (c.hw > VAULT_MAX_HALF || c.hd > VAULT_MAX_HALF) continue
            // Streamed props declare their height: anything taller than the
            // vault arc (kiosks, shelters, metro entrances, scaffolds…) is a
            // WALL, not a hurdle — without this the committed vault carry
            // (pushout disabled mid-air) no-clips straight through them.
            if (c.top !== undefined && c.top > VAULT_CLEAR_TOP) continue
            if (Math.abs(probeX - c.x) <= c.hw + 0.4 && Math.abs(probeZ - c.z) <= c.hd + 0.4) {
              vaulting.current = true
              vaultDir.current.set(fx, 0, fz)
              velY.current = VAULT_V // higher, longer arc than a plain jump
              // Lock the carry: at least a solid run, at most the sprint,
              // whatever the feet were actually doing at the plant.
              vaultSpeed.current = THREE.MathUtils.clamp(
                groundSpd.current,
                RUN_SPEED * 0.9,
                SPRINT_SPEED,
              )
              break outer
            }
          }
        }
      } else if (!riding) {
        // Airborne press: buffer it so a jump queued just before touchdown
        // fires the frame the feet hit instead of being eaten.
        jumpBufUntil.current = now + JUMP_BUFFER
      }
    }
    if (!grounded.current) {
      // Short hop: releasing Space during the rise trims the remaining lift
      // (floored so a same-frame tap still launches a visible hop). A vault
      // is COMMITTED — no jump-cut, or a quick tap would drop the hero onto
      // the car roof mid-plant.
      if (jumpCutReq.current && velY.current > JUMP_CUT_MIN_V && !vaulting.current) {
        velY.current = Math.max(velY.current * JUMP_CUT_MUL, JUMP_CUT_MIN_V)
      }
      // Apex hang: gravity relaxes for the beat where velY crosses zero, so
      // the top of the arc floats for a few frames before the heavy fall.
      const baseG = velY.current > 0 ? GRAVITY_RISE : GRAVITY_FALL
      const g = Math.abs(velY.current) < APEX_SPEED ? baseG * APEX_GRAVITY_MUL : baseG
      velY.current += g * dt
      pos.current.y += velY.current * dt
      // (The vault's forward carry lives in the movement block above — the
      // whole ground velocity is locked to the vault, not layered on input.)
      if (pos.current.y <= 0) {
        pos.current.y = 0
        grounded.current = true
        velY.current = 0
        vaulting.current = false
        squash.current = 1 // trigger landing squash
        // Touchdown micro-shake (shared channel — the decay below handles it).
        if (shakeRef) shakeRef.current = Math.max(shakeRef.current, LAND_SHAKE)
        // Fire a buffered jump the same frame — chained hops feel instant.
        if (now < jumpBufUntil.current && !riding) {
          jumpBufUntil.current = -10
          velY.current = JUMP_V
          grounded.current = false
          squash.current = 0
          jumpSeqRef.current++
        }
      }
    }
    jumpCutReq.current = false
    if (squash.current > 0) squash.current = Math.max(0, squash.current - dt * SQUASH_RATE)

    // Animation state. Riding reads as a calm stand — the board sells the
    // motion (tilt/trail/dust) so the rig stays planted on the deck.
    // Grounded movement picks the DIRECTIONAL cycle: backpedal and lateral
    // strafes get their own clips (phase-2 soldier-anims set) so the feet
    // agree with the travel direction instead of jogging forward everywhere.
    if (riding) want('idle')
    else if (dashing) want('dash')
    else if (!grounded.current) want(vaulting.current ? 'vault' : 'jump')
    else if (crouching) want('crouch')
    else if (moving) {
      turnDir.current = 0
      if (fwd < -0.25 && Math.abs(fwd) >= Math.abs(str)) want('back')
      else if (Math.abs(str) > Math.abs(fwd) + 0.05) want(str > 0 ? 'strafeR' : 'strafeL')
      else want(sprintHeld ? 'sprint' : 'run')
    } else {
      // Stationary: if the aim yaw is still swinging to catch the camera,
      // play the turn-in-place lean. The CLIPS carry lean only — the actual
      // yaw is driven by the heading ease above, exactly as before.
      let herr = camYaw.current - heading.current
      herr = Math.atan2(Math.sin(herr), Math.cos(herr))
      if (turnDir.current === 0) {
        if (Math.abs(herr) > 0.55) turnDir.current = herr > 0 ? 1 : -1
      } else if (Math.abs(herr) < 0.15) {
        turnDir.current = 0
      }
      if (turnDir.current !== 0) want(turnDir.current > 0 ? 'turnL' : 'turnR')
      else want('idle')
    }
    // Death presentation outranks everything: the page pauses input on death
    // already, so movement is parked — this pins the rig on its collapse
    // instead of the idle breathe the pause used to leave it in.
    // Dev-only QA seam (window.__qaDead): scripted probes flip it to review
    // the collapse without staging a real death. Guarded by DEV — never prod.
    if (
      deadRef?.current ||
      (import.meta.env.DEV && (window as unknown as { __qaDead?: boolean }).__qaDead === true)
    ) {
      want('death')
    }

    // Apply transform with Disney secondary motion.
    const g = group.current
    if (g) {
      g.position.copy(pos.current)
      g.rotation.y = heading.current
      // Lean into a forward run a touch (anticipation/secondary action).
      const targetLean = fwd > 0 && grounded.current ? 0.1 : 0
      g.rotation.x += (targetLean - g.rotation.x) * (1 - Math.exp(-LEAN_RATE * dt))
      // Squash & stretch: landing squashes wide + short; in the air the body
      // stretches with vertical speed (taller on the rise, settling at apex).
      const amt = squash.current
      const stretch = grounded.current
        ? 0
        : THREE.MathUtils.clamp(velY.current * 0.012, -0.05, 0.08)
      g.scale.set(
        1 + amt * 0.25 - stretch * 0.5,
        1 - amt * 0.22 + stretch,
        1 + amt * 0.25 - stretch * 0.5,
      )
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

    // Publish the hoverboard pose while mounted (the board visual reads it —
    // pose.y is the ground line, the deck offset lives in the component).
    if (riding && hoverboardPoseRef) {
      const pose = hoverboardPoseRef.current
      pose.x = pos.current.x
      pose.y = 0
      pose.z = pos.current.z
      pose.yaw = heading.current
      pose.speed = boardSpeed.current
    }

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
    camera.position.lerp(camTarget.current, 1 - Math.exp(-CAM_FOLLOW_RATE * dt))

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
    // No stride bob while hovering — the board glides, it doesn't step.
    const bobTarget = moving && grounded.current && !dashing && !riding ? 1 : 0
    bobAmp.current += (bobTarget - bobAmp.current) * Math.min(1, dt * 8)
    bobPhase.current += dt * Math.min(16, groundSpeed * 1.3)
    camera.position.y += Math.sin(bobPhase.current) * BOB_AMP * bobAmp.current

    // Vertical look point is EASED, not snapped to the hero's y: during a jump
    // the raw value ticks with every integration step, which pitched the whole
    // frame rigidly up and down the arc. The horizontal aim stays exact.
    lookY.current += (pos.current.y + AIM_HEIGHT - lookY.current) * (1 - Math.exp(-LOOK_Y_RATE * dt))
    lookTarget.current.set(
      pos.current.x + tmpForward.current.x * AIM_AHEAD,
      lookY.current,
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

    // (shootDir is published up-front, right after the aim basis is built, so a
    // shot fired this frame follows the current-frame reticle — see above.)

    // Proximity — the city tie-break contract (interactables.ts): inside the
    // target's own radius, highest priority wins, nearest breaks ties. Legacy
    // targets (no radius/priority) behave exactly as before.
    let nearest: Target | null = null
    let bestPriority = -Infinity
    let bestDist = Infinity
    for (const t of targets) {
      const d = Math.hypot(t.x - pos.current.x, t.z - pos.current.z)
      if (d > (t.radius ?? ENTER_RADIUS)) continue
      const priority = t.priority ?? 0
      if (priority > bestPriority || (priority === bestPriority && d < bestDist)) {
        nearest = t
        bestPriority = priority
        bestDist = d
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
        <Avatar animRef={animRef} accent={accent} fireRef={fireRef} slashRef={slashRef} jumpSeqRef={jumpSeqRef} />
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
