import { Navigate } from 'react-router-dom'
import { useProgress } from '../context/ProgressContext'
import { Loader } from '../components/Loader'

/**
 * "Start learning" drops the learner onto CodeBot's Pattern Quest map, where the
 * adventure (and their saved progress) lives.
 */
export function StartRedirect() {
  const { ready } = useProgress()

  if (!ready) {
    return <Loader label="Waking up CodeBot" />
  }

  return <Navigate to="/quest" replace />
}
