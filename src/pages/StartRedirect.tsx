import { Navigate } from 'react-router-dom'
import { useProgress } from '../context/ProgressContext'
import { Loader } from '../components/Loader'

/**
 * Every explicit launch into the game runs through the cinematic intro.
 * Durable progress is hydrated first so the quest can resume from its normal
 * progression path without fabricating a starting checkpoint.
 */
export function StartRedirect() {
  const { ready } = useProgress()

  if (!ready) {
    return <Loader label="Waking up CodeBot" night />
  }

  return <Navigate to="/intro" replace />
}
