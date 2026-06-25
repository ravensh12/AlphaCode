import { WORLDS, OVERWORLD_SIZE, type World } from '../../content/adventure'

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

export function to3d(p: { x: number; y: number }): Vec2 {
  return {
    x: (p.x / OVERWORLD_SIZE.width - 0.5) * WORLD_SPAN,
    z: (p.y / OVERWORLD_SIZE.height - 0.5) * WORLD_SPAN,
  }
}

export function toPixel(v: Vec2): { x: number; y: number } {
  return {
    x: Math.round((v.x / WORLD_SPAN + 0.5) * OVERWORLD_SIZE.width),
    y: Math.round((v.z / WORLD_SPAN + 0.5) * OVERWORLD_SIZE.height),
  }
}

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

export const PATH_3D: Vec2[] = [START_3D, ...CHECKPOINTS_3D.map((c) => c.flag)]

/**
 * Each lesson is approached through a chain of enterable buildings spread far
 * apart across the city. Passing each one ramps the zombie horde.
 */
export const GATES_PER_WORLD = 3
const GATE_FRACS = [0.26, 0.54, 0.82] // wide spacing along the route

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
export type Collider = { x: number; z: number; hw: number; hd: number }

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

        // street trees + planters hugging the lot edges toward the road — denser
        // now so tall greenery breaks up long sightlines down the avenues.
        if (rnd() < 0.85)
          out.tree.push({ x: lot.lx, z: lot.lz + d / 2 + 2.4, s: 1.0 + rnd() * 0.7, r: rnd() * 6 })
        if (rnd() < 0.7)
          out.tree.push({ x: lot.lx + (rnd() * 2 - 1) * w * 0.4, z: lot.lz - d / 2 - 2.4, s: 0.9 + rnd() * 0.7, r: rnd() * 6 })
        if (rnd() < 0.6)
          out.planter.push({ x: lot.lx - w / 2 - 2, z: lot.lz + (rnd() * 2 - 1) * d * 0.3, s: 0.7 + rnd() * 0.5, r: rnd() * 6 })
        if (rnd() < 0.5)
          out.planter.push({ x: lot.lx + w / 2 + 2, z: lot.lz + (rnd() * 2 - 1) * d * 0.3, s: 0.7 + rnd() * 0.5, r: rnd() * 6 })
      }
    }
  }

  // --- Street furniture along the avenues ----------------------------------
  // Dense lamps + alternating benches / trash cans on both kerbs of each road.
  for (const at of GRID) {
    let toggle = 0
    for (let s = -LIMIT + ROAD_STEP / 3; s <= LIMIT; s += ROAD_STEP / 3) {
      toggle++
      for (const side of [-1, 1]) {
        const off = ROAD_HALF + SIDEWALK - 1
        // vertical road kerb
        const vx = at + side * off
        if (Math.hypot(vx, s) <= LIMIT && !inAny(plazas, vx, s, -10)) {
          out.lamp.push({ x: vx, z: s, s: 1, r: 0 })
          if (toggle % 3 === 0) out.bench.push({ x: vx, z: s + 3, s: 1, r: 0 })
          else if (toggle % 3 === 1) out.trashCan.push({ x: vx, z: s + 2, s: 1, r: 0 })
        }
        // horizontal road kerb
        const hz = at + side * off
        if (Math.hypot(s, hz) <= LIMIT && !inAny(plazas, s, hz, -10)) {
          out.lamp.push({ x: s, z: hz, s: 1, r: 0 })
          if (toggle % 3 === 2) out.bench.push({ x: s + 3, z: hz, s: 1, r: Math.PI / 2 })
        }
      }
    }
  }

  // --- Parked cars hugging the kerb (colliders) ----------------------------
  const carRnd = mulberry32(7731)
  for (const at of GRID) {
    for (let s = -LIMIT + 18; s <= LIMIT - 18; s += 20) {
      if (carRnd() < 0.7) {
        const side = carRnd() < 0.5 ? -1 : 1
        const x = at + side * (ROAD_HALF + 1.6)
        const z = s + (carRnd() * 2 - 1) * 3
        if (Math.hypot(x, z) <= LIMIT && !inAny(plazas, x, z)) {
          out.car.push({ x, z, s: 1, r: 0 })
          COLLIDERS_OUT.push({ x, z, hw: 1.4, hd: 2.6 })
        }
      }
      if (carRnd() < 0.66) {
        const side = carRnd() < 0.5 ? -1 : 1
        const z = at + side * (ROAD_HALF + 1.6)
        const x = s + (carRnd() * 2 - 1) * 3
        if (Math.hypot(x, z) <= LIMIT && !inAny(plazas, x, z)) {
          out.car.push({ x, z, s: 1, r: Math.PI / 2 })
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

/** Building / car / quest footprints — the controller blocks the hero from these. */
export const COLLIDERS: Collider[] = [...COLLIDERS_OUT, ...QUEST_FOOTPRINTS]

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
