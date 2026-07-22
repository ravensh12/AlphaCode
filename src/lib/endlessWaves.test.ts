import { describe, expect, it } from 'vitest'
import {
  VARIANTS,
  VAR_NORMAL,
  VAR_RUNNER,
  VAR_BRUTE,
  VAR_MUTANT,
  VAR_SPITTER,
  VAR_GLITCH,
} from '../components/game3d/zombieTypes'
import {
  ENDLESS_COUNT_CAP,
  ENDLESS_SPEED_CAP,
  pickWaveVariant,
  waveConfig,
  waveZombieHp,
} from './endlessWaves'

describe('endless siege wave escalation', () => {
  it('is deterministic and clamps degenerate wave numbers', () => {
    expect(waveConfig(3)).toEqual(waveConfig(3))
    expect(waveConfig(0)).toEqual(waveConfig(1))
    expect(waveConfig(-5)).toEqual(waveConfig(1))
    expect(waveConfig(2.9)).toEqual(waveConfig(2))
  })

  it('escalates count, speed and hp monotonically up to their caps', () => {
    for (let w = 1; w < 40; w++) {
      const a = waveConfig(w)
      const b = waveConfig(w + 1)
      expect(b.count).toBeGreaterThanOrEqual(a.count)
      expect(b.speed).toBeGreaterThanOrEqual(a.speed)
      expect(b.hpBonus).toBeGreaterThanOrEqual(a.hpBonus)
      expect(b.spawnEvery).toBeLessThanOrEqual(a.spawnEvery)
      expect(b.batch).toBeGreaterThanOrEqual(a.batch)
      expect(b.count).toBeLessThanOrEqual(ENDLESS_COUNT_CAP)
      expect(b.speed).toBeLessThanOrEqual(ENDLESS_SPEED_CAP)
    }
    expect(waveConfig(50).count).toBe(ENDLESS_COUNT_CAP)
    expect(waveConfig(50).speed).toBe(ENDLESS_SPEED_CAP)
  })

  it('phases breeds in on schedule (runner 2, spitter 3, brute 4, mutant 5, glitch 7)', () => {
    const at = (w: number) => waveConfig(w).weights
    expect(at(1)[VAR_RUNNER]).toBe(0)
    expect(at(2)[VAR_RUNNER]).toBeGreaterThan(0)
    expect(at(2)[VAR_SPITTER]).toBe(0)
    expect(at(3)[VAR_SPITTER]).toBeGreaterThan(0)
    expect(at(3)[VAR_BRUTE]).toBe(0)
    expect(at(4)[VAR_BRUTE]).toBeGreaterThan(0)
    expect(at(4)[VAR_MUTANT]).toBe(0)
    expect(at(5)[VAR_MUTANT]).toBeGreaterThan(0)
    expect(at(6)[VAR_GLITCH]).toBe(0)
    expect(at(7)[VAR_GLITCH]).toBeGreaterThan(0)
  })

  it('always keeps some baseline shamblers in the mix', () => {
    for (let w = 1; w <= 30; w++) {
      const cfg = waveConfig(w)
      expect(cfg.weights[VAR_NORMAL]).toBeGreaterThanOrEqual(3)
      expect(cfg.weights).toHaveLength(VARIANTS.length)
      for (const weight of cfg.weights) expect(weight).toBeGreaterThanOrEqual(0)
    }
  })

  it('maps rolls onto the weighted mix exhaustively and in weight order', () => {
    const cfg = waveConfig(1) // only shamblers on wave 1
    expect(pickWaveVariant(cfg, 0)).toBe(VAR_NORMAL)
    expect(pickWaveVariant(cfg, 0.99)).toBe(VAR_NORMAL)

    const later = waveConfig(8) // every breed present
    const total = later.weights.reduce((a, b) => a + b, 0)
    // Boundary sweep: every variant with weight > 0 must be reachable.
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) seen.add(pickWaveVariant(later, i / 1000))
    for (let v = 0; v < later.weights.length; v++) {
      if (later.weights[v] > 0) expect(seen).toContain(v)
    }
    // Rolls are clamped, never out of range.
    expect(pickWaveVariant(later, -1)).toBe(VAR_NORMAL)
    expect(later.weights[pickWaveVariant(later, 1)]).toBeGreaterThan(0)
    expect(later.weights[pickWaveVariant(later, 2)]).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(0)
  })

  it('scales spawn HP by wave bonus and breed multipliers', () => {
    const w1 = waveConfig(1)
    expect(waveZombieHp(w1, VAR_NORMAL)).toBe(4)
    expect(waveZombieHp(w1, VAR_RUNNER)).toBe(1) // fragile sprinter (floors at 1)
    expect(waveZombieHp(w1, VAR_BRUTE)).toBe(15) // 4 * 2.4 + 5
    const w9 = waveConfig(9) // +4 hp bonus
    expect(waveZombieHp(w9, VAR_NORMAL)).toBe(8)
    expect(waveZombieHp(w9, VAR_BRUTE)).toBeGreaterThan(waveZombieHp(w1, VAR_BRUTE))
    // Unknown variants fall back to the shambler stat line.
    expect(waveZombieHp(w1, 99)).toBe(waveZombieHp(w1, VAR_NORMAL))
  })
})
