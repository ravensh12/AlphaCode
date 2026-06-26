import { Navigate } from 'react-router-dom'
import { useProgress } from '../context/ProgressContext'
import { Loader } from '../components/Loader'

/**
 * Every launch into the game runs through the cinematic intro + placement quiz.
 * The quiz then drops the player at the world it recommends, so the intro always
 * plays (on every rerun / refresh of the start flow) regardless of past progress.
 */
export function StartRedirect() {
  const { ready } = useProgress()

  if (!ready) {
    return <Loader label="Waking up CodeBot" night />
  }

  return <Navigate to="/intro" replace />
}
