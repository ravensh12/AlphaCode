import { describe, expect, it, vi } from 'vitest'
import {
  buildTutorMessages,
  isTutorConfigured,
  requestTutorReply,
  TUTOR_DEFAULT_BASE_URL,
  TUTOR_DEFAULT_MODEL,
  tutorConfig,
  tutorErrorMessage,
  TutorRequestError,
  TUTOR_SYSTEM_PROMPT,
  type TutorProblemContext,
} from './tutorClient'
import {
  describePythonAssessmentForTutor,
  summarizePythonRunForTutor,
} from './tutorRunSummary'
import type { PythonCodeAssessmentV1 } from '../types/assessment'
import type { PythonJudgeRunResult } from '../workers/pythonJudgeProtocol'

const CONTEXT: TutorProblemContext = {
  problemTitle: 'Valid Anagram',
  problemStatement: 'Return true when t is an anagram of s.',
  code: 'def is_anagram(s, t):\n    return sorted(s) == sorted(t)\n',
  runSummary: 'Practice run over the visible example cases: 1/2 passed.',
}

describe('tutor config', () => {
  it('defaults base URL and model; the key gates availability', () => {
    expect(tutorConfig({})).toEqual({
      baseUrl: TUTOR_DEFAULT_BASE_URL,
      model: TUTOR_DEFAULT_MODEL,
      apiKey: null,
    })
    expect(isTutorConfigured({})).toBe(false)
    expect(isTutorConfigured({ VITE_TUTOR_API_KEY: 'tfy_x' })).toBe(true)
    expect(
      tutorConfig({ VITE_TUTOR_BASE_URL: 'https://proxy.example/' }).baseUrl,
    ).toBe('https://proxy.example')
  })
})

describe('context assembly', () => {
  it('includes the system prompt, problem, code, run result, and question', () => {
    const messages = buildTutorMessages(
      CONTEXT,
      [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier hint' },
      ],
      'Why does case 2 fail?',
    )

    expect(messages[0]).toEqual({
      role: 'system',
      content: TUTOR_SYSTEM_PROMPT,
    })
    const contextBlock = messages[1]
    expect(contextBlock.role).toBe('system')
    expect(contextBlock.content).toContain('Problem: Valid Anagram')
    expect(contextBlock.content).toContain('anagram of s')
    expect(contextBlock.content).toContain('sorted(s) == sorted(t)')
    expect(contextBlock.content).toContain('1/2 passed')

    expect(messages[2]).toEqual({ role: 'user', content: 'earlier question' })
    expect(messages[3]).toEqual({ role: 'assistant', content: 'earlier hint' })
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: 'Why does case 2 fail?',
    })
  })

  it('omits code/run blocks when absent and trims long history', () => {
    const messages = buildTutorMessages(
      { ...CONTEXT, code: null, runSummary: null },
      Array.from({ length: 30 }, (_, i) => ({
        role: 'user' as const,
        content: `q${i}`,
      })),
      'next',
    )
    expect(messages[1].content).not.toContain('solution.py')
    expect(messages[1].content).not.toContain('Latest run result')
    // system ×2 + trimmed history (12) + new question
    expect(messages).toHaveLength(2 + 12 + 1)
    expect(messages[2].content).toBe('q18')
  })

  it('the standing orders are Socratic and forbid solution dumps', () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain('Do NOT provide the full solution')
    expect(TUTOR_SYSTEM_PROMPT).toContain('explicitly insists')
  })
})

describe('requestTutorReply', () => {
  it('refuses when no key is configured (the UI hides behind this)', async () => {
    await expect(
      requestTutorReply([{ role: 'user', content: 'hi' }], { env: {} }),
    ).rejects.toMatchObject({ status: null })
  })

  it('posts an OpenAI-compatible payload with the bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'A hint.' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const reply = await requestTutorReply([{ role: 'user', content: 'hi' }], {
      env: { VITE_TUTOR_API_KEY: 'tfy_test' },
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    expect(reply).toBe('A hint.')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${TUTOR_DEFAULT_BASE_URL}/v1/chat/completions`)
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tfy_test',
    )
    const body = JSON.parse(init.body as string) as {
      model: string
      stream: boolean
      messages: unknown[]
    }
    expect(body.model).toBe(TUTOR_DEFAULT_MODEL)
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(1)
  })

  it('streams SSE deltas and resolves the assembled reply', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Look "}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"closer."}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    const deltas: string[] = []
    const reply = await requestTutorReply([{ role: 'user', content: 'hi' }], {
      env: { VITE_TUTOR_API_KEY: 'tfy_test' },
      fetchImpl: fetchMock as unknown as typeof fetch,
      onDelta: (delta) => deltas.push(delta),
    })
    expect(reply).toBe('Look closer.')
    expect(deltas).toEqual(['Look ', 'closer.'])
  })

  it('maps HTTP failures to kid-friendly copy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(
      requestTutorReply([{ role: 'user', content: 'hi' }], {
        env: { VITE_TUTOR_API_KEY: 'tfy_bad' },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TutorRequestError)

    expect(tutorErrorMessage(new TutorRequestError('x', 401))).toContain(
      'tutor key',
    )
    expect(tutorErrorMessage(new TutorRequestError('x', 429))).toContain(
      'catching its breath',
    )
    expect(tutorErrorMessage(new TutorRequestError('x', 503))).toContain(
      'hiccuped',
    )
    expect(tutorErrorMessage(new TypeError('fetch failed'))).toContain(
      'internet',
    )
  })
})

/* -------------------------------------------------- run summaries (fixture) */

const ASSESSMENT = {
  id: 'assessment:test',
  kind: 'pythonCode',
  starterCode: 'def is_anagram(s, t):\n    pass\n',
  entrypoint: { kind: 'function', name: 'is_anagram' },
  codecs: {},
  cases: [
    {
      id: 'case-1',
      arguments: ['listen', 'silent'],
      expected: true,
      visibility: 'example',
    },
    {
      id: 'case-2',
      arguments: ['rat', 'car'],
      expected: false,
      visibility: 'example',
    },
    {
      id: 'case-3',
      arguments: ['a', 'a'],
      expected: true,
      visibility: 'hidden',
    },
  ],
  comparator: { kind: 'deepEqual' },
  limits: {},
} as unknown as PythonCodeAssessmentV1

describe('tutor run summaries', () => {
  it('describes the assessment with entrypoint and one example', () => {
    const description = describePythonAssessmentForTutor(ASSESSMENT)
    expect(description).toContain('is_anagram(...)')
    expect(description).toContain('is_anagram("listen", "silent")')
    expect(description).toContain('should return true')
  })

  it('summarizes the first failing visible case with expected vs actual', () => {
    const result = {
      status: 'failed',
      assessmentId: 'assessment:test',
      cases: [
        { caseId: 'case-1', visibility: 'example', passed: true },
        {
          caseId: 'case-2',
          visibility: 'example',
          passed: false,
          expected: false,
          actual: true,
        },
      ],
      passedCases: 1,
      totalCases: 2,
      stdout: '',
      stderr: '',
      durationMs: 12,
      memoryLimitEnforced: false,
    } as unknown as PythonJudgeRunResult

    const summary = summarizePythonRunForTutor(ASSESSMENT, result, 'run')
    expect(summary).toContain('1/2 passed')
    expect(summary).toContain('is_anagram("rat", "car")')
    expect(summary).toContain('Expected: false')
    expect(summary).toContain('Actual: true')
  })

  it('keeps hidden-case inputs hidden and reports fatal errors', () => {
    const hiddenFail = {
      status: 'failed',
      assessmentId: 'assessment:test',
      cases: [
        { caseId: 'case-1', visibility: 'example', passed: true },
        { caseId: 'case-3', visibility: 'hidden', passed: false },
      ],
      passedCases: 1,
      totalCases: 2,
      stdout: '',
      stderr: '',
      durationMs: 9,
      memoryLimitEnforced: false,
    } as unknown as PythonJudgeRunResult
    const hiddenSummary = summarizePythonRunForTutor(
      ASSESSMENT,
      hiddenFail,
      'submit',
    )
    expect(hiddenSummary).toContain('1 hidden check failed')
    expect(hiddenSummary).not.toContain('"a"')

    const fatal = {
      status: 'error',
      assessmentId: 'assessment:test',
      cases: [],
      passedCases: 0,
      totalCases: 2,
      stdout: '',
      stderr: 'Traceback…',
      durationMs: 3,
      memoryLimitEnforced: false,
      error: { category: 'syntax', message: 'invalid syntax on line 2' },
    } as unknown as PythonJudgeRunResult
    const fatalSummary = summarizePythonRunForTutor(ASSESSMENT, fatal, 'run')
    expect(fatalSummary).toContain('did not finish running')
    expect(fatalSummary).toContain('invalid syntax on line 2')
  })
})
