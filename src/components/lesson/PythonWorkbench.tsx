import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import type {
  PythonCaseV1,
  PythonCodeAssessmentV1,
  PythonCodeResponseV1,
} from '../../types/assessment'
import type {
  PythonJudgeCaseResult,
  PythonJudgeError,
  PythonJudgeErrorCategory,
  PythonJudgeRunResult,
} from '../../workers/pythonJudgeProtocol'
import type { JsonValue } from '../../types/learning'
import { publishTutorRun } from '../../lib/tutorContext'
import { summarizePythonRunForTutor } from '../../lib/tutorRunSummary'
import { IconPlay } from '../icons'
import './PythonWorkbench.css'

const PythonCodeEditor = lazy(() => import('./PythonCodeEditor'))

type PlainCodeFallbackProps = {
  code: string
  rows: number
  disabled: boolean
  onChange: (code: string) => void
}

/**
 * Plain-textarea editor used both while the CodeMirror chunk is loading and if
 * it ever fails to load or crashes. It is fully functional on its own — the
 * learner can still read, edit, and submit their solution — so the coding step
 * degrades gracefully instead of taking down the whole lesson runner.
 */
function PlainCodeFallback({
  code,
  rows,
  disabled,
  onChange,
}: PlainCodeFallbackProps) {
  return (
    <textarea
      className="pyide-editor-fallback"
      data-editor-fallback=""
      aria-label="Your Python solution"
      value={code}
      rows={rows}
      disabled={disabled}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

type EditorBoundaryProps = { fallback: ReactNode; children: ReactNode }
type EditorBoundaryState = { failed: boolean }

/**
 * Guards the lazily-loaded CodeMirror editor. A rejected dynamic import (chunk
 * load failure — common after a redeploy or a flaky network) or a runtime
 * crash inside the editor would otherwise bubble to the app-wide ErrorBoundary,
 * which reloads to "/" and throws away the learner's in-progress quiz. Catching
 * it here keeps them on the question with a working plain-text editor.
 */
class EditorErrorBoundary extends Component<
  EditorBoundaryProps,
  EditorBoundaryState
> {
  state: EditorBoundaryState = { failed: false }

  static getDerivedStateFromError(): EditorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[PythonWorkbench] code editor failed to load', error, info)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Same signature as `usePythonJudge().run` — the judge stays the oracle. */
export type PythonJudgeRunner = (
  assessment: PythonCodeAssessmentV1,
  response: PythonCodeResponseV1,
) => Promise<PythonJudgeRunResult>

export type PythonWorkbenchProps = {
  assessment: PythonCodeAssessmentV1
  code: string
  onChange: (code: string) => void
  disabled?: boolean
  /**
   * Shared judge client (the one grading submissions). When absent the
   * workbench still renders the editor, just without the Run action.
   */
  runJudge?: PythonJudgeRunner
  /**
   * Full judge result from the latest graded submission. Only pass this when
   * the verdict may be shown (never during deferred-feedback exams).
   */
  submitResult?: PythonJudgeRunResult | null
  /** Fires while a practice run is in flight so the parent can lock Submit. */
  onRunningChange?: (running: boolean) => void
}

const MAX_VALUE_CHARS = 220

const ERROR_CATEGORY_LABELS: Record<PythonJudgeErrorCategory, string> = {
  protocol: 'Judge error',
  initialization: 'Python runtime failed to start',
  validation: 'Submission rejected',
  syntax: 'Syntax error',
  import: 'Import not allowed',
  entrypoint: 'Entrypoint missing',
  runtime: 'Runtime error',
  resultEncoding: 'Result could not be read',
  outputLimit: 'Output limit exceeded',
  timeout: 'Time limit exceeded',
  workerCrash: 'Python runtime crashed',
  internal: 'Judge error',
}

function formatValue(value: JsonValue | undefined): string {
  if (value === undefined) return '—'
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return '—'
  return serialized.length > MAX_VALUE_CHARS
    ? `${serialized.slice(0, MAX_VALUE_CHARS)}…`
    : serialized
}

function callLabel(
  assessment: PythonCodeAssessmentV1,
  testCase: PythonCaseV1,
): string {
  const args = testCase.arguments.map((argument) => formatValue(argument))
  const joined = args.join(', ')
  if (assessment.entrypoint.kind === 'function') {
    return `${assessment.entrypoint.name}(${joined})`
  }
  return `${assessment.entrypoint.className}().${assessment.entrypoint.methodName}(${joined})`
}

function entrypointLabel(assessment: PythonCodeAssessmentV1): string {
  return assessment.entrypoint.kind === 'function'
    ? `${assessment.entrypoint.name}()`
    : `${assessment.entrypoint.className}.${assessment.entrypoint.methodName}()`
}

function ErrorBlock({
  error,
  stderr,
}: {
  error: PythonJudgeError
  stderr?: string
}) {
  return (
    <div className="pyide-error" role="alert">
      <span className="pyide-error-category">
        {ERROR_CATEGORY_LABELS[error.category]}
      </span>
      <pre className="pyide-error-message">{error.message}</pre>
      {stderr ? <pre className="pyide-error-stderr">{stderr}</pre> : null}
    </div>
  )
}

function CaseRow({
  index,
  caseResult,
  testCase,
  assessment,
}: {
  index: number
  caseResult: PythonJudgeCaseResult
  testCase: PythonCaseV1 | undefined
  assessment: PythonCodeAssessmentV1
}) {
  return (
    <li
      className={`pyide-case ${caseResult.passed ? 'pyide-case-pass' : 'pyide-case-fail'}`}
    >
      <div className="pyide-case-head">
        <span className="pyide-case-badge" aria-hidden="true">
          {caseResult.passed ? '✓' : '✗'}
        </span>
        <span className="pyide-case-title">
          Case {index + 1} {caseResult.passed ? 'passed' : 'failed'}
        </span>
        {testCase ? (
          <code className="pyide-case-call">
            {callLabel(assessment, testCase)}
          </code>
        ) : null}
      </div>
      <dl className="pyide-case-io">
        <div>
          <dt>Expected</dt>
          <dd>
            <code>{formatValue(caseResult.expected ?? testCase?.expected)}</code>
          </dd>
        </div>
        <div>
          <dt>Your output</dt>
          <dd>
            <code>
              {caseResult.error
                ? 'nothing — the run stopped with an error'
                : formatValue(caseResult.actual)}
            </code>
          </dd>
        </div>
      </dl>
      {caseResult.error ? (
        <pre className="pyide-case-error">
          {ERROR_CATEGORY_LABELS[caseResult.error.category]}:{' '}
          {caseResult.error.message}
        </pre>
      ) : null}
    </li>
  )
}

function ProgramOutput({ result }: { result: PythonJudgeRunResult }) {
  if (!result.stdout && !result.stderr) return null
  return (
    <details className="pyide-output">
      <summary>Program output</summary>
      {result.stdout ? <pre>{result.stdout}</pre> : null}
      {result.stderr ? (
        <pre className="pyide-output-stderr">{result.stderr}</pre>
      ) : null}
    </details>
  )
}

function ResultsPanel({
  result,
  mode,
  assessment,
}: {
  result: PythonJudgeRunResult
  mode: 'run' | 'submit'
  assessment: PythonCodeAssessmentV1
}) {
  const caseById = useMemo(
    () => new Map(assessment.cases.map((testCase) => [testCase.id, testCase])),
    [assessment],
  )
  const exampleResults = result.cases.filter(
    ({ visibility }) => visibility === 'example',
  )
  const hiddenResults = result.cases.filter(
    ({ visibility }) => visibility === 'hidden',
  )
  const hiddenPassed = hiddenResults.filter(({ passed }) => passed).length
  const firstHiddenFailure = hiddenResults.find(
    ({ passed, error }) => !passed && error,
  )
  const fatal = result.status === 'error' && result.cases.length === 0
  const allPassed = result.status === 'passed'
  const summary = fatal
    ? 'Your code did not finish running.'
    : mode === 'run'
      ? allPassed
        ? `All ${result.totalCases} example ${result.totalCases === 1 ? 'case' : 'cases'} passed. Submit to run the full test set.`
        : `${result.passedCases} of ${result.totalCases} example ${result.totalCases === 1 ? 'case' : 'cases'} passed.`
      : allPassed
        ? `All ${result.totalCases} tests passed.`
        : `${result.passedCases} of ${result.totalCases} tests passed.`

  return (
    <section
      className={`pyide-results ${
        fatal
          ? 'pyide-results-error'
          : allPassed
            ? 'pyide-results-pass'
            : 'pyide-results-fail'
      }`}
      aria-label={mode === 'run' ? 'Run results' : 'Submission results'}
    >
      <header className="pyide-results-head">
        <span className="pyide-results-tag">
          {mode === 'run' ? 'Run · example cases' : 'Submission'}
        </span>
        <span className="pyide-results-summary" role="status">
          {summary}
        </span>
        <span className="pyide-results-duration">
          {Math.max(1, Math.round(result.durationMs))} ms
        </span>
      </header>

      {fatal && result.error ? (
        <ErrorBlock error={result.error} stderr={result.stderr || undefined} />
      ) : (
        <>
          {exampleResults.length > 0 && (
            <ul className="pyide-case-list">
              {exampleResults.map((caseResult, index) => (
                <CaseRow
                  key={caseResult.caseId}
                  index={index}
                  caseResult={caseResult}
                  testCase={caseById.get(caseResult.caseId)}
                  assessment={assessment}
                />
              ))}
            </ul>
          )}
          {mode === 'submit' && hiddenResults.length > 0 && (
            <div className="pyide-hidden">
              <span
                className={`pyide-case-badge ${
                  hiddenPassed === hiddenResults.length
                    ? 'pyide-badge-pass'
                    : 'pyide-badge-fail'
                }`}
                aria-hidden="true"
              >
                {hiddenPassed === hiddenResults.length ? '✓' : '✗'}
              </span>
              <div className="pyide-hidden-body">
                <span className="pyide-hidden-count">
                  {hiddenPassed}/{hiddenResults.length} hidden{' '}
                  {hiddenResults.length === 1 ? 'case' : 'cases'} passed
                </span>
                {firstHiddenFailure?.error && (
                  <p className="pyide-hidden-detail">
                    First failing hidden case:{' '}
                    {ERROR_CATEGORY_LABELS[firstHiddenFailure.error.category]}.
                    Its input and expected output stay hidden.
                  </p>
                )}
              </div>
            </div>
          )}
          <ProgramOutput result={result} />
        </>
      )}
    </section>
  )
}

type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: PythonJudgeRunResult }

export function PythonWorkbench({
  assessment,
  code,
  onChange,
  disabled = false,
  runJudge,
  submitResult = null,
  onRunningChange,
}: PythonWorkbenchProps) {
  const [runState, setRunState] = useState<RunState>({ status: 'idle' })
  const runIdRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const exampleCases = useMemo(
    () => assessment.cases.filter(({ visibility }) => visibility === 'example'),
    [assessment],
  )
  const hiddenCount = assessment.cases.length - exampleCases.length

  // Mirror the latest verdict into the tutor mailbox so "why did this fail?"
  // questions carry the failing case (expected vs actual) automatically.
  const latestVerdict = useMemo(
    () =>
      runState.status === 'done'
        ? ({ result: runState.result, mode: 'run' } as const)
        : submitResult
          ? ({ result: submitResult, mode: 'submit' } as const)
          : null,
    [runState, submitResult],
  )
  useEffect(() => {
    if (!latestVerdict) return
    publishTutorRun({
      assessmentId: assessment.id,
      summary: summarizePythonRunForTutor(
        assessment,
        latestVerdict.result,
        latestVerdict.mode,
      ),
    })
  }, [assessment, latestVerdict])
  const canRun = !!runJudge && exampleCases.length > 0
  const running = runState.status === 'running'

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      // Fresh code invalidates any run verdict on screen.
      runIdRef.current += 1
      setRunState((prev) => (prev.status === 'done' ? { status: 'idle' } : prev))
      onChange(nextCode)
    },
    [onChange],
  )

  const handleRun = useCallback(async () => {
    if (!runJudge || running || disabled || exampleCases.length === 0) return
    const runId = ++runIdRef.current
    setRunState({ status: 'running' })
    onRunningChange?.(true)
    try {
      // Practice runs execute the visible example cases only; the hidden set
      // stays blind until the learner submits.
      const result = await runJudge(
        { ...assessment, cases: exampleCases },
        { kind: 'pythonCode', code },
      )
      if (!mountedRef.current || runIdRef.current !== runId) return
      setRunState({ status: 'done', result })
    } catch {
      if (!mountedRef.current || runIdRef.current !== runId) return
      setRunState({
        status: 'done',
        result: {
          status: 'error',
          assessmentId: assessment.id,
          cases: [],
          passedCases: 0,
          totalCases: exampleCases.length,
          stdout: '',
          stderr: '',
          durationMs: 0,
          memoryLimitEnforced: false,
          error: {
            category: 'internal',
            message: 'The Python runner could not start or finish. Try again.',
          },
        },
      })
    } finally {
      if (mountedRef.current) onRunningChange?.(false)
    }
  }, [
    runJudge,
    running,
    disabled,
    exampleCases,
    assessment,
    code,
    onRunningChange,
  ])

  const editorLines = Math.max(10, assessment.starterCode.split('\n').length + 4)

  return (
    <div className="pyide" data-assessment-id={assessment.id}>
      <div className="pyide-editor-shell">
        <div className="pyide-editor-head" aria-hidden="true">
          <span className="pyide-editor-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="pyide-editor-filename">solution.py</span>
          <code className="pyide-editor-entrypoint">
            {entrypointLabel(assessment)}
          </code>
        </div>
        <EditorErrorBoundary
          fallback={
            <PlainCodeFallback
              code={code}
              rows={editorLines}
              disabled={disabled}
              onChange={handleCodeChange}
            />
          }
        >
          <Suspense
            fallback={
              <PlainCodeFallback
                code={code}
                rows={editorLines}
                disabled={disabled}
                onChange={handleCodeChange}
              />
            }
          >
            <div className="pyide-editor" data-disabled={disabled || undefined}>
              <PythonCodeEditor
                value={code}
                onChange={handleCodeChange}
                disabled={disabled}
                ariaLabel="Your Python solution"
              />
            </div>
          </Suspense>
        </EditorErrorBoundary>
      </div>

      {(canRun || hiddenCount > 0) && (
        <div className="pyide-actions">
          {canRun && (
            <button
              type="button"
              className="pyide-run-btn"
              disabled={disabled || running}
              onClick={() => void handleRun()}
            >
              <IconPlay size={14} />
              {running ? 'Running…' : 'Run code'}
            </button>
          )}
          <span className="pyide-run-note">
            {canRun
              ? `Runs the ${exampleCases.length} visible example ${
                  exampleCases.length === 1 ? 'case' : 'cases'
                }${hiddenCount > 0 ? ` — ${hiddenCount} hidden ${hiddenCount === 1 ? 'check runs' : 'checks run'} on submit` : ''}.`
              : 'All checks for this problem are hidden and run on submit.'}
          </span>
        </div>
      )}

      {runState.status === 'running' && (
        <div className="pyide-running" role="status">
          <span className="pyide-running-dot" aria-hidden="true" />
          Running your code in the browser Python sandbox…
        </div>
      )}

      {runState.status === 'done' && (
        <ResultsPanel
          result={runState.result}
          mode="run"
          assessment={assessment}
        />
      )}

      {runState.status !== 'running' && submitResult && (
        <ResultsPanel
          result={submitResult}
          mode="submit"
          assessment={assessment}
        />
      )}

      {assessment.verificationNotes &&
        assessment.verificationNotes.length > 0 && (
          <ul className="assessment-verification-notes pyide-notes">
            {assessment.verificationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      <p className="assessment-verification-notes pyide-notes" role="note">
        Browser Python checks are educational and advisory. The server stores
        linked attempt evidence but does not independently execute your code,
        so browser-only results cannot provide server-side proof.
      </p>
    </div>
  )
}
