import type { AssessmentV1 } from '../../../../types/assessment'
import type {
  ProblemId,
  SkillId,
  TrackId,
} from '../../../../types/curriculum'
import type { DiagramSpec } from '../../../../types/diagram'
import type { ProblemLessonSpecV1 } from '../../../../types/problemLesson'
import {
  PROBLEM_LESSON_LIMITS,
  compileProblemLesson,
  validateDiagramSpec,
  validateProblemLesson,
} from '../../problemLessonCompiler'
import {
  CERTIFICATION_ITEM_BANK,
  buildCertificationAssessment,
} from '../certificationAssessment'
import {
  NEETCODE_150_CONTENT_VERSION,
  NEETCODE_150_MANIFEST,
} from '../manifest'
import type {
  ProblemMissionSeed,
  ProblemMissionVisualSeed,
} from '../problemMissionSeed'
import { loadProblemLesson } from '../problemRegistry'
import { discoverProblemMissionSeeds } from './seedDiscovery'
import { learnerProse } from './readability'

export type ContentQualityIssueKind =
  | 'coverage'
  | 'version'
  | 'id'
  | 'serializability'
  | 'originality'
  | 'duplicate-text'
  | 'near-duplicate-text'
  | 'choice'
  | 'choice-bias'
  | 'answer-leakage'
  | 'python-case'
  | 'diagram'
  | 'track-coverage'
  | 'prerequisite'
  | 'certification'

export type ContentQualityIssue = {
  readonly kind: ContentQualityIssueKind
  readonly location: string
  readonly message: string
}

export type TextSimilarityOffender = {
  readonly left: string
  readonly right: string
  readonly similarity: number
}

export type CorrectOptionBiasReport = {
  readonly authoredMissionCounts: readonly number[]
  readonly simulatedMissionCounts: readonly number[]
  readonly certificationCounts: readonly number[]
  readonly simulatedMissionMaximumShare: number
  readonly certificationMaximumShare: number
}

export type ContentQualityReport = {
  readonly passed: boolean
  readonly problemCount: number
  readonly trackCount: number
  /** Internal learner-copy similarity only; this is not a legal originality scan. */
  readonly internalExactDuplicateTexts: readonly TextSimilarityOffender[]
  readonly internalNearDuplicateTexts: readonly TextSimilarityOffender[]
  readonly correctOptionBias: CorrectOptionBiasReport
  readonly issues: readonly ContentQualityIssue[]
}

const CORE_TEXT_FIELDS = [
  'mission.title',
  'mission.context',
  'mission.prompt',
  'objective',
  'recognitionCue',
  'misconception',
  'workedExample.prompt',
  'patternCheck.prompt',
  'retrievalCheck.prompt',
  'reconstructionCheck.prompt',
  'pythonChallenge.prompt',
] as const

const NEAR_DUPLICATE_THRESHOLD = 0.94
const MAX_SIMULATED_MISSION_POSITION_SHARE = 0.35
const MAX_CERTIFICATION_POSITION_SHARE = 0.35
const POSITION_SIMULATION_COHORTS = 16

type CoreTextField = (typeof CORE_TEXT_FIELDS)[number]

type TextEntry = {
  readonly problemId: ProblemId
  readonly field: string
  readonly text: string
}

type LoadedMission = {
  readonly problemId: ProblemId
  readonly seed: ProblemMissionSeed
  readonly spec: ProblemLessonSpecV1
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/<=/gu, ' less than or equal ')
    .replace(/>=/gu, ' greater than or equal ')
    .replace(/!=/gu, ' not equal ')
    .replace(/==/gu, ' equal ')
    .replace(/\+/gu, ' plus ')
    .replace(/\s-\s/gu, ' minus ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

function words(value: string): readonly string[] {
  return normalizeText(value).split(' ').filter(Boolean)
}

function ngrams(value: string): ReadonlySet<string> {
  const tokens = words(value)
  const result = new Set<string>()
  if (tokens.length < 2) return new Set(tokens)
  for (let index = 0; index < tokens.length - 1; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]}`)
  }
  return result
}

function diceSimilarity(left: string, right: string): number {
  const a = ngrams(left)
  const b = ngrams(right)
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const token of a) {
    if (b.has(token)) overlap += 1
  }
  return (2 * overlap) / (a.size + b.size)
}

function textAt(seed: ProblemMissionSeed, field: CoreTextField): string {
  switch (field) {
    case 'mission.title':
      return seed.mission.title
    case 'mission.context':
      return seed.mission.context
    case 'mission.prompt':
      return seed.mission.prompt
    case 'objective':
      return seed.objective
    case 'recognitionCue':
      return seed.recognitionCue
    case 'misconception':
      return seed.misconception
    case 'workedExample.prompt':
      return seed.workedExample.prompt
    case 'patternCheck.prompt':
      return seed.patternCheck.prompt
    case 'retrievalCheck.prompt':
      return seed.retrievalCheck.prompt
    case 'reconstructionCheck.prompt':
      return seed.reconstructionCheck.prompt
    case 'pythonChallenge.prompt':
      return seed.pythonChallenge.prompt
  }
}

function addIssue(
  issues: ContentQualityIssue[],
  kind: ContentQualityIssueKind,
  location: string,
  message: string,
): void {
  issues.push({ kind, location, message })
}

function jsonProblem(value: unknown, path = '$', seen = new Set<object>()): string | null {
  if (value === null) return null
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return null
    case 'number':
      return Number.isFinite(value) ? null : `${path} is not finite`
    case 'object': {
      if (seen.has(value)) return `${path} contains a cycle`
      seen.add(value)
      const entries = Array.isArray(value)
        ? value.map((item, index) => [`${index}`, item] as const)
        : Object.entries(value)
      for (const [key, child] of entries) {
        const issue = jsonProblem(child, `${path}.${key}`, seen)
        if (issue) return issue
      }
      seen.delete(value)
      return null
    }
    default:
      return `${path} contains ${typeof value}, which is not JSON`
  }
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function collectDiagrams(
  seed: ProblemMissionSeed,
): readonly { location: string; diagram: DiagramSpec }[] {
  const diagrams: { location: string; diagram: DiagramSpec }[] = []
  const append = (location: string, visuals?: ProblemMissionVisualSeed) => {
    if (visuals?.diagram) {
      diagrams.push({ location: `${location}.diagram`, diagram: visuals.diagram })
    }
    visuals?.diagramSequence?.forEach((diagram, index) => {
      diagrams.push({
        location: `${location}.diagramSequence[${index}]`,
        diagram,
      })
    })
  }
  append('explanationVisuals', seed.explanationVisuals)
  append('workedExample', seed.workedExample)
  append('patternCheck', seed.patternCheck)
  append('retrievalCheck', seed.retrievalCheck)
  append('reconstructionCheck', seed.reconstructionCheck)
  append('pythonChallenge', seed.pythonChallenge)
  return diagrams
}

function countAt(counts: number[], position: number): void {
  while (counts.length <= position) counts.push(0)
  counts[position] = (counts[position] ?? 0) + 1
}

function maximumShare(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0)
  return total === 0 ? 0 : Math.max(...counts) / total
}

function singleChoice(assessments: readonly AssessmentV1[]): Extract<
  AssessmentV1,
  { kind: 'singleChoice' }
> | undefined {
  return assessments.find(
    (
      assessment,
    ): assessment is Extract<AssessmentV1, { kind: 'singleChoice' }> =>
      assessment.kind === 'singleChoice',
  )
}

async function loadMissions(
  issues: ContentQualityIssue[],
): Promise<readonly LoadedMission[]> {
  const discovered = await discoverProblemMissionSeeds()
  const result: LoadedMission[] = []
  for (const { problemId, seed } of discovered) {
    const spec = await loadProblemLesson(problemId)
    if (!spec) {
      addIssue(
        issues,
        'coverage',
        problemId,
        'The realm loader did not return a problem lesson.',
      )
      continue
    }
    result.push({ problemId, seed, spec })
  }
  return result
}

function evaluateCoverageAndIdentity(
  missions: readonly LoadedMission[],
  issues: ContentQualityIssue[],
): void {
  const manifestIds = NEETCODE_150_MANIFEST.problems.map(({ id }) => id)
  const missionIds = missions.map(({ problemId }) => problemId)
  if (manifestIds.length !== 150 || missions.length !== 150) {
    addIssue(
      issues,
      'coverage',
      'curriculum',
      `Expected 150 manifest problems and mission seeds; found ${manifestIds.length} and ${missions.length}.`,
    )
  }
  if (
    new Set(manifestIds).size !== 150 ||
    new Set(missionIds).size !== missions.length ||
    [...manifestIds].sort().join('\n') !== [...missionIds].sort().join('\n')
  ) {
    addIssue(
      issues,
      'coverage',
      'curriculum.problemIds',
      'Manifest and realm-loader problem IDs are not an exact unique set.',
    )
  }
  if (
    NEETCODE_150_MANIFEST.id !== 'curriculum:neetcode150' ||
    NEETCODE_150_MANIFEST.version.schema !== 'v1.0.0' ||
    NEETCODE_150_MANIFEST.version.content !== NEETCODE_150_CONTENT_VERSION
  ) {
    addIssue(
      issues,
      'version',
      'manifest.version',
      'The pinned curriculum id/schema/content versions changed.',
    )
  }

  const globalIds = new Set<string>()
  for (const { problemId, seed, spec } of missions) {
    const slug = seed.slug
    const problem = NEETCODE_150_MANIFEST.problems.find(
      ({ id }) => id === problemId,
    )
    if (
      !problem ||
      problemId !== `problem:${slug}` ||
      problem.leetcodeSlug !== slug ||
      spec.problemId !== problemId
    ) {
      addIssue(
        issues,
        'id',
        problemId,
        'Manifest, seed, loader, and spec identities do not agree.',
      )
    }
    if (
      spec.schemaVersion !== 1 ||
      spec.curriculumId !== NEETCODE_150_MANIFEST.id ||
      spec.manifestContentVersion !== NEETCODE_150_CONTENT_VERSION ||
      spec.problemContentVersion !== NEETCODE_150_CONTENT_VERSION
    ) {
      addIssue(
        issues,
        'version',
        problemId,
        'Problem lesson versions do not match the manifest.',
      )
    }

    const variant = spec.variants[0]
    const expectedStepIds = [
      `step:${slug}:explanation`,
      `step:${slug}:worked-example`,
      `step:${slug}:quiz-intro`,
      `step:${slug}:pattern-check`,
      `step:${slug}:typed-retrieval`,
      `step:${slug}:algorithm-reconstruction`,
      `step:${slug}:python-transfer`,
    ]
    const actualStepIds = variant
      ? [
          variant.explanation.id,
          variant.workedExample.id,
          variant.quizIntro.id,
          ...variant.assessments.map(({ id }) => id),
        ]
      : []
    if (
      variant?.id !== `variant:${slug}:core` ||
      actualStepIds.join('\n') !== expectedStepIds.join('\n')
    ) {
      addIssue(
        issues,
        'id',
        problemId,
        'The canonical variant or seven stage IDs are not stable.',
      )
    }
    const allIds = [
      variant?.id,
      ...actualStepIds,
      ...(variant?.assessments.map(({ assessment }) => assessment.id) ?? []),
    ].filter((id): id is string => !!id)
    for (const id of allIds) {
      if (globalIds.has(id)) {
        addIssue(issues, 'id', problemId, `Duplicate global content id "${id}".`)
      }
      globalIds.add(id)
    }
  }
}

function evaluateSerializationAndValidation(
  missions: readonly LoadedMission[],
  issues: ContentQualityIssue[],
): void {
  const manifestJsonIssue = jsonProblem(NEETCODE_150_MANIFEST)
  if (manifestJsonIssue) {
    addIssue(
      issues,
      'serializability',
      'manifest',
      manifestJsonIssue,
    )
  }
  for (const { problemId, seed, spec } of missions) {
    for (const [name, value] of [
      ['seed', seed],
      ['spec', spec],
    ] as const) {
      const problem = jsonProblem(value)
      if (problem) {
        addIssue(
          issues,
          'serializability',
          `${problemId}.${name}`,
          problem,
        )
      }
    }
    const validation = validateProblemLesson(spec, NEETCODE_150_MANIFEST)
    if (!validation.valid) {
      for (const issue of validation.issues) {
        addIssue(
          issues,
          issue.code === 'diagram' ? 'diagram' : 'serializability',
          `${problemId}.${issue.path}`,
          issue.message,
        )
      }
    }
    for (const { location, diagram } of collectDiagrams(seed)) {
      for (const issue of validateDiagramSpec(diagram)) {
        addIssue(
          issues,
          'diagram',
          `${problemId}.${location}.${issue.path}`,
          issue.message,
        )
      }
    }
  }
}

function evaluateOriginalityAndText(
  missions: readonly LoadedMission[],
  issues: ContentQualityIssue[],
): {
  exact: readonly TextSimilarityOffender[]
  near: readonly TextSimilarityOffender[]
} {
  if (
    NEETCODE_150_MANIFEST.contentPolicy.promptAuthorship !== 'original' ||
    NEETCODE_150_MANIFEST.contentPolicy.copiedThirdPartyStatements ||
    NEETCODE_150_MANIFEST.contentPolicy.copiedThirdPartyEditorials
  ) {
    addIssue(
      issues,
      'originality',
      'manifest.contentPolicy',
      'Original prompt policy is not enforced.',
    )
  }

  const coreEntries = missions.flatMap(({ problemId, seed }) =>
    CORE_TEXT_FIELDS.map(
      (field): TextEntry => ({
        problemId,
        field,
        text: textAt(seed, field),
      }),
    ),
  )
  const canonicalTitles = new Set(
    NEETCODE_150_MANIFEST.problems.map(({ title }) => normalizeText(title)),
  )
  const blockingSimilarityLocations = new Set(
    coreEntries.map(({ problemId, field }) => `${problemId}.${field}`),
  )
  for (const entry of coreEntries) {
    const location = `${entry.problemId}.${entry.field}`
    const normalized = normalizeText(entry.text)
    const minimumLength = entry.field === 'mission.title' ? 5 : 20
    if (entry.text.trim().length < minimumLength) {
      addIssue(
        issues,
        'originality',
        location,
        'Core learner-facing copy is too short to be an original teaching prompt.',
      )
    }
    if (
      canonicalTitles.has(normalized) ||
      /(?:https?:\/\/|leetcode|neetcode\s+problem|editorial)/iu.test(entry.text)
    ) {
      addIssue(
        issues,
        'originality',
        location,
        'Core copy repeats metadata or references a prohibited source.',
      )
    }
  }

  const entries = missions.flatMap(({ problemId, seed }) =>
    learnerProse(seed).map(
      ({ field, text }): TextEntry => ({
        problemId,
        field,
        text,
      }),
    ),
  )
  for (const problem of NEETCODE_150_MANIFEST.problems) {
    if (
      problem.provenance.promptsAndStatements !== 'original' ||
      problem.provenance.copiedSourceMaterial
    ) {
      addIssue(
        issues,
        'originality',
        problem.id,
        'Problem provenance does not declare original learner-facing copy.',
      )
    }
  }

  const exact: TextSimilarityOffender[] = []
  const near: TextSimilarityOffender[] = []
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const left = entries[leftIndex]
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entries.length;
      rightIndex += 1
    ) {
      const right = entries[rightIndex]
      if (
        left.problemId === right.problemId ||
        left.field !== right.field
      ) {
        continue
      }
      const leftLocation = `${left.problemId}.${left.field}`
      const rightLocation = `${right.problemId}.${right.field}`
      if (normalizeText(left.text) === normalizeText(right.text)) {
        exact.push({
          left: leftLocation,
          right: rightLocation,
          similarity: 1,
        })
        continue
      }
      if (words(left.text).length < 10 || words(right.text).length < 10) {
        continue
      }
      const similarity = diceSimilarity(left.text, right.text)
      if (similarity >= NEAR_DUPLICATE_THRESHOLD) {
        near.push({
          left: leftLocation,
          right: rightLocation,
          similarity,
        })
      }
    }
  }
  for (const offender of exact) {
    if (
      blockingSimilarityLocations.has(offender.left) &&
      blockingSimilarityLocations.has(offender.right)
    ) {
      addIssue(
        issues,
        'duplicate-text',
        `${offender.left} <> ${offender.right}`,
        'Exact duplicate core learner-facing text.',
      )
    }
  }
  for (const offender of near) {
    if (
      blockingSimilarityLocations.has(offender.left) &&
      blockingSimilarityLocations.has(offender.right)
    ) {
      addIssue(
        issues,
        'near-duplicate-text',
        `${offender.left} <> ${offender.right}`,
        `Near-duplicate core text (${offender.similarity.toFixed(3)} similarity).`,
      )
    }
  }
  return { exact, near }
}

function evaluateChoicesAndLeakage(
  missions: readonly LoadedMission[],
  issues: ContentQualityIssue[],
): CorrectOptionBiasReport {
  const authoredMissionCounts: number[] = []
  const simulatedMissionCounts: number[] = []

  for (const { problemId, seed, spec } of missions) {
    const labels = seed.patternCheck.options.map(({ label }) =>
      normalizeText(label),
    )
    if (new Set(labels).size !== labels.length) {
      addIssue(
        issues,
        'choice',
        `${problemId}.patternCheck.options`,
        'Choice labels must be distinct after normalization.',
      )
    }
    const correctPosition = seed.patternCheck.options.findIndex(
      ({ id }) => id === seed.patternCheck.correctOptionId,
    )
    if (correctPosition < 0) {
      addIssue(
        issues,
        'choice',
        `${problemId}.patternCheck.correctOptionId`,
        'Correct option id does not resolve.',
      )
    } else {
      countAt(authoredMissionCounts, correctPosition)
    }

    const correctLabel =
      correctPosition < 0
        ? ''
        : normalizeText(seed.patternCheck.options[correctPosition].label)
    if (
      correctLabel.length >= 12 &&
      normalizeText(seed.patternCheck.prompt).includes(correctLabel)
    ) {
      addIssue(
        issues,
        'answer-leakage',
        `${problemId}.patternCheck.prompt`,
        'Prompt contains the complete correct option label.',
      )
    }
    for (const answer of seed.retrievalCheck.acceptedAnswers) {
      const normalizedAnswer = normalizeText(answer)
      if (
        normalizedAnswer.length >= 8 &&
        normalizeText(seed.retrievalCheck.prompt).includes(normalizedAnswer)
      ) {
        addIssue(
          issues,
          'answer-leakage',
          `${problemId}.retrievalCheck.prompt`,
          `Prompt contains accepted answer "${answer}".`,
        )
      }
    }

    for (let cohort = 0; cohort < POSITION_SIMULATION_COHORTS; cohort += 1) {
      const compiled = compileProblemLesson(spec, NEETCODE_150_MANIFEST, {
        seed: `choice-position-cohort-${cohort}`,
      })
      const assessment = singleChoice(
        compiled.steps
          .map(({ assessment }) => assessment)
          .filter((value): value is AssessmentV1 => value !== undefined),
      )
      if (!assessment) {
        addIssue(
          issues,
          'choice',
          problemId,
          'Compiled mission has no single-choice pattern check.',
        )
        continue
      }
      if (assessment.shuffleOptions === false) {
        addIssue(
          issues,
          'choice-bias',
          assessment.id,
          'Mission choices must be shuffled before learner exposure.',
        )
      }
      const position = assessment.options.findIndex(
        ({ id }) => id === assessment.correctOptionId,
      )
      if (position >= 0) countAt(simulatedMissionCounts, position)
    }
  }

  const certificationCounts: number[] = []
  // Deliberately stricter than the grading matcher (which also folds
  // comma/semicolon/&& separators and a leading "because"/"since"): this
  // gate only case-folds and collapses whitespace, so authored separator
  // variants like "18,7,3" and "18 7 3" stay distinct here even though the
  // grader now treats them as equivalent.
  const matcherNormalize = (value: string): string =>
    value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/gu, ' ')
  for (const item of CERTIFICATION_ITEM_BANK) {
    if (item.kind === 'code-transfer') continue
    const matcherAnswers = item.acceptedAnswers.map(matcherNormalize)
    if (new Set(matcherAnswers).size !== matcherAnswers.length) {
      addIssue(
        issues,
        'choice',
        item.id,
        'Certification accepted answers are not distinct under matcher normalization.',
      )
    }
    const normalizedPrompt = normalizeText(item.prompt)
    for (const [index, answer] of item.acceptedAnswers.entries()) {
      const comparable = normalizeText(answer)
      if (comparable.length >= 12 && normalizedPrompt.includes(comparable)) {
        addIssue(
          issues,
          'answer-leakage',
          item.id,
          `Certification prompt contains accepted answer "${item.acceptedAnswers[index]}".`,
        )
      }
    }
  }
  for (const step of buildCertificationAssessment().lesson.steps) {
    const assessment = step.assessment
    if (assessment?.kind !== 'singleChoice') continue
    const position = assessment.options.findIndex(
      ({ id }) => id === assessment.correctOptionId,
    )
    if (position >= 0) countAt(certificationCounts, position)
  }

  const simulatedMissionMaximumShare = maximumShare(simulatedMissionCounts)
  const certificationMaximumShare = maximumShare(certificationCounts)
  if (simulatedMissionMaximumShare > MAX_SIMULATED_MISSION_POSITION_SHARE) {
    addIssue(
      issues,
      'choice-bias',
      'missions.patternCheck',
      `Simulated correct-position maximum share ${(simulatedMissionMaximumShare * 100).toFixed(1)}% exceeds ${(MAX_SIMULATED_MISSION_POSITION_SHARE * 100).toFixed(0)}%.`,
    )
  }
  if (certificationMaximumShare > MAX_CERTIFICATION_POSITION_SHARE) {
    addIssue(
      issues,
      'choice-bias',
      'certification',
      `Certification correct-position maximum share ${(certificationMaximumShare * 100).toFixed(1)}% exceeds ${(MAX_CERTIFICATION_POSITION_SHARE * 100).toFixed(0)}%.`,
    )
  }

  return {
    authoredMissionCounts,
    simulatedMissionCounts,
    certificationCounts,
    simulatedMissionMaximumShare,
    certificationMaximumShare,
  }
}

function evaluatePythonCasesAndDiagrams(
  missions: readonly LoadedMission[],
  issues: ContentQualityIssue[],
): void {
  for (const { problemId, seed } of missions) {
    const cases = seed.pythonChallenge.cases
    const entries = [
      ['visibleExample', cases.visibleExample],
      ['hiddenBoundary', cases.hiddenBoundary],
      ['hiddenAdversarial', cases.hiddenAdversarial],
      ...(cases.additional ?? []).map(
        (item) => [`additional.${item.id}`, item] as const,
      ),
    ] as const
    if (entries.length < 3 || entries.length > PROBLEM_LESSON_LIMITS.pythonCases) {
      addIssue(
        issues,
        'python-case',
        `${problemId}.pythonChallenge.cases`,
        `Case count ${entries.length} is outside 3-${PROBLEM_LESSON_LIMITS.pythonCases}.`,
      )
    }
    const inputKeys = new Set<string>()
    let planBytes = 0
    for (const [caseName, testCase] of entries) {
      const location = `${problemId}.pythonChallenge.cases.${caseName}`
      const problem = jsonProblem(testCase)
      if (problem) {
        addIssue(issues, 'python-case', location, problem)
        continue
      }
      const bytes = serializedBytes(testCase)
      planBytes += bytes
      if (bytes > PROBLEM_LESSON_LIMITS.pythonCaseBytes) {
        addIssue(
          issues,
          'python-case',
          location,
          `Serialized case is ${bytes} bytes; cap is ${PROBLEM_LESSON_LIMITS.pythonCaseBytes}.`,
        )
      }
      const inputKey = JSON.stringify(testCase.input)
      if (inputKeys.has(inputKey)) {
        addIssue(
          issues,
          'python-case',
          location,
          'Case input duplicates another case in this mission.',
        )
      }
      inputKeys.add(inputKey)
    }
    if (planBytes > PROBLEM_LESSON_LIMITS.pythonPlanBytes) {
      addIssue(
        issues,
        'python-case',
        `${problemId}.pythonChallenge.cases`,
        `Serialized plan is ${planBytes} bytes; cap is ${PROBLEM_LESSON_LIMITS.pythonPlanBytes}.`,
      )
    }
  }
}

function reachesSkillRoot(
  skillId: SkillId,
  prerequisites: ReadonlyMap<SkillId, readonly SkillId[]>,
  visiting: Set<SkillId>,
  memo: Map<SkillId, boolean>,
): boolean {
  const cached = memo.get(skillId)
  if (cached !== undefined) return cached
  if (visiting.has(skillId)) return false
  const next = prerequisites.get(skillId)
  if (!next) return false
  if (next.length === 0) {
    memo.set(skillId, true)
    return true
  }
  visiting.add(skillId)
  const result = next.every((id) =>
    reachesSkillRoot(id, prerequisites, visiting, memo),
  )
  visiting.delete(skillId)
  memo.set(skillId, result)
  return result
}

function evaluateTracksPrerequisitesAndCertification(
  missions: readonly LoadedMission[],
  issues: ContentQualityIssue[],
): void {
  const manifest = NEETCODE_150_MANIFEST
  if (manifest.tracks.length !== 18) {
    addIssue(
      issues,
      'track-coverage',
      'manifest.tracks',
      `Expected 18 tracks; found ${manifest.tracks.length}.`,
    )
  }
  const missionIds = new Set(missions.map(({ problemId }) => problemId))
  const coveredByTracks = new Set<ProblemId>()
  for (const track of manifest.tracks) {
    if (track.problemIds.length === 0) {
      addIssue(
        issues,
        'track-coverage',
        track.id,
        'Track has no problems.',
      )
    }
    for (const problemId of track.problemIds) {
      if (!missionIds.has(problemId)) {
        addIssue(
          issues,
          'track-coverage',
          track.id,
          `Track references missing mission "${problemId}".`,
        )
      }
      if (coveredByTracks.has(problemId)) {
        addIssue(
          issues,
          'track-coverage',
          track.id,
          `Mission "${problemId}" appears in multiple tracks.`,
        )
      }
      coveredByTracks.add(problemId)
    }
  }
  if (coveredByTracks.size !== 150) {
    addIssue(
      issues,
      'track-coverage',
      'manifest.tracks',
      `Tracks cover ${coveredByTracks.size}/150 unique missions.`,
    )
  }

  const problemById = new Map(
    manifest.problems.map((problem) => [problem.id, problem]),
  )
  for (const problem of manifest.problems) {
    for (const prerequisiteId of problem.prerequisiteProblemIds) {
      const prerequisite = problemById.get(prerequisiteId)
      if (!prerequisite || prerequisite.globalOrder >= problem.globalOrder) {
        addIssue(
          issues,
          'prerequisite',
          problem.id,
          `Prerequisite "${prerequisiteId}" is missing or not reachable earlier in manifest order.`,
        )
      }
    }
  }
  const skillPrerequisites = new Map<SkillId, readonly SkillId[]>(
    manifest.skills.map(({ id, prerequisiteSkillIds }) => [
      id,
      prerequisiteSkillIds,
    ]),
  )
  const skillMemo = new Map<SkillId, boolean>()
  for (const skill of manifest.skills) {
    if (
      !reachesSkillRoot(
        skill.id,
        skillPrerequisites,
        new Set<SkillId>(),
        skillMemo,
      )
    ) {
      addIssue(
        issues,
        'prerequisite',
        skill.id,
        'Skill does not reach a prerequisite root (missing reference or cycle).',
      )
    }
  }

  const certification = buildCertificationAssessment()
  const manifestTrackIds = new Set<TrackId>(
    manifest.tracks.map(({ id }) => id),
  )
  if (
    certification.trackIds.length !== 18 ||
    new Set(certification.trackIds).size !== 18 ||
    certification.trackIds.some((id) => !manifestTrackIds.has(id)) ||
    certification.requiredOpenEndedStepIds.length !== 18
  ) {
    addIssue(
      issues,
      'certification',
      'certification.trackCoverage',
      'Final certification must cover all 18 tracks and require 18 open transfers.',
    )
  }
  const codeItems = certification.stepMetadata.filter(
    ({ itemKind }) => itemKind === 'code-transfer',
  )
  if (codeItems.length === 0) {
    addIssue(
      issues,
      'certification',
      'certification.codingGauntlet',
      'Final certification must include real Python coding problems.',
    )
  }
  for (const trackId of manifestTrackIds) {
    const metadata = certification.stepMetadata.filter(
      (item) => item.trackId === trackId,
    )
    const recognitionCount = metadata.filter(
      ({ itemKind }) => itemKind === 'pattern-recognition',
    ).length
    const transferCount = metadata.filter(
      ({ itemKind }) => itemKind === 'open-transfer',
    ).length
    const codeCount = metadata.filter(
      ({ itemKind }) => itemKind === 'code-transfer',
    ).length
    if (recognitionCount !== 1 || transferCount !== 1 || codeCount > 1) {
      addIssue(
        issues,
        'certification',
        trackId,
        'Certification needs one recognition, one open transfer, and at most one Python solve per track.',
      )
    }
  }
}

export async function evaluateNeetcode150ContentQuality(): Promise<ContentQualityReport> {
  const issues: ContentQualityIssue[] = []
  const missions = await loadMissions(issues)
  evaluateCoverageAndIdentity(missions, issues)
  evaluateSerializationAndValidation(missions, issues)
  const text = evaluateOriginalityAndText(missions, issues)
  const correctOptionBias = evaluateChoicesAndLeakage(missions, issues)
  evaluatePythonCasesAndDiagrams(missions, issues)
  evaluateTracksPrerequisitesAndCertification(missions, issues)

  return {
    passed: issues.length === 0,
    problemCount: missions.length,
    trackCount: NEETCODE_150_MANIFEST.tracks.length,
    internalExactDuplicateTexts: text.exact,
    internalNearDuplicateTexts: text.near,
    correctOptionBias,
    issues,
  }
}

export function formatContentQualityReport(report: ContentQualityReport): string {
  const bias = report.correctOptionBias
  const lines = [
    `Internal curriculum quality: ${report.problemCount} problems, ${report.trackCount} tracks, ${report.issues.length} issues.`,
    'Similarity checks compare AlphaCode learner copy internally; they do not establish legal originality against third-party corpora.',
    `Learner-copy similarity inventory: ${report.internalExactDuplicateTexts.length} exact and ${report.internalNearDuplicateTexts.length} near-duplicate pairs.`,
    `Mission answer positions (authored): [${bias.authoredMissionCounts.join(', ')}].`,
    `Mission answer positions (${POSITION_SIMULATION_COHORTS} simulated cohorts): [${bias.simulatedMissionCounts.join(', ')}], max ${(bias.simulatedMissionMaximumShare * 100).toFixed(1)}%.`,
    `Certification answer positions: [${bias.certificationCounts.join(', ')}], max ${(bias.certificationMaximumShare * 100).toFixed(1)}%.`,
  ]
  if (report.issues.length > 0) {
    lines.push(
      ...report.issues.map(
        ({ kind, location, message }) =>
          `- [${kind}] ${location}: ${message}`,
      ),
    )
  }
  return lines.join('\n')
}
