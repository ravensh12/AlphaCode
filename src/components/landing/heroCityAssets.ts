import * as THREE from 'three'

/* ============================================================================
   Landing hero rooftop — local scene assets.

   Small, landing-owned copies of the ideas the game's city uses (facade
   window textures, deterministic layout) — deliberately NOT imported from
   src/components/game3d (read-only to this feature). Everything rasterizes
   once per mount from seeded noise: ships zero bytes.
   ========================================================================== */

/** Deterministic PRNG so the skyline is identical on every visit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface FacadeSpec {
  /** Lit-window tints. */
  lit: string[]
  /** Chance a window cell is lit. */
  litChance: number
  /** Window columns / rows in the texture. */
  cols: number
  rows: number
  seed: number
}

/**
 * A night facade: near-black walls, a grid of window cells, a seeded subset
 * lit. Used as BOTH `map` and `emissiveMap` (unlit pixels are near-black, so
 * only lit windows emit).
 */
export function makeFacadeTexture(spec: FacadeSpec): THREE.CanvasTexture {
  const W = 256
  const H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('heroCityAssets: 2d context unavailable')
  const rnd = mulberry32(spec.seed)

  // Dark walls (silhouettes against the horizon-lit sky plane), street glow
  // catching the lower floors.
  const wallGrad = ctx.createLinearGradient(0, 0, 0, H)
  wallGrad.addColorStop(0, '#080c16')
  wallGrad.addColorStop(0.7, '#0c1322')
  wallGrad.addColorStop(1, '#15203a')
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, W, H)

  const cw = W / spec.cols
  const ch = H / spec.rows
  for (let cy = 0; cy < spec.rows; cy++) {
    for (let cx = 0; cx < spec.cols; cx++) {
      const x = cx * cw
      const y = cy * ch
      const inset = 0.22
      const wx = x + cw * inset
      const wy = y + ch * inset
      const ww = cw * (1 - inset * 2)
      const wh = ch * (1 - inset * 2)
      const roll = rnd()
      if (roll < spec.litChance) {
        const tint = spec.lit[Math.floor(rnd() * spec.lit.length) % spec.lit.length]
        const bright = 0.7 + rnd() * 0.3
        // Whisper of spill around the lit pane (sells glow at distance).
        ctx.globalAlpha = bright * 0.13
        ctx.fillStyle = tint
        ctx.fillRect(wx - ww * 0.18, wy - wh * 0.14, ww * 1.36, wh * 1.28)
        ctx.globalAlpha = bright
        ctx.fillRect(wx, wy, ww, wh)
        // Ceiling-light falloff so lit cells read as rooms, not LEDs.
        ctx.globalAlpha = bright * 0.45
        ctx.fillStyle = '#000000'
        ctx.fillRect(wx, wy + wh * 0.6, ww, wh * 0.4)
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = '#0a1120'
        ctx.fillRect(wx, wy, ww, wh)
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 2
  return tex
}

/** Night-sky gradient: deep blue up top sinking into the city's teal/violet
 *  light-pollution band at the horizon. Drawn on a far plane so every tower
 *  reads as a silhouette against it. */
export function makeSkyTexture(): THREE.CanvasTexture {
  const W = 64
  const H = 512
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('heroCityAssets: 2d context unavailable')
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#04060b')
  g.addColorStop(0.52, '#071019')
  g.addColorStop(0.74, '#0c2331')
  g.addColorStop(0.88, '#14454e')
  g.addColorStop(1, '#1d5f66')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Soft radial glow sprite (horizon haze, ground fog, beacon halos). */
export function makeGlowTexture(inner: string, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('heroCityAssets: 2d context unavailable')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface TowerSpec {
  x: number
  z: number
  w: number
  d: number
  /** World-Y of the tower roof (the hero rooftop is y=0). */
  topY: number
  h: number
  /** Facade material variant index. */
  variant: number
}

export interface NeonTrimSpec {
  x: number
  y: number
  z: number
  w: number
  color: string
}

export interface BeaconSpec {
  x: number
  y: number
  z: number
}

const TRIM_COLORS = ['#41f0dc', '#ff4fd8', '#8a66ff', '#41f0dc', '#57f2b8']

/** Neon roofline trims + aircraft beacons derived from the tower layout. */
export function cityDressing(towers: TowerSpec[], seed: number): {
  trims: NeonTrimSpec[]
  beacons: BeaconSpec[]
} {
  const rnd = mulberry32(seed)
  const trims: NeonTrimSpec[] = []
  const beacons: BeaconSpec[] = []
  for (const t of towers) {
    const roll = rnd()
    const depth = -t.z
    // Sparse neon roof trim, mid/far field only — a skyline seasoning, not
    // a foreground feature.
    if (roll < 0.14 && depth > 60) {
      trims.push({
        x: t.x,
        y: t.topY + 0.3,
        // Front face (toward the hero roof at z≈0).
        z: t.z + t.d / 2,
        w: t.w * (0.4 + rnd() * 0.35),
        color: TRIM_COLORS[Math.floor(rnd() * TRIM_COLORS.length) % TRIM_COLORS.length],
      })
    }
    // Red beacons crown the tallest silhouettes.
    if (t.topY > 12 && rnd() < 0.5) {
      beacons.push({ x: t.x, y: t.topY + 1.6, z: t.z })
    }
  }
  return { trims, beacons }
}

/**
 * The city below: towers fall away from the rooftop edge (city extends -z).
 * A cleared canyon straight ahead keeps the view DOWN unobstructed; flanks
 * and the far ring rise into a skyline silhouette against the horizon glow.
 */
export function towerLayout(seed: number, count = 170): TowerSpec[] {
  const rnd = mulberry32(seed)
  const towers: TowerSpec[] = []
  for (let i = 0; i < count; i++) {
    const z = -26 - rnd() * 160 // -26 .. -186
    const depth01 = (-z - 26) / 160
    // Keep a clear canyon ahead: minimum lateral offset shrinks with depth
    // (far towers may sit anywhere — they're below the sight line anyway).
    const minX = Math.max(0, 14 - depth01 * 14)
    const side = rnd() < 0.5 ? -1 : 1
    const x = side * (minX + rnd() * (40 + depth01 * 92))
    const w = 12 + rnd() * 16
    const d = 12 + rnd() * 16
    // Near the roof: tops well below us. Flanks and the far skyline climb.
    const flank = Math.min(1, Math.abs(x) / (30 + depth01 * 70))
    let topY = -34 + flank * 14 + depth01 * 34 + rnd() * 9
    if (depth01 > 0.7) topY += (depth01 - 0.7) * 66 // far silhouette towers
    topY = Math.min(topY, 27)
    const h = 45 + rnd() * 55
    towers.push({ x, z, w, d, topY, h, variant: Math.floor(rnd() * 3) % 3 })
  }
  return towers
}
