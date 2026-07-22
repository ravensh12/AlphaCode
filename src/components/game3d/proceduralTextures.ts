import * as THREE from 'three'

/* ============================================================================
   M2 — PROCEDURAL PBR DETAIL MAPS.

   Nothing here is fetched: every map is synthesized ONCE at module load from
   seeded noise (deterministic across runs), uploaded as small DataTextures,
   and shared by material families. Costs a few hundred KB of GPU memory and
   ~a millisecond of startup CPU; buys micro-detail that makes the flat-color
   city read as concrete, asphalt and glass under the new image-based light.

   All generators are lazy singletons — call sites can import freely without
   paying for maps a scene never uses.
   ========================================================================== */

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Tiling white noise, box-blurred (wrap-around) to a chosen blotch radius. */
function blurredNoise(size: number, radius: number, seed: number): Float32Array {
  const rnd = mulberry32(seed)
  let src = new Float32Array(size * size)
  for (let i = 0; i < src.length; i++) src[i] = rnd()
  if (radius <= 0) return src
  // Two separable wrap-around box passes ≈ smooth tiling blotches.
  for (let pass = 0; pass < 2; pass++) {
    const dst = new Float32Array(size * size)
    // horizontal
    for (let y = 0; y < size; y++) {
      let acc = 0
      for (let k = -radius; k <= radius; k++) acc += src[y * size + ((k + size) % size)]
      for (let x = 0; x < size; x++) {
        dst[y * size + x] = acc / (radius * 2 + 1)
        const out = (x - radius + size) % size
        const inn = (x + radius + 1) % size
        acc += src[y * size + inn] - src[y * size + out]
      }
    }
    // vertical
    for (let x = 0; x < size; x++) {
      let acc = 0
      for (let k = -radius; k <= radius; k++) acc += dst[((k + size) % size) * size + x]
      for (let y = 0; y < size; y++) {
        src[y * size + x] = acc / (radius * 2 + 1)
        const out = (y - radius + size) % size
        const inn = (y + radius + 1) % size
        acc += dst[inn * size + x] - dst[out * size + x]
      }
    }
  }
  return src
}

/** Normalize a field to 0..1. */
function normalize01(a: Float32Array): Float32Array {
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < a.length; i++) {
    if (a[i] < lo) lo = a[i]
    if (a[i] > hi) hi = a[i]
  }
  const span = hi - lo || 1
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / span
  return a
}

/** Height field → tangent-space normal map (Sobel, wrap-around, +Z out). */
function heightToNormalTexture(h: Float32Array, w: number, hgt: number, strength: number): THREE.DataTexture {
  const data = new Uint8Array(w * hgt * 4)
  for (let y = 0; y < hgt; y++) {
    const y0 = ((y - 1 + hgt) % hgt) * w
    const y1 = y * w
    const y2 = ((y + 1) % hgt) * w
    for (let x = 0; x < w; x++) {
      const x0 = (x - 1 + w) % w
      const x2 = (x + 1) % w
      const dx =
        h[y0 + x2] + 2 * h[y1 + x2] + h[y2 + x2] - (h[y0 + x0] + 2 * h[y1 + x0] + h[y2 + x0])
      const dy =
        h[y2 + x0] + 2 * h[y2 + x] + h[y2 + x2] - (h[y0 + x0] + 2 * h[y0 + x] + h[y0 + x2])
      let nx = -dx * strength
      let ny = -dy * strength
      let nz = 1
      const inv = 1 / Math.hypot(nx, ny, nz)
      nx *= inv
      ny *= inv
      nz *= inv
      const o = (y1 + x) * 4
      data[o] = (nx * 0.5 + 0.5) * 255
      data[o + 1] = (ny * 0.5 + 0.5) * 255
      data[o + 2] = (nz * 0.5 + 0.5) * 255
      data[o + 3] = 255
    }
  }
  return finishTexture(new THREE.DataTexture(data, w, hgt))
}

/** Linear filtering + mipmaps — DataTexture defaults to unmipped Nearest,
 *  which shimmers badly on tiling detail maps seen at street distances. */
function finishTexture(tex: THREE.DataTexture): THREE.DataTexture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/** Scalar field (0..1) → single-channel-style RGBA texture (for roughnessMap). */
function scalarToTexture(f: Float32Array, w: number, h: number): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < f.length; i++) {
    const v = THREE.MathUtils.clamp(f[i], 0, 1) * 255
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  return finishTexture(new THREE.DataTexture(data, w, h))
}

export type SurfaceMaps = { normal: THREE.DataTexture; roughness: THREE.DataTexture }

/* ------------------------------------------------------------------ Asphalt */

let asphalt: SurfaceMaps | null = null

/**
 * Asphalt wear: broad polished patches, fine aggregate grain, and a scatter
 * of glassy specks so the road sparkles subtly in the sun / headlight env.
 * Designed to tile ~6m in world space (see the road world-UV patch).
 */
export function asphaltMaps(): SurfaceMaps {
  if (asphalt) return asphalt
  const S = 256
  const blotch = normalize01(blurredNoise(S, 22, 101))
  const grain = normalize01(blurredNoise(S, 0, 202))
  const mid = normalize01(blurredNoise(S, 5, 303))

  const rough = new Float32Array(S * S)
  const height = new Float32Array(S * S)
  for (let i = 0; i < rough.length; i++) {
    // Wear: blotchy areas polished smoother; grain keeps it alive up close.
    rough[i] = 0.94 - blotch[i] * 0.14 - mid[i] * 0.05 + (grain[i] - 0.5) * 0.08
    height[i] = blotch[i] * 0.45 + mid[i] * 0.3 + grain[i] * 0.25
  }
  // Sparkle: rare glassy chips catch the sun as pinprick glints.
  const rnd = mulberry32(404)
  for (let k = 0; k < 420; k++) {
    const i = (rnd() * rough.length) | 0
    rough[i] = 0.18 + rnd() * 0.1
  }
  asphalt = {
    normal: heightToNormalTexture(height, S, S, 1.4),
    roughness: scalarToTexture(rough, S, S),
  }
  return asphalt
}

/* ----------------------------------------------------------------- Concrete */

let concrete: SurfaceMaps | null = null

/**
 * Pavement / sidewalk concrete: pores, subtle trowel blotches, plus poured
 * PANEL breakup — recessed expansion joints on a 2×2 grid per tile (the tile
 * spans ~6m in world space, so joints land every ~3m like real sidewalk
 * slabs) with a slight per-panel tone/roughness step so adjacent pours never
 * read as one continuous sheet.
 */
export function concreteMaps(): SurfaceMaps {
  if (concrete) return concrete
  const S = 256
  const blotch = normalize01(blurredNoise(S, 30, 505))
  const pores = normalize01(blurredNoise(S, 0, 606))
  const mid = normalize01(blurredNoise(S, 3, 707))

  const rough = new Float32Array(S * S)
  const height = new Float32Array(S * S)
  const PANELS = 2 // per tile edge → joints every ~3m in world space
  const panel = S / PANELS
  const JOINT = 2 // joint half-width in texels
  const panelRnd = mulberry32(808)
  const panelTone: number[] = []
  for (let k = 0; k < PANELS * PANELS; k++) panelTone.push((panelRnd() - 0.5) * 0.07)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      rough[i] = 0.9 + (blotch[i] - 0.5) * 0.1 + (pores[i] - 0.5) * 0.05
      // Pores dig in; blotches give a gentle large-scale undulation.
      const pore = pores[i] > 0.86 ? (pores[i] - 0.86) * 3.2 : 0
      height[i] = blotch[i] * 0.5 + mid[i] * 0.4 - pore
      // Per-panel tone step (each pour cures a touch different).
      const px = Math.floor(x / panel)
      const py = Math.floor(y / panel)
      rough[i] += panelTone[py * PANELS + px]
      // Expansion joints: a recessed groove along panel edges (wrapping, so
      // the tile joins seamlessly with its neighbours).
      const dx = Math.min(x % panel, panel - (x % panel))
      const dy = Math.min(y % panel, panel - (y % panel))
      const d = Math.min(dx, dy)
      if (d < JOINT) {
        const t = 1 - d / JOINT
        height[i] -= t * 0.55
        rough[i] += t * 0.06 // dirt collects in the groove — flatter, darker
      }
    }
  }
  concrete = {
    normal: heightToNormalTexture(height, S, S, 1.0),
    roughness: scalarToTexture(rough, S, S),
  }
  return concrete
}

/* ------------------------------------------------------------ Facade detail */

/* ------------------------------------------------------------ Glow gradients */

let radialGlow: THREE.DataTexture | null = null

/** Soft radial falloff — alphaMap for streetlight ground pools (green ch.). */
export function radialGlowTexture(): THREE.DataTexture {
  if (radialGlow) return radialGlow
  const S = 64
  const data = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5
      const dy = (y + 0.5) / S - 0.5
      const r = Math.min(1, Math.hypot(dx, dy) * 2)
      const a = Math.pow(1 - r, 2.2) * 255
      const o = (y * S + x) * 4
      data[o] = a
      data[o + 1] = a
      data[o + 2] = a
      data[o + 3] = 255
    }
  }
  radialGlow = new THREE.DataTexture(data, S, S)
  radialGlow.magFilter = THREE.LinearFilter
  radialGlow.minFilter = THREE.LinearFilter
  radialGlow.wrapS = radialGlow.wrapT = THREE.ClampToEdgeWrapping
  radialGlow.needsUpdate = true
  return radialGlow
}

let coneGlow: THREE.DataTexture | null = null

/** Vertical falloff (bright at the lamp, fading to the ground) for the fake
 *  light cones. Cylinder UV v=1 at the top, so brightness rises with v. */
export function coneGlowTexture(): THREE.DataTexture {
  if (coneGlow) return coneGlow
  const H = 64
  const data = new Uint8Array(H * 4)
  for (let y = 0; y < H; y++) {
    const t = (y + 0.5) / H // v coordinate: 0 bottom … 1 top
    const a = Math.pow(t, 1.6) * 255
    data[y * 4] = a
    data[y * 4 + 1] = a
    data[y * 4 + 2] = a
    data[y * 4 + 3] = 255
  }
  coneGlow = new THREE.DataTexture(data, 1, H)
  coneGlow.magFilter = THREE.LinearFilter
  coneGlow.minFilter = THREE.LinearFilter
  coneGlow.wrapS = coneGlow.wrapT = THREE.ClampToEdgeWrapping
  coneGlow.needsUpdate = true
  return coneGlow
}

/* ------------------------------------------------------------- decal atlas */

let decalAtlas: THREE.CanvasTexture | null = null

/**
 * Phase 3 — street decal atlas (4×2 tiles of 128px): manhole, storm drain,
 * lane arrow, crack web, oil stain, puddle mask, painted code glyph, and a
 * worn crosswalk band. Alpha carries the shape mask; drawn once, shared by
 * the single instanced decal draw. Deterministic (seeded scratch noise).
 */
export function decalAtlasTexture(): THREE.CanvasTexture {
  if (decalAtlas) return decalAtlas
  const T = 128
  const canvas = document.createElement('canvas')
  canvas.width = T * 4
  canvas.height = T * 2
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const rnd = mulberry32(909)
  const tileOrigin = (i: number) => ({ ox: (i % 4) * T, oy: Math.floor(i / 4) * T })

  // 0 — manhole cover
  {
    const { ox, oy } = tileOrigin(0)
    const cx = ox + T / 2
    const cy = oy + T / 2
    ctx.fillStyle = 'rgba(24, 26, 30, 0.92)'
    ctx.beginPath()
    ctx.arc(cx, cy, T * 0.44, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(120, 126, 134, 0.9)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(cx, cy, T * 0.4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 2
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath()
      ctx.moveTo(cx - T * 0.3, cy + k * 9)
      ctx.lineTo(cx + T * 0.3, cy + k * 9)
      ctx.stroke()
    }
  }
  // 1 — storm drain
  {
    const { ox, oy } = tileOrigin(1)
    ctx.fillStyle = 'rgba(18, 20, 24, 0.94)'
    ctx.fillRect(ox + 8, oy + T * 0.3, T - 16, T * 0.4)
    ctx.fillStyle = 'rgba(96, 102, 110, 0.9)'
    for (let k = 0; k < 6; k++) ctx.fillRect(ox + 14 + k * 18, oy + T * 0.33, 8, T * 0.34)
  }
  // 2 — lane arrow (points +v / up in tile space)
  {
    const { ox, oy } = tileOrigin(2)
    ctx.fillStyle = 'rgba(238, 240, 242, 0.88)'
    ctx.beginPath()
    ctx.moveTo(ox + T / 2, oy + 10)
    ctx.lineTo(ox + T * 0.78, oy + T * 0.44)
    ctx.lineTo(ox + T * 0.6, oy + T * 0.44)
    ctx.lineTo(ox + T * 0.6, oy + T - 12)
    ctx.lineTo(ox + T * 0.4, oy + T - 12)
    ctx.lineTo(ox + T * 0.4, oy + T * 0.44)
    ctx.lineTo(ox + T * 0.22, oy + T * 0.44)
    ctx.closePath()
    ctx.fill()
  }
  // 3 — crack web
  {
    const { ox, oy } = tileOrigin(3)
    ctx.strokeStyle = 'rgba(16, 17, 20, 0.75)'
    for (let c = 0; c < 5; c++) {
      ctx.lineWidth = 1.4 + rnd() * 1.6
      ctx.beginPath()
      let x = ox + T * (0.2 + rnd() * 0.6)
      let y = oy + T * (0.15 + rnd() * 0.2)
      ctx.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        x += (rnd() - 0.5) * 34
        y += 12 + rnd() * 14
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
  // 4 — oil stain
  {
    const { ox, oy } = tileOrigin(4)
    const g = ctx.createRadialGradient(ox + T / 2, oy + T / 2, 4, ox + T / 2, oy + T / 2, T * 0.44)
    g.addColorStop(0, 'rgba(14, 14, 20, 0.8)')
    g.addColorStop(0.7, 'rgba(16, 18, 26, 0.45)')
    g.addColorStop(1, 'rgba(16, 18, 26, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(ox + T / 2, oy + T / 2, T * 0.42, T * 0.32, 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  // 5 — puddle mask (rain-only; the shader glosses it to a mirror)
  {
    const { ox, oy } = tileOrigin(5)
    const g = ctx.createRadialGradient(ox + T / 2, oy + T / 2, 6, ox + T / 2, oy + T / 2, T * 0.46)
    g.addColorStop(0, 'rgba(30, 38, 52, 0.85)')
    g.addColorStop(0.75, 'rgba(30, 38, 52, 0.55)')
    g.addColorStop(1, 'rgba(30, 38, 52, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(ox + T / 2, oy + T / 2, T * 0.45, T * 0.3, -0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  // 6 — painted </> street glyph
  {
    const { ox, oy } = tileOrigin(6)
    ctx.fillStyle = 'rgba(240, 244, 248, 0.7)'
    ctx.font = `bold ${Math.round(T * 0.52)}px "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('</>', ox + T / 2, oy + T / 2 + 3)
  }
  // 7 — crosswalk band (stripes run along u → across the road when laid)
  {
    const { ox, oy } = tileOrigin(7)
    ctx.fillStyle = 'rgba(236, 238, 241, 0.86)'
    for (let k = 0; k < 5; k++) {
      const w = T * 0.13
      ctx.fillRect(ox + 8 + k * (T - 16) * 0.22, oy + 10, w, T - 20)
    }
    // wear: knock chips out of the paint
    ctx.globalCompositeOperation = 'destination-out'
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(ox + rnd() * T, oy + rnd() * T, 2 + rnd() * 5, 2 + rnd() * 4)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  decalAtlas = new THREE.CanvasTexture(canvas)
  decalAtlas.colorSpace = THREE.SRGBColorSpace
  decalAtlas.anisotropy = 4
  return decalAtlas
}

export type FacadeMaps = {
  map: THREE.CanvasTexture
  emissive: THREE.CanvasTexture
  normal: THREE.DataTexture
  roughness: THREE.DataTexture
}

// Must stay in lock-step with the albedo/emissive canvas in makeFacadeMaps.
const FACADE_W = 96
const FACADE_H = 192
const FACADE_COLS = 5
const FACADE_ROWS = 11
const FACADE_MX = 8
const FACADE_MY = 8

let facade: FacadeMaps | null = null

/**
 * The full building-facade family: albedo (concrete + tinted glass), a
 * matching emissive map (lit offices with warm varied tints, some dark), a
 * normal map with recessed window reveals, and a roughness map (rough
 * concrete, glossy glass) so windows catch the sun from the baked sky env.
 */
export function facadeMaps(): FacadeMaps {
  if (facade) return facade
  const W = FACADE_W
  const H = FACADE_H
  const gw = (W - FACADE_MX * 2) / FACADE_COLS
  const gh = (H - FACADE_MY * 2) / FACADE_ROWS

  const albedo = document.createElement('canvas')
  albedo.width = W
  albedo.height = H
  const emap = document.createElement('canvas')
  emap.width = W
  emap.height = H
  const ac = albedo.getContext('2d')!
  const ec = emap.getContext('2d')!

  // concrete base with faint vertical banding
  ac.fillStyle = '#cfd3da'
  ac.fillRect(0, 0, W, H)
  for (let x = 0; x < W; x += 6) {
    ac.fillStyle = x % 12 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)'
    ac.fillRect(x, 0, 3, H)
  }
  ec.fillStyle = '#000'
  ec.fillRect(0, 0, W, H)

  // Height + roughness rasters built alongside the canvas draw.
  const height = new Float32Array(W * H)
  const rough = new Float32Array(W * H)
  const rnd = mulberry32(20260701)
  const bandNoise = normalize01(blurredNoise(256, 2, 808))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      height[y * W + x] = 0.55 + (bandNoise[((y % 256) * 256 + (x % 256)) % bandNoise.length] - 0.5) * 0.06
      rough[y * W + x] = 0.85 + (rnd() - 0.5) * 0.06
    }
  }
  const fillRect = (arr: Float32Array, x: number, y: number, w: number, h: number, v: number) => {
    const x1 = Math.min(W, Math.round(x + w))
    const y1 = Math.min(H, Math.round(y + h))
    for (let yy = Math.max(0, Math.round(y)); yy < y1; yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < x1; xx++) arr[yy * W + xx] = v
  }

  const litColors = ['#ffe7a0', '#fff2c8', '#bfe3ff', '#ffd9a0', '#ffe2b8', '#f6efdc']
  for (let r = 0; r < FACADE_ROWS; r++) {
    for (let col = 0; col < FACADE_COLS; col++) {
      const x = FACADE_MX + col * gw + 1.5
      const y = FACADE_MY + r * gh + 1.5
      const w = gw - 3
      const h = gh - 4
      const lit = rnd() < 0.42
      const glass = lit ? litColors[(rnd() * litColors.length) | 0] : '#46525f'
      ac.fillStyle = glass
      ac.fillRect(x, y, w, h)
      // window frame
      ac.fillStyle = 'rgba(20,26,38,0.5)'
      ac.fillRect(x, y, w, 1.5)
      ac.fillRect(x, y + h - 1.5, w, 1.5)
      if (lit) {
        ec.fillStyle = glass
        ec.fillRect(x, y, w, h)
      }
      // Recessed reveal: glass sits behind the wall plane; frame lip raised.
      fillRect(height, x - 1, y - 1, w + 2, h + 2, 0.78) // frame lip
      fillRect(height, x + 0.5, y + 0.5, w - 1, h - 1, 0.3) // glass pane
      fillRect(rough, x - 1, y - 1, w + 2, h + 2, 0.55)
      fillRect(rough, x + 0.5, y + 0.5, w - 1, h - 1, 0.09 + rnd() * 0.08)
    }
  }

  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const emissive = new THREE.CanvasTexture(emap)
  emissive.colorSpace = THREE.SRGBColorSpace
  emissive.anisotropy = 4
  facade = {
    map,
    emissive,
    normal: heightToNormalTexture(height, W, H, 1.6),
    roughness: scalarToTexture(rough, W, H),
  }
  return facade
}
