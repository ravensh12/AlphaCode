import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { toFloat32Positions } from './meshyModels'

/* ============================================================================
   Quantized-position expansion — the regression that shredded every Meshy
   model taller/longer than 1 m into a 2×2×2 wrap-around cube.

   Meshy GLBs carry meshopt/KHR_mesh_quantization positions: normalized
   Int16 storage in [-1, 1] with the real meter scale on the node transform.
   Baking node transforms (or the spec's targetHeight scale) into such an
   attribute writes meter-space floats back through the normalized encoder,
   and every value past ±1 wraps around the Int16 range. toFloat32Positions
   must expand the attribute to plain Float32 BEFORE any matrix bake.
   ========================================================================== */

/** A quantized triangle: unit-ish positions stored as normalized Int16. */
function quantizedGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const quantize = (v: number) => Math.round(v * 32767)
  const values = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, 1, 0.5],
  ].flat()
  const data = new Int16Array(values.map(quantize))
  geometry.setAttribute('position', new THREE.BufferAttribute(data, 3, true))
  return geometry
}

describe('toFloat32Positions', () => {
  it('expands normalized Int16 positions to Float32 with identical values', () => {
    const geometry = quantizedGeometry()
    toFloat32Positions(geometry)
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    expect(position.array).toBeInstanceOf(Float32Array)
    expect(position.normalized).toBe(false)
    expect(position.getX(0)).toBeCloseTo(-1, 3)
    expect(position.getX(1)).toBeCloseTo(1, 3)
    expect(position.getY(2)).toBeCloseTo(1, 3)
    expect(position.getZ(2)).toBeCloseTo(0.5, 3)
  })

  it('keeps scaled meter-space values past ±1 intact (no Int16 wrap-around)', () => {
    const geometry = quantizedGeometry()
    toFloat32Positions(geometry)
    // The normalization bake: scale a 1m-quantized mesh up to a 4.4m lamp.
    geometry.scale(4.4, 4.4, 4.4)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    expect(box.max.y).toBeCloseTo(4.4, 2)
    expect(box.min.x).toBeCloseTo(-4.4, 2)
    // The broken path wrapped anything past ±1 back into [-1, 1]: the whole
    // box collapsed to a 2×2×2 cube. Guard the diagonal too.
    expect(box.max.y - box.min.y).toBeGreaterThan(2.05)
  })

  it('leaves plain Float32 attributes untouched (same object, no copy)', () => {
    const geometry = new THREE.BufferGeometry()
    const attr = new THREE.BufferAttribute(new Float32Array([0, 2.5, 0]), 3)
    geometry.setAttribute('position', attr)
    toFloat32Positions(geometry)
    expect(geometry.getAttribute('position')).toBe(attr)
    expect(geometry.getAttribute('position').getY(0)).toBeCloseTo(2.5, 5)
  })
})
