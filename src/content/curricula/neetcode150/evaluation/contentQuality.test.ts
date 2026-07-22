import { describe, expect, it } from 'vitest'
import {
  evaluateNeetcode150ContentQuality,
  formatContentQualityReport,
} from './contentQuality'

describe('NeetCode 150 release content quality', () => {
  it(
    'passes coverage, originality, assessment, graph, and certification gates',
    async () => {
      const report = await evaluateNeetcode150ContentQuality()

      expect(report.problemCount).toBe(150)
      expect(report.trackCount).toBe(18)
      expect(report.internalExactDuplicateTexts.length).toBeGreaterThan(0)
      expect(Array.isArray(report.internalNearDuplicateTexts)).toBe(true)
      expect(report.issues, formatContentQualityReport(report)).toEqual([])
      expect(report.passed).toBe(true)
    },
    45_000,
  )
})
