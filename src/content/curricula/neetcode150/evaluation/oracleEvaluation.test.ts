import { describe, expect, it } from 'vitest'
import {
  evaluateProblemMissionOracles,
  formatOracleEvaluationReport,
  oracleReleaseModeFromEnvironment,
  problemMissionCases,
} from './oracleEvaluator'
import { NEETCODE_150_PROBLEM_MISSION_ORACLES } from './oracleRegistry'
import { PROBLEM_MISSION_RELEASE_MUTANT_MINIMUM } from './oracleContract'
import { discoverProblemMissionSeeds } from './seedDiscovery'

describe('NeetCode 150 problem oracles', () => {
  it(
    'discovers realm seed exports and kills every registered semantic mutant',
    async () => {
      const seeds = await discoverProblemMissionSeeds()
      const releaseMode = oracleReleaseModeFromEnvironment()
      const report = evaluateProblemMissionOracles(
        seeds,
        NEETCODE_150_PROBLEM_MISSION_ORACLES,
        { releaseMode },
      )

      expect(seeds).toHaveLength(150)
      expect(
        new Set(seeds.map(({ problemId }) => problemId)).size,
      ).toBe(150)
      expect(
        report.issues,
        formatOracleEvaluationReport(report),
      ).toEqual([])

      const example = report.problems.find(
        ({ problemId }) => problemId === 'problem:contains-duplicate',
      )
      expect(example).toMatchObject({
        oraclePresent: true,
        oraclePassed: true,
        caseCount: 4,
      })
      expect(example?.mutants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'adjacent-only',
            killed: true,
          }),
        ]),
      )
      expect(example?.mutants.length).toBeGreaterThanOrEqual(
        PROBLEM_MISSION_RELEASE_MUTANT_MINIMUM,
      )

      expect(report.missingOracleIds).toEqual([])
      expect(report.passed).toBe(true)
    },
    30_000,
  )

  it('labels all mandatory and additional case classes', async () => {
    const seeds = await discoverProblemMissionSeeds()
    const containsDuplicate = seeds.find(
      ({ problemId }) => problemId === 'problem:contains-duplicate',
    )
    expect(containsDuplicate).toBeDefined()
    expect(
      problemMissionCases(containsDuplicate!.seed.pythonChallenge.cases).map(
        ({ caseClass }) => caseClass,
      ),
    ).toEqual(['visible', 'boundary', 'adversarial', 'additional'])
  }, 30_000)

  it('enforces the two-mutant release gate across all 150 problems', async () => {
    const seeds = await discoverProblemMissionSeeds()
    const report = evaluateProblemMissionOracles(
      seeds,
      NEETCODE_150_PROBLEM_MISSION_ORACLES,
      {
      releaseMode: true,
      minimumMutantsPerProblem:
        PROBLEM_MISSION_RELEASE_MUTANT_MINIMUM,
      },
    )

    expect(report.minimumMutantsPerProblem).toBe(
      PROBLEM_MISSION_RELEASE_MUTANT_MINIMUM,
    )
    expect(report.issues, formatOracleEvaluationReport(report)).toEqual([])
    expect(
      report.problems.every(({ mutants }) => mutants.length >= 2),
    ).toBe(true)
  }, 30_000)
})
