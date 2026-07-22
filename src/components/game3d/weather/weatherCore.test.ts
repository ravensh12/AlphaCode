import { describe, expect, it } from 'vitest'
import {
  CYCLE_SECONDS,
  FIRST_FRONT_MAX_S,
  FIRST_FRONT_MIN_S,
  MAX_FRONT_SECONDS,
  MAX_GAP_CYCLES,
  MIN_FRONT_SECONDS,
  MIN_GAP_CYCLES,
  RAIN_EASE_RATE,
  WeatherSchedule,
  easeRain,
  type RainFront,
} from './weatherCore'

/** Collect the first `n` fronts of a schedule by scanning time forward. */
function frontsOf(seed: string | number, n: number): RainFront[] {
  const schedule = new WeatherSchedule(seed)
  const fronts: RainFront[] = []
  let t = 0
  let last: RainFront | null = null
  while (fronts.length < n) {
    const { front } = schedule.at(t)
    if (!last || front.start !== last.start) {
      fronts.push(front)
      last = front
    }
    t = front.start + front.duration + 0.001
  }
  return fronts
}

describe('WeatherSchedule determinism', () => {
  it('same seed → identical front timeline', () => {
    const a = frontsOf('seed-1', 8)
    const b = frontsOf('seed-1', 8)
    expect(a).toEqual(b)
  })

  it('different seeds → different timelines', () => {
    const a = frontsOf('seed-1', 4)
    const b = frontsOf('seed-2', 4)
    expect(a).not.toEqual(b)
  })

  it('replaying the same instance at earlier times is consistent (monotone scan)', () => {
    const schedule = new WeatherSchedule(42)
    const s10 = schedule.at(10)
    const s10b = schedule.at(10)
    expect(s10).toEqual(s10b)
  })
})

describe('WeatherSchedule shape', () => {
  it('first front lands inside the tuned early window', () => {
    for (const seed of ['a', 'b', 'c', 123, 456]) {
      const [first] = frontsOf(seed, 1)
      expect(first.start).toBeGreaterThanOrEqual(FIRST_FRONT_MIN_S)
      expect(first.start).toBeLessThanOrEqual(FIRST_FRONT_MAX_S)
    }
  })

  it('fronts and gaps stay inside the tuned frequency band', () => {
    for (const seed of ['x', 'y', 7]) {
      const fronts = frontsOf(seed, 10)
      for (let i = 0; i < fronts.length; i++) {
        expect(fronts[i].duration).toBeGreaterThanOrEqual(MIN_FRONT_SECONDS)
        expect(fronts[i].duration).toBeLessThanOrEqual(MAX_FRONT_SECONDS)
        if (i > 0) {
          const gap = fronts[i].start - (fronts[i - 1].start + fronts[i - 1].duration)
          expect(gap).toBeGreaterThanOrEqual(MIN_GAP_CYCLES * CYCLE_SECONDS)
          expect(gap).toBeLessThanOrEqual(MAX_GAP_CYCLES * CYCLE_SECONDS)
        }
      }
    }
  })

  it('reports raining exactly inside the front window', () => {
    const schedule = new WeatherSchedule('window')
    const { front } = schedule.at(0)
    expect(schedule.at(front.start - 0.01).raining).toBe(false)
    expect(schedule.at(front.start + 0.01).raining).toBe(true)
    expect(schedule.at(front.start + front.duration - 0.01).raining).toBe(true)
    const after = schedule.at(front.start + front.duration + 0.01)
    expect(after.raining).toBe(false)
    expect(after.rainTarget).toBe(0)
  })

  it('a frozen clock (overlay pause / finale) freezes the storm state', () => {
    const schedule = new WeatherSchedule('pause')
    const { front } = schedule.at(0)
    const during = front.start + 1
    // The caller simply stops advancing t while paused — repeated queries at
    // the same t stay stable, so no front can start or end under an overlay.
    expect(schedule.at(during)).toEqual(schedule.at(during))
  })
})

describe('easeRain (SIM.rain easing)', () => {
  it('approaches the target monotonically from both sides', () => {
    let v = 0
    for (let i = 0; i < 60; i++) {
      const next = easeRain(v, 1, 1 / 60)
      expect(next).toBeGreaterThanOrEqual(v)
      v = next
    }
    expect(v).toBeGreaterThan(0.3)
    for (let i = 0; i < 600; i++) v = easeRain(v, 1, 1 / 60)
    expect(v).toBeGreaterThan(0.99)
    for (let i = 0; i < 600; i++) v = easeRain(v, 0, 1 / 60)
    expect(v).toBeLessThan(0.01)
  })

  it('is frame-rate independent to first order (same wall time, similar result)', () => {
    let a = 0
    for (let i = 0; i < 120; i++) a = easeRain(a, 1, 1 / 120) // 1s at 120fps
    let b = 0
    for (let i = 0; i < 30; i++) b = easeRain(b, 1, 1 / 30) // 1s at 30fps
    expect(Math.abs(a - b)).toBeLessThan(0.06)
  })

  it('never overshoots or leaves [0,1], even with giant dt spikes', () => {
    expect(easeRain(0, 1, 100)).toBeLessThanOrEqual(1)
    expect(easeRain(1, 0, 100)).toBeGreaterThanOrEqual(0)
    expect(easeRain(0.5, 1, 100)).toBe(1)
    expect(easeRain(0.5, 0, 100)).toBe(0)
  })

  it('front roll-in takes on the order of seconds (art spec: ~6s)', () => {
    // Time to cross 0.95 at 60fps.
    let v = 0
    let frames = 0
    while (v < 0.95 && frames < 10000) {
      v = easeRain(v, 1, 1 / 60)
      frames++
    }
    const seconds = frames / 60
    expect(seconds).toBeGreaterThan(3)
    expect(seconds).toBeLessThan(10)
    // Sanity-pin the rate constant so a retune is a conscious choice.
    expect(RAIN_EASE_RATE).toBeCloseTo(0.5, 5)
  })
})
