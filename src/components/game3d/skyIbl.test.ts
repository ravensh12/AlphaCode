import { describe, expect, it } from 'vitest'
import { DataUtils } from 'three'
import {
  SKY_HDRI_DAY_ID,
  SKY_HDRI_GAIN,
  SKY_HDRI_NIGHT_ID,
  downsampleEquirect,
  envIntensityFor,
  hdriMode,
  skyHdriEntry,
} from './skyIbl'
import { sharedAssets } from '../../content/assets/assetManifest'

describe('HDRI manifest usage', () => {
  it('the day sky HDRI resolves to a manifest entry with the right shape', () => {
    const entry = skyHdriEntry('day')
    expect(entry).toBeDefined()
    expect(entry?.kind).toBe('hdri')
    expect(entry?.path.endsWith('.hdr')).toBe(true)
    expect(entry?.districts).toContain('shared')
    expect(entry?.minTier).toBe('medium')
    expect(entry?.license).toBe('CC0-1.0')
    expect(entry?.id).toBe(SKY_HDRI_DAY_ID)
  })

  it('the night HDRI stays cut from the ship set (CPU bake lights the night)', () => {
    // July 2026: SimulationSky only upgrades the DAY slot — the night dome is
    // the CPU corruption bake by design, so shipping a night .hdr again would
    // be dead CDN weight. This pins the manifest to that decision.
    expect(skyHdriEntry('night')).toBeUndefined()
    for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
      expect(sharedAssets(tier).map((e) => e.id)).not.toContain(SKY_HDRI_NIGHT_ID)
    }
  })

  it('the shared bundle ships the day sky at MEDIUM+ and not at LOW', () => {
    const mediumIds = sharedAssets('medium').map((e) => e.id)
    expect(mediumIds).toContain(SKY_HDRI_DAY_ID)
    const lowIds = sharedAssets('low').map((e) => e.id)
    expect(lowIds).not.toContain(SKY_HDRI_DAY_ID)
  })
})

describe('environment intensity curve', () => {
  it('keeps the pre-Phase-2 semantics for the CPU bakes (gain 1)', () => {
    expect(envIntensityFor(0)).toBeCloseTo(1.0, 10)
    expect(envIntensityFor(1)).toBeCloseTo(0.45, 10)
    expect(envIntensityFor(0.5)).toBeCloseTo(0.725, 10)
  })

  it('applies the measured calibration gains multiplicatively', () => {
    expect(envIntensityFor(0, SKY_HDRI_GAIN.day)).toBeCloseTo(SKY_HDRI_GAIN.day, 10)
    expect(envIntensityFor(1, SKY_HDRI_GAIN.night)).toBeCloseTo(0.45 * SKY_HDRI_GAIN.night, 10)
  })

  it('gains keep the HDRI swap in the same exposure ballpark (0 < gain ≤ 1)', () => {
    expect(SKY_HDRI_GAIN.day).toBeGreaterThan(0)
    expect(SKY_HDRI_GAIN.day).toBeLessThanOrEqual(1)
    expect(SKY_HDRI_GAIN.night).toBeGreaterThan(0)
    expect(SKY_HDRI_GAIN.night).toBeLessThanOrEqual(1)
  })
})

describe('hdriMode gating', () => {
  it('LOW never loads HDRIs; MEDIUM halves; HIGH/ULTRA run full res', () => {
    expect(hdriMode('low', false)).toBe('off')
    expect(hdriMode('medium', true)).toBe('half')
    expect(hdriMode('high', true)).toBe('full')
    expect(hdriMode('ultra', true)).toBe('full')
    // The flag wins over tier — a disabled profile stays off everywhere.
    expect(hdriMode('ultra', false)).toBe('off')
  })
})

describe('downsampleEquirect', () => {
  it('halves dimensions and box-filters float pixels', () => {
    // 4×2 → 2×1; each output = mean of its 2×2 block.
    const w = 4
    const h = 2
    const src = new Float32Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      src[i * 4] = i // r ramps 0..7
      src[i * 4 + 3] = 1
    }
    const out = downsampleEquirect(src, w, h)
    expect(out.width).toBe(2)
    expect(out.height).toBe(1)
    const d = out.data as Float32Array
    // Block (0,1,4,5) → 2.5 ; block (2,3,6,7) → 4.5
    expect(d[0]).toBeCloseTo(2.5, 6)
    expect(d[4]).toBeCloseTo(4.5, 6)
    expect(d[3]).toBeCloseTo(1, 6)
  })

  it('round-trips half-float data through DataUtils', () => {
    const w = 2
    const h = 2
    const src = new Uint16Array(w * h * 4)
    const vals = [0.5, 1.5, 2.5, 3.5]
    for (let i = 0; i < 4; i++) {
      src[i * 4] = DataUtils.toHalfFloat(vals[i])
      src[i * 4 + 3] = DataUtils.toHalfFloat(1)
    }
    const out = downsampleEquirect(src, w, h)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
    expect(out.data).toBeInstanceOf(Uint16Array)
    const r = DataUtils.fromHalfFloat((out.data as Uint16Array)[0])
    expect(r).toBeCloseTo(2, 2)
  })

  it('preserves energy (mean luminance unchanged) on uniform fields', () => {
    const w = 8
    const h = 4
    const src = new Float32Array(w * h * 4).fill(0.73)
    const out = downsampleEquirect(src, w, h)
    for (const v of out.data as Float32Array) expect(v).toBeCloseTo(0.73, 6)
  })
})
