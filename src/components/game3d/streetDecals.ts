import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  ROAD_HALF_W,
  ROAD_LINES,
  START_3D,
  WORLD_GATES,
  type Vec2,
} from './layout'

/* ============================================================================
   Phase 3 — STREET DECAL LAYER (pure placement, Node-testable).

   One instanced quad draw dresses every avenue with the wear a real city
   street carries: manhole covers and storm drains at intersections, painted
   lane arrows and worn crosswalk bands, crack webs, oil stains, and rain
   puddles (alpha rides SIM.rain, and the wet-response patch turns them into
   near-mirrors). Placement is fully deterministic from the road grid — the
   same city every session, testable in Node.

   Crosswalk bands REPLACE the old per-stripe box geometry on decal tiers
   (one quad per approach instead of five raised boxes), reclaiming a draw
   call; LOW keeps the legacy stripes untouched.
   ========================================================================== */

/** Atlas tile ids (4×2 grid — see decalAtlasTexture in proceduralTextures). */
export const DECAL_MANHOLE = 0
export const DECAL_DRAIN = 1
export const DECAL_ARROW = 2
export const DECAL_CRACK = 3
export const DECAL_OIL = 4
export const DECAL_PUDDLE = 5
export const DECAL_GLYPH = 6
export const DECAL_CROSSWALK = 7

export const DECAL_TILE_COUNT = 8

export interface StreetDecal {
  x: number
  z: number
  /** Y rotation, radians. */
  rot: number
  /** World size of the quad edge (crosswalks stretch via sx/sz). */
  sx: number
  sz: number
  /** Atlas tile (0..7). */
  tile: number
  /** 1 = only visible while raining (puddles). */
  rainOnly: 0 | 1
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Quest-site clearings the decal layer must not stamp over. */
const CLEARINGS: { p: Vec2; r: number }[] = [
  ...CHECKPOINTS_3D.map((c) => ({ p: c.flag, r: 18 })),
  ...CHECKPOINTS_3D.map((c) => ({ p: c.boss, r: 18 })),
  ...WORLD_GATES.flatMap((gates) => gates.map((g) => ({ p: g, r: 16 }))),
  { p: START_3D, r: 16 },
]

function inClearing(x: number, z: number): boolean {
  for (const c of CLEARINGS) {
    const dx = c.p.x - x
    const dz = c.p.z - z
    if (dx * dx + dz * dz < c.r * c.r) return true
  }
  return false
}

function inCity(x: number, z: number): boolean {
  return Math.hypot(x, z) <= CITY_LIMIT
}

/**
 * The full deterministic decal set. `includeCrosswalks` = decal tiers replace
 * the legacy stripe geometry (LOW passes false and keeps its stripes).
 */
export function buildStreetDecals(includeCrosswalks = true): StreetDecal[] {
  const rnd = mulberry32(20260712)
  const out: StreetDecal[] = []
  const lanes = 3.5 // driving lane centre offset from the road centreline

  /* ---- Intersections: manholes, drains, crosswalk bands ----------------- */
  for (let i = 0; i < ROAD_LINES.length; i++) {
    for (let j = 0; j < ROAD_LINES.length; j++) {
      const gx = ROAD_LINES[i]
      const gz = ROAD_LINES[j]
      if (!inCity(gx, gz)) continue
      const clear = inClearing(gx, gz)

      // Manhole just off-centre (staggered so avenues never look minted).
      if (!clear && (i + j) % 2 === 0 && rnd() < 0.85) {
        out.push({
          x: gx + (rnd() * 2 - 1) * 2.4,
          z: gz + (rnd() * 2 - 1) * 2.4,
          rot: rnd() * Math.PI * 2,
          sx: 1.15,
          sz: 1.15,
          tile: DECAL_MANHOLE,
          rainOnly: 0,
        })
      }
      // Storm drains against both kerbs of one approach.
      if (!clear && rnd() < 0.7) {
        const side = rnd() < 0.5 ? -1 : 1
        out.push({
          x: gx + side * (ROAD_HALF_W - 0.9),
          z: gz + 3.2,
          rot: 0,
          sx: 1.4,
          sz: 0.7,
          tile: DECAL_DRAIN,
          rainOnly: 0,
        })
      }

      // Crosswalk bands across each approach (replaces 5 stripe boxes each).
      if (includeCrosswalks && !clear) {
        const off = ROAD_HALF_W + 1.6
        for (const dir of [-1, 1]) {
          if (inCity(gx, gz + dir * off)) {
            out.push({
              x: gx,
              z: gz + dir * off,
              rot: 0,
              sx: 8.2,
              sz: 3.4,
              tile: DECAL_CROSSWALK,
              rainOnly: 0,
            })
          }
          if (inCity(gx + dir * off, gz)) {
            out.push({
              x: gx + dir * off,
              z: gz,
              rot: Math.PI / 2,
              sx: 8.2,
              sz: 3.4,
              tile: DECAL_CROSSWALK,
              rainOnly: 0,
            })
          }
        }
      }
    }
  }

  /* ---- Along every avenue: arrows, cracks, oil, puddles ------------------ */
  for (const line of ROAD_LINES) {
    for (let s = -CITY_LIMIT + 12; s <= CITY_LIMIT - 12; s += 21) {
      // vertical road (x = line, runs along z), then horizontal — same rolls.
      for (const vertical of [true, false]) {
        const x = vertical ? line : s + (rnd() * 2 - 1) * 4
        const z = vertical ? s + (rnd() * 2 - 1) * 4 : line
        // Inner margin: side offsets (gutter puddles) can push up to ~6m out.
        if (Math.hypot(x, z) > CITY_LIMIT - 8 || inClearing(x, z)) {
          rnd() // keep the stream aligned regardless of skips
          continue
        }
        const roll = rnd()
        if (roll < 0.16) {
          // Lane arrow in a driving lane, facing traffic flow.
          const side = roll < 0.08 ? 1 : -1
          out.push({
            x: vertical ? line + side * lanes : x,
            z: vertical ? z : line + side * lanes,
            rot: vertical ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2,
            sx: 1.1,
            sz: 2.6,
            tile: DECAL_ARROW,
            rainOnly: 0,
          })
        } else if (roll < 0.34) {
          out.push({
            x,
            z,
            rot: rnd() * Math.PI * 2,
            sx: 2.2 + rnd() * 2.4,
            sz: 2.2 + rnd() * 2.4,
            tile: DECAL_CRACK,
            rainOnly: 0,
          })
        } else if (roll < 0.46) {
          out.push({
            x,
            z,
            rot: rnd() * Math.PI * 2,
            sx: 1.4 + rnd() * 1.6,
            sz: 1.4 + rnd() * 1.6,
            tile: DECAL_OIL,
            rainOnly: 0,
          })
        } else if (roll < 0.72) {
          // Rain puddles pool in the gutters along the kerb line.
          const side = roll < 0.59 ? 1 : -1
          out.push({
            x: vertical ? line + side * (ROAD_HALF_W - 1.3) : x,
            z: vertical ? z : line + side * (ROAD_HALF_W - 1.3),
            rot: rnd() * Math.PI * 2,
            sx: 1.8 + rnd() * 2.6,
            sz: 1.2 + rnd() * 1.6,
            tile: DECAL_PUDDLE,
            rainOnly: 1,
          })
        } else if (roll < 0.755) {
          // Rare giant painted code glyph — Code City street art.
          out.push({
            x,
            z,
            rot: vertical ? 0 : Math.PI / 2,
            sx: 3.4,
            sz: 3.4,
            tile: DECAL_GLYPH,
            rainOnly: 0,
          })
        }
      }
    }
  }

  return out
}
