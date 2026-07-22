import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type PythonCodeAssessmentV1,
} from '../types/assessment'
import {
  PYTHON_JUDGE_PROTOCOL_VERSION,
  type PythonJudgeRequest,
  type PythonJudgeResponse,
  type PythonJudgeRunResult,
} from '../workers/pythonJudgeProtocol'
import {
  PythonJudgeClient,
  type PythonJudgeWorkerLike,
} from './usePythonJudge'

type Listener = Parameters<PythonJudgeWorkerLike['addEventListener']>[1]
type EventType = Parameters<PythonJudgeWorkerLike['addEventListener']>[0]

class FakeWorker implements PythonJudgeWorkerLike {
  readonly messages: PythonJudgeRequest[] = []
  terminated = false
  private readonly listeners = new Map<EventType, Set<Listener>>()

  postMessage(message: PythonJudgeRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  addEventListener(type: EventType, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: EventType, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  emitMessage(message: unknown): void {
    this.listeners
      .get('message')
      ?.forEach((listener) => listener({ data: message }))
  }

  emitError(message = 'worker exploded'): void {
    this.listeners
      .get('error')
      ?.forEach((listener) => listener({ message }))
  }
}

const baseAssessment: PythonCodeAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  id: 'assessment:hook-judge',
  kind: 'pythonCode',
  prompt: 'Return whether the input is positive.',
  evidenceKind: 'code-tests',
  starterCode: 'def is_positive(value):\n    return False',
  entrypoint: { kind: 'function', name: 'is_positive' },
  codecs: {
    arguments: [{ kind: 'integer' }],
    result: { kind: 'boolean' },
  },
  cases: [
    {
      id: 'case:positive',
      arguments: [2],
      expected: true,
      visibility: 'example',
    },
  ],
  comparator: { kind: 'deepEqual' },
  limits: {
    timeoutMs: 50,
    memoryMb: 64,
    maxOutputBytes: 1_024,
    maxSourceBytes: 10_000,
  },
}

const response = {
  kind: 'pythonCode',
  code: 'def is_positive(value):\n    return value > 0',
} as const

function passedResult(): PythonJudgeRunResult {
  return {
    status: 'passed',
    assessmentId: baseAssessment.id,
    cases: [
      {
        caseId: 'case:positive',
        visibility: 'example',
        passed: true,
        actual: true,
        expected: true,
      },
    ],
    passedCases: 1,
    totalCases: 1,
    stdout: '',
    stderr: '',
    durationMs: 4,
    memoryLimitEnforced: false,
  }
}

function correlatedResponse(
  request: PythonJudgeRequest,
  responseValue:
    | { type: 'initialized' }
    | { type: 'runResult'; result: PythonJudgeRunResult },
): PythonJudgeResponse {
  return {
    protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
    requestId: request.requestId,
    nonce: request.nonce,
    ...responseValue,
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve()
  }
}

function makeClient(options: { initializationTimeoutMs?: number } = {}): {
  client: PythonJudgeClient
  workers: FakeWorker[]
} {
  const workers: FakeWorker[] = []
  let nonceSequence = 0
  const client = new PythonJudgeClient({
    workerFactory: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
    nonceFactory: () =>
      `nonce${String(++nonceSequence).padStart(15, '0')}`,
    ...options,
  })
  return { client, workers }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PythonJudgeClient', () => {
  it('creates the worker lazily and correlates ids and nonces', async () => {
    const { client, workers } = makeClient()
    expect(workers).toHaveLength(0)

    const runPromise = client.run(baseAssessment, response)
    expect(workers).toHaveLength(1)
    const worker = workers[0]
    const initializeRequest = worker.messages[0]
    expect(initializeRequest?.type).toBe('initialize')

    worker.emitMessage({
      ...correlatedResponse(initializeRequest, { type: 'initialized' }),
      nonce: 'stale00000000000',
    })
    await flushMicrotasks()
    expect(worker.messages).toHaveLength(1)

    worker.emitMessage(
      correlatedResponse(initializeRequest, { type: 'initialized' }),
    )
    await flushMicrotasks()
    const runRequest = worker.messages[1]
    expect(runRequest?.type).toBe('run')

    worker.emitMessage({
      ...correlatedResponse(runRequest, {
        type: 'runResult',
        result: passedResult(),
      }),
      requestId: 'python:stale:999',
    })
    await flushMicrotasks()
    expect(client.getSnapshot().status).toBe('running')

    worker.emitMessage(
      correlatedResponse(runRequest, {
        type: 'runResult',
        result: passedResult(),
      }),
    )
    await expect(runPromise).resolves.toMatchObject({ status: 'passed' })
    expect(client.getSnapshot()).toEqual({ status: 'ready', error: null })
    client.dispose()
  })

  it('terminates a timed-out execution and recreates the worker', async () => {
    vi.useFakeTimers()
    const { client, workers } = makeClient()

    const firstRun = client.run(baseAssessment, response)
    const firstWorker = workers[0]
    firstWorker.emitMessage(
      correlatedResponse(firstWorker.messages[0], { type: 'initialized' }),
    )
    await flushMicrotasks()
    expect(firstWorker.messages[1]?.type).toBe('run')

    await vi.advanceTimersByTimeAsync(baseAssessment.limits.timeoutMs)
    await expect(firstRun).resolves.toMatchObject({
      status: 'error',
      error: { category: 'timeout' },
    })
    expect(firstWorker.terminated).toBe(true)

    const secondRun = client.run(baseAssessment, response)
    expect(workers).toHaveLength(2)
    const secondWorker = workers[1]
    secondWorker.emitMessage(
      correlatedResponse(secondWorker.messages[0], { type: 'initialized' }),
    )
    await flushMicrotasks()
    const secondRequest = secondWorker.messages[1]
    secondWorker.emitMessage(
      correlatedResponse(secondRequest, {
        type: 'runResult',
        result: passedResult(),
      }),
    )
    await expect(secondRun).resolves.toMatchObject({ status: 'passed' })
    client.dispose()
  })

  it('terminates and recreates after a worker crash', async () => {
    const { client, workers } = makeClient()
    const firstRun = client.run(baseAssessment, response)
    const firstWorker = workers[0]
    firstWorker.emitMessage(
      correlatedResponse(firstWorker.messages[0], { type: 'initialized' }),
    )
    await flushMicrotasks()
    firstWorker.emitError()

    await expect(firstRun).resolves.toMatchObject({
      status: 'error',
      error: { category: 'workerCrash' },
    })
    expect(firstWorker.terminated).toBe(true)

    const secondRun = client.run(baseAssessment, response)
    expect(workers).toHaveLength(2)
    const secondWorker = workers[1]
    secondWorker.emitMessage(
      correlatedResponse(secondWorker.messages[0], { type: 'initialized' }),
    )
    await flushMicrotasks()
    secondWorker.emitMessage(
      correlatedResponse(secondWorker.messages[1], {
        type: 'runResult',
        result: passedResult(),
      }),
    )
    await secondRun
    client.dispose()
  })

  it('enforces initialization timeout and cleans up on dispose', async () => {
    vi.useFakeTimers()
    const { client, workers } = makeClient({ initializationTimeoutMs: 20 })

    const initialization = client.initialize()
    expect(workers).toHaveLength(1)
    const initializationRejection = expect(initialization).rejects.toThrow(
      'Python runtime initialization timed out',
    )
    await vi.advanceTimersByTimeAsync(20)
    await initializationRejection
    expect(workers[0].terminated).toBe(true)

    const retry = client.initialize()
    expect(workers).toHaveLength(2)
    const retryRejection = expect(retry).rejects.toThrow(
      'Python judge was disposed',
    )
    client.dispose()
    await retryRejection
    expect(workers[1].terminated).toBe(true)
  })

  it('rejects invalid submissions before creating a worker', async () => {
    const { client, workers } = makeClient()
    await expect(
      client.run(baseAssessment, {
        kind: 'pythonCode',
        code: 'x'.repeat(baseAssessment.limits.maxSourceBytes + 1),
      }),
    ).resolves.toMatchObject({
      status: 'error',
      error: { category: 'validation' },
    })
    expect(workers).toHaveLength(0)
    client.dispose()
  })
})
