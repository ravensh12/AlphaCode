import { FIRST_LESSON_ID } from '../content/catalog'
import type { CourseSection } from './lessonSections'

/** Guests may preview only the first lesson's interactive (learn) section. */
export function canGuestAccessLesson(lessonId: string): boolean {
  return lessonId === FIRST_LESSON_ID
}

export function canGuestAccessSection(
  lessonId: string,
  section: CourseSection,
): boolean {
  return lessonId === FIRST_LESSON_ID && section === 'learn'
}
