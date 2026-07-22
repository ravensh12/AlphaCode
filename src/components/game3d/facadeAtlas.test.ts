import { describe, expect, it } from 'vitest'
import {
  FACADE_ATLAS_COLS,
  FACADE_ATLAS_ROWS,
  FACADE_BAY_METERS,
  FACADE_CELLS_PER_TILE,
  FACADE_FLOOR_METERS,
  FACADE_STYLES,
  FACADE_STYLE_COUNT,
  FACADE_TILE_U,
  FACADE_TILE_V,
  cellHasWindow,
  roomTileOrigin,
  signGlyphOrigin,
  styleTileOrigin,
  windowCellHash,
} from './facadeAtlas'

describe('facade atlas packing', () => {
  it('declares 8 styles matching the 4×2 atlas grid', () => {
    expect(FACADE_STYLES).toHaveLength(FACADE_STYLE_COUNT)
    expect(FACADE_ATLAS_COLS * FACADE_ATLAS_ROWS).toBe(FACADE_STYLE_COUNT)
    expect(FACADE_TILE_U).toBeCloseTo(1 / FACADE_ATLAS_COLS)
    expect(FACADE_TILE_V).toBeCloseTo(1 / FACADE_ATLAS_ROWS)
  })

  it('tile origins are unique, in-bounds, and never overlap', () => {
    const seen = new Set<string>()
    for (let s = 0; s < FACADE_STYLE_COUNT; s++) {
      const { u, v } = styleTileOrigin(s)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(u + FACADE_TILE_U).toBeLessThanOrEqual(1.0001)
      expect(v + FACADE_TILE_V).toBeLessThanOrEqual(1.0001)
      const key = `${u.toFixed(4)}:${v.toFixed(4)}`
      expect(seen.has(key), `tile ${s} overlaps`).toBe(false)
      seen.add(key)
    }
  })

  it('tile origin math matches the GLSL twin (mod/floor packing)', () => {
    for (let s = 0; s < FACADE_STYLE_COUNT; s++) {
      const { u, v } = styleTileOrigin(s)
      // The facade shader computes: (mod(s,4)*0.25, (1-floor(s/4))*0.5)
      expect(u).toBeCloseTo((s % 4) * 0.25)
      expect(v).toBeCloseTo((1 - Math.floor(s / 4)) * 0.5)
    }
  })

  it('out-of-range styles clamp instead of sampling off-atlas', () => {
    expect(styleTileOrigin(-3)).toEqual(styleTileOrigin(0))
    expect(styleTileOrigin(99)).toEqual(styleTileOrigin(FACADE_STYLE_COUNT - 1))
  })

  it('meter rhythm constants stay human-scale', () => {
    expect(FACADE_BAY_METERS).toBeGreaterThan(2)
    expect(FACADE_BAY_METERS).toBeLessThan(4)
    expect(FACADE_FLOOR_METERS).toBeGreaterThan(2.4)
    expect(FACADE_FLOOR_METERS).toBeLessThan(4)
    expect(FACADE_CELLS_PER_TILE).toBe(4)
  })

  it('window cell decisions are deterministic and respect style density', () => {
    for (let s = 0; s < FACADE_STYLE_COUNT; s++) {
      let windows = 0
      for (let cy = 0; cy < FACADE_CELLS_PER_TILE; cy++) {
        for (let cx = 0; cx < FACADE_CELLS_PER_TILE; cx++) {
          expect(cellHasWindow(s, cx, cy)).toBe(cellHasWindow(s, cx, cy))
          if (cellHasWindow(s, cx, cy)) windows++
        }
      }
      // Full-window styles fill every cell; sparse industrial leaves walls.
      if (FACADE_STYLES[s].windowChance >= 1) expect(windows).toBe(16)
      else expect(windows).toBeLessThanOrEqual(16)
      expect(windows).toBeGreaterThan(2)
    }
    const h = windowCellHash(3, 1, 2)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(1)
  })

  it('room + sign glyph tiles pack into their own 4×2 grids', () => {
    const rooms = new Set<string>()
    for (let r = 0; r < 8; r++) {
      const { u, v } = roomTileOrigin(r)
      rooms.add(`${u}:${v}`)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThanOrEqual(0.75)
      expect(v === 0 || v === 0.5).toBe(true)
    }
    expect(rooms.size).toBe(8)
    const glyphs = new Set<string>()
    for (let g = 0; g < 8; g++) {
      const { u, v } = signGlyphOrigin(g)
      glyphs.add(`${u}:${v}`)
    }
    expect(glyphs.size).toBe(8)
  })
})
