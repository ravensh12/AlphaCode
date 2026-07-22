import { describe, expect, it } from 'vitest'
import {
  evaluateNeetcode150Readability,
  formatReadabilityReport,
  learnerProse,
} from './readability'
import { discoverProblemMissionSeeds } from './seedDiscovery'

describe('NeetCode 150 readability evaluation', () => {
  it(
    'reports target-band outliers and enforces hard readability caps',
    async () => {
      const report = await evaluateNeetcode150Readability()
      const formatted = formatReadabilityReport(report)
      const reportMode = (
        globalThis as typeof globalThis & {
          process?: { env?: Readonly<Record<string, string | undefined>> }
        }
      ).process?.env?.CURRICULUM_EVAL_REPORT

      if (reportMode === '1') {
        console.info(formatted)
      }
      expect(report.metrics).toHaveLength(150)
      expect(report.issues, formatted).toEqual([])
      expect(report.passed).toBe(true)
    },
    30_000,
  )

  it('excludes worked-example and starter code from prose extraction', async () => {
    const seeds = await discoverProblemMissionSeeds()
    const sample = seeds[0]
    expect(sample).toBeDefined()
    const fields = learnerProse(sample!.seed).map(({ field }) => field)

    expect(fields.some((field) => field.includes('starterCode'))).toBe(false)
    expect(fields.some((field) => field.endsWith('.code'))).toBe(false)
  }, 30_000)
})
