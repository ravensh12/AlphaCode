export function LevelTracker({
  current,
  total,
}: {
  current: number
  total: number
}) {
  const levelNow = Math.min(current + 1, total)
  return (
    <div
      className="levels"
      aria-label={`Level ${levelNow} of ${total}`}
      title={`Level ${levelNow} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo'
        return <span key={i} className={`level-seg ${state}`} />
      })}
    </div>
  )
}
