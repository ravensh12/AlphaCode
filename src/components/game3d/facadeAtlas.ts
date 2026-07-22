import * as THREE from 'three'

/* ============================================================================
   Phase 3 — FACADE STYLE ATLAS.

   One shared texture set gives every building in the city a real facade
   while keeping the whole skyline at two instanced draws:

   - The atlas packs 8 architectural styles in a 4×2 grid. Each style tile is
     a 4 bays × 4 floors window pattern block; the facade shader re-projects
     it in METER space (bays 2.6m, floors 3.0m — see applyFacadeAtlas in
     simulation.ts), so windows are always window-sized no matter how the
     instance box is scaled. Per-instance attributes pick the style tile.
   - Three maps share the layout: albedo (walls/frames/glass), emissive
     (per-window lit tints — the runtime office schedule gates them), and a
     linear data map with roughness in G and the window mask in B (the mask
     gates the parallax interior mapping).
   - A companion room atlas feeds the interior mapping: 8 tiny room "back
     walls" with furniture silhouettes; side walls/floor/ceiling are shaded
     analytically in the shader.

   Everything is rasterized ONCE per mount from seeded noise (deterministic
   across runs, ships zero bytes). The style specs and the packing math are
   pure and Node-testable; only the *Textures() entry points touch canvas.
   ========================================================================== */

export const FACADE_STYLE_COUNT = 8
export const FACADE_ATLAS_COLS = 4
export const FACADE_ATLAS_ROWS = 2

/** Meter-space window rhythm — the shader divides facade meters by these. */
export const FACADE_BAY_METERS = 2.6
export const FACADE_FLOOR_METERS = 3.0
/** Window cells per style tile edge (tile = 4 bays × 4 floors). */
export const FACADE_CELLS_PER_TILE = 4

/** Normalized UV size of one style tile. */
export const FACADE_TILE_U = 1 / FACADE_ATLAS_COLS
export const FACADE_TILE_V = 1 / FACADE_ATLAS_ROWS

/** Bottom-left UV origin of a style tile (0..7), row-major from the top. */
export function styleTileOrigin(style: number): { u: number; v: number } {
  const s = Math.max(0, Math.min(FACADE_STYLE_COUNT - 1, Math.floor(style)))
  const col = s % FACADE_ATLAS_COLS
  const row = Math.floor(s / FACADE_ATLAS_COLS)
  // Canvas rasters draw row 0 at the top; CanvasTexture flipY puts v=0 at the
  // bottom, so the tile's UV origin flips the row.
  return { u: col * FACADE_TILE_U, v: (FACADE_ATLAS_ROWS - 1 - row) * FACADE_TILE_V }
}

/* ---------------------------------------------------------------- styles -- */

export interface FacadeStyleSpec {
  name: string
  /** Base wall paint (multiplied by the per-instance district tint). */
  wall: string
  /** Horizontal floor band / spandrel color. */
  band: string
  frame: string
  /** Unlit glass. */
  glass: string
  /** Lit-window tints (emissive map variety; schedule gates at runtime). */
  lit: string[]
  /** Window rect inside a cell: [left, top, width, height] as cell fractions. */
  windowRect: [number, number, number, number]
  /** Vertical mullions splitting each window (0–2). */
  mullions: 0 | 1 | 2
  /** Chance a cell actually has a window (industrial walls stay blank). */
  windowChance: number
  wallRough: number
  glassRough: number
  /** Vertical corrugation/timber stripe period in cell fractions (0 = none). */
  stripes: number
}

const WARM_LIT = ['#ffe7a0', '#fff2c8', '#ffd9a0', '#ffe2b8', '#f6efdc']
const COOL_LIT = ['#bfe3ff', '#d8f2ff', '#cfe8ff']
const NEON_LIT = ['#c9b2ff', '#8fe8ff', '#ff9ee8', '#b0a4ff', '#7df3ff']

export const FACADE_STYLES: FacadeStyleSpec[] = [
  {
    name: 'glass-tower',
    wall: '#c7d2da',
    band: '#8b979f',
    frame: '#3c4650',
    glass: '#54707f',
    lit: [...COOL_LIT, '#ffe7a0'],
    windowRect: [0.06, 0.08, 0.88, 0.78],
    mullions: 2,
    windowChance: 1,
    wallRough: 0.55,
    glassRough: 0.08,
    stripes: 0,
  },
  {
    name: 'white-composite',
    wall: '#e9ebed',
    band: '#c4c9cd',
    frame: '#5a636b',
    glass: '#4e6373',
    lit: WARM_LIT,
    windowRect: [0.14, 0.16, 0.72, 0.6],
    mullions: 1,
    windowChance: 1,
    wallRough: 0.78,
    glassRough: 0.1,
    stripes: 0,
  },
  {
    name: 'harbor-stucco',
    wall: '#f0e9da',
    band: '#d6c8ac',
    frame: '#7c6a52',
    glass: '#57666e',
    lit: WARM_LIT,
    windowRect: [0.2, 0.18, 0.6, 0.58],
    mullions: 1,
    windowChance: 0.94,
    wallRough: 0.9,
    glassRough: 0.12,
    stripes: 0,
  },
  {
    name: 'teal-timber',
    wall: '#dfeceb',
    band: '#4e8892',
    frame: '#2f5f68',
    glass: '#4d626b',
    lit: [...WARM_LIT, '#d8fff2'],
    windowRect: [0.16, 0.14, 0.68, 0.62],
    mullions: 1,
    windowChance: 0.94,
    wallRough: 0.82,
    glassRough: 0.12,
    stripes: 0.5,
  },
  {
    name: 'neon-frame',
    wall: '#5d5a6c',
    band: '#37343f',
    frame: '#232029',
    glass: '#3d4157',
    lit: NEON_LIT,
    windowRect: [0.08, 0.1, 0.84, 0.74],
    mullions: 2,
    windowChance: 1,
    wallRough: 0.6,
    glassRough: 0.07,
    stripes: 0,
  },
  {
    name: 'sandstone',
    wall: '#e3cda6',
    band: '#c8ad7e',
    frame: '#8a6f4c',
    glass: '#5b6068',
    lit: WARM_LIT,
    windowRect: [0.22, 0.1, 0.56, 0.68],
    mullions: 0,
    windowChance: 0.92,
    wallRough: 0.94,
    glassRough: 0.14,
    stripes: 0,
  },
  {
    name: 'corrugated',
    wall: '#a9b1b9',
    band: '#78828c',
    frame: '#4a525a',
    glass: '#4c5a62',
    lit: ['#ffe7a0', '#fff2c8', '#ffd28a'],
    windowRect: [0.12, 0.26, 0.76, 0.42],
    mullions: 2,
    windowChance: 0.45,
    wallRough: 0.68,
    glassRough: 0.16,
    stripes: 0.25,
  },
  {
    name: 'alpine',
    wall: '#e8e1d2',
    band: '#8a7358',
    frame: '#59493a',
    glass: '#4e5f6b',
    lit: WARM_LIT,
    windowRect: [0.16, 0.18, 0.68, 0.56],
    mullions: 1,
    windowChance: 0.9,
    wallRough: 0.86,
    glassRough: 0.12,
    stripes: 0.5,
  },
]

/** Deterministic 0..1 hash for a window cell of a style tile. */
export function windowCellHash(style: number, cx: number, cy: number): number {
  const s = Math.sin(style * 61.7 + cx * 12.9898 + cy * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** Whether a tile cell is a window (vs blank wall) — shared with the raster. */
export function cellHasWindow(style: number, cx: number, cy: number): boolean {
  return windowCellHash(style, cx, cy) < FACADE_STYLES[style].windowChance
}

/* --------------------------------------------------------------- rasters -- */

export interface FacadeAtlasTextures {
  /** sRGB albedo: walls, frames, unlit glass. */
  map: THREE.CanvasTexture
  /** sRGB emissive: per-window lit tints (runtime schedule gates them). */
  emissive: THREE.CanvasTexture
  /** Linear data: G = roughness, B = window mask (interior-mapping gate). */
  data: THREE.CanvasTexture
  /** Atlas pixel width (tests/debug). */
  size: number
}

export type FacadeAtlasResolution = 'full' | 'half'

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('facadeAtlas: 2d context unavailable')
  return { canvas, ctx }
}

function finishColor(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4
  return tex
}

function finishData(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4
  return tex
}

let facadeFull: FacadeAtlasTextures | null = null
let facadeHalf: FacadeAtlasTextures | null = null

/** Lighten (+amt) / darken (−amt) a hex color; amt in [-1, 1]. */
function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Rasterize (once per resolution) the shared facade atlas. 'full' = 512px
 * tiles (2048×1024 atlas, HIGH/ULTRA); 'half' = 256px tiles (MEDIUM).
 */
export function facadeAtlasTextures(res: FacadeAtlasResolution = 'full'): FacadeAtlasTextures {
  const cached = res === 'full' ? facadeFull : facadeHalf
  if (cached) return cached

  const tile = res === 'full' ? 512 : 256
  const W = tile * FACADE_ATLAS_COLS
  const H = tile * FACADE_ATLAS_ROWS
  const albedo = makeCanvas(W, H)
  const emissive = makeCanvas(W, H)
  const data = makeCanvas(W, H)

  emissive.ctx.fillStyle = '#000000'
  emissive.ctx.fillRect(0, 0, W, H)

  const cell = tile / FACADE_CELLS_PER_TILE

  for (let s = 0; s < FACADE_STYLE_COUNT; s++) {
    const spec = FACADE_STYLES[s]
    const ox = (s % FACADE_ATLAS_COLS) * tile
    const oy = Math.floor(s / FACADE_ATLAS_COLS) * tile

    // Wall base + roughness/mask base.
    albedo.ctx.fillStyle = spec.wall
    albedo.ctx.fillRect(ox, oy, tile, tile)
    data.ctx.fillStyle = `rgb(255, ${Math.round(spec.wallRough * 255)}, 0)`
    data.ctx.fillRect(ox, oy, tile, tile)

    // Realism rebuild — material variation so daylight facades stop reading
    // as flat paint: per-cell wall tone patches (weathering / panel drift)
    // plus matched roughness jitter in the data map. All hash-deterministic.
    for (let cy = 0; cy < FACADE_CELLS_PER_TILE; cy++) {
      for (let cx = 0; cx < FACADE_CELLS_PER_TILE; cx++) {
        const left = ox + cx * cell
        const top = oy + cy * cell
        const tone = (windowCellHash(s, cx + 21, cy + 13) - 0.5) * 0.13
        albedo.ctx.fillStyle =
          tone >= 0 ? `rgba(255,255,255,${tone.toFixed(3)})` : `rgba(8,10,14,${(-tone).toFixed(3)})`
        albedo.ctx.fillRect(left, top, Math.ceil(cell), Math.ceil(cell))
        const rough = Math.max(
          0.2,
          Math.min(1, spec.wallRough + (windowCellHash(s, cx + 33, cy + 27) - 0.5) * 0.2),
        )
        data.ctx.fillStyle = `rgb(255, ${Math.round(rough * 255)}, 0)`
        data.ctx.fillRect(left, top, Math.ceil(cell), Math.ceil(cell))
      }
    }
    // Grime streaks bleeding down from a few random cells (rain wash).
    for (let g = 0; g < 6; g++) {
      const gh = windowCellHash(s, g + 51, g * 3 + 7)
      const gx = ox + Math.round(gh * (tile - 8))
      const gw = Math.max(2, Math.round(cell * (0.05 + gh * 0.08)))
      albedo.ctx.fillStyle = `rgba(20, 22, 26, ${(0.04 + gh * 0.05).toFixed(3)})`
      albedo.ctx.fillRect(gx, oy, gw, tile)
    }

    // Vertical stripes (corrugation / timber studs).
    if (spec.stripes > 0) {
      const period = Math.max(4, Math.round(cell * spec.stripes))
      albedo.ctx.fillStyle = 'rgba(0,0,0,0.07)'
      for (let x = ox; x < ox + tile; x += period) {
        albedo.ctx.fillRect(x, oy, Math.max(2, Math.round(period * 0.28)), tile)
      }
    }

    for (let cy = 0; cy < FACADE_CELLS_PER_TILE; cy++) {
      const top = oy + cy * cell
      // Floor band along the bottom of every cell row, with a slab shadow
      // above it and a thin catch-light below — floors read as real depth.
      const bandY = Math.round(top + cell * 0.94)
      const bandH = Math.max(2, Math.round(cell * 0.06))
      albedo.ctx.fillStyle = 'rgba(0,0,0,0.12)'
      albedo.ctx.fillRect(ox, bandY - Math.max(1, Math.round(cell * 0.015)), tile, Math.max(1, Math.round(cell * 0.015)))
      albedo.ctx.fillStyle = spec.band
      albedo.ctx.fillRect(ox, bandY, tile, bandH)
      albedo.ctx.fillStyle = 'rgba(255,255,255,0.06)'
      albedo.ctx.fillRect(ox, bandY, tile, Math.max(1, Math.round(bandH * 0.3)))

      for (let cx = 0; cx < FACADE_CELLS_PER_TILE; cx++) {
        if (!cellHasWindow(s, cx, cy)) continue
        const left = ox + cx * cell
        const [rl, rt, rw, rh] = spec.windowRect
        const wx = Math.round(left + rl * cell)
        const wy = Math.round(top + rt * cell)
        const ww = Math.round(rw * cell)
        const wh = Math.round(rh * cell)
        const border = Math.max(2, Math.round(cell * 0.035))

        // Frame then glass — glass carries a vertical sky-reflection gradient
        // instead of flat paint, so daylight windows read as glazing.
        albedo.ctx.fillStyle = spec.frame
        albedo.ctx.fillRect(wx - border, wy - border, ww + border * 2, wh + border * 2)
        const glassGrad = albedo.ctx.createLinearGradient(0, wy, 0, wy + wh)
        glassGrad.addColorStop(0, shadeHex(spec.glass, 0.22))
        glassGrad.addColorStop(0.55, spec.glass)
        glassGrad.addColorStop(1, shadeHex(spec.glass, -0.16))
        albedo.ctx.fillStyle = glassGrad
        albedo.ctx.fillRect(wx, wy, ww, wh)
        // Diagonal reflection streak on ~40% of panes.
        if (windowCellHash(s, cx + 45, cy + 39) < 0.4) {
          albedo.ctx.save()
          albedo.ctx.beginPath()
          albedo.ctx.rect(wx, wy, ww, wh)
          albedo.ctx.clip()
          albedo.ctx.fillStyle = 'rgba(255,255,255,0.10)'
          albedo.ctx.beginPath()
          albedo.ctx.moveTo(wx - ww * 0.2, wy + wh)
          albedo.ctx.lineTo(wx + ww * 0.35, wy)
          albedo.ctx.lineTo(wx + ww * 0.6, wy)
          albedo.ctx.lineTo(wx + ww * 0.05, wy + wh)
          albedo.ctx.closePath()
          albedo.ctx.fill()
          albedo.ctx.restore()
        }

        // Mullions split the glass verticaly (thin frame strips).
        if (spec.mullions > 0) {
          albedo.ctx.fillStyle = spec.frame
          for (let m = 1; m <= spec.mullions; m++) {
            const mx = Math.round(wx + (ww * m) / (spec.mullions + 1))
            albedo.ctx.fillRect(mx - 1, wy, Math.max(2, border - 1), wh)
          }
        }

        // Sill shadow under the frame (the strongest single depth cue).
        albedo.ctx.fillStyle = 'rgba(0,0,0,0.16)'
        albedo.ctx.fillRect(wx - border, wy + wh + border, ww + border * 2, Math.max(2, Math.round(cell * 0.03)))

        // Emissive: every window carries a lit tint; the office schedule in
        // the shader decides which are on right now. Night-city pass (July
        // 2026): the glow is SHADED instead of a flat rect — a ceiling-light
        // gradient, baked per-window brightness, mullion/transom shadows and
        // occasional pulled blinds — so the lit grid reads as rooms with
        // lights in them, not an LED checkerboard.
        const lit = spec.lit[Math.floor(windowCellHash(s, cx + 9, cy + 3) * spec.lit.length) % spec.lit.length]
        const glowRoll = windowCellHash(s, cx + 57, cy + 71)
        const litBase = glowRoll < 0.3 ? shadeHex(lit, -0.28) : lit
        const eGrad = emissive.ctx.createLinearGradient(0, wy, 0, wy + wh)
        eGrad.addColorStop(0, shadeHex(litBase, 0.12))
        eGrad.addColorStop(0.3, litBase)
        eGrad.addColorStop(1, shadeHex(litBase, -0.5))
        emissive.ctx.fillStyle = eGrad
        emissive.ctx.fillRect(wx, wy, ww, wh)
        // ~1 in 5 rooms has the blinds pulled: only a slit of light escapes.
        if (glowRoll > 0.8) {
          emissive.ctx.fillStyle = 'rgba(0,0,0,0.78)'
          emissive.ctx.fillRect(wx, wy, ww, Math.round(wh * (0.45 + (glowRoll - 0.8))))
        }
        // Mullion + transom shadows survive the glow (the frame is in FRONT
        // of the light) — the strongest anti-checkerboard cue at distance.
        if (spec.mullions > 0) {
          emissive.ctx.fillStyle = 'rgba(0,0,0,0.82)'
          for (let m = 1; m <= spec.mullions; m++) {
            const mx = Math.round(wx + (ww * m) / (spec.mullions + 1))
            emissive.ctx.fillRect(mx - 1, wy, Math.max(2, border - 1), wh)
          }
        }
        if (wh > cell * 0.4) {
          emissive.ctx.fillStyle = 'rgba(0,0,0,0.55)'
          emissive.ctx.fillRect(wx, wy + Math.round(wh * 0.52), ww, Math.max(1, Math.round(cell * 0.018)))
        }

        // Data: glossy glass + window mask.
        data.ctx.fillStyle = `rgb(255, ${Math.round(spec.glassRough * 255)}, 255)`
        data.ctx.fillRect(wx, wy, ww, wh)
      }
    }
  }

  const out: FacadeAtlasTextures = {
    map: finishColor(albedo.canvas),
    emissive: finishColor(emissive.canvas),
    data: finishData(data.canvas),
    size: W,
  }
  if (res === 'full') facadeFull = out
  else facadeHalf = out
  return out
}

/* ------------------------------------------------------------ room atlas -- */

export const ROOM_COUNT = 8
export const ROOM_ATLAS_COLS = 4
export const ROOM_ATLAS_ROWS = 2

/** Bottom-left UV origin of a room tile (mirrors styleTileOrigin math). */
export function roomTileOrigin(room: number): { u: number; v: number } {
  const r = Math.max(0, Math.min(ROOM_COUNT - 1, Math.floor(room)))
  const col = r % ROOM_ATLAS_COLS
  const row = Math.floor(r / ROOM_ATLAS_COLS)
  return { u: col / ROOM_ATLAS_COLS, v: (ROOM_ATLAS_ROWS - 1 - row) / ROOM_ATLAS_ROWS }
}

const ROOM_WALLS = ['#c9b18e', '#8ea4b8', '#b8a4c9', '#93b39a', '#c9c2a6', '#7f93ad', '#b89e93', '#9aa3b0']

let roomAtlas: THREE.CanvasTexture | null = null

/**
 * The interior-mapping back-wall atlas: 8 rooms, each a warm gradient wall
 * with furniture silhouettes and a ceiling light pool. Sampled only where
 * the parallax ray hits the virtual back wall.
 */
export function roomAtlasTexture(): THREE.CanvasTexture {
  if (roomAtlas) return roomAtlas
  const tile = 128
  const W = tile * ROOM_ATLAS_COLS
  const H = tile * ROOM_ATLAS_ROWS
  const { canvas, ctx } = makeCanvas(W, H)

  for (let r = 0; r < ROOM_COUNT; r++) {
    const ox = (r % ROOM_ATLAS_COLS) * tile
    const oy = Math.floor(r / ROOM_ATLAS_COLS) * tile
    const wall = ROOM_WALLS[r]

    // Back wall gradient — brighter toward the ceiling light.
    const grad = ctx.createLinearGradient(0, oy, 0, oy + tile)
    grad.addColorStop(0, '#fff3d8')
    grad.addColorStop(0.35, wall)
    grad.addColorStop(1, '#3a3630')
    ctx.fillStyle = grad
    ctx.fillRect(ox, oy, tile, tile)

    // Ceiling light pool.
    ctx.fillStyle = 'rgba(255, 244, 214, 0.9)'
    ctx.fillRect(ox + tile * 0.3, oy + 2, tile * 0.4, 5)

    // Furniture silhouettes (desks / shelves / screens), deterministic per room.
    ctx.fillStyle = 'rgba(30, 26, 34, 0.55)'
    const h1 = windowCellHash(r, 1, 7)
    const h2 = windowCellHash(r, 5, 2)
    // desk
    ctx.fillRect(ox + tile * (0.1 + h1 * 0.2), oy + tile * 0.62, tile * 0.34, tile * 0.06)
    ctx.fillRect(ox + tile * (0.14 + h1 * 0.2), oy + tile * 0.68, tile * 0.04, tile * 0.3)
    // shelf / cabinet
    ctx.fillRect(ox + tile * (0.6 + h2 * 0.14), oy + tile * 0.34, tile * 0.22, tile * 0.62)
    // glowing screen — the "someone's coding in there" beat.
    ctx.fillStyle = r % 2 ? 'rgba(140, 226, 255, 0.85)' : 'rgba(160, 255, 200, 0.8)'
    ctx.fillRect(ox + tile * (0.16 + h1 * 0.2), oy + tile * 0.5, tile * 0.16, tile * 0.1)
  }

  roomAtlas = finishColor(canvas)
  return roomAtlas
}

/* ----------------------------------------------------------- sign glyphs -- */

const SIGN_GLYPHS = ['{', '}', '<', '>', '=', ';', '/', '*'] as const

let signAtlas: THREE.CanvasTexture | null = null

/** Emissive code-glyph atlas for district holo-signs (4×2 tiles). */
export function signGlyphAtlasTexture(): THREE.CanvasTexture {
  if (signAtlas) return signAtlas
  const tile = 64
  const { canvas, ctx } = makeCanvas(tile * 4, tile * 2)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.round(tile * 0.72)}px "Courier New", monospace`
  for (let i = 0; i < SIGN_GLYPHS.length; i++) {
    const ox = (i % 4) * tile
    const oy = Math.floor(i / 4) * tile
    ctx.fillStyle = '#ffffff'
    ctx.fillText(SIGN_GLYPHS[i], ox + tile / 2, oy + tile / 2 + 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.strokeRect(ox + 5, oy + 5, tile - 10, tile - 10)
  }
  signAtlas = finishColor(canvas)
  return signAtlas
}

/** UV origin for a sign glyph tile (bottom-left, flipY-aware). */
export function signGlyphOrigin(glyph: number): { u: number; v: number } {
  const g = Math.max(0, Math.min(SIGN_GLYPHS.length - 1, Math.floor(glyph)))
  return { u: (g % 4) / 4, v: g < 4 ? 0.5 : 0 }
}
