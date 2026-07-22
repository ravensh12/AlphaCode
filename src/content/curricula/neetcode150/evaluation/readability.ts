import { syllable } from 'syllable'
import type { ProblemId } from '../../../../types/curriculum'
import type { ProblemMissionSeed } from '../problemMissionSeed'
import { discoverProblemMissionSeeds } from './seedDiscovery'

export const READABILITY_TARGET_GRADE = {
  minimum: 7,
  maximum: 9,
} as const

export const READABILITY_HARD_GRADE_CAP = 13
export const READABILITY_LONG_SENTENCE_WORD_CAP = 40

export type ReadabilityWaiverRule =
  | 'grade-target-cap'
  | 'grade-hard-cap'
  | 'long-sentence'

export type ReadabilityWaiver = {
  readonly problemId: ProblemId
  readonly rule: ReadabilityWaiverRule
  /** Required for a sentence waiver; omitted for a whole-mission grade waiver. */
  readonly field?: string
  readonly reason: string
}

export function defineReadabilityWaivers<
  const T extends readonly ReadabilityWaiver[],
>(waivers: T): T {
  return waivers
}

/**
 * Waivers are intentionally centralized, narrow, and reviewable. A stale or
 * unexplained waiver fails evaluation instead of silently becoming permanent.
 */
export const NEETCODE_150_READABILITY_WAIVERS =
  defineReadabilityWaivers([])

export type ReadabilityMissionMetric = {
  readonly problemId: ProblemId
  readonly grade: number
  readonly words: number
  readonly sentences: number
  readonly syllables: number
  readonly longestSentenceWords: number
}

export type ReadabilityGradeOffender = ReadabilityMissionMetric & {
  readonly direction: 'below-target' | 'above-target' | 'hard-cap'
}

export type ReadabilitySentenceOffender = {
  readonly problemId: ProblemId
  readonly field: string
  readonly words: number
  readonly sentence: string
}

export type ReadabilityIssue = {
  readonly problemId?: ProblemId
  readonly rule: ReadabilityWaiverRule | 'waiver'
  readonly message: string
}

export type ReadabilityReport = {
  readonly passed: boolean
  readonly targetGrade: typeof READABILITY_TARGET_GRADE
  readonly hardGradeCap: number
  readonly longSentenceWordCap: number
  readonly metrics: readonly ReadabilityMissionMetric[]
  readonly targetOutliers: readonly ReadabilityGradeOffender[]
  readonly hardCapOffenders: readonly ReadabilityGradeOffender[]
  readonly longSentenceOffenders: readonly ReadabilitySentenceOffender[]
  readonly waivedOffenders: readonly (
    | ReadabilityGradeOffender
    | ReadabilitySentenceOffender
  )[]
  readonly issues: readonly ReadabilityIssue[]
}

type ProseFragment = {
  readonly field: string
  readonly text: string
}

function guidanceFragments(
  prefix: string,
  guidance: {
    readonly feedback: {
      readonly correct: string
      readonly incorrect: string
      readonly secondIncorrect?: string
    }
    readonly hints: readonly string[]
  },
): readonly ProseFragment[] {
  return [
    { field: `${prefix}.feedback.correct`, text: guidance.feedback.correct },
    { field: `${prefix}.feedback.incorrect`, text: guidance.feedback.incorrect },
    ...(guidance.feedback.secondIncorrect
      ? [
          {
            field: `${prefix}.feedback.secondIncorrect`,
            text: guidance.feedback.secondIncorrect,
          },
        ]
      : []),
    ...guidance.hints.map((text, index) => ({
      field: `${prefix}.hints[${index}]`,
      text,
    })),
  ]
}

/**
 * Extract only displayed prose. Worked-example code, starter code, accepted
 * answer fragments, complexity notation, and serialized cases are excluded.
 */
export function learnerProse(seed: ProblemMissionSeed): readonly ProseFragment[] {
  return [
    { field: 'mission.title', text: seed.mission.title },
    { field: 'mission.context', text: seed.mission.context },
    { field: 'mission.prompt', text: seed.mission.prompt },
    { field: 'objective', text: seed.objective },
    ...seed.priorKnowledge.map((text, index) => ({
      field: `priorKnowledge[${index}]`,
      text,
    })),
    { field: 'recognitionCue', text: seed.recognitionCue },
    { field: 'misconception', text: seed.misconception },
    {
      field: 'complexity.explanation',
      text: seed.complexity.explanation,
    },
    { field: 'workedExample.prompt', text: seed.workedExample.prompt },
    ...seed.workedExample.walkthrough.map((text, index) => ({
      field: `workedExample.walkthrough[${index}]`,
      text,
    })),
    { field: 'patternCheck.prompt', text: seed.patternCheck.prompt },
    ...seed.patternCheck.options.map(({ label }, index) => ({
      field: `patternCheck.options[${index}]`,
      text: label,
    })),
    ...guidanceFragments('patternCheck', seed.patternCheck),
    { field: 'retrievalCheck.prompt', text: seed.retrievalCheck.prompt },
    ...guidanceFragments('retrievalCheck', seed.retrievalCheck),
    {
      field: 'reconstructionCheck.prompt',
      text: seed.reconstructionCheck.prompt,
    },
    ...guidanceFragments('reconstructionCheck', seed.reconstructionCheck),
    { field: 'pythonChallenge.prompt', text: seed.pythonChallenge.prompt },
    ...guidanceFragments('pythonChallenge', seed.pythonChallenge),
  ].filter(({ text }) => text.trim().length > 0)
}

function wordTokens(value: string): readonly string[] {
  return value.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? []
}

function sentenceTexts(value: string): readonly string[] {
  return value
    .replace(/\s+/gu, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function gradeFor(
  problemId: ProblemId,
  fragments: readonly ProseFragment[],
): ReadabilityMissionMetric {
  const text = fragments.map(({ text: fragment }) => fragment).join(' ')
  const words = wordTokens(text).length
  const sentences = fragments.reduce(
    (total, fragment) =>
      total + Math.max(1, sentenceTexts(fragment.text).length),
    0,
  )
  const syllables = syllable(text)
  const grade =
    words === 0 || sentences === 0
      ? 0
      : 0.39 * (words / sentences) +
        11.8 * (syllables / words) -
        15.59
  const longestSentenceWords = fragments.reduce(
    (longest, fragment) =>
      Math.max(
        longest,
        ...sentenceTexts(fragment.text).map(
          (sentence) => wordTokens(sentence).length,
        ),
      ),
    0,
  )
  return {
    problemId,
    grade: Number(grade.toFixed(2)),
    words,
    sentences,
    syllables,
    longestSentenceWords,
  }
}

function longSentences(
  problemId: ProblemId,
  fragments: readonly ProseFragment[],
): readonly ReadabilitySentenceOffender[] {
  return fragments.flatMap(({ field, text }) =>
    sentenceTexts(text)
      .map((sentence) => ({
        problemId,
        field,
        words: wordTokens(sentence).length,
        sentence,
      }))
      .filter(({ words: count }) => count > READABILITY_LONG_SENTENCE_WORD_CAP),
  )
}

function matchingWaiver(
  waivers: readonly ReadabilityWaiver[],
  problemId: ProblemId,
  rule: ReadabilityWaiverRule,
  field?: string,
): ReadabilityWaiver | undefined {
  return waivers.find(
    (waiver) =>
      waiver.problemId === problemId &&
      waiver.rule === rule &&
      (rule === 'grade-target-cap' ||
        rule === 'grade-hard-cap' ||
        waiver.field === field),
  )
}

export async function evaluateNeetcode150Readability(
  waivers: readonly ReadabilityWaiver[] = NEETCODE_150_READABILITY_WAIVERS,
): Promise<ReadabilityReport> {
  const seeds = await discoverProblemMissionSeeds()
  const metrics: ReadabilityMissionMetric[] = []
  const targetOutliers: ReadabilityGradeOffender[] = []
  const hardCapOffenders: ReadabilityGradeOffender[] = []
  const sentenceOffenders: ReadabilitySentenceOffender[] = []
  const waivedOffenders: (
    | ReadabilityGradeOffender
    | ReadabilitySentenceOffender
  )[] = []
  const issues: ReadabilityIssue[] = []
  const usedWaivers = new Set<ReadabilityWaiver>()
  const problemIds = new Set(seeds.map(({ problemId }) => problemId))

  for (const { problemId, seed } of seeds) {
    const fragments = learnerProse(seed)
    const metric = gradeFor(problemId, fragments)
    metrics.push(metric)
    // Copy below grade 7 is still accessible to the target audience. Report
    // only material above the grade 7-9 target as an authoring outlier.
    if (metric.grade > READABILITY_TARGET_GRADE.maximum) {
      const offender: ReadabilityGradeOffender = {
        ...metric,
        direction: 'above-target',
      }
      targetOutliers.push(offender)
      const waiver = matchingWaiver(
        waivers,
        problemId,
        'grade-target-cap',
      )
      if (waiver) {
        usedWaivers.add(waiver)
        waivedOffenders.push(offender)
      } else {
        issues.push({
          problemId,
          rule: 'grade-target-cap',
          message: `${problemId} grade ${metric.grade} exceeds target cap ${READABILITY_TARGET_GRADE.maximum}.`,
        })
      }
    }
    if (metric.grade > READABILITY_HARD_GRADE_CAP) {
      const offender: ReadabilityGradeOffender = {
        ...metric,
        direction: 'hard-cap',
      }
      hardCapOffenders.push(offender)
      const waiver = matchingWaiver(
        waivers,
        problemId,
        'grade-hard-cap',
      )
      if (waiver) {
        usedWaivers.add(waiver)
        waivedOffenders.push(offender)
      } else {
        issues.push({
          problemId,
          rule: 'grade-hard-cap',
          message: `${problemId} grade ${metric.grade} exceeds hard cap ${READABILITY_HARD_GRADE_CAP}.`,
        })
      }
    }

    for (const offender of longSentences(problemId, fragments)) {
      sentenceOffenders.push(offender)
      const waiver = matchingWaiver(
        waivers,
        problemId,
        'long-sentence',
        offender.field,
      )
      if (waiver) {
        usedWaivers.add(waiver)
        waivedOffenders.push(offender)
      } else {
        issues.push({
          problemId,
          rule: 'long-sentence',
          message: `${problemId}.${offender.field} has ${offender.words} words; cap is ${READABILITY_LONG_SENTENCE_WORD_CAP}.`,
        })
      }
    }
  }

  for (const waiver of waivers) {
    if (!problemIds.has(waiver.problemId)) {
      issues.push({
        problemId: waiver.problemId,
        rule: 'waiver',
        message: `Readability waiver references unknown problem "${waiver.problemId}".`,
      })
    }
    if (waiver.reason.trim().length < 20) {
      issues.push({
        problemId: waiver.problemId,
        rule: 'waiver',
        message: 'Readability waiver reason must contain at least 20 characters.',
      })
    }
    if (waiver.rule === 'long-sentence' && !waiver.field) {
      issues.push({
        problemId: waiver.problemId,
        rule: 'waiver',
        message: 'Long-sentence waivers must name the exact prose field.',
      })
    }
    if (!usedWaivers.has(waiver)) {
      issues.push({
        problemId: waiver.problemId,
        rule: 'waiver',
        message: `Readability waiver for ${waiver.rule} is stale and no longer suppresses an offender.`,
      })
    }
  }

  return {
    passed: issues.length === 0,
    targetGrade: READABILITY_TARGET_GRADE,
    hardGradeCap: READABILITY_HARD_GRADE_CAP,
    longSentenceWordCap: READABILITY_LONG_SENTENCE_WORD_CAP,
    metrics,
    targetOutliers,
    hardCapOffenders,
    longSentenceOffenders: sentenceOffenders,
    waivedOffenders,
    issues,
  }
}

export function formatReadabilityReport(report: ReadabilityReport): string {
  const lines = [
    `Readability: target grades ${report.targetGrade.minimum}-${report.targetGrade.maximum}; hard cap ${report.hardGradeCap}; sentence cap ${report.longSentenceWordCap} words.`,
    `${report.targetOutliers.length}/${report.metrics.length} missions are above the target band; ${report.hardCapOffenders.length} exceed the hard cap; ${report.longSentenceOffenders.length} long sentences.`,
  ]
  if (report.targetOutliers.length > 0) {
    lines.push(
      'Target-band outliers:',
      ...report.targetOutliers.map(
        ({ problemId, grade, direction }) =>
          `- ${problemId}: grade ${grade} (${direction})`,
      ),
    )
  }
  if (report.longSentenceOffenders.length > 0) {
    lines.push(
      'Long sentences:',
      ...report.longSentenceOffenders.map(
        ({ problemId, field, words: count }) =>
          `- ${problemId}.${field}: ${count} words`,
      ),
    )
  }
  if (report.issues.length > 0) {
    lines.push(
      'Blocking issues:',
      ...report.issues.map(({ rule, message }) => `- [${rule}] ${message}`),
    )
  }
  return lines.join('\n')
}
