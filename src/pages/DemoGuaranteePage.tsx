import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { useDemoGuarantee } from '../context/DemoGuaranteeContext'
import { useGauntlet } from '../context/GauntletContext'
import { useProgress } from '../context/ProgressContext'
import {
  DEMO_GUARANTEE_POLICY_VERSION,
  DEMO_GUARANTEE_REQUIRED_MISSIONS,
  type DemoGuaranteeEvaluationInput,
  type DemoGuaranteeReasonCode,
  type DemoGuaranteeScenario,
  type DemoGuaranteeSimulation,
} from '../types/demoGuarantee'
import { selectAcademyProgressCounts } from '../lib/academyProgress'
import {
  createDemoGuaranteeSimulation,
  decideDemoGuaranteeSimulation,
  reevaluateDemoGuaranteeSimulation,
  resetDemoGuaranteeSimulation,
} from '../lib/demoGuarantee'
import './DemoGuaranteePage.css'

const WARNING =
  'DEMO ONLY — fictional guarantee workflow. No payment provider is connected and no money can move.'
const DAY_MS = 24 * 60 * 60 * 1000

const REASON_LABELS: Record<DemoGuaranteeReasonCode, string> = {
  'awaiting-simulated-decision': 'Awaiting a fictional decision',
  'eligible-under-demo-policy': 'All fictional policy criteria were met',
  'mission-requirement-not-met': 'All 150 missions are not complete',
  'delayed-review-requirement-not-met':
    'Simulated delayed-review adherence was not met',
  'remediation-requirement-not-met':
    'Simulated remediation is not complete',
  'certification-already-achieved':
    'The academy certification is already achieved',
  'outside-simulated-policy-window':
    'The fictional evaluation falls outside the mock window',
}

const SCENARIO_LABELS: Record<DemoGuaranteeScenario, string> = {
  'eligible-path': 'Eligible-path walkthrough',
  'delayed-review-not-met': 'Delayed-review gap',
  'remediation-not-complete': 'Remediation still open',
  'outside-window': 'Outside the mock window',
}

function createRunId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function operationTimestamp(simulation: DemoGuaranteeSimulation | null): string {
  const currentTime = new Date().getTime()
  const minimumTime = simulation
    ? Math.max(
        Date.parse(simulation.createdAt),
        Date.parse(simulation.updatedAt),
      ) + 1
    : currentTime
  return new Date(Math.max(currentTime, minimumTime)).toISOString()
}

export function DemoGuaranteePage() {
  const { academyProgress, ready: progressReady } = useProgress()
  const { state: gauntlet } = useGauntlet()
  const {
    ready,
    saving,
    simulation,
    cloudMode,
    error,
    saveSimulation,
    clearError,
  } = useDemoGuarantee()
  const academyCounts = selectAcademyProgressCounts(academyProgress)
  const [scenario, setScenario] =
    useState<DemoGuaranteeScenario>('eligible-path')
  const [delayedReviewMet, setDelayedReviewMet] = useState(true)
  const [remediationComplete, setRemediationComplete] = useState(true)
  const [windowDays, setWindowDays] = useState(30)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!simulation) return
    setScenario(simulation.scenario)
    setDelayedReviewMet(
      simulation.criteria.delayedReviewAdherence.met,
    )
    setRemediationComplete(
      simulation.criteria.remediationCompletion.met,
    )
    setWindowDays(simulation.simulatedPolicyWindow.durationDays)
  }, [simulation])

  const policy = useMemo(
    () => ({
      policyVersion: DEMO_GUARANTEE_POLICY_VERSION,
      requiredMissions: DEMO_GUARANTEE_REQUIRED_MISSIONS,
      simulatedWindowDays: windowDays,
    }),
    [windowDays],
  )

  if (!ready || !progressReady) {
    return <Loader label="Loading fictional workflow" />
  }

  function applyScenario(next: DemoGuaranteeScenario): void {
    setScenario(next)
    if (next === 'delayed-review-not-met') {
      setDelayedReviewMet(false)
      setRemediationComplete(true)
    } else if (next === 'remediation-not-complete') {
      setDelayedReviewMet(true)
      setRemediationComplete(false)
    } else {
      setDelayedReviewMet(true)
      setRemediationComplete(true)
    }
    setSuccess(null)
    clearError()
  }

  function evaluationInput(
    simulationRunId: string,
    recordedAt: string,
    windowStartsAt: string,
  ): DemoGuaranteeEvaluationInput {
    const startMs = Date.parse(windowStartsAt)
    const evaluatedAt =
      scenario === 'outside-window'
        ? new Date(startMs + (windowDays + 1) * DAY_MS).toISOString()
        : new Date(startMs + (windowDays * DAY_MS) / 2).toISOString()
    return {
      simulationRunId,
      scenario,
      completedMissions: academyCounts.completedProblems,
      delayedReviewAdherenceMet: delayedReviewMet,
      remediationComplete,
      certificationAchieved: gauntlet.examPassed,
      windowStartsAt,
      evaluatedAt,
      recordedAt,
    }
  }

  async function evaluatePending(): Promise<void> {
    const recordedAt = operationTimestamp(simulation)
    const runId =
      simulation?.status === 'pending'
        ? simulation.simulationRunId
        : createRunId()
    const windowStartsAt =
      simulation?.status === 'pending'
        ? simulation.simulatedPolicyWindow.startsAt
        : recordedAt
    const input = evaluationInput(runId, recordedAt, windowStartsAt)
    const next =
      simulation?.status === 'pending'
        ? reevaluateDemoGuaranteeSimulation(simulation, input, policy)
        : createDemoGuaranteeSimulation(input, policy)
    try {
      await saveSimulation(next)
      setSuccess('Simulation saved. No refund was sent.')
    } catch {
      setSuccess(null)
    }
  }

  async function simulateDecision(): Promise<void> {
    if (!simulation || simulation.status !== 'pending') return
    const decision = simulation.eligible ? 'approved' : 'denied'
    const confirmed = window.confirm(
      `${WARNING}\n\nRecord a fictional ${decision} outcome for this simulation?`,
    )
    if (!confirmed) return
    try {
      const next = decideDemoGuaranteeSimulation(
        simulation,
        operationTimestamp(simulation),
      )
      await saveSimulation(next)
      setSuccess('Simulation saved. No refund was sent.')
    } catch {
      setSuccess(null)
    }
  }

  async function resetSimulation(): Promise<void> {
    const recordedAt = operationTimestamp(simulation)
    const input = evaluationInput(createRunId(), recordedAt, recordedAt)
    const next = simulation
      ? resetDemoGuaranteeSimulation(simulation, input, policy)
      : createDemoGuaranteeSimulation(input, policy)
    try {
      await saveSimulation(next)
      setSuccess('Simulation saved. No refund was sent.')
    } catch {
      setSuccess(null)
    }
  }

  function downloadEvidence(): void {
    if (!simulation) return
    const serialized = JSON.stringify(simulation, null, 2)
    const blob = new Blob([serialized], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `alphacode-demo-guarantee-${simulation.simulationRunId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const terminal = simulation?.status !== 'pending' && simulation != null
  const modeLabel =
    cloudMode === 'guest-local'
      ? 'Guest · this browser only'
      : cloudMode === 'cloud'
        ? 'Signed in · optional cloud copy active'
        : 'Signed in · local fallback active'

  return (
    <div className="page demo-guarantee-page">
      <AppHeader />
      <div className="demo-guarantee-warning demo-guarantee-warning-top" role="note">
        {WARNING}
      </div>

      <main className="container demo-guarantee-main" id="main-content">
        <header className="demo-guarantee-hero">
          <div>
            <span className="eyebrow">Private product demo</span>
            <h1>Fictional guarantee workflow</h1>
            <p>
              Explore deterministic eligibility states using academy facts and
              explicitly simulated inputs. This page does not make a legal promise.
            </p>
          </div>
          <span className="pill warn">Simulation environment</span>
        </header>

        <section className="card demo-guarantee-card" aria-labelledby="actual-facts">
          <div className="demo-guarantee-section-head">
            <div>
              <span className="eyebrow">Read-only academy facts</span>
              <h2 id="actual-facts">Current learning status</h2>
            </div>
            <span className="demo-guarantee-mode">{modeLabel}</span>
          </div>
          <div className="demo-guarantee-facts">
            <label className="field">
              <span>Academy completion</span>
              <input
                className="input"
                readOnly
                aria-readonly="true"
                value={`${academyCounts.completedProblems}/150 missions complete`}
              />
            </label>
            <label className="field">
              <span>Certification status</span>
              <input
                className="input"
                readOnly
                aria-readonly="true"
                value={
                  gauntlet.examPassed
                    ? 'Certification achieved'
                    : 'Certification not achieved'
                }
              />
            </label>
          </div>
          <p className="demo-guarantee-identity-note">
            Guest simulations stay under the guest identity on this browser and are
            never moved into a signed-in account.
          </p>
        </section>

        <section className="card demo-guarantee-card" aria-labelledby="scenario-inputs">
          <div className="demo-guarantee-section-head">
            <div>
              <span className="eyebrow">Explicitly simulated inputs</span>
              <h2 id="scenario-inputs">Choose a walkthrough</h2>
            </div>
            <span className="pill">Policy {DEMO_GUARANTEE_POLICY_VERSION}</span>
          </div>

          <div className="demo-guarantee-controls">
            <label className="field">
              <span>Scenario</span>
              <select
                className="input"
                value={scenario}
                disabled={saving || terminal}
                onChange={(event) =>
                  applyScenario(event.target.value as DemoGuaranteeScenario)
                }
              >
                {Object.entries(SCENARIO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mock window length in days</span>
              <input
                className="input"
                type="number"
                min={1}
                max={3650}
                step={1}
                value={windowDays}
                disabled={saving || terminal}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isSafeInteger(next) && next >= 1 && next <= 3650) {
                    setWindowDays(next)
                    setSuccess(null)
                  }
                }}
              />
            </label>
          </div>

          <div className="demo-guarantee-toggles">
            <label>
              <input
                type="checkbox"
                checked={delayedReviewMet}
                disabled={saving || terminal}
                onChange={(event) => {
                  setDelayedReviewMet(event.target.checked)
                  setSuccess(null)
                }}
              />
              <span>
                <strong>Simulated delayed-review adherence met</strong>
                <small>Fictional toggle; it does not alter learning history.</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={remediationComplete}
                disabled={saving || terminal}
                onChange={(event) => {
                  setRemediationComplete(event.target.checked)
                  setSuccess(null)
                }}
              />
              <span>
                <strong>Simulated remediation complete</strong>
                <small>Fictional toggle; it does not alter academy progress.</small>
              </span>
            </label>
          </div>

          <button
            className="btn ghost"
            type="button"
            disabled={saving || terminal}
            onClick={() => void evaluatePending()}
          >
            {simulation?.status === 'pending'
              ? 'Refresh pending simulation'
              : 'Create pending simulation'}
          </button>
          {terminal && (
            <p className="demo-guarantee-terminal-note">
              Terminal simulation outcomes are immutable. Reset to start a new run.
            </p>
          )}
        </section>

        <section className="card demo-guarantee-card" aria-labelledby="criteria-heading">
          <div className="demo-guarantee-section-head">
            <div>
              <span className="eyebrow">Evidence snapshot</span>
              <h2 id="criteria-heading">Criterion checklist</h2>
            </div>
            <SimulationStatus simulation={simulation} />
          </div>

          {simulation ? (
            <>
              <ul className="demo-guarantee-checklist">
                <Criterion
                  met={simulation.criteria.missionCompletion.met}
                  label="All 150 academy missions complete"
                  detail={`${simulation.criteria.missionCompletion.completedMissions}/${simulation.criteria.missionCompletion.requiredMissions}`}
                />
                <Criterion
                  met={simulation.criteria.delayedReviewAdherence.met}
                  label="Simulated delayed-review adherence met"
                  detail="Explicit fictional input"
                />
                <Criterion
                  met={simulation.criteria.remediationCompletion.met}
                  label="Simulated remediation complete"
                  detail="Explicit fictional input"
                />
                <Criterion
                  met={simulation.criteria.certificationNotAchieved.met}
                  label="Certification still not achieved"
                  detail="Read-only academy fact"
                />
                <Criterion
                  met={simulation.criteria.policyWindow.met}
                  label="Inside the mock policy window"
                  detail={`${simulation.simulatedPolicyWindow.durationDays} simulated days`}
                />
              </ul>
              <dl className="demo-guarantee-metadata">
                <div>
                  <dt>Run</dt>
                  <dd>{simulation.simulationRunId}</dd>
                </div>
                <div>
                  <dt>Mock window</dt>
                  <dd>
                    {simulation.simulatedPolicyWindow.startsAt} →{' '}
                    {simulation.simulatedPolicyWindow.endsAt}
                  </dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{REASON_LABELS[simulation.reasonCode]}</dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>{simulation.revision}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="demo-guarantee-empty">
              Create a pending simulation to capture a versioned criterion snapshot.
            </p>
          )}
        </section>

        <section className="card demo-guarantee-card demo-guarantee-actions" aria-labelledby="actions-heading">
          <h2 id="actions-heading">Simulation actions</h2>
          <div className="demo-guarantee-warning demo-guarantee-warning-near" role="note">
            {WARNING}
          </div>
          <div className="demo-guarantee-action-row">
            <button
              className={simulation?.eligible ? 'btn lime' : 'btn subtle'}
              type="button"
              disabled={saving || !simulation || simulation.status !== 'pending'}
              onClick={() => void simulateDecision()}
            >
              {simulation?.eligible
                ? 'Simulate approved outcome'
                : 'Simulate denied outcome'}
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={saving}
              onClick={() => void resetSimulation()}
            >
              Reset with a new run
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={!simulation}
              onClick={downloadEvidence}
            >
              Download JSON evidence
            </button>
          </div>
          {success && (
            <p className="demo-guarantee-success" role="status">
              {success}
            </p>
          )}
          {error && (
            <p className="demo-guarantee-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <Link className="demo-guarantee-back" to="/profile">
          Back to profile
        </Link>
      </main>
    </div>
  )
}

function Criterion({
  met,
  label,
  detail,
}: {
  readonly met: boolean
  readonly label: string
  readonly detail: string
}) {
  return (
    <li className={met ? 'is-met' : 'is-unmet'}>
      <span className="demo-guarantee-checkmark" aria-hidden="true">
        {met ? '✓' : '×'}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </li>
  )
}

function SimulationStatus({
  simulation,
}: {
  readonly simulation: DemoGuaranteeSimulation | null
}) {
  const status = simulation?.status ?? 'not-started'
  return (
    <span className={`demo-guarantee-status status-${status}`}>
      Simulation {status.replace('-', ' ')}
    </span>
  )
}
