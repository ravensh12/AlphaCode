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
import type { DemoGuaranteeSimulation } from '../types/demoGuarantee'
import { mergeDemoGuaranteeSimulations } from '../lib/demoGuarantee'
import { CloudDemoGuaranteeAdapter } from '../lib/cloudDemoGuarantee'
import {
  LocalDemoGuaranteeStore,
  localDemoGuaranteeStore,
} from '../lib/localDemoGuarantee'
import { useAuth } from './AuthContext'

type DemoGuaranteeCloudMode = 'guest-local' | 'account-local' | 'cloud'

type DemoGuaranteeContextValue = {
  readonly ready: boolean
  readonly saving: boolean
  readonly simulation: DemoGuaranteeSimulation | null
  readonly cloudMode: DemoGuaranteeCloudMode
  readonly error: string | null
  readonly saveSimulation: (
    simulation: DemoGuaranteeSimulation,
  ) => Promise<DemoGuaranteeSimulation>
  readonly clearError: () => void
}

const DemoGuaranteeContext =
  createContext<DemoGuaranteeContextValue | null>(null)

const defaultCloudAdapter = new CloudDemoGuaranteeAdapter()

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'The demo simulation could not be saved.'

const cloudModeForUnavailable = (
  isGuest: boolean,
): DemoGuaranteeCloudMode => (isGuest ? 'guest-local' : 'account-local')

export function DemoGuaranteeProvider({
  children,
  localStore = localDemoGuaranteeStore,
  cloudAdapter = defaultCloudAdapter,
}: {
  readonly children: ReactNode
  readonly localStore?: LocalDemoGuaranteeStore
  readonly cloudAdapter?: CloudDemoGuaranteeAdapter
}) {
  const { status, user, identityId, isGuest, hasBackend } = useAuth()
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [simulation, setSimulation] =
    useState<DemoGuaranteeSimulation | null>(null)
  const [cloudMode, setCloudMode] =
    useState<DemoGuaranteeCloudMode>('account-local')
  const [error, setError] = useState<string | null>(null)
  const identityRef = useRef(identityId)
  identityRef.current = identityId

  const authenticatedCloud =
    status === 'authenticated' &&
    !isGuest &&
    hasBackend &&
    !!user &&
    user.id === identityId

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(null)
    setSimulation(null)

    async function load(): Promise<void> {
      if (!identityId) {
        if (!cancelled) {
          setCloudMode('account-local')
          setReady(true)
        }
        return
      }

      let local: DemoGuaranteeSimulation | null
      try {
        local = localStore.load(identityId)
      } catch (loadError) {
        if (!cancelled && identityRef.current === identityId) {
          setCloudMode(cloudModeForUnavailable(isGuest))
          setError(errorMessage(loadError))
          setReady(true)
        }
        return
      }

      let next = local
      let nextCloudMode: DemoGuaranteeCloudMode = isGuest
        ? 'guest-local'
        : 'account-local'

      if (authenticatedCloud && user) {
        try {
          const cloud = await cloudAdapter.load(user.id)
          if (cloud.status === 'ok') {
            nextCloudMode = 'cloud'
            if (cloud.simulation) {
              next = next
                ? mergeDemoGuaranteeSimulations(next, cloud.simulation)
                : cloud.simulation
              next = localStore.save(identityId, next)
            }
            if (local && next) {
              const saved = await cloudAdapter.save(user.id, next)
              if (saved.status === 'ok') {
                next = localStore.save(identityId, saved.simulation)
              } else {
                nextCloudMode = 'account-local'
              }
            }
          } else {
            nextCloudMode = cloudModeForUnavailable(false)
          }
        } catch (cloudError) {
          nextCloudMode = 'account-local'
          if (!cancelled && identityRef.current === identityId) {
            setError(
              `Cloud demo sync is unavailable; the local simulation remains intact. ${errorMessage(
                cloudError,
              )}`,
            )
          }
        }
      }

      if (!cancelled && identityRef.current === identityId) {
        setSimulation(next)
        setCloudMode(nextCloudMode)
        setReady(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [
    authenticatedCloud,
    cloudAdapter,
    identityId,
    isGuest,
    localStore,
    user,
  ])

  const saveSimulation = useCallback(
    async (
      nextSimulation: DemoGuaranteeSimulation,
    ): Promise<DemoGuaranteeSimulation> => {
      if (!identityId) throw new Error('No active identity for demo simulation')
      setSaving(true)
      setError(null)
      try {
        let saved = localStore.save(identityId, nextSimulation)
        if (identityRef.current === identityId) setSimulation(saved)

        if (authenticatedCloud && user) {
          try {
            const cloud = await cloudAdapter.save(user.id, saved)
            if (cloud.status === 'ok') {
              saved = localStore.save(identityId, cloud.simulation)
              if (identityRef.current === identityId) {
                setSimulation(saved)
                setCloudMode('cloud')
              }
            } else if (identityRef.current === identityId) {
              setCloudMode('account-local')
            }
          } catch (cloudError) {
            if (identityRef.current === identityId) {
              setCloudMode('account-local')
              setError(
                `Cloud demo sync is unavailable; the local simulation remains intact. ${errorMessage(
                  cloudError,
                )}`,
              )
            }
          }
        } else if (identityRef.current === identityId) {
          setCloudMode(isGuest ? 'guest-local' : 'account-local')
        }
        return saved
      } catch (saveError) {
        if (identityRef.current === identityId) {
          setError(errorMessage(saveError))
        }
        throw saveError
      } finally {
        if (identityRef.current === identityId) setSaving(false)
      }
    },
    [
      authenticatedCloud,
      cloudAdapter,
      identityId,
      isGuest,
      localStore,
      user,
    ],
  )

  const value = useMemo<DemoGuaranteeContextValue>(
    () => ({
      ready,
      saving,
      simulation,
      cloudMode,
      error,
      saveSimulation,
      clearError: () => setError(null),
    }),
    [cloudMode, error, ready, saveSimulation, saving, simulation],
  )

  return (
    <DemoGuaranteeContext.Provider value={value}>
      {children}
    </DemoGuaranteeContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useDemoGuarantee(): DemoGuaranteeContextValue {
  const context = useContext(DemoGuaranteeContext)
  if (!context) {
    throw new Error(
      'useDemoGuarantee must be used within a DemoGuaranteeProvider',
    )
  }
  return context
}
