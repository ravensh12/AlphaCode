import type { ProblemId } from '../../../types/curriculum'
import type { ProblemLessonLoader } from './problemRegistry'
import { REALM_1_PROBLEM_LESSON_LOADERS } from './problems/realm1'
import { REALM_2_PROBLEM_LESSON_LOADERS } from './problems/realm2'
import { REALM_3_PROBLEM_LESSON_LOADERS } from './problems/realm3'
import { REALM_4_PROBLEM_LESSON_LOADERS } from './problems/realm4'
import { REALM_5_PROBLEM_LESSON_LOADERS } from './problems/realm5'
import { REALM_6_PROBLEM_LESSON_LOADERS } from './problems/realm6'

/**
 * Generated-style lazy import table. Add one manifest-keyed entry per authored
 * mission; importing this map does not evaluate any problem content module.
 */
export const NEETCODE_150_PROBLEM_LESSON_LOADERS = {
  ...REALM_1_PROBLEM_LESSON_LOADERS,
  ...REALM_2_PROBLEM_LESSON_LOADERS,
  ...REALM_3_PROBLEM_LESSON_LOADERS,
  ...REALM_4_PROBLEM_LESSON_LOADERS,
  ...REALM_5_PROBLEM_LESSON_LOADERS,
  ...REALM_6_PROBLEM_LESSON_LOADERS,
} satisfies Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>
