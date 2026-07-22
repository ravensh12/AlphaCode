import { describe, expect, it } from 'vitest'
import {
  resolveFinalGauntletAccess,
  resolveThresholdAccess,
} from './finalFlowAccess'

describe('final-flow hydration gates', () => {
  it('never redirects while progress is still hydrating', () => {
    expect(resolveThresholdAccess(false, false)).toEqual({
      status: 'loading',
    })
    expect(resolveFinalGauntletAccess(false, false, false)).toEqual({
      status: 'loading',
    })
  })

  it('routes only after hydrated durable progress is known', () => {
    expect(resolveThresholdAccess(true, false)).toEqual({
      status: 'redirect',
      to: '/quest',
    })
    expect(resolveThresholdAccess(true, true)).toEqual({
      status: 'allowed',
    })
    expect(resolveFinalGauntletAccess(true, false, false)).toEqual({
      status: 'redirect',
      to: '/quest',
    })
    expect(resolveFinalGauntletAccess(true, true, false)).toEqual({
      status: 'redirect',
      to: '/threshold',
    })
    expect(resolveFinalGauntletAccess(true, true, true)).toEqual({
      status: 'allowed',
    })
  })
})
