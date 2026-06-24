import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { FIRST_LESSON_ID } from '../content/catalog'
import { generateLesson } from '../content/lessons'
import { isLearnComplete } from '../lib/lessonSections'
import { Loader } from '../components/Loader'

/**
 * "Start learning" drops the learner into their active section: unfinished
 * learn, unfinished quiz, or the first lesson.
 */
export function StartRedirect() {
  const { ready, activeLessonId, lessons } = useProgress()
  const { isGuest } = useAuth()

  if (!ready) {
    return <Loader label="Finding your level" />
  }

  if (isGuest) {
    return <Navigate to={`/lesson/${FIRST_LESSON_ID}/learn`} replace />
  }

  const target = activeLessonId ?? FIRST_LESSON_ID
  const progress = lessons[target]
  const lesson = generateLesson(target)!

  if (!isLearnComplete(progress, lesson)) {
    return <Navigate to={`/lesson/${target}/learn`} replace />
  }
  if (progress?.status !== 'completed') {
    return <Navigate to={`/lesson/${target}/quiz`} replace />
  }
  return <Navigate to={`/lesson/${target}/learn`} replace />
}
