import type { LessonStep } from '../../types/lesson'
import { isInteractiveType } from '../../content/lessons/shared'

export function SectionTracker({
  steps,
  stepIndex,
  completedStepIds,
}: {
  steps: LessonStep[]
  stepIndex: number
  completedStepIds: string[]
}) {
  const interactive = steps.filter((s) => isInteractiveType(s.type))
  const teachSteps = interactive.filter((s) => s.section === 'teach')
  const quizSteps = interactive.filter((s) => s.section === 'quiz')
  const current = steps[stepIndex]
  const inQuiz = current?.section === 'quiz'

  function segState(step: LessonStep, globalIndex: number) {
    if (completedStepIds.includes(step.id)) return 'done'
    if (globalIndex === stepIndex) return 'now'
    return 'todo'
  }

  return (
    <div className="section-tracker" aria-label="Lesson progress">
      <div className="section-tracker-row">
        <span className={`section-label ${!inQuiz ? 'active' : ''}`}>Learn</span>
        <div className="levels levels-teach">
          {teachSteps.map((s) => {
            const i = steps.indexOf(s)
            return (
              <span
                key={s.id}
                className={`level-seg ${segState(s, i)}`}
                title={s.phaseLabel}
              />
            )
          })}
        </div>
      </div>
      <div className="section-tracker-row">
        <span className={`section-label ${inQuiz ? 'active' : ''}`}>Quiz</span>
        <div className="levels levels-quiz">
          {quizSteps.map((s) => {
            const i = steps.indexOf(s)
            return (
              <span
                key={s.id}
                className={`level-seg ${segState(s, i)}`}
                title={s.phaseLabel}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
