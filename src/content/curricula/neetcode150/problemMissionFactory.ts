import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentEvidenceKind,
  type AssessmentId,
  type AssessmentOptionId,
  type PythonCaseId,
  type PythonCaseV1,
} from '../../../types/assessment'
import { seededShuffle } from '../../../lib/seededRandom'
import type {
  NonEmptyReadonlyArray,
  ProblemSummary,
  SkillSpec,
  SourceId,
  SourceRecord,
} from '../../../types/curriculum'
import type { DiagramSpec } from '../../../types/diagram'
import {
  PROBLEM_LESSON_SCHEMA_VERSION,
  type ProblemLessonAssessmentStepV1,
  type ProblemLessonSpecV1,
  type ProblemLessonVariantId,
} from '../../../types/problemLesson'
import {
  ProblemLessonValidationError,
  validateProblemLesson,
} from '../problemLessonCompiler'
import { NEETCODE_150_MANIFEST } from './manifest'
import type {
  ProblemMissionGuidanceSeed,
  ProblemMissionSeed,
  ProblemMissionVisualSeed,
} from './problemMissionSeed'

export const PROBLEM_MISSION_STAGE_ORDER = [
  'explanation',
  'worked-example',
  'quiz-intro',
  'pattern-check',
  'typed-retrieval',
  'algorithm-reconstruction',
  'python-transfer',
] as const

export const PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT = {
  'pattern-check': 'acquisition',
  'typed-retrieval': 'delayed-retrieval',
  // Legacy v1 projection. Use PROBLEM_MISSION_EVIDENCE_KINDS_BY_ASSESSMENT
  // when deciding academy completion.
  'algorithm-reconstruction': 'independent-transfer',
  'python-transfer': 'code-tests',
} as const satisfies Record<string, AssessmentEvidenceKind>

/**
 * Authoritative evidence contract for mission completion.
 *
 * Reconstruction is an immediate acquisition check. A passing Python event is
 * the single durable event that proves both independent transfer and code
 * tests; consumers should read assessmentEvidenceKinds() rather than matching
 * only the legacy evidenceKind field.
 */
export const PROBLEM_MISSION_EVIDENCE_KINDS_BY_ASSESSMENT = {
  'pattern-check': ['acquisition'],
  'typed-retrieval': ['delayed-retrieval'],
  'algorithm-reconstruction': ['acquisition'],
  'python-transfer': ['independent-transfer', 'code-tests'],
} as const satisfies Record<
  string,
  readonly [AssessmentEvidenceKind, ...AssessmentEvidenceKind[]]
>

export const PROBLEM_MISSION_PYTHON_CASE_CLASSES = [
  'visible-example',
  'hidden-boundary',
  'hidden-adversarial',
] as const

export type ProblemMissionManifestContext = {
  problem: ProblemSummary
  skills: NonEmptyReadonlyArray<SkillSpec>
  provenanceSources: NonEmptyReadonlyArray<SourceRecord>
}

const STABLE_SEED_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

function requireManifestSkill(skillId: string): SkillSpec {
  const skill = NEETCODE_150_MANIFEST.skills.find(({ id }) => id === skillId)
  if (!skill) {
    throw new Error(`Manifest skill "${skillId}" could not be resolved`)
  }
  return skill
}

function requireManifestSource(sourceId: SourceId): SourceRecord {
  const source = NEETCODE_150_MANIFEST.sources.find(({ id }) => id === sourceId)
  if (!source) {
    throw new Error(`Manifest source "${sourceId}" could not be resolved`)
  }
  return source
}

/**
 * Resolves all curriculum-owned mission data from the exact manifest entry.
 * This also makes missing or unsafe provenance fail before content is built.
 */
export function resolveProblemMissionManifestContext(
  slug: string,
): ProblemMissionManifestContext {
  const problem = NEETCODE_150_MANIFEST.problems.find(
    ({ leetcodeSlug }) => leetcodeSlug === slug,
  )
  if (!problem) {
    throw new Error(`Problem slug "${slug}" is not in the NeetCode 150 manifest`)
  }
  if (
    problem.provenance.promptsAndStatements !== 'original' ||
    problem.provenance.copiedSourceMaterial !== false
  ) {
    throw new Error(`Problem "${problem.id}" does not permit original mission copy`)
  }

  const [firstSkillId, ...remainingSkillIds] = problem.skillIds
  const skills: [SkillSpec, ...SkillSpec[]] = [
    requireManifestSkill(firstSkillId),
    ...remainingSkillIds.map(requireManifestSkill),
  ]
  const provenanceSourceIds: [SourceId, ...SourceId[]] = [
    problem.provenance.primaryReferenceSourceId,
    problem.provenance.curriculumVerificationSourceId,
    ...problem.provenance.pedagogySourceIds,
  ]
  const [firstSourceId, ...remainingSourceIds] = provenanceSourceIds
  const provenanceSources: [SourceRecord, ...SourceRecord[]] = [
    requireManifestSource(firstSourceId),
    ...remainingSourceIds.map(requireManifestSource),
  ]

  return { problem, skills, provenanceSources }
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

function assertNonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${path} must not be blank`)
  }
}

function assertStableKeys(
  entries: readonly { id: string }[],
  path: string,
  reserved: readonly string[] = [],
): void {
  const seen = new Set(reserved)
  entries.forEach(({ id }, index) => {
    if (!STABLE_SEED_KEY.test(id)) {
      throw new Error(
        `${path}[${index}].id must be a lowercase kebab-case stable key`,
      )
    }
    if (seen.has(id)) {
      throw new Error(`${path}[${index}].id duplicates "${id}"`)
    }
    seen.add(id)
  })
}

function assertGuidance(
  guidance: ProblemMissionGuidanceSeed,
  path: string,
): void {
  assertNonEmpty(guidance.feedback.correct, `${path}.feedback.correct`)
  assertNonEmpty(guidance.feedback.incorrect, `${path}.feedback.incorrect`)
  if (guidance.feedback.secondIncorrect !== undefined) {
    assertNonEmpty(
      guidance.feedback.secondIncorrect,
      `${path}.feedback.secondIncorrect`,
    )
  }
  guidance.hints.forEach((hint, index) =>
    assertNonEmpty(hint, `${path}.hints[${index}]`),
  )
}

function assertMissionSeed(
  seed: ProblemMissionSeed,
  problem: ProblemSummary,
): void {
  const requiredCopy: readonly [string, string][] = [
    ['mission.title', seed.mission.title],
    ['mission.context', seed.mission.context],
    ['mission.prompt', seed.mission.prompt],
    ['objective', seed.objective],
    ['recognitionCue', seed.recognitionCue],
    ['misconception', seed.misconception],
    ['complexity.time', seed.complexity.time],
    ['complexity.space', seed.complexity.space],
    ['complexity.explanation', seed.complexity.explanation],
    ['workedExample.prompt', seed.workedExample.prompt],
    ['patternCheck.prompt', seed.patternCheck.prompt],
    ['retrievalCheck.prompt', seed.retrievalCheck.prompt],
    ['reconstructionCheck.prompt', seed.reconstructionCheck.prompt],
    ['pythonChallenge.prompt', seed.pythonChallenge.prompt],
  ]
  requiredCopy.forEach(([path, value]) => assertNonEmpty(value, path))

  if (normalized(seed.mission.title) === normalized(problem.title)) {
    throw new Error('mission.title must be original, not the canonical title')
  }
  const promptEntries = requiredCopy.filter(([path]) => path.endsWith('prompt'))
  promptEntries.forEach(([path, prompt]) => {
    if (normalized(prompt) === normalized(problem.title)) {
      throw new Error(`${path} must not repeat the canonical title`)
    }
  })
  if (
    !Number.isSafeInteger(seed.estimatedMinutes) ||
    seed.estimatedMinutes <= 0
  ) {
    throw new Error('estimatedMinutes must be a positive integer')
  }

  seed.priorKnowledge.forEach((item, index) =>
    assertNonEmpty(item, `priorKnowledge[${index}]`),
  )
  assertStableKeys(seed.algorithmSteps, 'algorithmSteps')
  seed.algorithmSteps.forEach((step, index) =>
    assertNonEmpty(step.instruction, `algorithmSteps[${index}].instruction`),
  )
  seed.workedExample.walkthrough.forEach((item, index) =>
    assertNonEmpty(item, `workedExample.walkthrough[${index}]`),
  )

  assertStableKeys(seed.patternCheck.options, 'patternCheck.options')
  seed.patternCheck.options.forEach((option, index) =>
    assertNonEmpty(option.label, `patternCheck.options[${index}].label`),
  )
  if (
    !seed.patternCheck.options.some(
      ({ id }) => id === seed.patternCheck.correctOptionId,
    )
  ) {
    throw new Error('patternCheck.correctOptionId must reference an option')
  }
  seed.retrievalCheck.acceptedAnswers.forEach((answer, index) =>
    assertNonEmpty(answer, `retrievalCheck.acceptedAnswers[${index}]`),
  )
  assertGuidance(seed.patternCheck, 'patternCheck')
  assertGuidance(seed.retrievalCheck, 'retrievalCheck')
  assertGuidance(seed.reconstructionCheck, 'reconstructionCheck')
  assertGuidance(seed.pythonChallenge, 'pythonChallenge')

  if (
    !seed.pythonChallenge.starterCode
      .replace(/\r\n?/gu, '\n')
      .split('\n')
      .includes('def solve(data):')
  ) {
    throw new Error(
      'pythonChallenge.starterCode must declare the exact `def solve(data):` entrypoint',
    )
  }
  assertStableKeys(
    seed.pythonChallenge.cases.additional ?? [],
    'pythonChallenge.cases.additional',
    PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  )
}

function variantId(slug: string): ProblemLessonVariantId {
  return `variant:${slug}:core`
}

function assessmentId(slug: string, stage: string): AssessmentId {
  return `assessment:${slug}:${stage}`
}

function optionId(slug: string, key: string): AssessmentOptionId {
  return `option:${slug}:pattern-check:${key}`
}

function pythonCaseId(slug: string, key: string): PythonCaseId {
  return `case:${slug}:${key}`
}

function visualFields(
  visuals: ProblemMissionVisualSeed | undefined,
): Pick<ProblemMissionVisualSeed, 'diagram' | 'diagramSequence'> {
  return {
    ...(visuals?.diagram === undefined
      ? {}
      : { diagram: visuals.diagram as DiagramSpec }),
    ...(visuals?.diagramSequence === undefined
      ? {}
      : { diagramSequence: [...visuals.diagramSequence] }),
  }
}

function assessmentStep(
  step: ProblemLessonAssessmentStepV1,
): ProblemLessonAssessmentStepV1 {
  return step
}

function reconstructionPrompt(seed: ProblemMissionSeed): string {
  const authored = seed.reconstructionCheck.prompt
  const recitesOrderedList = /:\s*[^.]+(?:,\s*[^,.]+){3,}/u.test(authored)
  const base = recitesOrderedList
    ? `Rebuild “${seed.mission.title}.” Order the shuffled actions by their data dependencies: each action must establish the state needed by the next.`
    : authored
  return `${base} The actions below are scrambled and lettered. Type the letters in the order the algorithm performs them, separated by spaces.`
}

const RECONSTRUCTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

type ReconstructionLayout = {
  /** Lettered actions in their scrambled display order. */
  displayLines: readonly string[]
  /** Letters of the displayed actions in correct execution order. */
  answerLetters: readonly string[]
}

/**
 * Deterministically scrambles the authored algorithm steps and letters them,
 * so the learner types the execution order instead of dragging tiles. The
 * shuffle is baked into the spec (seeded by slug), keeping accepted answers
 * and displayed lines consistent across sessions.
 */
function reconstructionLayout(seed: ProblemMissionSeed): ReconstructionLayout {
  const steps = seed.algorithmSteps
  let displayed = seededShuffle(
    steps,
    'problem-mission-reconstruction',
    seed.slug,
  )
  const identity = displayed.every((step, index) => step === steps[index])
  if (identity && displayed.length > 1) {
    displayed = [...displayed.slice(1), displayed[0]]
  }
  const letterByStepId = new Map(
    displayed.map((step, index) => [step.id, RECONSTRUCTION_LETTERS[index]]),
  )
  return {
    displayLines: displayed.map(
      (step, index) => `${RECONSTRUCTION_LETTERS[index]}. ${step.instruction}`,
    ),
    answerLetters: steps.map((step) => letterByStepId.get(step.id)!),
  }
}

/**
 * Generous set of equivalent typed spellings of one letter sequence. The
 * normalized matcher already folds case and collapses whitespace; these
 * variants additionally accept common separators so a correct order is never
 * rejected over formatting.
 */
function reconstructionAcceptedAnswers(
  letters: readonly string[],
): [string, ...string[]] {
  const separators = [' ', '', ', ', ',', ' - ', '-', ' -> ', ' → ', ' > ']
  const seen = new Set<string>()
  const variants: string[] = []
  for (const separator of separators) {
    const answer = letters.join(separator)
    const key = normalized(answer)
    if (seen.has(key)) continue
    seen.add(key)
    variants.push(answer)
  }
  return variants as [string, ...string[]]
}

function pythonVerificationNotes(seed: ProblemMissionSeed): readonly string[] {
  const notes = [...(seed.pythonChallenge.verificationNotes ?? [])]
  const comparator = seed.pythonChallenge.comparator
  if (comparator?.kind === 'unordered') {
    notes.push(
      'Equivalent valid output orderings are accepted; ordering is not part of correctness.',
    )
  } else if (comparator?.kind === 'semantic') {
    notes.push(
      'The judge validates the returned answer against the input constraints, so any valid canonical answer is accepted.',
    )
  }
  return notes
}

/**
 * Builds and validates the canonical learning-science sequence for one
 * manifest problem. Content authors never supply curriculum IDs or skill IDs.
 */
export function createProblemMission(
  seed: ProblemMissionSeed,
): ProblemLessonSpecV1 {
  const context = resolveProblemMissionManifestContext(seed.slug)
  const { problem, skills } = context
  assertMissionSeed(seed, problem)

  const slug = problem.leetcodeSlug
  const reconstructionPromptText = reconstructionPrompt(seed)
  const verificationNotes = pythonVerificationNotes(seed)
  const patternCheck = assessmentStep({
    id: `step:${slug}:pattern-check`,
    kind: 'assessment',
    prompt: seed.patternCheck.prompt,
    skillIds: problem.skillIds,
    ...visualFields(seed.patternCheck),
    assessment: {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      id: assessmentId(slug, 'pattern-check'),
      kind: 'singleChoice',
      prompt: seed.patternCheck.prompt,
      evidenceKind:
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['pattern-check'],
      skillIds: problem.skillIds,
      options: seed.patternCheck.options.map(({ id, label }) => ({
        id: optionId(slug, id),
        label,
      })),
      correctOptionId: optionId(slug, seed.patternCheck.correctOptionId),
      shuffleOptions: true,
      failurePolicy: { kind: 'retry', maxAttempts: 2 },
    },
    feedback: { ...seed.patternCheck.feedback },
    hints: [...seed.patternCheck.hints],
  })
  const typedRetrieval = assessmentStep({
    id: `step:${slug}:typed-retrieval`,
    kind: 'assessment',
    prompt: seed.retrievalCheck.prompt,
    skillIds: problem.skillIds,
    ...visualFields(seed.retrievalCheck),
    assessment: {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      id: assessmentId(slug, 'typed-retrieval'),
      kind: 'shortAnswer',
      prompt: seed.retrievalCheck.prompt,
      evidenceKind:
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['typed-retrieval'],
      skillIds: problem.skillIds,
      matcher:
        seed.retrievalCheck.matcher ??
        ({
          mode: 'normalized',
          acceptedAnswers: seed.retrievalCheck.acceptedAnswers,
        } as const),
      ...(seed.retrievalCheck.placeholder === undefined
        ? {}
        : { placeholder: seed.retrievalCheck.placeholder }),
      failurePolicy: { kind: 'reveal', maxAttempts: 2 },
    },
    feedback: { ...seed.retrievalCheck.feedback },
    hints: [...seed.retrievalCheck.hints],
  })
  const layout = reconstructionLayout(seed)
  const algorithmReconstruction = assessmentStep({
    id: `step:${slug}:algorithm-reconstruction`,
    kind: 'assessment',
    prompt: reconstructionPromptText,
    skillIds: problem.skillIds,
    ...visualFields(seed.reconstructionCheck),
    assessment: {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      id: assessmentId(slug, 'algorithm-reconstruction'),
      kind: 'predict',
      language: 'python',
      prompt: reconstructionPromptText,
      evidenceKind:
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT[
          'algorithm-reconstruction'
        ],
      evidenceKinds:
        PROBLEM_MISSION_EVIDENCE_KINDS_BY_ASSESSMENT[
          'algorithm-reconstruction'
        ],
      skillIds: problem.skillIds,
      code: [...layout.displayLines],
      matcher: {
        mode: 'normalized',
        acceptedAnswers: reconstructionAcceptedAnswers(layout.answerLetters),
      },
      failurePolicy: { kind: 'retry', maxAttempts: 3 },
    },
    feedback: { ...seed.reconstructionCheck.feedback },
    hints: [...seed.reconstructionCheck.hints],
  })

  const mandatoryCases: readonly PythonCaseV1[] = [
    {
      id: pythonCaseId(slug, 'visible-example'),
      arguments: [seed.pythonChallenge.cases.visibleExample.input],
      expected: seed.pythonChallenge.cases.visibleExample.expected,
      visibility: 'example',
    },
    {
      id: pythonCaseId(slug, 'hidden-boundary'),
      arguments: [seed.pythonChallenge.cases.hiddenBoundary.input],
      expected: seed.pythonChallenge.cases.hiddenBoundary.expected,
      visibility: 'hidden',
    },
    {
      id: pythonCaseId(slug, 'hidden-adversarial'),
      arguments: [seed.pythonChallenge.cases.hiddenAdversarial.input],
      expected: seed.pythonChallenge.cases.hiddenAdversarial.expected,
      visibility: 'hidden',
    },
  ]
  const additionalCases: readonly PythonCaseV1[] = (
    seed.pythonChallenge.cases.additional ?? []
  ).map((testCase) => ({
    id: pythonCaseId(slug, testCase.id),
    arguments: [testCase.input],
    expected: testCase.expected,
    visibility: testCase.visibility,
  }))
  const pythonTransfer = assessmentStep({
    id: `step:${slug}:python-transfer`,
    kind: 'assessment',
    prompt: seed.pythonChallenge.prompt,
    skillIds: problem.skillIds,
    ...visualFields(seed.pythonChallenge),
    assessment: {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      id: assessmentId(slug, 'python-transfer'),
      kind: 'pythonCode',
      prompt: seed.pythonChallenge.prompt,
      evidenceKind:
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['python-transfer'],
      evidenceKinds:
        PROBLEM_MISSION_EVIDENCE_KINDS_BY_ASSESSMENT['python-transfer'],
      skillIds: problem.skillIds,
      starterCode: seed.pythonChallenge.starterCode,
      entrypoint: { kind: 'function', name: 'solve' },
      codecs: {
        arguments: [{ kind: 'json' }],
        result: { kind: 'json' },
      },
      cases: [...mandatoryCases, ...additionalCases],
      comparator: seed.pythonChallenge.comparator ?? { kind: 'deepEqual' },
      ...(seed.pythonChallenge.observation === undefined
        ? {}
        : { observation: seed.pythonChallenge.observation }),
      ...(verificationNotes.length === 0
        ? {}
        : {
            verificationNotes: [...verificationNotes],
          }),
      limits: {
        timeoutMs: 2_000,
        memoryMb: 128,
        maxOutputBytes: 8_192,
        maxSourceBytes: 20_000,
      },
      failurePolicy: { kind: 'retry', maxAttempts: 10 },
    },
    feedback: { ...seed.pythonChallenge.feedback },
    hints: [...seed.pythonChallenge.hints],
  })

  const spec: ProblemLessonSpecV1 = {
    schemaVersion: PROBLEM_LESSON_SCHEMA_VERSION,
    curriculumId: NEETCODE_150_MANIFEST.id,
    manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
    problemId: problem.id,
    problemContentVersion: problem.contentVersion,
    description: `${seed.mission.title} — ${seed.objective}`,
    pattern: skills.map(({ patternLabel }) => patternLabel).join(' + '),
    estimatedMinutes: seed.estimatedMinutes,
    skillIds: problem.skillIds,
    variants: [
      {
        id: variantId(slug),
        explanation: {
          id: `step:${slug}:explanation`,
          kind: 'explanation',
          hook: seed.mission.title,
          prompt: `${seed.mission.context}\n\n${seed.mission.prompt}`,
          skillIds: problem.skillIds,
          ...visualFields(seed.explanationVisuals),
          bullets: [
            `Objective: ${seed.objective}`,
            ...seed.priorKnowledge.map(
              (knowledge) => `Bring forward: ${knowledge}`,
            ),
            `Recognition cue: ${seed.recognitionCue}`,
            ...seed.algorithmSteps.map(
              ({ instruction }, index) => `${index + 1}. ${instruction}`,
            ),
            `Expected complexity: ${seed.complexity.time} time and ${seed.complexity.space} extra space. ${seed.complexity.explanation}`,
          ],
          callout: `Common trap: ${seed.misconception}`,
        },
        workedExample: {
          id: `step:${slug}:worked-example`,
          kind: 'workedExample',
          prompt: seed.workedExample.prompt,
          skillIds: problem.skillIds,
          code: [...seed.workedExample.code],
          ...(seed.workedExample.currentLineIndex === undefined
            ? {}
            : { currentLineIndex: seed.workedExample.currentLineIndex }),
          ...visualFields(seed.workedExample),
          bullets: [...seed.workedExample.walkthrough],
        },
        quizIntro: {
          id: `step:${slug}:quiz-intro`,
          kind: 'quizIntro',
          hook: seed.mission.title,
          prompt:
            'Lock in the pattern: recognize it, type the key rule from memory, type the rebuild order, then solve the full problem in Python.',
          skillIds: problem.skillIds,
        },
        assessments: [
          patternCheck,
          typedRetrieval,
          algorithmReconstruction,
          pythonTransfer,
        ],
      },
    ],
  }

  const validation = validateProblemLesson(spec, NEETCODE_150_MANIFEST)
  if (!validation.valid) {
    throw new ProblemLessonValidationError(validation.issues)
  }
  return spec
}
