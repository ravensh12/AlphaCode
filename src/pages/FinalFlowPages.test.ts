import { describe, expect, it } from 'vitest'
import finalBossSource from './FinalBossPage.tsx?raw'
import finalExamSource from './FinalExamPage.tsx?raw'
import finalJourneySource from './FinalJourneyPage.tsx?raw'
import thresholdSource from './ThresholdPage.tsx?raw'

describe('final-flow page hydration wiring', () => {
  it.each([
    ['Threshold', thresholdSource],
    ['Final Journey', finalJourneySource],
    ['Final Exam', finalExamSource],
    ['Final Boss', finalBossSource],
  ])('%s waits with a loader before redirecting', (_label, source) => {
    expect(source).toContain("access.status === 'loading'")
    expect(source).toContain('<Loader')
    expect(source).toContain("access.status === 'redirect'")
  })
})
