import { CHECKPOINTS_3D, SCENERY, type Building } from './layout'

/* ============================================================================
   Phase 3 — DISTRICT IDENTITIES (pure, Node-testable).

   Code City's six realm districts each get a visual identity: a facade style
   pair, wall/roof palettes, street-furniture tints, signage density, and a
   window "lit bias" that drives how alive the district reads at night. All of
   it derives deterministically from the existing layout data — positions never
   move, colliders never change; identity is 100% materials + instanced extras.

   The mapping (realm order == world index == BIOME_TINTS order):
     0 Scanner Valley  → Verdant Downtown   (lime)   glass + white composite
     1 Letter Lagoon   → Harborfront        (cyan)   stucco + teal timber
     2 Memory Mines    → Crystal Neon Qtr   (violet) obsidian frames, neon
     3 Twin Bridges    → Old Town           (amber)  sandstone arcades
     4 Stack City      → Container Port     (coral)  corrugated industrial
     5 Halving Heights → Mountain Outskirts (blue)   alpine timber + slate
   ========================================================================== */

export const DISTRICT_COUNT = 6

/** Facade atlas style slots (see facadeAtlas.ts — 8 tiles, 4×2 grid). */
export const STYLE_GLASS_TOWER = 0
export const STYLE_WHITE_COMPOSITE = 1
export const STYLE_HARBOR_STUCCO = 2
export const STYLE_TEAL_TIMBER = 3
export const STYLE_NEON_FRAME = 4
export const STYLE_SANDSTONE = 5
export const STYLE_CORRUGATED = 6
export const STYLE_ALPINE = 7

export interface DistrictTheme {
  /** World/realm index (0-based). */
  index: number
  name: string
  /** Strong accent (matches the realm theme accent used by SIM tints). */
  accent: string
  /** Facade styles: [primary, secondary] atlas tiles. */
  styles: [number, number]
  /** Chance a building takes the secondary style (hashed per building). */
  secondaryChance: number
  /** Wall tints multiplied over the shared facade atlas. */
  wallPalette: string[]
  /** Roof cap tints. */
  roofPalette: string[]
  /** Window lit-bias: 0.15 sleepy industrial … 0.85 neon quarter. */
  litBias: number
  /** Street-furniture tints. */
  bench: string
  planter: string
  canopyTint: string
  /** Holo-sign density multiplier (violet quarter runs 4×). */
  signDensity: number
}

export const DISTRICT_THEMES: DistrictTheme[] = [
  {
    index: 0,
    name: 'Verdant Downtown',
    accent: '#14d39a',
    styles: [STYLE_GLASS_TOWER, STYLE_WHITE_COMPOSITE],
    secondaryChance: 0.45,
    wallPalette: ['#e9edf2', '#dfe7ea', '#d3e4dd', '#e4eff0', '#cfdcd6', '#e8f0ec'],
    roofPalette: ['#3c414b', '#46525a', '#39494a'],
    litBias: 0.5,
    bench: '#7f8f86',
    planter: '#3fae62',
    canopyTint: '#3f9e54',
    signDensity: 1,
  },
  {
    index: 1,
    name: 'Harborfront',
    accent: '#2dd4ee',
    styles: [STYLE_HARBOR_STUCCO, STYLE_TEAL_TIMBER],
    secondaryChance: 0.4,
    wallPalette: ['#f2ede2', '#ecf0ee', '#dcebe9', '#f4efe6', '#d8e6e6', '#efe9dc'],
    roofPalette: ['#3d6470', '#465a66', '#565049'],
    litBias: 0.42,
    bench: '#9a7a52',
    planter: '#4fae5a',
    canopyTint: '#4aa06a',
    signDensity: 1.4,
  },
  {
    index: 2,
    name: 'Crystal Neon Quarter',
    accent: '#6d4afe',
    styles: [STYLE_NEON_FRAME, STYLE_GLASS_TOWER],
    secondaryChance: 0.3,
    wallPalette: ['#6f6c80', '#5d5a6e', '#767283', '#565364', '#6a6478', '#7d7a8c'],
    roofPalette: ['#2e2b3c', '#37324a', '#2a2836'],
    litBias: 0.85,
    bench: '#4d4760',
    planter: '#7a5fd0',
    canopyTint: '#57407e',
    signDensity: 4,
  },
  {
    index: 3,
    name: 'Old Town',
    accent: '#ff9e2c',
    styles: [STYLE_SANDSTONE, STYLE_HARBOR_STUCCO],
    secondaryChance: 0.35,
    wallPalette: ['#e2c9a2', '#dcbf94', '#e8d5b4', '#d4b488', '#ecd9b6', '#d9c49c'],
    roofPalette: ['#8a4a30', '#7c4432', '#94553a'],
    litBias: 0.48,
    bench: '#8a6a44',
    planter: '#5d9c4e',
    canopyTint: '#4f9450',
    signDensity: 0.8,
  },
  {
    index: 4,
    name: 'Container Port',
    accent: '#ff5a5f',
    styles: [STYLE_CORRUGATED, STYLE_SANDSTONE],
    secondaryChance: 0.22,
    wallPalette: ['#b9bec6', '#c86258', '#8d99a6', '#d0d4da', '#b46a60', '#9aa5b0'],
    roofPalette: ['#474d55', '#544240', '#3f464e'],
    litBias: 0.22,
    bench: '#5d6672',
    planter: '#61945a',
    canopyTint: '#55804e',
    signDensity: 0.9,
  },
  {
    index: 5,
    name: 'Mountain Outskirts',
    accent: '#3a86ff',
    styles: [STYLE_ALPINE, STYLE_WHITE_COMPOSITE],
    secondaryChance: 0.35,
    wallPalette: ['#e8e2d4', '#cabfa8', '#d8e2ea', '#efeadf', '#bfb49e', '#dde5ec'],
    roofPalette: ['#49566a', '#3e4a5c', '#55617a'],
    litBias: 0.4,
    bench: '#7a6448',
    planter: '#3d7a4e',
    canopyTint: '#35704a',
    signDensity: 0.7,
  },
]

/* ------------------------------------------------------------ district map */

/** Nearest Academy flag decides the district (ties broken by realm order). */
export function districtIndexAt(x: number, z: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < CHECKPOINTS_3D.length; i++) {
    const f = CHECKPOINTS_3D[i].flag
    const dx = f.x - x
    const dz = f.z - z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Deterministic 0..1 hash of a world position (matches shader hash style). */
export function positionHash(x: number, z: number, salt = 0): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/* ------------------------------------------------------ per-building looks */

export interface BuildingAppearance {
  district: number
  /** Facade atlas style tile (0..7). */
  style: number
  /** Office lit-bias for the window schedule (0..1). */
  litBias: number
  /** Wall tint hex. */
  wall: string
  /** Roof tint hex. */
  roof: string
}

/** Scale a hex color's brightness by `k` (clamped) — pure, no three.js.
 *  `warm` skews red up / blue down (negative = cool skew) so neighbouring
 *  buildings drift in TEMPERATURE as well as value — value-only jitter still
 *  read as "the same paint, lit differently". */
function scaleHex(hex: string, k: number, warm = 0): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number, kk: number) => Math.max(0, Math.min(255, Math.round(v * kk)))
  const r = ch((n >> 16) & 255, k * (1 + warm))
  const g = ch((n >> 8) & 255, k)
  const b = ch(n & 255, k * (1 - warm))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * The deterministic look of one building. Towers in the downtown core force
 * the glass style so the skyline center always reads high-tech.
 */
export function buildingAppearance(b: Building): BuildingAppearance {
  const district = districtIndexAt(b.x, b.z)
  const theme = DISTRICT_THEMES[district]
  const h = positionHash(b.x, b.z)
  let style = h < theme.secondaryChance ? theme.styles[1] : theme.styles[0]
  if (b.kind === 'tower' && Math.hypot(b.x, b.z) < 190) style = STYLE_GLASS_TOWER
  // Realism rebuild: widen per-building value variance (±9% wall, ±7% roof)
  // so a block of same-palette buildings never reads as one flat material,
  // plus a ±3.5% warm/cool temperature drift — sun-bleached vs shaded pours.
  const wallK = 0.91 + positionHash(b.x, b.z, 5) * 0.18
  const roofK = 0.93 + positionHash(b.x, b.z, 7) * 0.14
  const warm = (positionHash(b.x, b.z, 11) - 0.5) * 0.07
  const wall = scaleHex(theme.wallPalette[b.color % theme.wallPalette.length], wallK, warm)
  const roof = scaleHex(theme.roofPalette[b.roof % theme.roofPalette.length], roofK, warm * 0.6)
  // Individual buildings drift ±0.12 around the district bias so blocks never
  // light up uniformly.
  const litBias = Math.min(1, Math.max(0.05, theme.litBias + (positionHash(b.x, b.z, 3) - 0.5) * 0.24))
  return { district, style, litBias, wall, roof }
}

/* -------------------------------------------------- silhouette dressing -- */

/** A non-uniformly scaled instanced box/quad placement. */
export interface DressItem {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  ry: number
  color: string
}

export interface SignItem extends DressItem {
  /** Glyph atlas tile (0..7). */
  glyph: number
}

export interface BuildingDressing {
  /** Tower setback crowns (penthouse/mechanical floors). */
  crowns: DressItem[]
  /** Shop-front awnings (harbor/old-town flavored). */
  awnings: DressItem[]
  /** Emissive code-glyph signs on street faces (neon quarter 4× density). */
  signs: SignItem[]
}

export const SIGN_GLYPH_COUNT = 8

/**
 * Deterministic silhouette extras for every building, all inside existing
 * collider footprints (crowns sit on roofs; awnings/signs hug the wall plane
 * above head height), so gameplay/movement is untouched.
 */
export function buildBuildingDressing(buildings: readonly Building[] = SCENERY.building): BuildingDressing {
  const crowns: DressItem[] = []
  const awnings: DressItem[] = []
  const signs: SignItem[] = []

  for (const b of buildings) {
    const look = buildingAppearance(b)
    const theme = DISTRICT_THEMES[look.district]
    const h1 = positionHash(b.x, b.z, 11)
    const h2 = positionHash(b.x, b.z, 23)

    // Towers + a third of mid-rises: a setback crown block above the roof cap
    // (cap is 0.7 tall) — penthouse/mechanical floors that break the flat-top
    // skyline monotony.
    if ((b.kind === 'tower' && h1 < 0.85) || (b.kind === 'mid' && h1 < 0.34)) {
      const ch = b.kind === 'tower' ? 2.6 + h2 * 3.2 : 1.6 + h2 * 1.8
      crowns.push({
        x: b.x,
        y: b.h + 0.7,
        z: b.z,
        sx: b.w * (0.5 + h2 * 0.18),
        sy: ch,
        sz: b.d * (0.5 + h1 * 0.18),
        ry: b.r,
        color: look.roof,
      })
    }

    // Shops: awning over the street face. Front face (+Z in local space
    // before rotation r ∈ {0, π/2, π, 3π/2}) — offset along the rotated axis.
    if (b.kind === 'shop' && h2 < 0.7 && (look.district === 1 || look.district === 3 || h1 < 0.3)) {
      const sin = Math.sin(b.r)
      const cos = Math.cos(b.r)
      const off = b.d / 2 + 0.42
      awnings.push({
        x: b.x + sin * off,
        y: 3.0,
        z: b.z + cos * off,
        sx: Math.min(6.5, b.w * 0.62),
        sy: 0.09,
        sz: 0.9,
        ry: b.r,
        color: theme.accent,
      })
    }

    // Code-glyph signs on mid/tower street walls, density per district.
    const signRoll = positionHash(b.x, b.z, 41)
    if (b.kind !== 'shop' && signRoll < 0.16 * theme.signDensity) {
      const sin = Math.sin(b.r)
      const cos = Math.cos(b.r)
      const off = b.d / 2 + 0.12
      const size = 1.6 + positionHash(b.x, b.z, 43) * 1.8
      signs.push({
        x: b.x + sin * off,
        y: Math.min(b.h * 0.62, 6 + positionHash(b.x, b.z, 47) * (b.h * 0.4)),
        z: b.z + cos * off,
        sx: size,
        sy: size,
        sz: 1,
        ry: b.r,
        color: theme.accent,
        glyph: Math.floor(positionHash(b.x, b.z, 53) * SIGN_GLYPH_COUNT) % SIGN_GLYPH_COUNT,
      })
    }
  }
  return { crowns, awnings, signs }
}

/* ---------------------------------------------------- street furniture -- */

export type FurnitureKind = 'bench' | 'planter' | 'canopy'

/** District-aware tint for a street furniture instance at (x, z). */
export function furnitureTint(kind: FurnitureKind, x: number, z: number): string {
  const theme = DISTRICT_THEMES[districtIndexAt(x, z)]
  switch (kind) {
    case 'bench':
      return theme.bench
    case 'planter':
      return theme.planter
    case 'canopy':
      return theme.canopyTint
  }
}
