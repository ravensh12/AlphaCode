import { describe, expect, it } from 'vitest'
import type { CrystalState } from '../../../lib/memoryCrystals'
import {
  CRYSTAL_CLUSTER_SCALE,
  crystalBodyScale,
  crystalChannels,
  crystalCountLabelVisible,
  crystalPhase,
} from './memoryCrystalsCore'

const STATES: CrystalState[] = ['growing', 'ripe', 'pendingCloud', 'cleared']

describe('crystalChannels (state → look mapping)', () => {
  it('growing is a dim violet that neither pulses nor carries a glyph', () => {
    const c = crystalChannels('growing')
    expect(c.color).toBe('#8f7bdc')
    expect(c.pulseAmplitude).toBe(0)
    expect(c.cloudGlyph).toBe(false)
    expect(c.boost).toBeLessThan(crystalChannels('ripe').boost)
  })

  it('ripe is a bright pulsing amber', () => {
    const c = crystalChannels('ripe')
    expect(c.color).toBe('#ffb347')
    expect(c.pulseAmplitude).toBeGreaterThan(0)
    expect(c.scale).toBe(1)
    expect(c.cloudGlyph).toBe(false)
  })

  it('pendingCloud draws the ripe body plus the cloud glyph', () => {
    const ripe = crystalChannels('ripe')
    const pending = crystalChannels('pendingCloud')
    expect(pending.cloudGlyph).toBe(true)
    expect({ ...pending, cloudGlyph: false }).toEqual({
      ...ripe,
      cloudGlyph: false,
    })
  })

  it('cleared is the faint lime, smallest and calmest', () => {
    const c = crystalChannels('cleared')
    expect(c.color).toBe('#9bf6c3')
    expect(c.pulseAmplitude).toBe(0)
    expect(c.cloudGlyph).toBe(false)
    for (const state of STATES) {
      expect(c.scale).toBeLessThanOrEqual(crystalChannels(state).scale)
      expect(c.boost).toBeLessThanOrEqual(crystalChannels(state).boost)
    }
  })

  it('only ripe-bodied states pulse', () => {
    expect(crystalChannels('ripe').pulseAmplitude).toBeGreaterThan(0)
    expect(crystalChannels('pendingCloud').pulseAmplitude).toBeGreaterThan(0)
    expect(crystalChannels('growing').pulseAmplitude).toBe(0)
    expect(crystalChannels('cleared').pulseAmplitude).toBe(0)
  })
})

describe('crystalBodyScale', () => {
  it('clusters scale up over their state base', () => {
    expect(crystalBodyScale({ kind: 'single', state: 'ripe' })).toBe(1)
    expect(crystalBodyScale({ kind: 'cluster', state: 'ripe' })).toBeCloseTo(
      CRYSTAL_CLUSTER_SCALE,
    )
    expect(
      crystalBodyScale({ kind: 'cluster', state: 'growing' }),
    ).toBeCloseTo(crystalChannels('growing').scale * CRYSTAL_CLUSTER_SCALE)
  })
})

describe('crystalCountLabelVisible (the Html cap)', () => {
  it('shows counts only for ripe-bodied clusters', () => {
    expect(
      crystalCountLabelVisible({ kind: 'cluster', state: 'ripe', count: 4 }),
    ).toBe(true)
    expect(
      crystalCountLabelVisible({
        kind: 'cluster',
        state: 'pendingCloud',
        count: 2,
      }),
    ).toBe(true)
  })

  it('never shows Html for singles or scenery-state clusters', () => {
    expect(
      crystalCountLabelVisible({ kind: 'single', state: 'ripe', count: 1 }),
    ).toBe(false)
    expect(
      crystalCountLabelVisible({ kind: 'cluster', state: 'growing', count: 9 }),
    ).toBe(false)
    expect(
      crystalCountLabelVisible({ kind: 'cluster', state: 'cleared', count: 9 }),
    ).toBe(false)
    expect(
      crystalCountLabelVisible({ kind: 'cluster', state: 'ripe', count: 0 }),
    ).toBe(false)
  })
})

describe('crystalPhase', () => {
  it('is deterministic and bounded to [0, 2π)', () => {
    for (const id of ['crystal:two-sum', 'crystal-cluster:0:1', 'x']) {
      const phase = crystalPhase(id)
      expect(phase).toBe(crystalPhase(id))
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(Math.PI * 2)
    }
  })

  it('spreads different ids apart', () => {
    expect(crystalPhase('crystal:two-sum')).not.toBe(
      crystalPhase('crystal:valid-anagram'),
    )
  })
})
