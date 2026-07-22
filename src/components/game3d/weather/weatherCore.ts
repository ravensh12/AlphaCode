import { SeededRandom, type SeedValue } from '../../../lib/seededRandom'

/* ============================================================================
   Phase 2 — weather scheduler core (pure, deterministic, Node-testable).

   The overworld's sky regularly breaks into a rain front: roughly every
   1–2 day/night cycles a 30–70s storm rolls through (the neon city spends
   a good ~40% of a session under rain — owner direction). This module owns all
   of the DECISIONS — when fronts start, how long they last, how the rain
   uniform eases — while the React side (useWeatherScheduler + RainSystem)
   only forwards clocks and renders.

   Time is fed in as *unpaused* gameplay seconds: the caller simply doesn't
   advance the clock while an overlay (intro, milestone, death, finale) is up,
   which both freezes storms mid-front during dialogs and guarantees the
   finale is never rained on.
   ========================================================================== */

/** One day+night cycle of the overworld loop (32s day + 18s night). */
export const CYCLE_SECONDS = 50

/** Fronts arrive roughly every 1–2 cycles ("make it rain more often" —
 *  owner direction, July 2026; was every 2.6–4.2 cycles)... */
export const MIN_GAP_CYCLES = 0.9
export const MAX_GAP_CYCLES = 2.0
/** ...and last 30–70 seconds (was 20–40): storms are events, not blinks. */
export const MIN_FRONT_SECONDS = 30
export const MAX_FRONT_SECONDS = 70

/** How long the very first session front waits — under a minute, so a normal
 *  session SEES rain early (was 1.6–3 cycles ≈ 80–150s). */
export const FIRST_FRONT_MIN_S = CYCLE_SECONDS * 0.6
export const FIRST_FRONT_MAX_S = CYCLE_SECONDS * 1.1

export interface RainFront {
  /** Gameplay-clock second this front opens. */
  start: number
  /** Seconds of rain. */
  duration: number
}

export interface WeatherState {
  /** True while inside a front (the eased SIM.rain uniform lags behind). */
  raining: boolean
  /** Rain target the driver eases toward (0 | 1). */
  rainTarget: number
  /** The active or next front (for HUD/debug). */
  front: RainFront
}

/**
 * Deterministic storm timeline. The whole schedule derives from the seed, so
 * a session's fronts are fixed at creation and tests can assert exact times.
 */
export class WeatherSchedule {
  private rng: SeededRandom
  private current: RainFront

  constructor(seed: SeedValue) {
    this.rng = new SeededRandom(`weather|${String(seed)}`)
    this.current = {
      start: lerp(FIRST_FRONT_MIN_S, FIRST_FRONT_MAX_S, this.rng.next()),
      duration: lerp(MIN_FRONT_SECONDS, MAX_FRONT_SECONDS, this.rng.next()),
    }
  }

  /**
   * Resolve the weather at gameplay second `t` (monotonic, pause-free).
   * Fronts that fully elapse roll the schedule forward deterministically.
   */
  at(t: number): WeatherState {
    while (t >= this.current.start + this.current.duration) {
      const gap = lerp(MIN_GAP_CYCLES, MAX_GAP_CYCLES, this.rng.next()) * CYCLE_SECONDS
      this.current = {
        start: this.current.start + this.current.duration + gap,
        duration: lerp(MIN_FRONT_SECONDS, MAX_FRONT_SECONDS, this.rng.next()),
      }
    }
    const raining = t >= this.current.start
    return { raining, rainTarget: raining ? 1 : 0, front: this.current }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/* ----------------------------------------------------------- rain easing -- */

/** Fronts roll in/out over ~6s; the tested twin of SimulationDriver's update. */
export const RAIN_EASE_RATE = 0.5

/**
 * One frame of the SIM.rain easing: exponential approach toward the target,
 * frame-rate independent (scaled by dt), clamped so giant dt spikes (tab
 * refocus) can never overshoot.
 */
export function easeRain(current: number, target: number, dt: number): number {
  const k = Math.min(1, dt * RAIN_EASE_RATE)
  const next = current + (target - current) * k
  return next < 0 ? 0 : next > 1 ? 1 : next
}
