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
import { levelInfo, levelTitle, type LevelInfo } from '../lib/playerLevel'

type PlayerLevelValue = {
  xp: number
  info: LevelInfo
  title: string
  /** Award XP. Triggers a level-up flash when a threshold is crossed. */
  addXp: (amount: number) => void
  /** The level just reached, for a celebratory toast (auto-clears). */
  recentLevelUp: number | null
  clearLevelUp: () => void
}

const PlayerLevelContext = createContext<PlayerLevelValue | null>(null)

const keyFor = (id: string) => `alphacode.xp.${id}`

function loadXp(id: string): number {
  try {
    const raw = localStorage.getItem(keyFor(id))
    if (!raw) return 0
    const n = JSON.parse(raw)?.xp
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  } catch {
    return 0
  }
}

function saveXp(id: string, xp: number) {
  try {
    localStorage.setItem(keyFor(id), JSON.stringify({ xp }))
  } catch {
    /* ignore */
  }
}

export function PlayerLevelProvider({ children }: { children: ReactNode }) {
  const { identityId } = useAuth()
  const id = identityId ?? 'guest'
  const [xp, setXp] = useState(0)
  const [recentLevelUp, setRecentLevelUp] = useState<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  // Reload the stored XP whenever the identity changes.
  useEffect(() => {
    setXp(loadXp(id))
  }, [id])

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const addXp = useCallback(
    (amount: number) => {
      if (!amount || amount <= 0) return
      setXp((prev) => {
        const next = prev + Math.round(amount)
        const before = levelInfo(prev).level
        const after = levelInfo(next).level
        saveXp(id, next)
        if (after > before) {
          setRecentLevelUp(after)
          if (flashTimer.current) window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => setRecentLevelUp(null), 3600)
        }
        return next
      })
    },
    [id],
  )

  const clearLevelUp = useCallback(() => setRecentLevelUp(null), [])

  const value = useMemo<PlayerLevelValue>(() => {
    const info = levelInfo(xp)
    return { xp, info, title: levelTitle(info.level), addXp, recentLevelUp, clearLevelUp }
  }, [xp, addXp, recentLevelUp, clearLevelUp])

  return <PlayerLevelContext.Provider value={value}>{children}</PlayerLevelContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function usePlayerLevel(): PlayerLevelValue {
  const ctx = useContext(PlayerLevelContext)
  if (!ctx) throw new Error('usePlayerLevel must be used within a PlayerLevelProvider')
  return ctx
}
