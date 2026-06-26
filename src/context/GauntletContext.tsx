import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import {
  applyOutcome,
  emptyGauntletState,
  loadGauntlet,
  markBossBeaten,
  recordExamCompletion,
  saveGauntlet,
  type GauntletState,
} from '../lib/gauntletProgress'
import type { QuestionOutcome } from '../types/finalGauntlet'

type GauntletValue = {
  state: GauntletState
  /** Fold one answered question into the spaced-repetition schedule + persist. */
  recordOutcome: (outcome: QuestionOutcome) => void
  /** Mark a trial run complete (mastery learning gate cleared) + persist. */
  completeExam: (firstTryPercent: number) => void
  /** Mark the final boss defeated + persist. */
  beatFinalBoss: () => void
}

const GauntletContext = createContext<GauntletValue | null>(null)

export function GauntletProvider({ children }: { children: ReactNode }) {
  const { identityId } = useAuth()
  const id = identityId ?? 'guest'
  const [state, setState] = useState<GauntletState>(emptyGauntletState)

  useEffect(() => {
    setState(loadGauntlet(id))
  }, [id])

  const recordOutcome = useCallback(
    (outcome: QuestionOutcome) => {
      setState((prev) => {
        const next = applyOutcome(prev, outcome)
        saveGauntlet(id, next)
        return next
      })
    },
    [id],
  )

  const completeExam = useCallback(
    (firstTryPercent: number) => {
      setState((prev) => {
        const next = recordExamCompletion(prev, firstTryPercent)
        saveGauntlet(id, next)
        return next
      })
    },
    [id],
  )

  const beatFinalBoss = useCallback(() => {
    setState((prev) => {
      const next = markBossBeaten(prev)
      saveGauntlet(id, next)
      return next
    })
  }, [id])

  const value = useMemo<GauntletValue>(
    () => ({ state, recordOutcome, completeExam, beatFinalBoss }),
    [state, recordOutcome, completeExam, beatFinalBoss],
  )

  return <GauntletContext.Provider value={value}>{children}</GauntletContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useGauntlet(): GauntletValue {
  const ctx = useContext(GauntletContext)
  if (!ctx) throw new Error('useGauntlet must be used within a GauntletProvider')
  return ctx
}
