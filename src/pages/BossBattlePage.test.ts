import { describe, expect, it } from 'vitest'
import source from './BossBattlePage.tsx?raw'

describe('BossBattlePage realm quiz wiring', () => {
  it('runs both quiz LessonRunners (regular realms and VEX) in exam mode', () => {
    const runners = source
      .split('<LessonRunner')
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf('/>')))
    expect(runners).toHaveLength(2)
    for (const runner of runners) {
      expect(runner).toContain('examMode')
      expect(runner).toContain('section="quiz"')
      expect(runner).toContain('onQuizComplete={handleQuizComplete}')
    }
  })

  it('keeps the end-of-quiz gate on the recorded assessment outcome', () => {
    expect(source).toContain('realmAssessmentOutcome(result, assessment)')
    expect(source).toContain('recordRealmQuizAttempt')
    expect(source).toContain("setPhase('result')")
  })
})
