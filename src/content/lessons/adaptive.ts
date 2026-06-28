/**
 * Adaptive lessons — reshape a lesson's QUIZ to the individual learner.
 *
 * This is what makes a strong kid and a struggling kid play *different* lessons
 * from the same source content:
 *   - strong on the concept  → quiz is lightened (fewer reps, quick confirmation)
 *   - weak on the concept     → quiz is reinforced (an extra practice rep)
 *
 * Only the quiz section is touched. The teach/learn section is left byte-for-byte
 * identical so learn-completion, resume indices, and unlock math stay stable
 * (those paths generate the lesson WITHOUT a model). Original step ids are never
 * mutated; reinforcement steps get fresh ids, so review-by-missed-id stays sound.
 */

import type { Lesson, LessonStep } from '../../types/lesson'
import type { ConceptBand, LearnerModel } from '../../lib/learnerModel'
import { weakestBand } from '../../lib/learnerModel'
import { isInteractiveType } from './shared'

/** A scored quiz practice item (trace / guided), excluding the final reflection. */
function isQuizPractice(step: LessonStep): boolean {
  return (
    step.section === 'quiz' &&
    isInteractiveType(step.type) &&
    step.type !== 'reflection'
  )
}

function reinforceCopy(step: LessonStep): LessonStep {
  return {
    ...step,
    id: `${step.id}-reinforce`,
    prompt: `One more rep to lock it in — ${step.prompt}`,
  }
}

/**
 * Return a quiz-adapted copy of the lesson for this learner. When no model is
 * supplied (or there's no signal yet) the lesson is returned unchanged.
 */
export function adaptLessonForLearner(
  lesson: Lesson,
  model: LearnerModel | undefined,
): Lesson {
  if (!model) return lesson

  const band: ConceptBand = weakestBand(model, lesson.conceptTags)
  // Neutral / developing learners get the standard, hand-authored quiz.
  if (band === 'developing') return lesson

  const practiceIndices = lesson.steps
    .map((s, i) => (isQuizPractice(s) ? i : -1))
    .filter((i) => i >= 0)

  // Need at least two practice items before trimming is meaningful.
  if (band === 'mastered' && practiceIndices.length >= 2) {
    // Keep only the first practice item; drop the rest. Reflection + intro stay.
    const dropAfterFirst = new Set(practiceIndices.slice(1))
    return {
      ...lesson,
      adapted: 'lightened',
      steps: lesson.steps.filter((_, i) => !dropAfterFirst.has(i)),
    }
  }

  if (band === 'solid' && practiceIndices.length >= 3) {
    // Lightly trim: drop the last practice item only.
    const dropLast = new Set([practiceIndices[practiceIndices.length - 1]])
    return {
      ...lesson,
      adapted: 'lightened',
      steps: lesson.steps.filter((_, i) => !dropLast.has(i)),
    }
  }

  if (band === 'weak' && practiceIndices.length >= 1) {
    // Reinforce: insert an extra rep of the first practice item right after it.
    const firstIdx = practiceIndices[0]
    const steps: LessonStep[] = []
    lesson.steps.forEach((s, i) => {
      steps.push(s)
      if (i === firstIdx) steps.push(reinforceCopy(s))
    })
    return { ...lesson, adapted: 'reinforced', steps }
  }

  return lesson
}
