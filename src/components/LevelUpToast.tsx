import { usePlayerLevel } from '../context/PlayerLevelContext'
import { levelTitle } from '../lib/playerLevel'
import './LevelUpToast.css'

/**
 * Global celebratory toast that flashes whenever the player crosses an XP
 * threshold. Mounted once near the app root so a level-up earned anywhere
 * (zombie kills in the overworld, fast answers in a lesson) is always seen.
 */
export function LevelUpToast() {
  const { recentLevelUp, clearLevelUp } = usePlayerLevel()
  if (recentLevelUp == null) return null

  return (
    <div className="levelup-toast" role="status" aria-live="polite" onClick={clearLevelUp}>
      <span className="levelup-toast-spark" aria-hidden="true">
        ★
      </span>
      <div className="levelup-toast-body">
        <span className="levelup-toast-tag">Level up!</span>
        <strong className="levelup-toast-level">
          Level {recentLevelUp} · {levelTitle(recentLevelUp)}
        </strong>
      </div>
    </div>
  )
}
