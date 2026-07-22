import { WORLDS, type World } from '../../content/adventure'

/**
 * 1 world unit = 1 meter. The hero is ~1.8m, so everything is real human scale.
 *
 * The overworld is a walkable CITY: a grid of avenues and streets carving the
 * map into blocks. Blocks are filled with shops, mid-rises and the odd tower
 * (downtown is taller), plus parks, plazas, street lamps, benches, hydrants and
 * parked cars. You can't walk through buildings — every structure exports a
 * collider. Six districts each hold a numbered Academy (the lesson) and, nearby,
 * a Boss Lair (the quiz + fight).
 */
export const GROUND_HALF = 720
/** World span in meters — quest sites are authored in 3D and must stay inside CITY_LIMIT. */
export const WORLD_SPAN = GROUND_HALF * 2

export type Vec2 = { x: number; z: number }

export type Checkpoint3D = {
  world: World
  index: number
  flag: Vec2
  boss: Vec2
}

/** Road grid pitch — must equal ROAD_STEP below. Quest sites snap to this grid. */
const ROAD_PITCH = 74

/** Snap a point to the nearest road intersection so it always sits on clear road. */
function snapToRoad(p: Vec2): Vec2 {
  return {
    x: Math.round(p.x / ROAD_PITCH) * ROAD_PITCH,
    z: Math.round(p.z / ROAD_PITCH) * ROAD_PITCH,
  }
}

/**
 * Hand-placed 3D quest sites — every point stays inside the generated city
 * (hypot <= CITY_LIMIT) so you never spawn in empty void outside the map.
 */
const QUEST_SITES: { flag: Vec2; boss: Vec2 }[] = [
  { flag: { x: -100, z: 100 }, boss: { x: 80, z: -60 } },
  { flag: { x: 260, z: -140 }, boss: { x: 400, z: -260 } },
  { flag: { x: 520, z: -380 }, boss: { x: 480, z: -480 } },
  { flag: { x: 380, z: -540 }, boss: { x: 240, z: -620 } },
  { flag: { x: -80, z: -580 }, boss: { x: -280, z: -520 } },
  { flag: { x: -440, z: -300 }, boss: { x: -520, z: -100 } },
]

export const CHECKPOINTS_3D: Checkpoint3D[] = WORLDS.map((world, index) => ({
  world,
  index,
  flag: snapToRoad(QUEST_SITES[index].flag),
  boss: snapToRoad(QUEST_SITES[index].boss),
}))

/** Spawn plaza — south-west district, snapped to a road intersection. */
export const START_3D: Vec2 = snapToRoad({ x: -420, z: 380 })

/**
 * Each lesson is approached through a chain of enterable buildings spread far
 * apart across the city. Passing each one ramps the zombie horde.
 */
export const GATES_PER_WORLD = 3
const GATE_FRACS = [0.3, 0.6, 0.9] // farther apart — longer legs between checkpoints

/**
 * Place a level's checkpoints as DISTINCT road intersections marching from the
 * previous objective toward this level's Academy. Snapping can collapse nearby
 * fractions onto the same junction, so collisions are nudged one block further
 * along the dominant axis. This guarantees real spacing and a clean, walkable
 * road path between every checkpoint — no two ever sit on the same spot.
 */
function placeGates(origin: Vec2, dest: Vec2): Vec2[] {
  const dirX = Math.sign(dest.x - origin.x) || 1
  const dirZ = Math.sign(dest.z - origin.z) || 1
  const alongX = Math.abs(dest.x - origin.x) >= Math.abs(dest.z - origin.z)
  const used: Vec2[] = [snapToRoad(origin)]
  const gates: Vec2[] = []
  for (const t of GATE_FRACS) {
    let g = snapToRoad({
      x: origin.x + (dest.x - origin.x) * t,
      z: origin.z + (dest.z - origin.z) * t,
    })
    let guard = 0
    while (used.some((u) => u.x === g.x && u.z === g.z) && guard < 8) {
      g = alongX
        ? { x: g.x + dirX * ROAD_PITCH, z: g.z }
        : { x: g.x, z: g.z + dirZ * ROAD_PITCH }
      guard++
    }
    used.push(g)
    gates.push(g)
  }
  return gates
}

export const WORLD_GATES: Vec2[][] = CHECKPOINTS_3D.map((c, i) =>
  placeGates(i === 0 ? START_3D : CHECKPOINTS_3D[i - 1].boss, c.flag),
)

/** Door threshold in world space — where the hero stands to press E. */
export function questDoor(pos: Vec2, inset = 5.2): Vec2 {
  const facing = Math.atan2(-pos.x, -pos.z)
  return {
    x: pos.x + Math.sin(facing) * inset,
    z: pos.z + Math.cos(facing) * inset,
  }
}

/** A distinct, far-visible landmark per district so you always know where to head. */
export type LandmarkType = 'windmill' | 'lighthouse' | 'spire' | 'arch' | 'tower' | 'mountain'
export type Landmark = {
  world: World
  index: number
  type: LandmarkType
  pos: Vec2
  color: string
}

const LANDMARK_TYPES: LandmarkType[] = ['windmill', 'lighthouse', 'spire', 'arch', 'tower', 'mountain']

export const LANDMARKS: Landmark[] = CHECKPOINTS_3D.map((c, i) => {
  const dirX = c.flag.x === 0 ? 0 : c.flag.x / Math.abs(c.flag.x)
  const dirZ = c.flag.z === 0 ? 0 : c.flag.z / Math.abs(c.flag.z)
  return {
    world: c.world,
    index: i,
    type: LANDMARK_TYPES[i % LANDMARK_TYPES.length],
    pos: { x: c.flag.x + dirX * 34 + 10, z: c.flag.z + dirZ * 34 + 6 },
    color: c.world.theme.accent,
  }
})

/** District colour wash on the pavement, centred on each Academy. */
export const BIOME_TINTS: { center: Vec2; radius: number; color: string }[] = CHECKPOINTS_3D.map(
  (c, i) => ({
    center: c.flag,
    radius: 180,
    color: ['#9ccf7a', '#8fd0c2', '#b2a0d8', '#d8c089', '#cf9fb0', '#9fc0e6'][i % 6],
  }),
)

/* ----------------------------------------------------------- City geometry */

export type Prop = { x: number; z: number; s: number; r: number; y?: number }
export type Building = {
  x: number
  z: number
  w: number
  d: number
  h: number
  /** rotation so the building faces the nearest road */
  r: number
  color: number
  roof: number
  kind: 'shop' | 'mid' | 'tower'
}
export type Road = { x: number; z: number; w: number; d: number; vertical: boolean }
/**
 * Static/streamed obstacle footprint. `top` is the obstacle's height above
 * ground (meters) where known — the controller's parkour vault uses it to
 * refuse hurdling things taller than the vault arc (a 2.3m holo kiosk or a
 * 4.4m metro entrance must block, not no-clip). Absent `top` = low prop.
 */
export type Collider = { x: number; z: number; hw: number; hd: number; top?: number }

/** Obstacles with tops above this cannot be cleared by the parkour vault
 *  (apex ~2.0m) — the vault probe must skip them so they stay solid. */
export const VAULT_CLEAR_TOP = 1.6

export type Scenery = {
  building: Building[]
  rooftop: Prop[]
  tree: Prop[]
  lamp: Prop[]
  bench: Prop[]
  car: Prop[]
  hydrant: Prop[]
  planter: Prop[]
  trafficLight: Prop[]
  trashCan: Prop[]
  crosswalk: Prop[]
  ac: Prop[]
}

const ROAD_STEP = 74 // block pitch — slightly wider lots on the bigger map
const ROAD_HALF = 7 // half the asphalt width (14m avenues)
const SIDEWALK = 4 // sidewalk depth on each side of a road
const LIMIT = GROUND_HALF - 26

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Clear = { p: Vec2; r: number }
function inAny(list: Clear[], x: number, z: number, pad = 0) {
  for (const c of list) if (Math.hypot(c.p.x - x, c.p.z - z) < c.r + pad) return true
  return false
}

/** Grid line coordinates (roads) spanning the map in one axis. */
function gridLines(): number[] {
  const lines: number[] = []
  for (let v = -Math.ceil(LIMIT / ROAD_STEP); v <= Math.ceil(LIMIT / ROAD_STEP); v++) {
    const at = v * ROAD_STEP
    if (Math.abs(at) <= LIMIT) lines.push(at)
  }
  return lines
}

const GRID = gridLines()

/** Outermost road centreline coordinate (roads only exist within ±this). */
const MAX_ROAD_LINE = Math.floor(LIMIT / ROAD_STEP) * ROAD_STEP

/**
 * Distance from a 1-D coordinate to the nearest road centreline. Street
 * furniture and parked cars use this to stay clear of crossing streets:
 * anything whose along-road coordinate lands inside an intersecting road
 * would otherwise stand in the middle of the asphalt.
 */
function distToRoadLine(v: number): number {
  const nearest = Math.max(
    -MAX_ROAD_LINE,
    Math.min(MAX_ROAD_LINE, Math.round(v / ROAD_STEP) * ROAD_STEP),
  )
  return Math.abs(v - nearest)
}

/** Exported road-grid metadata so the renderer can lay kerbs between blocks. */
export const ROAD_LINES = GRID
export const ROAD_HALF_W = ROAD_HALF
export const CITY_LIMIT = LIMIT

/** Long asphalt strips, one per grid line in each axis. */
export const ROADS: Road[] = (() => {
  const len = LIMIT * 2 + ROAD_HALF * 2
  const out: Road[] = []
  for (const at of GRID) {
    out.push({ x: at, z: 0, w: ROAD_HALF * 2, d: len, vertical: true })
    out.push({ x: 0, z: at, w: len, d: ROAD_HALF * 2, vertical: false })
  }
  return out
})()

const COLLIDERS_OUT: Collider[] = []

function buildCity(): Scenery {
  const rnd = mulberry32(20260624)
  const out: Scenery = {
    building: [],
    rooftop: [],
    tree: [],
    lamp: [],
    bench: [],
    car: [],
    hydrant: [],
    planter: [],
    trafficLight: [],
    trashCan: [],
    crosswalk: [],
    ac: [],
  }

  // Keep quest buildings clear, but tighter now so the city crowds in close and
  // you can't just see the next checkpoint straight ahead.
  const plazas: Clear[] = [
    ...CHECKPOINTS_3D.map((c) => ({ p: c.flag, r: 24 })),
    ...CHECKPOINTS_3D.map((c) => ({ p: c.boss, r: 24 })),
    ...WORLD_GATES.flatMap((gates) => gates.map((g) => ({ p: g, r: 22 }))),
    { p: START_3D, r: 22 },
  ]

  const downtown = 1 / 240 // taller buildings toward the centre
  const EDGE = ROAD_HALF + SIDEWALK

  /** Add rooftop clutter so skylines read as a lived-in city. */
  function dressRoof(x: number, z: number, w: number, d: number, h: number, kind: Building['kind']) {
    if (kind === 'shop') {
      // small parapet AC box
      if (rnd() < 0.7)
        out.ac.push({
          x: x + (rnd() * 2 - 1) * w * 0.25,
          z: z + (rnd() * 2 - 1) * d * 0.25,
          s: 0.7 + rnd() * 0.5,
          r: rnd() * 6,
          y: h,
        })
      return
    }
    // mid / tower: water tanks, AC banks, antennas
    const units = kind === 'tower' ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2)
    for (let u = 0; u < units; u++) {
      out.rooftop.push({
        x: x + (rnd() * 2 - 1) * w * 0.3,
        z: z + (rnd() * 2 - 1) * d * 0.3,
        s: 0.9 + rnd() * 1.2,
        r: rnd() * 6,
        y: h,
      })
    }
    const acn = 1 + Math.floor(rnd() * 3)
    for (let a = 0; a < acn; a++) {
      out.ac.push({
        x: x + (rnd() * 2 - 1) * w * 0.34,
        z: z + (rnd() * 2 - 1) * d * 0.34,
        s: 0.8 + rnd() * 0.7,
        r: rnd() * 6,
        y: h,
      })
    }
  }

  // --- Fill every block between adjacent grid lines -----------------------
  for (let i = 0; i < GRID.length - 1; i++) {
    for (let j = 0; j < GRID.length - 1; j++) {
      const x0 = GRID[i]
      const x1 = GRID[i + 1]
      const z0 = GRID[j]
      const z1 = GRID[j + 1]
      const cx = (x0 + x1) / 2
      const cz = (z0 + z1) / 2
      const innerW = x1 - x0 - 2 * EDGE
      const innerD = z1 - z0 - 2 * EDGE
      if (innerW < 12 || innerD < 12) continue
      if (Math.hypot(cx, cz) > LIMIT) continue

      // Plaza blocks around Academies / spawn stay open (park ring instead).
      if (inAny(plazas, cx, cz)) {
        if (rnd() < 0.6) out.tree.push({ x: cx, z: cz, s: 1.1 + rnd() * 0.5, r: rnd() * 6 })
        if (rnd() < 0.5)
          out.planter.push({ x: cx + 4, z: cz + 4, s: 0.8 + rnd() * 0.5, r: rnd() * 6 })
        continue
      }

      const distC = Math.hypot(cx, cz)
      const park = rnd() < 0.035 // very rare — keep the city dense and view-blocking

      if (park) {
        // green block: scatter trees + bushes + benches, no collider
        const tn = 6 + Math.floor(rnd() * 6)
        for (let t = 0; t < tn; t++) {
          out.tree.push({
            x: cx + (rnd() * 2 - 1) * innerW * 0.44,
            z: cz + (rnd() * 2 - 1) * innerD * 0.44,
            s: 0.9 + rnd() * 0.8,
            r: rnd() * 6,
          })
        }
        for (let b = 0; b < tn; b++) {
          out.planter.push({
            x: cx + (rnd() * 2 - 1) * innerW * 0.46,
            z: cz + (rnd() * 2 - 1) * innerD * 0.46,
            s: 0.6 + rnd() * 0.9,
            r: rnd() * 6,
          })
        }
        for (let bn = 0; bn < 2; bn++)
          out.bench.push({
            x: cx + (rnd() * 2 - 1) * innerW * 0.3,
            z: cz + (rnd() * 2 - 1) * innerD * 0.3,
            s: 1,
            r: rnd() < 0.5 ? 0 : Math.PI / 2,
          })
        if (rnd() < 0.6) out.trashCan.push({ x: cx + 3, z: cz + 3, s: 1, r: 0 })
        continue
      }

      // Decide how many lots this block splits into — more aggressive now.
      const split = innerW > 38 && innerD > 38 && rnd() < 0.92
      const lots: { lx: number; lz: number; lw: number; ld: number }[] = []
      if (split) {
        const halfW = innerW / 2
        const halfD = innerD / 2
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            if (rnd() < 0.05) continue // rare alley gap
            lots.push({
              lx: cx + sx * halfW * 0.5,
              lz: cz + sz * halfD * 0.5,
              lw: halfW * 0.94,
              ld: halfD * 0.94,
            })
          }
        }
      } else {
        lots.push({ lx: cx, lz: cz, lw: innerW, ld: innerD })
      }

      for (const lot of lots) {
        const w = lot.lw * (0.82 + rnd() * 0.16)
        const d = lot.ld * (0.82 + rnd() * 0.16)
        // Height: downtown core is tall; outskirts are low shops.
        const coreT = Math.max(0, 1 - distC * downtown)
        const roll = rnd()
        let kind: Building['kind']
        let h: number
        if (coreT > 0.5 && roll < 0.5) {
          kind = 'tower'
          h = 46 + rnd() * 54 * coreT
        } else if (roll < 0.5 + coreT * 0.3) {
          kind = 'mid'
          h = 20 + rnd() * 18
        } else {
          kind = 'shop'
          h = 9 + rnd() * 7
        }
        const facing = Math.round(rnd() * 4) * (Math.PI / 2)
        out.building.push({
          x: lot.lx,
          z: lot.lz,
          w,
          d,
          h,
          r: facing,
          color: Math.floor(rnd() * 6),
          roof: Math.floor(rnd() * 3),
          kind,
        })
        COLLIDERS_OUT.push({ x: lot.lx, z: lot.lz, hw: w / 2, hd: d / 2 })
        dressRoof(lot.lx, lot.lz, w, d, h, kind)

        // Street trees + planters in the lot frontage strips. Positions are
        // clamped INSIDE the block interior (≥1.6m off the sidewalk edge) so
        // greenery lives in parkway strips, never in the sidewalk or asphalt;
        // spots too tight to keep clear of both the wall and the kerb are
        // skipped. (Random draws stay in the original order so the rest of
        // the city layout is unchanged.)
        const zTop = cz + innerD / 2 - 1.6
        const zBot = cz - innerD / 2 + 1.6
        const xLo = cx - innerW / 2 + 1.6
        const xHi = cx + innerW / 2 - 1.6
        if (rnd() < 0.85) {
          const ts = 1.0 + rnd() * 0.7
          const tr = rnd() * 6
          const tz = Math.min(lot.lz + d / 2 + 2.4, zTop)
          if (tz - (lot.lz + d / 2) >= 1.2) out.tree.push({ x: lot.lx, z: tz, s: ts, r: tr })
        }
        if (rnd() < 0.7) {
          const tx = Math.min(Math.max(lot.lx + (rnd() * 2 - 1) * w * 0.4, xLo), xHi)
          const ts = 0.9 + rnd() * 0.7
          const tr = rnd() * 6
          const tz = Math.max(lot.lz - d / 2 - 2.4, zBot)
          if (lot.lz - d / 2 - tz >= 1.2) out.tree.push({ x: tx, z: tz, s: ts, r: tr })
        }
        if (rnd() < 0.6) {
          const pz = Math.min(Math.max(lot.lz + (rnd() * 2 - 1) * d * 0.3, zBot), zTop)
          const ps = 0.7 + rnd() * 0.5
          const pr = rnd() * 6
          const px = Math.max(lot.lx - w / 2 - 2, xLo)
          if (lot.lx - w / 2 - px >= 1.0) out.planter.push({ x: px, z: pz, s: ps, r: pr })
        }
        if (rnd() < 0.5) {
          const pz = Math.min(Math.max(lot.lz + (rnd() * 2 - 1) * d * 0.3, zBot), zTop)
          const ps = 0.7 + rnd() * 0.5
          const pr = rnd() * 6
          const px = Math.min(lot.lx + w / 2 + 2, xHi)
          if (px - (lot.lx + w / 2) >= 1.0) out.planter.push({ x: px, z: pz, s: ps, r: pr })
        }
      }
    }
  }

  // --- Street furniture along the avenues ----------------------------------
  // Dense lamps + alternating benches / trash cans on both kerbs of each road.
  for (const at of GRID) {
    let toggle = 0
    for (let s = -LIMIT + ROAD_STEP / 3; s <= LIMIT; s += ROAD_STEP / 3) {
      toggle++
      // Kerb spots only exist between intersections: a coordinate inside a
      // crossing street (asphalt + sidewalk) would put the lamp/bench in the
      // middle of that road.
      if (distToRoadLine(s) < EDGE + 1.5) continue
      for (const side of [-1, 1]) {
        const off = ROAD_HALF + SIDEWALK - 1
        // vertical road kerb — benches turned to face the roadway
        const vx = at + side * off
        if (Math.hypot(vx, s) <= LIMIT && !inAny(plazas, vx, s, -10)) {
          out.lamp.push({ x: vx, z: s, s: 1, r: 0 })
          if (toggle % 3 === 0) out.bench.push({ x: vx, z: s + 3, s: 1, r: -side * (Math.PI / 2) })
          else if (toggle % 3 === 1) out.trashCan.push({ x: vx, z: s + 2, s: 1, r: 0 })
        }
        // horizontal road kerb — benches turned to face the roadway. The
        // remaining thirds get a trash can / planter so this kerb carries the
        // same street-level clutter density as the vertical one (it used to
        // get benches only, which left half the avenues visibly bare).
        const hz = at + side * off
        if (Math.hypot(s, hz) <= LIMIT && !inAny(plazas, s, hz, -10)) {
          out.lamp.push({ x: s, z: hz, s: 1, r: 0 })
          if (toggle % 3 === 2) out.bench.push({ x: s + 3, z: hz, s: 1, r: side > 0 ? Math.PI : 0 })
          else if (toggle % 3 === 0) out.trashCan.push({ x: s + 2, z: hz, s: 1, r: 0 })
          else out.planter.push({ x: s + 2.6, z: hz, s: 0.8, r: 0 })
        }
      }
    }
  }

  // --- Parked cars in the kerb lane (colliders) -----------------------------
  // Real kerbside parking: INSIDE the asphalt against the kerb (the old
  // ROAD_HALF + 1.6 offset put every car half up on the sidewalk), aligned
  // with the road direction, nose along its side's traffic flow, and clear of
  // intersection boxes + crosswalk stripes.
  const carRnd = mulberry32(7731)
  const CAR_KERB = ROAD_HALF - 1.5 // lane centre 5.5m out — wheels at the kerb
  const CAR_CLEAR = ROAD_HALF + 6 // no parking inside crossings / on crosswalks
  for (const at of GRID) {
    for (let s = -LIMIT + 18; s <= LIMIT - 18; s += 20) {
      if (carRnd() < 0.7) {
        const side = carRnd() < 0.5 ? -1 : 1
        const x = at + side * CAR_KERB
        const z = s + (carRnd() * 2 - 1) * 3
        if (Math.hypot(x, z) <= LIMIT && distToRoadLine(z) >= CAR_CLEAR && !inAny(plazas, x, z)) {
          out.car.push({ x, z, s: 1, r: side > 0 ? Math.PI : 0 })
          COLLIDERS_OUT.push({ x, z, hw: 1.4, hd: 2.6 })
        }
      }
      if (carRnd() < 0.66) {
        const side = carRnd() < 0.5 ? -1 : 1
        const z = at + side * CAR_KERB
        const x = s + (carRnd() * 2 - 1) * 3
        if (Math.hypot(x, z) <= LIMIT && distToRoadLine(x) >= CAR_CLEAR && !inAny(plazas, x, z)) {
          out.car.push({ x, z, s: 1, r: side > 0 ? Math.PI / 2 : -Math.PI / 2 })
          COLLIDERS_OUT.push({ x, z, hw: 2.6, hd: 1.4 })
        }
      }
    }
  }

  // --- Intersections: traffic lights, hydrants, crosswalk stripes ----------
  for (let i = 0; i < GRID.length; i++) {
    for (let j = 0; j < GRID.length; j++) {
      const gx = GRID[i]
      const gz = GRID[j]
      if (Math.hypot(gx, gz) > LIMIT) continue
      const corner = ROAD_HALF + 2.2
      // traffic light on one corner, hydrant on the opposite
      const tlx = gx + corner
      const tlz = gz + corner
      if (Math.hypot(tlx, tlz) <= LIMIT && !inAny(plazas, tlx, tlz)) {
        out.trafficLight.push({ x: tlx, z: tlz, s: 1, r: Math.PI / 4 })
      }
      const hx = gx - corner
      const hz = gz - corner
      if (Math.hypot(hx, hz) <= LIMIT && !inAny(plazas, hx, hz) && (i + j) % 2 === 0) {
        out.hydrant.push({ x: hx, z: hz, s: 1, r: 0 })
      }
      // Corner greenery on the two free corners (the light and hydrant own
      // the other pair) — real intersections collect planters and signage
      // clutter at the ramps. Deterministic hash keeps ~2/3 of corners
      // dressed without disturbing the main RNG stream.
      const c1x = gx - corner
      const c1z = gz + corner
      if (Math.hypot(c1x, c1z) <= LIMIT && !inAny(plazas, c1x, c1z) && (i * 7 + j * 13) % 3 !== 0) {
        out.planter.push({ x: c1x, z: c1z, s: 0.85, r: Math.PI / 4 })
      }
      const c2x = gx + corner
      const c2z = gz - corner
      if (Math.hypot(c2x, c2z) <= LIMIT && !inAny(plazas, c2x, c2z) && (i * 11 + j * 5) % 3 !== 1) {
        out.trashCan.push({ x: c2x, z: c2z, s: 1, r: 0 })
      }
      // crosswalk stripes across each of the 4 approaches
      if (inAny(plazas, gx, gz, -6)) continue
      const STRIPES = 5
      for (let k = 0; k < STRIPES; k++) {
        const o = (k - (STRIPES - 1) / 2) * 1.5
        // N & S approaches (stripes run along X, banded across Z)
        for (const dir of [-1, 1]) {
          const cz = gz + dir * (ROAD_HALF + 1.6)
          if (Math.hypot(gx + o, cz) <= LIMIT)
            out.crosswalk.push({ x: gx + o, z: cz, s: 1, r: 0 })
          const cx = gx + dir * (ROAD_HALF + 1.6)
          if (Math.hypot(cx, gz + o) <= LIMIT)
            out.crosswalk.push({ x: cx, z: gz + o, s: 1, r: Math.PI / 2 })
        }
      }
    }
  }

  return out
}

export const SCENERY: Scenery = buildCity()

/** Footprints for quest buildings — hero cannot walk through these. */
const QUEST_FOOTPRINTS: Collider[] = (() => {
  const out: Collider[] = []
  for (let i = 0; i < CHECKPOINTS_3D.length; i++) {
    const c = CHECKPOINTS_3D[i]
    out.push({ x: c.flag.x, z: c.flag.z, hw: 4.8, hd: 4.2 })
    out.push({ x: c.boss.x, z: c.boss.z, hw: 5.8, hd: 4.4 })
    for (const g of WORLD_GATES[i]) {
      out.push({ x: g.x, z: g.z, hw: 3.9, hd: 3.4 })
    }
  }
  return out
})()

/**
 * Street-prop footprints — lamp posts, tree trunks, planters, benches,
 * hydrants, traffic lights and trash cans are solid now (the hero used to
 * ghost straight through them). Half-extents are sized to each primitive's
 * base geometry (Primitives3D) times the instance scale; the Meshy street
 * shell replaces those primitives at the exact same transforms, so one
 * collider set serves both. Small enough that every one stays vaultable
 * and sidewalks remain walkable.
 */
const PROP_FOOTPRINTS: Collider[] = (() => {
  const out: Collider[] = []
  const square = (items: Prop[], half: number, scaled = true, top?: number) => {
    for (const p of items) {
      const r = half * (scaled ? p.s : 1)
      out.push({ x: p.x, z: p.z, hw: r, hd: r, ...(top !== undefined ? { top } : {}) })
    }
  }
  // Poles and trunks carry a `top` so the parkour vault refuses them — a
  // hurdle carry through a 4m lamp post or a tree trunk is a no-clip, not a
  // move. Low furniture (benches, planters, bins, hydrants) stays hurdle-able.
  square(SCENERY.lamp, 0.22, false, 4.4)
  square(SCENERY.tree, 0.3, true, 5) // trunk only — canopies overhang walkable ground
  square(SCENERY.planter, 0.6)
  square(SCENERY.hydrant, 0.28, false)
  square(SCENERY.trafficLight, 0.24, false, 5.4)
  square(SCENERY.trashCan, 0.4)
  for (const b of SCENERY.bench) {
    // Benches rotate in quarter turns — swap the AABB on the odd ones.
    const swapped = Math.abs(Math.sin(b.r)) > 0.5
    out.push({ x: b.x, z: b.z, hw: swapped ? 0.45 : 1.0, hd: swapped ? 1.0 : 0.45 })
  }
  return out
})()

/**
 * Landmark footprints — every district landmark renders a large solid
 * primitive (and, on MEDIUM+, a Meshy replacement at the SAME anchor), yet
 * the hero could sprint straight through all of them. Half-extents cover the
 * base mass of both the primitive and its Meshy stand-in; deliberately
 * larger than VAULT_MAX_HALF-sized props so none of them reads "hurdle-able".
 */
const LANDMARK_FOOTPRINTS: Collider[] = LANDMARKS.flatMap((l): Collider[] => {
  switch (l.type) {
    case 'windmill': // primitive base r4 / observatory dome
      return [{ x: l.pos.x, z: l.pos.z, hw: 4.4, hd: 4.4 }]
    case 'lighthouse': // primitive base r3.6 / bridge pylon
      return [{ x: l.pos.x, z: l.pos.z, hw: 3.8, hd: 3.8 }]
    case 'spire': // primitive cone r5 + side cones / spiral tower
      return [{ x: l.pos.x, z: l.pos.z, hw: 5.2, hd: 5.2 }]
    case 'arch': // solid 30×6 base slab / district gate
      return [{ x: l.pos.x, z: l.pos.z, hw: 15, hd: 3.2 }]
    case 'tower': // stacked 8×8 boxes / lighthouse swap
      return [{ x: l.pos.x, z: l.pos.z, hw: 4.2, hd: 4.2 }]
    case 'mountain': // twin cliff cones (r26 centre + r12 at offset)
      return [
        { x: l.pos.x, z: l.pos.z, hw: 21, hd: 21 },
        { x: l.pos.x + 14, z: l.pos.z + 8, hw: 9, hd: 9 },
      ]
  }
})

/** Building / car / prop / quest / landmark footprints — the controller
 *  blocks the hero from all of these. */
export const COLLIDERS: Collider[] = [
  ...COLLIDERS_OUT,
  ...QUEST_FOOTPRINTS,
  ...PROP_FOOTPRINTS,
  ...LANDMARK_FOOTPRINTS,
]

/* --------------------------------------------------------- Collider broadphase */

// The hero used to test every collider (~2.8k) every frame — a full linear scan.
// Bucket the static colliders into a uniform grid once so movement only checks
// the handful sharing the hero's cell. Cells are road-block sized; each collider
// is inserted into every cell its (padded) AABB overlaps, so any collider that
// could touch the hero is guaranteed to live in the hero's own cell.
const BROAD_CELL = ROAD_STEP
const BROAD_ORIGIN = GROUND_HALF
const BROAD_STRIDE = Math.ceil((GROUND_HALF * 2) / BROAD_CELL) + 2
const BROAD_PAD = 1 // must exceed the controller's body radius (0.7)
const EMPTY_COLLIDERS: Collider[] = []

function broadKey(ix: number, iz: number): number {
  return ix * BROAD_STRIDE + iz
}

const BROAD_GRID: Map<number, Collider[]> = (() => {
  const grid = new Map<number, Collider[]>()
  for (const c of COLLIDERS) {
    const minIx = Math.floor((c.x - c.hw - BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
    const maxIx = Math.floor((c.x + c.hw + BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
    const minIz = Math.floor((c.z - c.hd - BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
    const maxIz = Math.floor((c.z + c.hd + BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iz = minIz; iz <= maxIz; iz++) {
        const key = broadKey(ix, iz)
        let bucket = grid.get(key)
        if (!bucket) {
          bucket = []
          grid.set(key, bucket)
        }
        bucket.push(c)
      }
    }
  }
  return grid
})()

/* ------------------------------------------------- dynamic prop colliders */

// Streamed layers (Meshy signature/grit dressing, encounter terminals, city
// interactable shells) register footprints for exactly what they RENDER, so
// solidity always matches what the player sees: nothing collides while the
// primitive city shows nothing there, and nothing renders walk-through-able.
// Registration happens on stream transitions (~1/s while moving, never per
// frame); queries stay allocation-free via per-cell merged buckets that are
// rebuilt only when a registration changes.

const DYNAMIC_SETS = new Map<string, Collider[]>()
/** Cell key → static ∪ dynamic colliders; null while nothing is registered. */
let MERGED_GRID: Map<number, Collider[]> | null = null

function insertIntoGrid(grid: Map<number, Collider[]>, c: Collider): void {
  const minIx = Math.floor((c.x - c.hw - BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
  const maxIx = Math.floor((c.x + c.hw + BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
  const minIz = Math.floor((c.z - c.hd - BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
  const maxIz = Math.floor((c.z + c.hd + BROAD_PAD + BROAD_ORIGIN) / BROAD_CELL)
  for (let ix = minIx; ix <= maxIx; ix++) {
    for (let iz = minIz; iz <= maxIz; iz++) {
      const key = broadKey(ix, iz)
      let bucket = grid.get(key)
      if (!bucket) {
        // Seed with the static bucket so a merged cell supersedes it 1:1.
        bucket = [...(BROAD_GRID.get(key) ?? EMPTY_COLLIDERS)]
        grid.set(key, bucket)
      }
      bucket.push(c)
    }
  }
}

function rebuildMergedGrid(): void {
  if (DYNAMIC_SETS.size === 0) {
    MERGED_GRID = null
    return
  }
  const grid = new Map<number, Collider[]>()
  for (const set of DYNAMIC_SETS.values()) {
    for (const c of set) insertIntoGrid(grid, c)
  }
  MERGED_GRID = grid
}

/**
 * Replace the dynamic collider set owned by `owner` (empty list = remove).
 * Call from stream/mount transitions only — each call rebuilds the merged
 * broadphase overlay (cheap: a few hundred colliders at most).
 */
export function setDynamicColliders(owner: string, colliders: readonly Collider[]): void {
  if (colliders.length === 0) {
    if (!DYNAMIC_SETS.delete(owner)) return
  } else {
    // No-op sets skip the rebuild: React effects re-fire with identical
    // placements whenever a sibling cell streams (shared model-map identity),
    // which would otherwise stack ~1 rebuild per live cell in one frame.
    const prev = DYNAMIC_SETS.get(owner)
    if (prev && prev.length === colliders.length) {
      let same = true
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i]
        const b = colliders[i]
        if (a.x !== b.x || a.z !== b.z || a.hw !== b.hw || a.hd !== b.hd || a.top !== b.top) {
          same = false
          break
        }
      }
      if (same) return
    }
    DYNAMIC_SETS.set(owner, [...colliders])
  }
  rebuildMergedGrid()
}

/** Test seam — clears every registered dynamic set. */
export function resetDynamicCollidersForTests(): void {
  DYNAMIC_SETS.clear()
  MERGED_GRID = null
}

/** Introspection for tests/probes: owner → registered collider count. */
export function dynamicColliderCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [owner, set] of DYNAMIC_SETS) out[owner] = set.length
  return out
}

/**
 * Axis-aligned footprint of a local box (half-extents hw×hd) rotated by
 * `yaw` and scaled by `s` — streamed props register through this so their
 * colliders stay rotation-aware.
 */
export function rotatedFootprint(
  x: number,
  z: number,
  hw: number,
  hd: number,
  yaw: number,
  s = 1,
  top?: number,
): Collider {
  const cos = Math.abs(Math.cos(yaw))
  const sin = Math.abs(Math.sin(yaw))
  return {
    x,
    z,
    hw: (cos * hw + sin * hd) * s,
    hd: (sin * hw + cos * hd) * s,
    ...(top !== undefined ? { top: top * s } : {}),
  }
}

/** Static + registered dynamic colliders that could overlap the point
 *  (x, z). Allocation-free. */
export function collidersNear(x: number, z: number): Collider[] {
  const ix = Math.floor((x + BROAD_ORIGIN) / BROAD_CELL)
  const iz = Math.floor((z + BROAD_ORIGIN) / BROAD_CELL)
  const key = broadKey(ix, iz)
  if (MERGED_GRID) {
    const merged = MERGED_GRID.get(key)
    if (merged) return merged
  }
  return BROAD_GRID.get(key) ?? EMPTY_COLLIDERS
}

/* ------------------------------------------------------------- Street routing */

function nearestRoadLine(v: number): number {
  let best = ROAD_LINES[0]
  let bd = Infinity
  for (const l of ROAD_LINES) {
    const d = Math.abs(l - v)
    if (d < bd) {
      bd = d
      best = l
    }
  }
  return best
}

/**
 * A street-following zig-zag route from `from` to `to`. Turns are snapped to the
 * road grid so the guide trail bends down avenues instead of cutting straight
 * across blocks. Returns an ordered polyline including both endpoints.
 */
export function roadRoute(from: Vec2, to: Vec2): Vec2[] {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.hypot(dx, dz) < 26) return [from, to]

  // Bend along a road line roughly between the two points. Lead with whichever
  // axis is longer so the dog-leg looks natural. Deterministic so the trail is
  // stable frame to frame.
  const bendX = nearestRoadLine(from.x + dx * 0.5)
  const bendZ = nearestRoadLine(from.z + dz * 0.5)

  if (Math.abs(dx) >= Math.abs(dz)) {
    // travel along X first, turn, then settle on the target's row
    return [from, { x: bendX, z: from.z }, { x: bendX, z: to.z }, to]
  }
  return [from, { x: from.x, z: bendZ }, { x: to.x, z: bendZ }, to]
}
