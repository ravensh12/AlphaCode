import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { Loader } from './Loader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return <Loader />
  }

  if (status === 'signedOut') {
    return <Navigate to="/auth" replace />
  }

  return <>{children}</>
}
