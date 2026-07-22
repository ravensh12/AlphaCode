import * as THREE from 'three'

/** Procedural night-tower texture: dense warm/cool lit windows on dark
 *  concrete (map + emissiveMap pair). Shared by the NightCityStage skyline
 *  and the Architect finale's corruptible skyline. Callers own disposal. */
export function makeTowerMaps(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 128
  const H = 256
  const albedo = document.createElement('canvas')
  albedo.width = W
  albedo.height = H
  const emis = document.createElement('canvas')
  emis.width = W
  emis.height = H
  const ac = albedo.getContext('2d')!
  const ec = emis.getContext('2d')!
  ac.fillStyle = '#14161f'
  ac.fillRect(0, 0, W, H)
  ec.fillStyle = '#000'
  ec.fillRect(0, 0, W, H)
  // Faint vertical mullions.
  for (let x = 0; x < W; x += 8) {
    ac.fillStyle = x % 16 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.14)'
    ac.fillRect(x, 0, 2, H)
  }
  // Window grid — most dark, some lit in warm/cool office tints.
  const COLS = 12
  const ROWS = 30
  const gw = W / COLS
  const gh = H / ROWS
  let seed = 1877
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const tints = ['#ffd9a0', '#ffe9c8', '#bfd6ff', '#9fe8ff', '#fff3d6']
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * gw + 1.5
      const y = r * gh + 1.5
      const w = gw - 3
      const h = gh - 3
      ac.fillStyle = 'rgba(30, 36, 52, 0.9)'
      ac.fillRect(x, y, w, h)
      const v = rnd()
      if (v > 0.72) {
        const tint = tints[Math.floor(rnd() * tints.length)]
        ec.fillStyle = tint
        ec.globalAlpha = 0.5 + rnd() * 0.5
        ec.fillRect(x, y, w, h)
        ec.globalAlpha = 1
      }
    }
  }
  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  const emissive = new THREE.CanvasTexture(emis)
  emissive.colorSpace = THREE.SRGBColorSpace
  return { map, emissive }
}

/** The skyline tower footprint/height generator shared with the finale. */
export interface TowerBox {
  x: number
  z: number
  w: number
  h: number
  d: number
}

export function genTowers(count: number, innerRadius: number): TowerBox[] {
  const out: TowerBox[] = []
  for (let i = 0; i < count; i++) {
    const ring = Math.floor(i / (count / 3))
    const a = i * 2.399963 // golden angle — even, non-repeating spread
    const r = innerRadius + ring * 30 + ((i * 29) % 13) * 1.9
    if (i % 9 === 4) continue // streets between the blocks
    out.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 8 + (i % 5) * 3.0,
      h: 18 + ((i * 13) % 11) * 7 + ring * 12,
      d: 8 + (i % 3) * 3.6,
    })
  }
  return out
}
