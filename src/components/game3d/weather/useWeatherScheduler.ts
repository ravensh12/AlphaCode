import { useEffect, useMemo, useRef, useState } from 'react'
import { SIM } from '../simulation'
import { setRainLevel } from '../../../lib/soundFx'
import { WeatherSchedule } from './weatherCore'

/* ============================================================================
   Phase 2 — page half of the weather system. Owns the gameplay weather clock
   (an interval, NOT the render loop), forwards the schedule's rain target to
   the SimulationDriver through a ref, mirrors a coarse `raining` flag into
   React state for HUD use, and drives the rain audio bed off the eased
   SIM.rain value so sound and visuals always swell together.

   The clock only advances while `pausedRef.current` is false — overlays
   (intro, milestones, death, the finale) freeze weather exactly like they
   freeze the day/night cycle, so it can never rain on the finale.
   ========================================================================== */

const TICK_MS = 250

export interface WeatherHandle {
  /** Eased-target input for `<SimulationDriver rainTargetRef>`. */
  rainTargetRef: React.MutableRefObject<number>
  /** True while a front is active (HUD-friendly, changes rarely). */
  raining: boolean
}

export function useWeatherScheduler({
  enabled,
  pausedRef,
}: {
  /** LOW tier disables scheduling entirely — SIM.rain stays 0. */
  enabled: boolean
  /** Blocks the weather clock while any blocking overlay is up. */
  pausedRef: React.MutableRefObject<boolean>
}): WeatherHandle {
  const rainTargetRef = useRef(0)
  const [raining, setRaining] = useState(false)

  // One deterministic schedule per page mount; seeded off the mount time so
  // sessions differ while tests can construct WeatherSchedule directly.
  const schedule = useMemo(() => new WeatherSchedule(Date.now()), [])

  useEffect(() => {
    if (!enabled) {
      rainTargetRef.current = 0
      return
    }
    let clock = 0
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      // Clamp big gaps (background tab) so storms don't fast-forward.
      const dt = Math.min(1, (now - last) / 1000)
      last = now
      if (!pausedRef.current) clock += dt
      const state = schedule.at(clock)
      rainTargetRef.current = pausedRef.current ? 0 : state.rainTarget
      setRaining((prev) => (prev !== state.raining ? state.raining : prev))
      // Audio follows the EASED uniform (written by SimulationDriver), so the
      // bed swells with the visuals rather than snapping with the target.
      setRainLevel(SIM.rain.value)
    }, TICK_MS)
    return () => {
      window.clearInterval(id)
      rainTargetRef.current = 0
      SIM.rain.value = 0
      setRainLevel(0)
    }
  }, [enabled, pausedRef, schedule])

  return { rainTargetRef, raining }
}
