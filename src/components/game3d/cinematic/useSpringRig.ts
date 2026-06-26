import * as THREE from 'three'

/* ============================================================================
   Procedural animation helpers — no external spring libs.

   Springs give cheap, framerate-independent secondary motion (a head lagging
   behind a turn, a weapon settling after a swing). The CameraDirector layers
   smoothed framing + impact kicks + shake on top of state.camera. Everything
   is meant to be stepped from inside useFrame with the real delta.
   ========================================================================== */

/** A critically-dampable 1D spring integrator. */
export interface Spring {
  value: number
  velocity: number
  /** Retarget the spring; it will ease toward `target` on subsequent steps. */
  set(target: number): void
  /** Advance by `dt` seconds and return the new value. */
  step(dt: number): number
}

/**
 * Make a 1D spring. Defaults to critical damping (no overshoot) derived from
 * stiffness; pass an explicit `damping` for a bouncier or sloppier feel.
 */
export function makeSpring(initial = 0, stiffness = 120, damping?: number): Spring {
  let target = initial
  const d = damping ?? 2 * Math.sqrt(stiffness)
  const s: Spring = {
    value: initial,
    velocity: 0,
    set(t: number) {
      target = t
    },
    step(dt: number): number {
      // Clamp dt so a long frame (tab refocus) can't explode the integrator.
      const h = Math.min(dt, 0.05)
      const a = -stiffness * (s.value - target) - d * s.velocity
      s.velocity += a * h
      s.value += s.velocity * h
      return s.value
    },
  }
  return s
}

/** A Vector3 spring — three independent critically-dampable axes. */
export interface Spring3 {
  value: THREE.Vector3
  velocity: THREE.Vector3
  set(target: THREE.Vector3): void
  setScalar(x: number, y: number, z: number): void
  /** Advance by `dt` seconds and return the (mutated) value vector. */
  step(dt: number): THREE.Vector3
}

export function makeSpring3(
  initial?: THREE.Vector3,
  stiffness = 120,
  damping?: number,
): Spring3 {
  const target = (initial ? initial.clone() : new THREE.Vector3())
  const d = damping ?? 2 * Math.sqrt(stiffness)
  const value = initial ? initial.clone() : new THREE.Vector3()
  const velocity = new THREE.Vector3()
  const s: Spring3 = {
    value,
    velocity,
    set(t: THREE.Vector3) {
      target.copy(t)
    },
    setScalar(x: number, y: number, z: number) {
      target.set(x, y, z)
    },
    step(dt: number): THREE.Vector3 {
      const h = Math.min(dt, 0.05)
      // a = -k*(x-target) - d*v, integrated semi-implicitly per axis.
      velocity.x += (-stiffness * (value.x - target.x) - d * velocity.x) * h
      velocity.y += (-stiffness * (value.y - target.y) - d * velocity.y) * h
      velocity.z += (-stiffness * (value.z - target.z) - d * velocity.z) * h
      value.addScaledVector(velocity, h)
      return value
    },
  }
  return s
}

/* -------------------------------------------------------------------------- */

/**
 * Drives `state.camera` toward framed shots with smoothing, plus impact kicks
 * (`punch`), trauma `shake`, and a `timeScale` for slow-mo. Construct once
 * (e.g. in a ref) and call {@link CameraDirector.frame} every frame from inside
 * useFrame.
 *
 *   const dir = useRef(new CameraDirector()).current
 *   useFrame((state, dt) => {
 *     dir.attach(state.camera)
 *     const sdt = dir.scaledDelta(dt)   // honour slow-mo for the sim
 *     dir.frame(targetVec, fromVec, dt) // framing uses REAL dt
 *   })
 *   // on a hit: dir.punch(0.8); dir.shake(0.4)
 */
export class CameraDirector {
  private cam: THREE.Camera | null
  private shakeAmt = 0
  private punchAmt = 0
  /** 1 = real time, <1 = slow motion. Read via {@link scaledDelta}. */
  timeScale = 1
  /** Position follow smoothing (0..1 per frame at 60fps). */
  followLerp = 0.3
  /** Look-at target smoothing. */
  lookLerp = 0.4

  private readonly _from = new THREE.Vector3()
  private readonly _look = new THREE.Vector3()
  private readonly _kick = new THREE.Vector3()
  private _lookInit = false

  constructor(cam?: THREE.Camera) {
    this.cam = cam ?? null
  }

  /** Point the director at a camera (cheap; call each frame if convenient). */
  attach(cam: THREE.Camera): void {
    this.cam = cam
  }

  /** Set the simulation time scale (e.g. 0.25 for a slow-mo finisher). */
  setTimeScale(scale: number): void {
    this.timeScale = scale
  }

  /** Convert a real delta into a slow-mo-aware delta for sim stepping. */
  scaledDelta(dt: number): number {
    return dt * this.timeScale
  }

  /** Add an impulsive dolly/recoil kick (accumulates; decays in frame()). */
  punch(intensity: number): void {
    this.punchAmt = Math.max(this.punchAmt, intensity)
  }

  /** Add screen-shake trauma (accumulates; decays in frame()). */
  shake(intensity: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, intensity)
  }

  /**
   * Smoothly move the camera toward `fromPos`, look toward `targetPos`, and
   * apply any pending punch/shake. Framing uses the REAL delta so the camera
   * keeps tracking even during slow-mo. Returns nothing; mutates the camera.
   */
  frame(targetPos: THREE.Vector3, fromPos: THREE.Vector3, dt: number): void {
    const cam = this.cam
    if (!cam) return
    const h = Math.min(dt, 0.05)
    const fLerp = 1 - Math.pow(1 - this.followLerp, h * 60)
    const lLerp = 1 - Math.pow(1 - this.lookLerp, h * 60)

    this._from.copy(fromPos)

    // Impact kick pulls the camera slightly toward the target (punch-in).
    if (this.punchAmt > 0.0001) {
      this._kick.copy(targetPos).sub(this._from).normalize().multiplyScalar(this.punchAmt * 0.9)
      this._from.add(this._kick)
      this.punchAmt *= Math.pow(0.0025, h) // ~fast decay, framerate independent
      if (this.punchAmt < 0.01) this.punchAmt = 0
    }

    cam.position.lerp(this._from, fLerp)

    // Trauma shake — random positional jitter that decays each frame.
    if (this.shakeAmt > 0.0005) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt
      cam.position.z += (Math.random() - 0.5) * this.shakeAmt * 0.5
      this.shakeAmt *= Math.pow(0.0025, h)
      if (this.shakeAmt < 0.005) this.shakeAmt = 0
    }

    if (!this._lookInit) {
      this._look.copy(targetPos)
      this._lookInit = true
    } else {
      this._look.lerp(targetPos, lLerp)
    }
    cam.lookAt(this._look)
  }
}
