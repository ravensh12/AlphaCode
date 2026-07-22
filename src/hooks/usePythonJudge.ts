import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PythonCodeAssessmentV1,
  PythonCodeResponseV1,
} from '../types/assessment'
import {
  validatePythonJudgeSubmission,
  type PythonJudgePlanV1,
} from '../lib/pythonJudgeHarness'
import {
  PYTHON_JUDGE_PROTOCOL_VERSION,
  type PythonJudgeError,
  type PythonJudgeErrorCategory,
  type PythonJudgeRequest,
  type PythonJudgeResponse,
  type PythonJudgeRunResult,
  validatePythonJudgeResponse,
} from '../workers/pythonJudgeProtocol'

const DEFAULT_INITIALIZATION_TIMEOUT_MS = 30_000

type WorkerMessageEvent = { data: unknown }
type WorkerFailureEvent = { message?: string }
type WorkerListener = (event: WorkerMessageEvent | WorkerFailureEvent) => void

export type PythonJudgeWorkerLike = {
  postMessage(message: PythonJudgeRequest): void
  terminate(): void
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: WorkerListener,
  ): void
  removeEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: WorkerListener,
  ): void
}

export type PythonJudgeClientStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'error'

export type PythonJudgeClientSnapshot = {
  status: PythonJudgeClientStatus
  error: PythonJudgeError | null
}

export type PythonJudgeClientOptions = {
  workerFactory?: () => PythonJudgeWorkerLike
  initializationTimeoutMs?: number
  nonceFactory?: () => string
  now?: () => number
}

type PendingRequest = {
  nonce: string
  expectedType: 'initialized' | 'runResult'
  timer: ReturnType<typeof setTimeout>
  resolve: (response: PythonJudgeResponse) => void
  reject: (error: PythonJudgeClientFailure) => void
}

type WorkerBinding = {
  worker: PythonJudgeWorkerLike
  generation: number
  onMessage: WorkerListener
  onError: WorkerListener
  onMessageError: WorkerListener
}

class PythonJudgeClientFailure extends Error {
  readonly category: PythonJudgeErrorCategory

  constructor(category: PythonJudgeErrorCategory, message: string) {
    super(message)
    this.name = 'PythonJudgeClientFailure'
    this.category = category
  }
}

function defaultWorkerFactory(): PythonJudgeWorkerLike {
  return new Worker(
    new URL('../workers/pythonJudge.worker.ts', import.meta.url),
    {
      type: 'module',
      name: 'python-judge',
    },
  ) as unknown as PythonJudgeWorkerLike
}

function defaultNonceFactory(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function errorResult(
  assessmentId: PythonJudgePlanV1['id'],
  totalCases: number,
  error: PythonJudgeError,
  durationMs = 0,
): PythonJudgeRunResult {
  return {
    status: 'error',
    assessmentId,
    cases: [],
    passedCases: 0,
    totalCases,
    stdout: '',
    stderr: '',
    durationMs,
    memoryLimitEnforced: false,
    error,
  }
}

function eventMessage(
  event: WorkerMessageEvent | WorkerFailureEvent,
  fallback: string,
): string {
  return 'message' in event && typeof event.message === 'string' && event.message
    ? event.message.slice(0, 750)
    : fallback
}

export class PythonJudgeClient {
  private readonly workerFactory: () => PythonJudgeWorkerLike
  private readonly initializationTimeoutMs: number
  private readonly nonceFactory: () => string
  private readonly now: () => number
  private readonly pending = new Map<string, PendingRequest>()
  private readonly subscribers = new Set<
    (snapshot: PythonJudgeClientSnapshot) => void
  >()

  private binding: WorkerBinding | null = null
  private initializationPromise: Promise<void> | null = null
  private generation = 0
  private requestSequence = 0
  private activeRun = false
  private runtimeReady = false
  private disposed = false
  private snapshot: PythonJudgeClientSnapshot = {
    status: 'idle',
    error: null,
  }

  constructor(options: PythonJudgeClientOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory
    this.initializationTimeoutMs =
      options.initializationTimeoutMs ?? DEFAULT_INITIALIZATION_TIMEOUT_MS
    this.nonceFactory = options.nonceFactory ?? defaultNonceFactory
    this.now = options.now ?? (() => performance.now())

    if (
      !Number.isFinite(this.initializationTimeoutMs) ||
      this.initializationTimeoutMs <= 0
    ) {
      throw new RangeError('initializationTimeoutMs must be positive')
    }
  }

  getSnapshot(): PythonJudgeClientSnapshot {
    return this.snapshot
  }

  subscribe(
    subscriber: (snapshot: PythonJudgeClientSnapshot) => void,
  ): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  private setSnapshot(
    status: PythonJudgeClientStatus,
    error: PythonJudgeError | null = null,
  ): void {
    this.snapshot = { status, error }
    this.subscribers.forEach((subscriber) => subscriber(this.snapshot))
  }

  private nextEnvelope(): {
    protocolVersion: typeof PYTHON_JUDGE_PROTOCOL_VERSION
    requestId: string
    nonce: string
  } {
    this.requestSequence += 1
    return {
      protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
      requestId: `python:${this.generation}:${this.requestSequence}`,
      nonce: this.nonceFactory(),
    }
  }

  private ensureWorker(): WorkerBinding {
    if (this.disposed) {
      throw new PythonJudgeClientFailure(
        'internal',
        'Python judge client has been disposed',
      )
    }
    if (this.binding) return this.binding

    const worker = this.workerFactory()
    const generation = ++this.generation
    const onMessage: WorkerListener = (event) => {
      if (
        this.binding?.worker !== worker ||
        this.binding.generation !== generation ||
        !('data' in event)
      ) {
        return
      }
      this.handleMessage(event.data)
    }
    const onError: WorkerListener = (event) => {
      if (this.binding?.worker !== worker) return
      this.invalidateWorker(
        new PythonJudgeClientFailure(
          'workerCrash',
          eventMessage(event, 'Python worker crashed'),
        ),
      )
    }
    const onMessageError: WorkerListener = () => {
      if (this.binding?.worker !== worker) return
      this.invalidateWorker(
        new PythonJudgeClientFailure(
          'protocol',
          'Python worker sent an unreadable message',
        ),
      )
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.addEventListener('messageerror', onMessageError)
    this.binding = {
      worker,
      generation,
      onMessage,
      onError,
      onMessageError,
    }
    return this.binding
  }

  private handleMessage(data: unknown): void {
    const validation = validatePythonJudgeResponse(data)
    if (!validation.valid) {
      if (
        typeof data === 'object' &&
        data !== null &&
        'requestId' in data &&
        typeof data.requestId === 'string' &&
        this.pending.has(data.requestId)
      ) {
        this.invalidateWorker(
          new PythonJudgeClientFailure(
            'protocol',
            `Invalid Python worker response: ${validation.error}`,
          ),
        )
      }
      return
    }

    const response = validation.value
    const pending = this.pending.get(response.requestId)
    // Unknown ids and wrong nonces are stale or forged responses. Ignore them.
    if (!pending || pending.nonce !== response.nonce) return
    if (
      response.type !== 'error' &&
      response.type !== pending.expectedType
    ) {
      this.invalidateWorker(
        new PythonJudgeClientFailure(
          'protocol',
          `Unexpected Python worker response type "${response.type}"`,
        ),
      )
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(response.requestId)
    pending.resolve(response)
  }

  private sendRequest(
    message: PythonJudgeRequest,
    expectedType: PendingRequest['expectedType'],
    timeoutMs: number,
    timeoutCategory: PythonJudgeErrorCategory,
  ): Promise<PythonJudgeResponse> {
    const binding = this.ensureWorker()
    return new Promise<PythonJudgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(message.requestId)) return
        this.invalidateWorker(
          new PythonJudgeClientFailure(
            timeoutCategory,
            expectedType === 'initialized'
              ? 'Python runtime initialization timed out'
              : 'Python execution timed out',
          ),
        )
      }, timeoutMs)
      this.pending.set(message.requestId, {
        nonce: message.nonce,
        expectedType,
        timer,
        resolve,
        reject,
      })
      try {
        binding.worker.postMessage(message)
      } catch (error) {
        this.invalidateWorker(
          new PythonJudgeClientFailure(
            'workerCrash',
            error instanceof Error
              ? error.message
              : 'Could not send a message to the Python worker',
          ),
        )
      }
    })
  }

  private invalidateWorker(failure: PythonJudgeClientFailure): void {
    const binding = this.binding
    this.binding = null
    this.initializationPromise = null
    this.runtimeReady = false
    if (binding) {
      binding.worker.removeEventListener('message', binding.onMessage)
      binding.worker.removeEventListener('error', binding.onError)
      binding.worker.removeEventListener('messageerror', binding.onMessageError)
      binding.worker.terminate()
    }

    const pending = [...this.pending.values()]
    this.pending.clear()
    pending.forEach((request) => {
      clearTimeout(request.timer)
      request.reject(failure)
    })
    if (!this.disposed) {
      this.setSnapshot('error', {
        category: failure.category,
        message: failure.message,
      })
    }
  }

  async initialize(): Promise<void> {
    if (this.runtimeReady && this.binding) return
    if (this.initializationPromise) return this.initializationPromise

    this.setSnapshot('initializing')
    const envelope = this.nextEnvelope()
    const promise = this.sendRequest(
      { ...envelope, type: 'initialize' },
      'initialized',
      this.initializationTimeoutMs,
      'initialization',
    )
      .then((response) => {
        if (response.type === 'error') {
          const failure = new PythonJudgeClientFailure(
            response.error.category,
            response.error.message,
          )
          this.invalidateWorker(failure)
          throw failure
        }
        this.runtimeReady = true
        this.setSnapshot('ready')
      })
      .finally(() => {
        if (this.initializationPromise === promise) {
          this.initializationPromise = null
        }
      })
    this.initializationPromise = promise
    return promise
  }

  async run(
    assessment: PythonCodeAssessmentV1,
    response: PythonCodeResponseV1,
  ): Promise<PythonJudgeRunResult> {
    const validation = validatePythonJudgeSubmission(assessment, response)
    if (!validation.valid) {
      return errorResult(
        assessment.id,
        assessment.cases.length,
        {
          category: 'validation',
          message:
            validation.issues[0]?.message ?? 'Invalid Python judge submission',
        },
      )
    }
    if (this.activeRun) {
      return errorResult(
        validation.value.plan.id,
        validation.value.plan.cases.length,
        {
          category: 'validation',
          message: 'A Python submission is already running',
        },
      )
    }

    this.activeRun = true
    try {
      try {
        await this.initialize()
      } catch (error) {
        const failure =
          error instanceof PythonJudgeClientFailure
            ? error
            : new PythonJudgeClientFailure(
                'initialization',
                'Python runtime initialization failed',
              )
        return errorResult(
          validation.value.plan.id,
          validation.value.plan.cases.length,
          { category: failure.category, message: failure.message },
        )
      }

      this.setSnapshot('running')
      const startedAt = this.now()
      const envelope = this.nextEnvelope()
      try {
        const workerResponse = await this.sendRequest(
          {
            ...envelope,
            type: 'run',
            plan: validation.value.plan,
            response: validation.value.response,
          },
          'runResult',
          validation.value.plan.limits.timeoutMs,
          'timeout',
        )
        if (workerResponse.type === 'error') {
          if (
            workerResponse.error.category === 'internal' ||
            workerResponse.error.category === 'protocol'
          ) {
            this.invalidateWorker(
              new PythonJudgeClientFailure(
                workerResponse.error.category,
                workerResponse.error.message,
              ),
            )
          } else {
            this.setSnapshot('ready')
          }
          return errorResult(
            validation.value.plan.id,
            validation.value.plan.cases.length,
            workerResponse.error,
            this.now() - startedAt,
          )
        }
        if (workerResponse.type !== 'runResult') {
          const failure = new PythonJudgeClientFailure(
            'protocol',
            `Unexpected Python worker response type "${workerResponse.type}"`,
          )
          this.invalidateWorker(failure)
          return errorResult(
            validation.value.plan.id,
            validation.value.plan.cases.length,
            { category: failure.category, message: failure.message },
            this.now() - startedAt,
          )
        }
        if (
          workerResponse.result.assessmentId !== validation.value.plan.id
        ) {
          const failure = new PythonJudgeClientFailure(
            'protocol',
            'Python worker returned a result for another assessment',
          )
          this.invalidateWorker(failure)
          return errorResult(
            validation.value.plan.id,
            validation.value.plan.cases.length,
            { category: failure.category, message: failure.message },
            this.now() - startedAt,
          )
        }
        this.setSnapshot('ready')
        return workerResponse.result
      } catch (error) {
        const failure =
          error instanceof PythonJudgeClientFailure
            ? error
            : new PythonJudgeClientFailure(
                'workerCrash',
                'Python worker failed',
              )
        return errorResult(
          validation.value.plan.id,
          validation.value.plan.cases.length,
          { category: failure.category, message: failure.message },
          this.now() - startedAt,
        )
      }
    } finally {
      this.activeRun = false
    }
  }

  reset(): void {
    this.invalidateWorker(
      new PythonJudgeClientFailure('internal', 'Python judge was reset'),
    )
    if (!this.disposed) this.setSnapshot('idle')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.invalidateWorker(
      new PythonJudgeClientFailure('internal', 'Python judge was disposed'),
    )
    this.subscribers.clear()
  }
}

export type UsePythonJudgeResult = PythonJudgeClientSnapshot & {
  initialize(): Promise<void>
  run(
    assessment: PythonCodeAssessmentV1,
    response: PythonCodeResponseV1,
  ): Promise<PythonJudgeRunResult>
  reset(): void
}

export function usePythonJudge(
  options: PythonJudgeClientOptions = {},
): UsePythonJudgeResult {
  const clientRef = useRef<PythonJudgeClient | null>(null)
  if (!clientRef.current) clientRef.current = new PythonJudgeClient(options)
  const client = clientRef.current
  const [snapshot, setSnapshot] = useState(client.getSnapshot())
  const lifecycle = useRef({ effectGeneration: 0 }).current

  useEffect(() => {
    const generation = ++lifecycle.effectGeneration
    const unsubscribe = client.subscribe(setSnapshot)
    setSnapshot(client.getSnapshot())
    return () => {
      unsubscribe()
      queueMicrotask(() => {
        if (lifecycle.effectGeneration === generation) client.dispose()
      })
    }
  }, [client, lifecycle])

  const initialize = useCallback(() => client.initialize(), [client])
  const run = useCallback(
    (
      assessment: PythonCodeAssessmentV1,
      response: PythonCodeResponseV1,
    ) => client.run(assessment, response),
    [client],
  )
  const reset = useCallback(() => client.reset(), [client])

  return { ...snapshot, initialize, run, reset }
}
