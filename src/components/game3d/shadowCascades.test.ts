import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cascadeSpecs, snapToShadowTexel, texelWorldSize } from './shadowCascades'
import { SUN_DIR } from './simulation'

describe('cascade ladders', () => {
  it('cascade ladders: 3× (2048/1024/1024), 2× (1536/768), single 1024', () => {
    expect(cascadeSpecs(3).map((c) => c.mapSize)).toEqual([2048, 1024, 1024])
    expect(cascadeSpecs(2).map((c) => c.mapSize)).toEqual([1536, 768])
    expect(cascadeSpecs(1).map((c) => c.mapSize)).toEqual([1024])
  })

  it('keeps cascade 0 as the pre-Phase-2 FollowLight frustum on every ladder', () => {
    for (const count of [1, 2, 3] as const) {
      const c0 = cascadeSpecs(count)[0]
      expect(c0.halfExtent).toBe(34)
      expect(c0.dist).toBe(62)
      expect(c0.near).toBe(16)
      expect(c0.far).toBe(130)
      expect(c0.bias).toBe(-0.0004)
      expect(c0.normalBias).toBe(0.02)
    }
    // The single-cascade ladder must reproduce today's light exactly — that
    // includes its full intensity share.
    expect(cascadeSpecs(1)[0].intensityShare).toBe(1)
  })

  it('partitions the sun intensity exactly (shares sum to 1)', () => {
    for (const count of [1, 2, 3] as const) {
      const total = cascadeSpecs(count).reduce((s, c) => s + c.intensityShare, 0)
      expect(total).toBeCloseTo(1, 10)
    }
  })

  it('extents strictly grow and clip planes stay sane on every cascade', () => {
    for (const count of [1, 2, 3] as const) {
      const specs = cascadeSpecs(count)
      for (let i = 0; i < specs.length; i++) {
        const c = specs[i]
        if (i > 0) expect(c.halfExtent).toBeGreaterThan(specs[i - 1].halfExtent)
        expect(c.near).toBeGreaterThan(0)
        expect(c.far).toBeGreaterThan(c.near)
        // The box must fully contain terrain around the follow point: the
        // light sits `dist` out, so the far plane has to reach past the
        // ground through the whole box depth.
        expect(c.far).toBeGreaterThan(c.dist)
        expect(c.near).toBeLessThan(c.dist)
      }
    }
  })

  it('near cascade always keeps the highest texel density', () => {
    for (const count of [2, 3] as const) {
      const specs = cascadeSpecs(count)
      const density = specs.map((c) => texelWorldSize(c))
      for (let i = 1; i < density.length; i++) {
        expect(density[i]).toBeGreaterThan(density[i - 1])
      }
    }
  })

  it('outer cascades increase slope bias with texel footprint (acne guard)', () => {
    for (const count of [2, 3] as const) {
      const specs = cascadeSpecs(count)
      for (let i = 1; i < specs.length; i++) {
        expect(specs[i].normalBias).toBeGreaterThan(specs[i - 1].normalBias)
      }
    }
  })
})

describe('texel snapping', () => {
  const spec = { halfExtent: 34, mapSize: 1024 }

  it('is idempotent (snapping a snapped point is a no-op)', () => {
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    snapToShadowTexel(12.34, -56.78, spec, a)
    snapToShadowTexel(a.x, a.z, spec, b)
    // Compare in the light plane: re-snapping must not move the point.
    expect(b.distanceTo(a)).toBeLessThan(1e-9)
  })

  it('never moves a point more than one texel diagonal', () => {
    const texel = texelWorldSize(spec)
    const out = new THREE.Vector3()
    for (const [x, z] of [
      [0, 0],
      [1.23, 4.56],
      [-700, 700],
      [333.33, -0.01],
    ]) {
      snapToShadowTexel(x, z, spec, out)
      // The snapped point must stay within one texel cell of the input in the
      // light-plane axes; measure via the world-space displacement of the
      // in-plane components only (strip the along-sun component, which snapping
      // preserves from the input by construction).
      const dx = out.x - x
      const dz = out.z - z
      const planar = Math.hypot(dx, dz)
      expect(planar).toBeLessThanOrEqual(texel * Math.SQRT2 + 1e-9)
    }
  })

  it('produces steps of exactly whole texels as the player runs', () => {
    const texel = texelWorldSize(spec)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    // Walk a diagonal; consecutive snapped points must differ by texel
    // multiples along the light basis (i.e. their difference has quantized
    // length in the plane perpendicular to the sun).
    snapToShadowTexel(0, 0, spec, a)
    snapToShadowTexel(texel * 7.4, texel * 3.2, spec, b)
    const diff = b.clone().sub(a)
    // Remove the along-sun component before measuring.
    const alongSun = diff.dot(SUN_DIR)
    diff.addScaledVector(SUN_DIR, -alongSun)
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
    const up = new THREE.Vector3().crossVectors(SUN_DIR, right).normalize()
    const stepsRight = diff.dot(right) / texel
    const stepsUp = diff.dot(up) / texel
    expect(Math.abs(stepsRight - Math.round(stepsRight))).toBeLessThan(1e-6)
    expect(Math.abs(stepsUp - Math.round(stepsUp))).toBeLessThan(1e-6)
  })

  it('finer maps snap on a finer grid', () => {
    expect(texelWorldSize({ halfExtent: 34, mapSize: 2048 })).toBeCloseTo(
      texelWorldSize({ halfExtent: 34, mapSize: 1024 }) / 2,
      12,
    )
  })
})
