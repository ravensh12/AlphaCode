import { describe, expect, it } from 'vitest'
import {
  buildInstancePack,
  compactInRadius,
  writeAllInstances,
} from './proximityCulling'
import { GRAPHICS_TIERS, profileForTier } from '../../lib/graphicsQuality'

const items = [
  { x: 0, z: 0, tag: 10 },
  { x: 50, z: 0, tag: 20 },
  { x: 0, z: 120, tag: 30 },
  { x: -200, z: -200, tag: 40 },
]

function makePack(withExtras = false) {
  const extras = withExtras
    ? [{ name: 'aTag', size: 2, data: new Float32Array(items.flatMap((it) => [it.tag, it.tag + 1])) }]
    : []
  return buildInstancePack(
    items,
    {
      place: (it, d) => {
        d.position.set(it.x, 0, it.z)
        d.scale.setScalar(2)
      },
      color: (it) => (it.tag === 20 ? '#ff0000' : '#00ff00'),
      pad: (it) => (it.tag === 30 ? 30 : 0),
    },
    extras,
  )
}

describe('proximityCulling', () => {
  it('packs one matrix/color/pos entry per item', () => {
    const pack = makePack()
    expect(pack.count).toBe(4)
    expect(pack.matrices.length).toBe(4 * 16)
    expect(pack.colors?.length).toBe(4 * 3)
    // Translation lives in matrix elements 12/14 (column-major).
    expect(pack.matrices[1 * 16 + 12]).toBe(50)
    expect(pack.matrices[2 * 16 + 14]).toBe(120)
    expect(pack.posXZ[3 * 2]).toBe(-200)
    expect(pack.pad?.[2]).toBe(30)
  })

  it('compacts only instances inside the radius (pad extends reach)', () => {
    const pack = makePack()
    const outMat = new Float32Array(4 * 16)
    const outCol = new Float32Array(4 * 3)
    // Radius 100 from origin: items at 0 and 50 qualify outright; the item at
    // 120 qualifies only through its +30 pad; -200/-200 stays culled.
    const n = compactInRadius(pack, 0, 0, 100, outMat, outCol, null)
    expect(n).toBe(3)
    expect(outMat[12]).toBe(0)
    expect(outMat[1 * 16 + 12]).toBe(50)
    expect(outMat[2 * 16 + 14]).toBe(120)
    // Colors compacted in the same order (item 1 is the red one).
    expect(outCol[1 * 3 + 0]).toBeCloseTo(1)
    expect(outCol[2 * 3 + 1]).toBeCloseTo(1)
  })

  it('keeps extra attributes aligned with compacted instance ids', () => {
    const pack = makePack(true)
    const outMat = new Float32Array(4 * 16)
    const outTag = new Float32Array(4 * 2)
    // Radius 60 around (0,0): items 0 and 1 survive.
    const n = compactInRadius(pack, 0, 0, 60, outMat, null, [outTag])
    expect(n).toBe(2)
    expect(Array.from(outTag.subarray(0, 4))).toEqual([10, 11, 20, 21])
  })

  it('re-compacts correctly from pristine pack data after a previous pass', () => {
    const pack = makePack(true)
    const outMat = new Float32Array(4 * 16)
    const outTag = new Float32Array(4 * 2)
    compactInRadius(pack, 0, 0, 60, outMat, null, [outTag])
    // Move the bubble onto the far corner — a fresh compact must still see
    // the original data (the compactor never mutates the pack).
    const n = compactInRadius(pack, -200, -200, 10, outMat, null, [outTag])
    expect(n).toBe(1)
    expect(outMat[12]).toBe(-200)
    expect(Array.from(outTag.subarray(0, 2))).toEqual([40, 41])
  })

  it('writeAllInstances mirrors the full set', () => {
    const pack = makePack(true)
    const outMat = new Float32Array(4 * 16)
    const outCol = new Float32Array(4 * 3)
    const outTag = new Float32Array(4 * 2)
    const n = writeAllInstances(pack, outMat, outCol, [outTag])
    expect(n).toBe(4)
    expect(outMat[3 * 16 + 12]).toBe(-200)
    expect(outTag[3 * 2]).toBe(40)
  })

  it('cull radius widens with the governor notch (ultra > … > low)', () => {
    const radii = GRAPHICS_TIERS.map((tier) => profileForTier(tier, 2).cullRadius)
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1])
    }
    expect(profileForTier('ultra', 2).cullRadius).toBe(300)
    expect(profileForTier('low', 2).cullRadius).toBe(150)
  })
})
