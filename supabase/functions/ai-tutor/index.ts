// Supabase Edge Function: ai-tutor
// Proxies chat requests to an OpenAI-compatible provider so the provider API
// key stays server-side and never ships in the client bundle.
//
// Deploy:
//   supabase functions deploy ai-tutor --no-verify-jwt
//
// Secrets (set at least the key):
//   supabase secrets set AI_TUTOR_API_KEY=...          # or OPENAI_API_KEY
//   supabase secrets set AI_TUTOR_BASE_URL=https://... # default api.openai.com
//   supabase secrets set AI_TUTOR_MODEL=gpt-4o-mini
//
// Verify a deployment without a chat round-trip:
//   GET /functions/v1/ai-tutor  ->  { ok, hasKey, baseUrl, model }
//
// Two request shapes are accepted:
//   1. { messages: [{ role, content }, ...] }        — pre-built (lesson tutor)
//   2. { system, context, history, message }         — assembled here (Bit)
//
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  (this file runs on Deno in Supabase, not in the Vite/TS app build)

// A single key name would strand whichever one the project happens to have set,
// so both are accepted; AI_TUTOR_API_KEY wins when both exist.
const API_KEY =
  Deno.env.get('AI_TUTOR_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? ''
const BASE_URL = (
  Deno.env.get('AI_TUTOR_BASE_URL') ?? 'https://api.openai.com'
).replace(/\/+$/, '')
const MODEL = Deno.env.get('AI_TUTOR_MODEL') ?? 'gpt-4o-mini'
// Sampling knobs stay opt-in: several newer models reject `temperature` or
// require `max_completion_tokens` instead, and a hardcoded pair turns a working
// key into an opaque 400.
const TEMPERATURE = Deno.env.get('AI_TUTOR_TEMPERATURE')
const MAX_TOKENS = Deno.env.get('AI_TUTOR_MAX_TOKENS')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type TutorTurn = { role: 'student' | 'tutor'; text: string }
type WireMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type TutorContext = {
  prompt?: string
  code?: string[]
  concept?: string
  hint?: string
  answered?: boolean
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Builds the messages array for the {system, context, history, message} shape. */
function assembleMessages(
  system: string | undefined,
  context: TutorContext | undefined,
  history: TutorTurn[],
  message: string,
): WireMessage[] {
  const ctxLines: string[] = []
  if (context?.concept) ctxLines.push(`Concept: ${context.concept}`)
  if (context?.prompt) ctxLines.push(`Question: ${context.prompt}`)
  if (context?.code?.length) ctxLines.push(`Code:\n${context.code.join('\n')}`)
  if (context?.hint) {
    ctxLines.push(`Built-in hint (you may build on this): ${context.hint}`)
  }
  ctxLines.push(
    context?.answered
      ? 'The student has ALREADY answered — review mode: you may fully explain.'
      : 'The student is STILL answering — do NOT reveal the answer; nudge only.',
  )

  return [
    {
      role: 'system',
      content: system ?? 'You are a helpful, Socratic coding tutor.',
    },
    { role: 'system', content: ctxLines.join('\n') },
    ...history.slice(-8).map((turn) => ({
      role: turn.role === 'student' ? 'user' : 'assistant',
      content: turn.text,
    })),
    { role: 'user', content: message },
  ]
}

function isWireMessages(value: unknown): value is WireMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) =>
        m &&
        typeof m === 'object' &&
        typeof (m as WireMessage).role === 'string' &&
        typeof (m as WireMessage).content === 'string',
    )
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Config probe: lets a deployment be verified (key present? which provider?)
  // without spending a token or leaking the key itself.
  if (req.method === 'GET') {
    return json({ ok: true, hasKey: API_KEY.length > 0, baseUrl: BASE_URL, model: MODEL })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!API_KEY) {
    return json(
      {
        error:
          'No provider key configured. Run: supabase secrets set AI_TUTOR_API_KEY=...',
      },
      500,
    )
  }

  let payload: {
    system?: string
    context?: TutorContext
    history?: TutorTurn[]
    message?: string
    messages?: WireMessage[]
    model?: string
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  let messages: WireMessage[]
  if (isWireMessages(payload.messages)) {
    messages = payload.messages
  } else if (payload.message && typeof payload.message === 'string') {
    messages = assembleMessages(
      payload.system,
      payload.context,
      payload.history ?? [],
      payload.message,
    )
  } else {
    return json({ error: 'Missing `messages` array or `message` string' }, 400)
  }

  const body: Record<string, unknown> = { model: MODEL, messages }
  if (TEMPERATURE != null) body.temperature = Number(TEMPERATURE)
  if (MAX_TOKENS != null) body.max_tokens = Number(MAX_TOKENS)

  try {
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const detail = await res.text()
      // Auth and rate-limit statuses are passed through so the client can show
      // the right message ("key isn't working" vs "catching its breath")
      // instead of collapsing every upstream problem into one 502.
      const status =
        res.status === 401 || res.status === 403 || res.status === 429
          ? res.status
          : 502
      return json({ error: 'Provider request failed', status: res.status, detail }, status)
    }

    const data = await res.json()
    const reply: string = data?.choices?.[0]?.message?.content?.trim() ?? ''
    return json({ reply })
  } catch (err) {
    return json({ error: 'Upstream error', detail: String(err) }, 502)
  }
})
