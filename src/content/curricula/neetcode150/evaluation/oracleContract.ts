import type { ProblemId } from '../../../../types/curriculum'
import type { JsonValue } from '../../../../types/learning'

/** Opt-in release gate while realm writers migrate from the v1 single mutant. */
export const PROBLEM_MISSION_RELEASE_MUTANT_MINIMUM = 2 as const

/**
 * Oracle functions must be deterministic, side-effect free, and accept/return
 * only JSON values. The evaluator verifies those guarantees for every case.
 */
export type PureJsonProblemSolver = (input: JsonValue) => JsonValue

export type ProblemMissionMutant = {
  /** Stable, problem-local identifier describing the intentional defect. */
  readonly id: string
  readonly description: string
  readonly solve: PureJsonProblemSolver
}

export type ProblemMissionOracle = {
  readonly problemId: ProblemId
  readonly solve: PureJsonProblemSolver
  readonly mutants: readonly [
    ProblemMissionMutant,
    ...ProblemMissionMutant[],
  ]
}

export type ProblemMissionOracleRegistry = Readonly<
  Partial<Record<ProblemId, ProblemMissionOracle>>
>

/** Preserve literal ids while checking the complete oracle contract. */
export function defineProblemMissionOracle<const T extends ProblemMissionOracle>(
  oracle: T,
): T {
  return oracle
}

/** Define one independently mergeable realm map. */
export function defineProblemMissionOracleRegistry<
  const T extends ProblemMissionOracleRegistry,
>(registry: T): T {
  return registry
}

/**
 * Merge independently-authored realm maps without allowing a later spread to
 * silently replace an oracle. Registry keys must match each oracle's id.
 */
export function mergeProblemMissionOracleRegistries(
  ...registries: readonly ProblemMissionOracleRegistry[]
): ProblemMissionOracleRegistry {
  const merged: Partial<Record<ProblemId, ProblemMissionOracle>> = {}

  for (const registry of registries) {
    for (const [key, oracle] of Object.entries(registry)) {
      if (!oracle) continue
      const problemId = key as ProblemId
      if (oracle.problemId !== problemId) {
        throw new Error(
          `Oracle registry key "${problemId}" contains "${oracle.problemId}"`,
        )
      }
      if (merged[problemId]) {
        throw new Error(`Duplicate problem oracle "${problemId}"`)
      }
      merged[problemId] = oracle
    }
  }

  return Object.freeze(merged)
}
