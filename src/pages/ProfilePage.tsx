import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import type { ConceptId } from '../types/lesson'
import {
  bandForConcept,
  conceptBand,
  dueConcepts,
  prerequisitesOf,
  weakestConcepts,
  type ConceptBand,
} from '../lib/learnerModel'
import { IconFlame, IconTrophy, IconGauge, IconCompass } from '../components/icons'
import './ProfilePage.css'

const CONCEPTS: { id: ConceptId; label: string }[] = [
  { id: 'variables', label: 'Variables' },
  { id: 'loops', label: 'Loops' },
  { id: 'arrays', label: 'Arrays' },
  { id: 'strings', label: 'Strings' },
  { id: 'hashMaps', label: 'Hash Maps' },
  { id: 'twoPointers', label: 'Two Pointers' },
  { id: 'stacks', label: 'Stacks' },
  { id: 'binarySearch', label: 'Binary Search' },
]

const LABEL: Record<ConceptId, string> = Object.fromEntries(
  CONCEPTS.map((c) => [c.id, c.label]),
) as Record<ConceptId, string>

const BAND_LABEL: Record<ConceptBand, string> = {
  weak: 'Needs work',
  developing: 'Developing',
  solid: 'Solid',
  mastered: 'Mastered',
}

export function ProfilePage() {
  const { displayName, isGuest } = useAuth()
  const { learnerModel, streak, totalBadgeCount, badgesUnlockedCount } = useProgress()
  const { info: playerLevel, title } = usePlayerLevel()

  const hasSignal = Object.values(learnerModel.concepts).some(
    (c) => c && c.seen > 0,
  )

  const due = useMemo(() => dueConcepts(learnerModel), [learnerModel])
  const weakest = useMemo(() => weakestConcepts(learnerModel, 1)[0], [learnerModel])

  // Coach suggestion: if the weakest concept leans on a prerequisite that's also
  // shaky, point there first (smart remediation).
  const coach = useMemo(() => {
    if (!weakest) return null
    const shakyPrereq = prerequisitesOf(weakest).find((p) => {
      const band = bandForConcept(learnerModel, p)
      return band === 'weak' || band === 'developing'
    })
    if (shakyPrereq && shakyPrereq !== weakest) {
      return `${LABEL[weakest]} is shaky — strengthening ${LABEL[shakyPrereq]} first will make it click.`
    }
    return `Focus your next session on ${LABEL[weakest]} — a few clean reps will push it to Solid.`
  }, [weakest, learnerModel])

  return (
    <div className="page">
      <AppHeader />

      <main className="container lp profile-main" id="main-content">
        <section className="profile-hero">
          <div>
            <span className="eyebrow">Coder profile</span>
            <h1 className="profile-name">{isGuest ? 'Guest coder' : displayName}</h1>
            <p className="profile-sub">
              Lv {playerLevel.level} · {title}
            </p>
          </div>
          <div className="profile-stats">
            <div className="profile-stat">
              <IconFlame size={18} />
              <span className="profile-stat-num">{streak.current}</span>
              <span className="profile-stat-label">day streak</span>
            </div>
            <div className="profile-stat">
              <IconGauge size={18} />
              <span className="profile-stat-num">{playerLevel.level}</span>
              <span className="profile-stat-label">level</span>
            </div>
            <div className="profile-stat">
              <IconTrophy size={18} />
              <span className="profile-stat-num">
                {badgesUnlockedCount}
                <small> / {totalBadgeCount || 0}</small>
              </span>
              <span className="profile-stat-label">badges</span>
            </div>
          </div>
        </section>

        {isGuest ? (
          <section className="profile-card profile-empty">
            <h2>Sign in to build your profile</h2>
            <p>
              Guests play in preview mode. Create an account and AlphaCode will track
              your strengths and weaknesses across every concept, then personalize the
              lessons and the game to you.
            </p>
            <Link className="btn" to="/auth">
              Create an account
            </Link>
          </section>
        ) : !hasSignal ? (
          <section className="profile-card profile-empty">
            <h2>Your strengths map is empty… for now</h2>
            <p>
              Play a lesson or fight through Code City and we’ll start charting how
              well you know each concept. The more you play, the smarter the game gets.
            </p>
            <Link className="btn" to="/quest">
              <IconCompass size={16} /> Enter Code City
            </Link>
          </section>
        ) : (
          <>
            <section className="profile-card">
              <div className="profile-card-head">
                <h2>Strengths &amp; weaknesses</h2>
                <span className="profile-card-hint">
                  Updated from every question you answer
                </span>
              </div>
              <ul className="profile-skills">
                {CONCEPTS.map(({ id, label }) => {
                  const skill = learnerModel.concepts[id]
                  const band = conceptBand(skill)
                  const pct = skill ? Math.round(skill.ability * 100) : 0
                  const seen = skill?.seen ?? 0
                  const isDue = due.includes(id)
                  return (
                    <li key={id} className="profile-skill">
                      <div className="profile-skill-top">
                        <span className="profile-skill-name">{label}</span>
                        <span className={`profile-skill-band band-${band}`}>
                          {BAND_LABEL[band]}
                          {isDue && <em className="profile-due-dot" title="Due for review" />}
                        </span>
                      </div>
                      <div className="profile-skill-bar">
                        <span
                          className={`profile-skill-fill band-${band}`}
                          style={{ width: `${seen === 0 ? 0 : Math.max(6, pct)}%` }}
                        />
                      </div>
                      <span className="profile-skill-meta">
                        {seen === 0 ? 'Not practiced yet' : `${seen} answered`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>

            <div className="profile-row">
              <section className="profile-card profile-coach">
                <h2>Your coach says</h2>
                <p>{coach}</p>
              </section>

              <section className="profile-card">
                <div className="profile-card-head">
                  <h2>Due for review</h2>
                </div>
                {due.length === 0 ? (
                  <p className="profile-due-empty">
                    You’re all caught up — nothing due right now. Nice.
                  </p>
                ) : (
                  <ul className="profile-due-list">
                    {due.map((id) => (
                      <li key={id} className="profile-due-item">
                        <span className="profile-due-mark" />
                        {LABEL[id]}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="profile-due-note">
                  Due concepts resurface as cyan <strong>Glitches</strong> in Code City —
                  destroy them for a Knowledge Surge.
                </p>
                <Link className="btn" to="/warmup" style={{ marginTop: 12 }}>
                  Start daily warm-up
                </Link>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
