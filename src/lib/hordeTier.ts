import {
  CHECKPOINTS_3D,
  GATES_PER_WORLD,
  START_3D,
  WORLD_GATES,
} from '../components/game3d/layout'
import { WORLDS } from '../content/adventure'
import type { WorldState } from './questState'
import type { ConceptBand } from './learnerModel'

/** Radius (m) around a gate / academy / boss where its horde tier applies. */
const ZONE_R = 100

type WorldEntry = { state: WorldState; gatesPassed: number }

/**
 * Tier for a world segment: 1 = first gate of world 1, then +1 per gate,
 * academy, and boss lair.
 */
export function tierForSegment(worldIndex: number, segment: number): number {
  const stride = GATES_PER_WORLD + 2 // gates + academy + boss
  return worldIndex * stride + segment + 1
}

/** Main-quest tier from the first incomplete checkpoint line. */
export function questHordeTier(activeIndex: number, gatesPassed: number, atBoss = false): number {
  if (activeIndex < 0) return 1
  if (atBoss) return tierForSegment(activeIndex, GATES_PER_WORLD + 1)
  if (gatesPassed >= GATES_PER_WORLD) return tierForSegment(activeIndex, GATES_PER_WORLD)
  return tierForSegment(activeIndex, gatesPassed)
}

/**
 * Horde strength follows where you are on the map. Spawn / world-1 gate 1 is
 * always tier 1. Completed districts keep their tier so revisits feel right.
 */
export function hordeTierAtPosition(
  px: number,
  pz: number,
  worlds: WorldEntry[],
  fallbackTier: number,
): number {
  let tier = fallbackTier
  let nearest = Infinity

  for (let i = 0; i < worlds.length; i++) {
    const { state } = worlds[i]
    if (state.status === 'locked') continue

    for (let g = 0; g < GATES_PER_WORLD; g++) {
      const pos = WORLD_GATES[i][g]
      const d = Math.hypot(px - pos.x, pz - pos.z)
      if (d < ZONE_R && d < nearest) {
        nearest = d
        tier = tierForSegment(i, g)
      }
    }

    const cp = CHECKPOINTS_3D[i]
    const da = Math.hypot(px - cp.flag.x, pz - cp.flag.z)
    if (da < ZONE_R + 24 && da < nearest) {
      nearest = da
      tier = tierForSegment(i, GATES_PER_WORLD)
    }

    const db = Math.hypot(px - cp.boss.x, pz - cp.boss.z)
    if (db < ZONE_R + 18 && db < nearest) {
      nearest = db
      tier = tierForSegment(i, GATES_PER_WORLD + 1)
    }
  }

  // Fresh spawn always tier 1.
  const dStart = Math.hypot(px - START_3D.x, pz - START_3D.z)
  if (dStart < 70) return 1

  return Math.max(1, tier)
}

/**
 * Adaptive combat tuning derived from the learner's mastery of the current
 * concept. Struggling learners get a gentler horde and more time so the game
 * never punishes them for still learning; confident learners get a tougher,
 * more rewarding fight. This is the game half of personalization.
 */
export type CombatAdjust = {
  /** Added to the position-based horde tier (clamped to >= 1 by the caller). */
  tierDelta: number
  /** Multiplier on the per-leg timer budget (>1 = more time). */
  timeMul: number
  /** Extra heart-drop chance added per kill (0..1). */
  heartBonus: number
}

export function combatAdjustForBand(band: ConceptBand): CombatAdjust {
  switch (band) {
    case 'weak':
      return { tierDelta: -1, timeMul: 1.3, heartBonus: 0.06 }
    case 'developing':
      return { tierDelta: 0, timeMul: 1.1, heartBonus: 0.02 }
    case 'solid':
      return { tierDelta: 0, timeMul: 1.0, heartBonus: 0 }
    case 'mastered':
      return { tierDelta: 1, timeMul: 0.9, heartBonus: 0 }
  }
}

/** Strip gate progress for locked worlds or worlds ahead of the main quest line. */
export function sanitizeGateProgress(
  gateProg: Record<string, number>,
  activeIndex: number,
  worlds: WorldEntry[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < WORLDS.length; i++) {
    const id = WORLDS[i].id
    const { state } = worlds[i]
    if (state.learnDone) {
      out[id] = GATES_PER_WORLD
      continue
    }
    if (state.status === 'locked' || i > activeIndex) continue
    if (i === activeIndex && (gateProg[id] ?? 0) > 0) out[id] = gateProg[id]!
  }
  return out
}

const GATE_KEY = (id: string) => `alphacode.gates.session.${id}`

export function loadSessionGateProgress(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const w of WORLDS) {
    try {
      const v = sessionStorage.getItem(GATE_KEY(w.id))
      if (v) out[w.id] = Math.min(GATES_PER_WORLD, parseInt(v, 10) || 0)
    } catch {
      /* ignore */
    }
  }
  return out
}

export function persistGateProgress(gateProg: Record<string, number>) {
  for (const w of WORLDS) {
    const v = gateProg[w.id]
    try {
      if (v != null && v > 0) sessionStorage.setItem(GATE_KEY(w.id), String(v))
      else sessionStorage.removeItem(GATE_KEY(w.id))
      // Drop legacy local saves so gate order always resets per session.
      localStorage.removeItem(`alphacode.gates.${w.id}`)
    } catch {
      /* ignore */
    }
  }
}
