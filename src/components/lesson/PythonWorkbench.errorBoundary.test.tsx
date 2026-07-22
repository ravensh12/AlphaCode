// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
} from '../../types/assessment'

// Force the lazily-loaded CodeMirror editor to blow up during render, the way
// a rejected chunk import or a runtime crash inside the editor would. Before
// the local EditorErrorBoundary this propagated to the app-wide ErrorBoundary,
// which reloads to "/" and wipes an in-progress quiz — the "it refreshed on the
// last question and made me restart" bug.
vi.mock('./PythonCodeEditor', () => ({
  default: () => {
    throw new Error('simulated CodeMirror chunk failure')
  },
}))

// eslint-disable-next-line import/first
import { PythonWorkbench } from './PythonWorkbench'

// `act` from 'react' requires this flag to flush effects/state without warnings.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const assessment: PythonCodeAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  evidenceKind: 'code-tests',
  id: 'assessment:python-boundary',
  kind: 'pythonCode',
  prompt: 'Write the function.',
  starterCode: 'def solve(nums):\n    pass',
  entrypoint: { kind: 'function', name: 'solve' },
  codecs: {
    arguments: [{ kind: 'list', item: { kind: 'integer' } }],
    result: { kind: 'integer' },
  },
  cases: [
    {
      id: 'case:example-1',
      arguments: [[1, 2, 3]],
      expected: 6,
      visibility: 'example',
    },
  ],
  comparator: { kind: 'deepEqual' },
  limits: {
    timeoutMs: 1_000,
    memoryMb: 64,
    maxOutputBytes: 4_096,
    maxSourceBytes: 20_000,
  },
}

let container: HTMLDivElement
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  // React logs caught render errors; keep the test output readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  container.remove()
})

describe('PythonWorkbench editor failure resilience', () => {
  it('falls back to a working plain-text editor when the lazy editor crashes', async () => {
    const onChange = vi.fn()
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <PythonWorkbench
          assessment={assessment}
          code={assessment.starterCode}
          onChange={onChange}
          runJudge={() => Promise.reject(new Error('unused'))}
        />,
      )
    })
    // Let the lazy import resolve and the boundary catch the render crash.
    await act(async () => {
      await Promise.resolve()
    })

    // The runner is still alive: the fallback textarea rendered with the code,
    // and the pre-submit Run action is still available.
    const fallback = container.querySelector<HTMLTextAreaElement>(
      'textarea[data-editor-fallback]',
    )
    expect(fallback).not.toBeNull()
    expect(fallback!.value).toBe(assessment.starterCode)
    expect(container.textContent).toContain('Run code')

    // Editing still flows the answer up to the engine — progress is preserved.
    await act(async () => {
      const native = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      native.call(fallback, 'def solve(nums):\n    return sum(nums)')
      fallback!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('def solve(nums):\n    return sum(nums)')

    // Every action inside the workbench is an explicit button (never a submit
    // that could trigger a full-page navigation/reload).
    container.querySelectorAll('button').forEach((button) => {
      expect(button.getAttribute('type')).toBe('button')
    })

    await act(async () => {
      root.unmount()
    })
  })
})
