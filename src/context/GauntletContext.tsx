import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import {
  applyOutcome,
  emptyGauntletState,
  loadGauntlet,
  markBossBeaten,
  markGauntletCloudSynced,
  mergeGauntletStates,
  recordExamCompletion,
  saveGauntlet,
  type GauntletState,
} from '../lib/gauntletProgress'
import {
  loadGauntletProgressCloud,
  saveGauntletProgressCloud,
} from '../lib/cloudProgress'
import type { QuestionOutcome } from '../types/finalGauntlet'

type GauntletValue = {
  ready: boolean
  state: GauntletState
  /** Legacy warmup support: fold one answer into the old concept schedule. */
  recordOutcome: (outcomeId: string, outcome: QuestionOutcome) => Promise<void>
  /** Record one certification attempt and its explicit requirements gate. */
  completeExam: (
    attemptId: string,
    firstTryPercent: number,
    requirementsPassed: boolean,
  ) => Promise<void>
  /** Mark the final boss defeated + persist. */
  beatFinalBoss: (defeatId: string) => Promise<void>
}

const GauntletContext = createContext<GauntletValue | null>(null)

export function GauntletProvider({ children }: { children: ReactNode }) {
  const { identityId, status, user, hasBackend } = useAuth()
  const id = identityId ?? 'guest'
  const [state, setState] = useState<GauntletState>(emptyGauntletState)
  const [ready, setReady] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const flushRef = useRef<Promise<void> | null>(null)
  const wantsCloud = status === 'authenticated' && hasBackend && !!user

  useEffect(() => {
    let cancelled = false
    setReady(false)
    async function hydrate() {
      if (!identityId) {
        if (!cancelled) setState(emptyGauntletState())
        return
      }
      const local = loadGauntlet(id)
      let hydrated = local
      if (wantsCloud && user) {
        try {
          const cloud = await loadGauntletProgressCloud(user.id)
          if (cloud.status === 'ok') {
            hydrated = mergeGauntletStates(local, cloud.state)
          }
        } catch (error) {
          console.warn('[gauntlet] cloud load failed', error)
        }
      }
      if (cancelled) return
      hydrated = {
        ...hydrated,
        pendingCloudSync: wantsCloud || hydrated.pendingCloudSync,
      }
      if (!saveGauntlet(id, hydrated)) {
        console.warn('[gauntlet] local hydration write failed')
      }
      stateRef.current = hydrated
      setState(hydrated)
      setReady(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [id, identityId, user, wantsCloud])

  const flushCloud = useCallback(async (): Promise<void> => {
    if (!wantsCloud || !ready) return
    if (flushRef.current) return flushRef.current
    const operation = (async () => {
      for (let pass = 0; pass < 8; pass += 1) {
        const snapshot = stateRef.current
        if (!snapshot.pendingCloudSync) return
        const result = await saveGauntletProgressCloud(snapshot)
        if (result.status !== 'ok') return
        if (stateRef.current.revision === snapshot.revision) {
          const synced = markGauntletCloudSynced(stateRef.current)
          if (!saveGauntlet(id, synced)) {
            throw new Error('Unable to persist gauntlet cloud acknowledgement')
          }
          stateRef.current = synced
          setState(synced)
          return
        }
      }
      throw new Error('Gauntlet cloud queue did not settle')
    })().finally(() => {
      flushRef.current = null
    })
    flushRef.current = operation
    return operation
  }, [id, ready, wantsCloud])

  useEffect(() => {
    if (!ready || !wantsCloud) return
    const retry = () =>
      void flushCloud().catch((error) =>
        console.warn('[gauntlet] cloud write failed', error),
      )
    const visible = () => {
      if (document.visibilityState === 'visible') retry()
    }
    retry()
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [flushCloud, ready, wantsCloud])

  const persist = useCallback(
    async (nextValue: GauntletState): Promise<void> => {
      const next = { ...nextValue, pendingCloudSync: wantsCloud }
      if (!saveGauntlet(id, next)) {
        throw new Error('Unable to save gauntlet progress locally')
      }
      stateRef.current = next
      setState(next)
      if (wantsCloud) {
        void flushCloud().catch((error) =>
          console.warn('[gauntlet] cloud write failed', error),
        )
      }
    },
    [flushCloud, id, wantsCloud],
  )

  const recordOutcome = useCallback(
    async (outcomeId: string, outcome: QuestionOutcome) => {
      if (!ready) throw new Error('Gauntlet progress is still loading')
      await persist(
        applyOutcome(stateRef.current, outcome, Date.now(), outcomeId),
      )
    },
    [persist, ready],
  )

  const completeExam = useCallback(
    async (
      attemptId: string,
      firstTryPercent: number,
      requirementsPassed: boolean,
    ) => {
      if (!ready) throw new Error('Gauntlet progress is still loading')
      await persist(
        recordExamCompletion(
          stateRef.current,
          firstTryPercent,
          requirementsPassed,
          Date.now(),
          attemptId,
        ),
      )
    },
    [persist, ready],
  )

  const beatFinalBoss = useCallback(
    async (defeatId: string) => {
      if (!ready) throw new Error('Gauntlet progress is still loading')
      await persist(
        markBossBeaten(stateRef.current, Date.now(), defeatId),
      )
    },
    [persist, ready],
  )

  const value = useMemo<GauntletValue>(
    () => ({ ready, state, recordOutcome, completeExam, beatFinalBoss }),
    [ready, state, recordOutcome, completeExam, beatFinalBoss],
  )

  return <GauntletContext.Provider value={value}>{children}</GauntletContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useGauntlet(): GauntletValue {
  const ctx = useContext(GauntletContext)
  if (!ctx) throw new Error('useGauntlet must be used within a GauntletProvider')
  return ctx
}
