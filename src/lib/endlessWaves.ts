import {
  VARIANTS,
  VAR_NORMAL,
  VAR_RUNNER,
  VAR_BRUTE,
  VAR_MUTANT,
  VAR_SPITTER,
  VAR_GLITCH,
} from '../components/game3d/zombieTypes'

/**
 * Endless Siege — pure wave escalation math.
 *
 * Each wave gets bigger, faster and tougher, and the breed mix shifts from
 * plain shamblers toward runners, spitters, brutes, mutants and (late) glitch
 * elites. Kept pure (no three.js objects, no randomness) so escalation is
 * unit-testable; the arena supplies its own random rolls to `pickWaveVariant`.
 */

export type WaveConfig = {
  wave: number
  /** Total zombies spawned across the wave. */
  count: number
  /** Base chase speed (m/s) before per-breed multipliers. */
  speed: number
  /** Flat HP added to the base zombie HP before breed scaling. */
  hpBonus: number
  /** Spawn weights indexed by zombie variant (VAR_*). */
  weights: number[]
  /** Seconds between spawn batches while the wave pours in. */
  spawnEvery: number
  /** Zombies per spawn batch. */
  batch: number
}

export const ENDLESS_BASE_HP = 4
/** Hard cap so a wave can never starve the render pool. */
export const ENDLESS_COUNT_CAP = 46
export const ENDLESS_SPEED_CAP = 7.4

export function waveConfig(wave: number): WaveConfig {
  const w = Math.max(1, Math.floor(wave))
  const count = Math.min(ENDLESS_COUNT_CAP, 8 + (w - 1) * 3)
  const speed = Math.min(ENDLESS_SPEED_CAP, 3.4 + (w - 1) * 0.22)
  const hpBonus = Math.floor((w - 1) / 2)

  // Breed phase-in: shamblers thin out (never vanish) as the pressure breeds
  // arrive — runners at 2, spitters at 3, brutes at 4, mutants at 5, and the
  // tanky glitch elite from wave 7 on.
  const weights = new Array<number>(VARIANTS.length).fill(0)
  weights[VAR_NORMAL] = Math.max(3, 10 - (w - 1))
  weights[VAR_RUNNER] = w >= 2 ? 2 + Math.min(4, w - 2) : 0
  weights[VAR_SPITTER] = w >= 3 ? 2 + Math.min(4, w - 3) : 0
  weights[VAR_BRUTE] = w >= 4 ? 1 + Math.min(3, Math.floor((w - 4) / 2)) : 0
  weights[VAR_MUTANT] = w >= 5 ? 1 + Math.min(3, Math.floor((w - 5) / 2)) : 0
  weights[VAR_GLITCH] = w >= 7 ? 1 : 0

  const spawnEvery = Math.max(0.55, 1.1 - (w - 1) * 0.05)
  const batch = Math.min(5, 2 + Math.floor((w - 1) / 3))
  return { wave: w, count, speed, hpBonus, weights, spawnEvery, batch }
}

/** Map one uniform roll in [0,1) onto the wave's weighted breed mix. */
export function pickWaveVariant(cfg: WaveConfig, roll01: number): number {
  let total = 0
  for (const weight of cfg.weights) total += weight
  if (total <= 0) return VAR_NORMAL
  let t = Math.min(0.999999, Math.max(0, roll01)) * total
  for (let variant = 0; variant < cfg.weights.length; variant++) {
    t -= cfg.weights[variant]
    if (t < 0) return variant
  }
  return VAR_NORMAL
}

/** Spawn HP for a breed on this wave (base + wave bonus, breed-scaled). */
export function waveZombieHp(cfg: WaveConfig, variant: number): number {
  const vdef = VARIANTS[variant] ?? VARIANTS[VAR_NORMAL]
  return Math.max(
    1,
    Math.round((ENDLESS_BASE_HP + cfg.hpBonus) * vdef.hpMul) + vdef.hpAdd,
  )
}
