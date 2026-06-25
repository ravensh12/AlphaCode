import { useEffect, useMemo } from 'react'
import type { World } from '../../content/adventure'
import { codeBotStage } from '../../content/adventure'
import { CodeBot } from './CodeBot'
import './PowerUnlock.css'

const CONFETTI_COLORS = ['#6d4afe', '#14d39a', '#ffd23f', '#2dd4ee', '#ff5a5f', '#ff9e2c']

/**
 * Full-screen celebration shown the first time a world's boss is beaten.
 * `clearedCount` is the number of worlds cleared INCLUDING this one, so CodeBot
 * shows its freshly-evolved stage.
 */
export function PowerUnlock({
  world,
  clearedCount,
  isFinal,
  onClose,
}: {
  world: World
  clearedCount: number
  isFinal: boolean
  onClose: () => void
}) {
  const stageInfo = codeBotStage(clearedCount)
  const PowerIcon = world.power.Icon

  const confetti = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.8 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        size: 8 + Math.random() * 8,
      })),
    [],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="power-unlock" role="dialog" aria-modal="true" aria-label="Power unlocked">
      <div className="power-unlock-confetti" aria-hidden="true">
        {confetti.map((c) => (
          <span
            key={c.id}
            className="power-confetti-piece"
            style={{
              left: `${c.left}%`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              background: c.color,
              width: c.size,
              height: c.size,
              transform: `rotate(${c.rotate}deg)`,
            }}
          />
        ))}
      </div>

      <div className="power-unlock-card card" style={{ ['--world-accent' as string]: world.theme.accent }}>
        <span className="power-unlock-eyebrow">{isFinal ? 'Quest Complete' : 'Boss Defeated'}</span>

        <CodeBot stage={clearedCount} mood="celebrate" size={180} accent={world.theme.accent} />

        <p className="power-unlock-defeat">{world.boss.defeat}</p>

        <div className="power-unlock-power">
          <span className="power-unlock-power-icon" style={{ background: world.theme.accentSoft, color: world.theme.accentInk }}>
            <PowerIcon size={30} />
          </span>
          <div className="power-unlock-power-copy">
            <span className="power-unlock-power-label">New power unlocked</span>
            <strong className="power-unlock-power-name">{world.power.name}</strong>
            <span className="power-unlock-power-desc muted">{world.power.description}</span>
          </div>
        </div>

        <div className="power-unlock-stage">
          <span className="power-unlock-stage-title">{stageInfo.title}</span>
          <span className="power-unlock-stage-caption muted">{stageInfo.caption}</span>
        </div>

        <button className="btn lg full power-unlock-btn" onClick={onClose}>
          {isFinal ? 'Celebrate!' : 'Onward to the map'}
        </button>
      </div>
    </div>
  )
}
