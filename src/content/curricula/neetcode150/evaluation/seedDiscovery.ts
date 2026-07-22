import type { ProblemId } from '../../../../types/curriculum'
import type { ProblemMissionSeed } from '../problemMissionSeed'
import { NEETCODE_150_PROBLEM_LESSON_LOADERS } from '../problemLessonLoaders.generated'
import type { ProblemLessonLoader } from '../problemRegistry'

export type DiscoveredProblemMissionSeed = {
  readonly problemId: ProblemId
  readonly exportName: string
  readonly seed: ProblemMissionSeed
}

type MissionLoaderMap = Readonly<
  Partial<Record<ProblemId, ProblemLessonLoader>>
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A narrow runtime check used only to identify seed exports on loaded modules. */
export function isProblemMissionSeed(value: unknown): value is ProblemMissionSeed {
  if (!isRecord(value)) return false
  const mission = value.mission
  const pythonChallenge = value.pythonChallenge
  const cases = isRecord(pythonChallenge) ? pythonChallenge.cases : undefined
  return (
    typeof value.slug === 'string' &&
    typeof value.estimatedMinutes === 'number' &&
    isRecord(mission) &&
    typeof mission.title === 'string' &&
    typeof mission.context === 'string' &&
    typeof mission.prompt === 'string' &&
    Array.isArray(value.algorithmSteps) &&
    isRecord(pythonChallenge) &&
    isRecord(cases) &&
    isRecord(cases.visibleExample) &&
    isRecord(cases.hiddenBoundary) &&
    isRecord(cases.hiddenAdversarial)
  )
}

/**
 * Load each realm-owned lazy module and discover its named mission-seed export.
 * This deliberately uses the same loader graph as production, so a module
 * omitted from a realm index cannot be accidentally evaluated as covered.
 */
export async function discoverProblemMissionSeeds(
  loaders: MissionLoaderMap = NEETCODE_150_PROBLEM_LESSON_LOADERS,
): Promise<readonly DiscoveredProblemMissionSeed[]> {
  const discovered: DiscoveredProblemMissionSeed[] = []

  for (const [rawProblemId, loader] of Object.entries(loaders).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!loader) continue
    const problemId = rawProblemId as ProblemId
    const loaded = await loader()
    if (!isRecord(loaded)) {
      throw new Error(`Mission loader "${problemId}" did not return a module`)
    }

    const seedExports = Object.entries(loaded).filter((entry) =>
      isProblemMissionSeed(entry[1]),
    )
    if (seedExports.length !== 1) {
      throw new Error(
        `Mission module "${problemId}" must export exactly one ProblemMissionSeed; found ${seedExports.length}`,
      )
    }

    const [exportName, seed] = seedExports[0] as [string, ProblemMissionSeed]
    if (`problem:${seed.slug}` !== problemId) {
      throw new Error(
        `Seed export "${exportName}" has slug "${seed.slug}" but loader key is "${problemId}"`,
      )
    }
    discovered.push({ problemId, exportName, seed })
  }

  return discovered
}
