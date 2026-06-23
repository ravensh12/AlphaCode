import { Navigate } from 'react-router-dom'
import { useProgress } from '../context/ProgressContext'
import { FIRST_LESSON_ID } from '../content/catalog'
import { Loader } from '../components/Loader'

/**
 * "Start learning" always drops the learner into a level: their active
 * (unfinished) lesson, or the first lesson for review if everything is done.
 * The course page stays reachable on demand via the Course button.
 */
export function StartRedirect() {
  const { ready, activeLessonId } = useProgress()

  if (!ready) {
    return <Loader label="Finding your level" />
  }

  const target = activeLessonId ?? FIRST_LESSON_ID
  return <Navigate to={`/lesson/${target}`} replace />
}
