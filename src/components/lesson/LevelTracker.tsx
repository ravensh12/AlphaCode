export type ProgressSegmentState =
  | 'todo'
  | 'now'
  | 'correct'
  | 'wrong'
  | 'answered'

export function LevelTracker({
  segments,
  current,
  total,
}: {
  /** Per-segment state — preferred when tracking correct vs wrong. */
  segments?: ProgressSegmentState[]
  /** Fallback when segments not provided. */
  current?: number
  total: number
}) {
  const states: ProgressSegmentState[] =
    segments ??
    Array.from({ length: total }, (_, i) => {
      const c = current ?? 0
      if (i < c) return 'correct'
      if (i === c) return 'now'
      return 'todo'
    })

  const correct = states.filter((s) => s === 'correct').length
  const wrong = states.filter((s) => s === 'wrong').length
  // Exam mode: outcomes stay hidden, segments only report "answered".
  const answered = states.filter((s) => s === 'answered').length
  const nowIdx = states.findIndex((s) => s === 'now')
  const levelNow = nowIdx >= 0 ? nowIdx + 1 : correct + wrong + answered + 1

  const ariaParts = [`Step ${Math.min(levelNow, total)} of ${total}`]
  if (correct + wrong > 0) {
    ariaParts.push(`${correct} correct`, `${wrong} missed`)
  }
  if (answered > 0) {
    ariaParts.push(`${answered} answered`)
  }

  return (
    <div
      className="levels"
      aria-label={ariaParts.join(', ')}
      title={ariaParts.join(' · ')}
    >
      {states.map((state, i) => (
        <span key={i} className={`level-seg ${state}`} />
      ))}
    </div>
  )
}
