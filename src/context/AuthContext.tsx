import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient'

type AuthStatus = 'loading' | 'authenticated' | 'guest' | 'signedOut'

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  isGuest: boolean
  /** A stable id for the current identity: the uid, or "guest". */
  identityId: string | null
  displayName: string | null
  hasBackend: boolean
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<'active' | 'confirm'>
  signIn: (email: string, password: string) => Promise<void>
  continueAsGuest: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const GUEST_FLAG = 'codetracer.guest'

function deriveName(user: User | null): string | null {
  if (!user) return null
  const meta = user.user_metadata as { displayName?: string } | undefined
  if (meta?.displayName) return meta.displayName
  if (user.email) return user.email.split('@')[0]
  return 'Learner'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isGuest, setIsGuest] = useState<boolean>(
    () => localStorage.getItem(GUEST_FLAG) === 'true',
  )
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setInitializing(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setInitializing(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) {
        setIsGuest(false)
        localStorage.removeItem(GUEST_FLAG)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null

    let status: AuthStatus = 'signedOut'
    if (initializing) status = 'loading'
    else if (user) status = 'authenticated'
    else if (isGuest) status = 'guest'

    async function signUp(
      email: string,
      password: string,
      displayName: string,
    ): Promise<'active' | 'confirm'> {
      if (!supabase) throw new Error('Connect Supabase to create an account.')
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { displayName } },
      })
      if (error) throw error
      // If the email already belongs to a user, Supabase returns a user with
      // no identities instead of an error.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error('That email is already registered. Try logging in instead.')
      }
      localStorage.removeItem(GUEST_FLAG)
      setIsGuest(false)
      // A session means the user is logged in immediately (email confirmation
      // is off). No session means a confirmation email was sent.
      return data.session ? 'active' : 'confirm'
    }

    async function signIn(email: string, password: string) {
      if (!supabase) throw new Error('Connect Supabase to log in.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      localStorage.removeItem(GUEST_FLAG)
      setIsGuest(false)
    }

    function continueAsGuest() {
      localStorage.setItem(GUEST_FLAG, 'true')
      setIsGuest(true)
    }

    async function signOut() {
      if (supabase) await supabase.auth.signOut()
      localStorage.removeItem(GUEST_FLAG)
      setIsGuest(false)
      setSession(null)
    }

    return {
      status,
      user,
      isGuest: status === 'guest',
      identityId: user ? user.id : status === 'guest' ? 'guest' : null,
      displayName: deriveName(user) ?? (status === 'guest' ? 'Guest' : null),
      hasBackend: hasSupabaseConfig,
      signUp,
      signIn,
      continueAsGuest,
      signOut,
    }
  }, [session, isGuest, initializing])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
