import type { NeetCodeReadiness } from '../../content/neetcodeReadiness'

export function NeetCodeReadinessPanel({
  readiness,
  compact,
}: {
  readiness: NeetCodeReadiness
  compact?: boolean
}) {
  return (
    <section
      className={`neetcode-ready ${compact ? 'compact' : ''}`}
      aria-label="NeetCode readiness"
    >
      <p className="neetcode-ready-eyebrow">You&apos;re now ready for…</p>
      <p className="neetcode-ready-lead">
        Beginner NeetCode-style problems that use{' '}
        <strong>{readiness.patternLearned.toLowerCase()}</strong>:
      </p>
      <ul className="neetcode-ready-list">
        {readiness.readyFor.map((name) => (
          <li key={name} className="neetcode-ready-chip">
            {name}
          </li>
        ))}
      </ul>
      <p className="neetcode-ready-note muted">
        AlphaCode teaches the pattern — NeetCode 150 gives you the reps. Try these
        when you&apos;re ready for real interview-style practice.
      </p>
    </section>
  )
}
