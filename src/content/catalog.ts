import type { LessonSummary } from '../types/lesson'

/**
 * The course path shown on Course Home. Every lesson is procedurally generated,
 * so they're all playable; each unlocks once the previous one is mastered.
 */
export const LESSON_CATALOG: LessonSummary[] = [
  {
    id: 'variables-are-boxes',
    title: 'Variables Are Boxes',
    subtitle: 'Trace how values are stored, used, and replaced.',
    conceptTags: ['variables', 'assignment', 'reassignment'],
    playable: true,
    unlockRequirements: {},
  },
  {
    id: 'predict-the-output',
    title: 'Predict the Output',
    subtitle: 'Run programs in your head and call the result.',
    conceptTags: ['variables', 'arithmetic', 'output'],
    playable: true,
    unlockRequirements: {
      previousLessonId: 'variables-are-boxes',
      minimumMastery: 75,
    },
  },
  {
    id: 'if-statements',
    title: 'If Statements',
    subtitle: 'Follow the branch the computer actually takes.',
    conceptTags: ['variables', 'conditionals'],
    playable: true,
    unlockRequirements: { previousLessonId: 'predict-the-output', minimumMastery: 75 },
  },
  {
    id: 'loops',
    title: 'Loops',
    subtitle: 'Trace a value as it changes round after round.',
    conceptTags: ['variables', 'loops'],
    playable: true,
    unlockRequirements: { previousLessonId: 'if-statements', minimumMastery: 75 },
  },
  {
    id: 'debug-the-code',
    title: 'Debug the Code',
    subtitle: 'Find the line where the program goes wrong.',
    conceptTags: ['variables', 'reassignment', 'debugging'],
    playable: true,
    unlockRequirements: { previousLessonId: 'loops', minimumMastery: 75 },
  },
]

export const FIRST_LESSON_ID = LESSON_CATALOG[0].id
export const MASTERY_UNLOCK_THRESHOLD = 75
