import type { TutorChatMessage } from './missionStash'

/* ============================================================================
   AI tutor client — an OpenAI-compatible chat-completions caller.

   ⚠️ DEPLOYMENT SAFETY: everything configured here (including the API key)
   comes from VITE_ env vars, which Vite BAKES INTO THE CLIENT BUNDLE. This
   wiring is for LOCAL/PERSONAL use only. A public deployment must move the
   key behind a server-side proxy (same pattern as the phonics project's
   Vercel proxy) and point VITE_TUTOR_BASE_URL at that proxy instead.
   See README "AI tutor".

   The client is dependency-injected (fetch + env) so tests exercise context
   assembly, the unconfigured state, streaming, and error mapping without a
   network.
   ========================================================================== */

export const TUTOR_DEFAULT_BASE_URL = 'https://gateway.truefoundry.ai'
export const TUTOR_DEFAULT_MODEL = 'openai-group/gpt-5.4-mini'

export type TutorEnv = {
  VITE_TUTOR_BASE_URL?: string
  VITE_TUTOR_MODEL?: string
  VITE_TUTOR_API_KEY?: string
}

export type TutorConfig = {
  baseUrl: string
  model: string
  apiKey: string | null
}

function defaultEnv(): TutorEnv {
  try {
    return import.meta.env as TutorEnv
  } catch {
    return {}
  }
}

export function tutorConfig(env?: TutorEnv): TutorConfig {
  const e = env ?? defaultEnv()
  const baseUrl = (e.VITE_TUTOR_BASE_URL || TUTOR_DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  )
  return {
    baseUrl,
    model: e.VITE_TUTOR_MODEL || TUTOR_DEFAULT_MODEL,
    apiKey: e.VITE_TUTOR_API_KEY || null,
  }
}

/** No key → the tutor UI collapses to a subtle "unavailable" affordance. */
export function isTutorConfigured(env?: TutorEnv): boolean {
  return !!tutorConfig(env).apiKey
}

/* ------------------------------------------------------- prompt assembly -- */

export type TutorProblemContext = {
  problemTitle: string
  /** Current step's prompt / problem statement. */
  problemStatement: string
  /** The learner's current editor code (null on non-coding steps). */
  code: string | null
  /** Compact description of the latest run/submit outcome, if any. */
  runSummary: string | null
}

/**
 * The tutor's standing orders. Socratic by default: concepts, hints, and the
 * idea behind the failing line — never the full solution unless the learner
 * explicitly insists after already getting a hint.
 */
export const TUTOR_SYSTEM_PROMPT = [
  'You are the AlphaCode Tutor, a patient coding coach inside a game that',
  'teaches young coders Python through missions in Code City.',
  'How to help:',
  '- Be Socratic. Explain the concept, ask a guiding question, or give ONE',
  '  hint that points at the idea behind the bug — not the fixed code.',
  '- When a test fails, help them read it: what the input was, what came out,',
  '  what was expected, and which line\u2019s idea is most suspect.',
  '- Do NOT provide the full solution or a complete corrected function unless',
  '  the learner explicitly insists after already receiving at least one hint.',
  '  If they truly insist, walk through it step by step, explaining why each',
  '  part works — never a silent code dump.',
  '- Keep answers short (a few sentences, one idea at a time), friendly, and',
  '  encouraging. Use simple words; if you must use jargon, explain it.',
  '- Small code fragments (a line or two) to illustrate a concept are fine.',
  '- Stay on the mission topic. If asked something unrelated, gently steer',
  '  back to the problem.',
].join('\n')

/** History beyond this many messages is trimmed from the request. */
const MAX_HISTORY_MESSAGES = 12
const MAX_CODE_CHARS = 6_000
const MAX_STATEMENT_CHARS = 2_000

export type TutorWireMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…(trimmed)` : text
}

/**
 * Builds the full messages array for one tutor request: standing orders, a
 * fresh context block (problem + current code + latest run result), the
 * recent chat history, then the learner's new question.
 */
export function buildTutorMessages(
  context: TutorProblemContext,
  history: readonly TutorChatMessage[],
  question: string,
): TutorWireMessage[] {
  const contextLines = [
    `Problem: ${context.problemTitle}`,
    '',
    clip(context.problemStatement, MAX_STATEMENT_CHARS),
  ]
  if (context.code != null && context.code.trim().length > 0) {
    contextLines.push(
      '',
      "Learner's current code (solution.py):",
      '```python',
      clip(context.code, MAX_CODE_CHARS),
      '```',
    )
  }
  if (context.runSummary) {
    contextLines.push('', 'Latest run result:', context.runSummary)
  }

  return [
    { role: 'system', content: TUTOR_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Current mission context (refreshed on every question):\n\n${contextLines.join('\n')}`,
    },
    ...history.slice(-MAX_HISTORY_MESSAGES).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: question },
  ]
}

/* -------------------------------------------------------------- transport -- */

export class TutorRequestError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'TutorRequestError'
    this.status = status
  }
}

export type TutorRequestOptions = {
  /** Streaming callback — receives each content delta as it arrives. */
  onDelta?: (delta: string) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  env?: TutorEnv
}

/**
 * Sends one chat request and resolves with the full assistant reply.
 * Streams (SSE) when the response body is readable; otherwise falls back to
 * parsing a plain JSON completion.
 */
export async function requestTutorReply(
  messages: TutorWireMessage[],
  options: TutorRequestOptions = {},
): Promise<string> {
  const config = tutorConfig(options.env)
  if (!config.apiKey) {
    throw new TutorRequestError('Tutor is not configured', null)
  }
  const doFetch = options.fetchImpl ?? fetch
  const response = await doFetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new TutorRequestError(
      `Tutor request failed (${response.status})`,
      response.status,
    )
  }

  const contentType = response.headers?.get?.('content-type') ?? ''
  if (response.body && contentType.includes('text/event-stream')) {
    return readSseStream(response.body, options.onDelta)
  }

  // Non-streaming fallback (gateways that ignore `stream`, and test mocks).
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = payload.choices?.[0]?.message?.content ?? ''
  if (content && options.onDelta) options.onDelta(content)
  return content
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta?: (delta: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return full
      try {
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[]
        }
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta?.(delta)
        }
      } catch {
        /* keep-alive / partial frame — skip */
      }
    }
  }
  return full
}

/* ---------------------------------------------------------- error mapping -- */

/** Kid-appropriate error copy for anything the request can throw. */
export function tutorErrorMessage(error: unknown): string {
  if (error instanceof TutorRequestError) {
    if (error.status === 401 || error.status === 403) {
      return 'The tutor key on this computer isn\u2019t working. Ask a grown-up to check the setup.'
    }
    if (error.status === 429) {
      return 'The tutor is catching its breath — wait a few seconds and ask again.'
    }
    if (error.status != null && error.status >= 500) {
      return 'The tutor\u2019s brain server hiccuped. Try asking again in a moment.'
    }
    if (error.status == null) {
      return 'The tutor isn\u2019t set up on this computer yet.'
    }
    return 'The tutor couldn\u2019t answer that one. Try asking again.'
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'That answer was cancelled.'
  }
  return 'The tutor couldn\u2019t connect. Check your internet and try again.'
}
