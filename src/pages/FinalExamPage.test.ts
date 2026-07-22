import { describe, expect, it } from 'vitest'
import source from './FinalExamPage.tsx?raw'

describe('FinalExamPage certification wiring', () => {
  it('uses the lazy certification builder and existing LessonRunner', () => {
    expect(source).toMatch(
      /import\(\s*['"]\.\.\/content\/curricula\/neetcode150\/certificationAssessment['"]\s*\)/u,
    )
    expect(source).toContain('buildCertificationAssessment()')
    expect(source).toContain('<LessonRunner')
    expect(source).toContain('lessonOverride={assessment.lesson}')
  })

  it('runs the certification trial in deferred-feedback exam mode', () => {
    const runner = source.slice(source.indexOf('<LessonRunner'))
    expect(runner.slice(0, runner.indexOf('/>'))).toContain('examMode')
  })

  it('supports a fresh retry and records explicit certification requirements', () => {
    expect(source).toContain('setAttempt((value) => value + 1)')
    expect(source).toContain('certificationAttemptId')
    expect(source).toContain('await completeExam(')
    expect(source).toContain('nextOutcome.requirementsPassed')
    expect(source).toContain('onAttempt={logAttempt}')
  })

  it('does not import or write through the old six-concept exam path', () => {
    expect(source).not.toContain('FINAL_EXAM')
    expect(source).not.toContain('content/finalExam')
    expect(source).not.toContain('recordOutcome')
  })
})
