import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Loader } from '../components/Loader'

/** Handles the redirect back from Google (or other OAuth providers). */
export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function finish() {
      if (!supabase) {
        navigate('/auth', { replace: true })
        return
      }

      // Supabase puts tokens in the URL hash; exchange them for a session.
      const { error } = await supabase.auth.getSession()
      if (cancelled) return

      if (error) {
        navigate('/auth', { replace: true })
        return
      }

      navigate('/start', { replace: true })
    }

    finish()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return <Loader label="Signing you in" />
}
