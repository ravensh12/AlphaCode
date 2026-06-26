// Supabase Edge Function: ai-tutor
// Proxies chat requests to OpenAI so the OpenAI API key stays server-side.
//
// Deploy:
//   supabase functions deploy ai-tutor --no-verify-jwt
//   supabase secrets set OPENAI_API_KEY=sk-...   (use a freshly rotated key)
//
// The client calls this via supabase.functions.invoke('ai-tutor', { body }).
//
// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  (this file runs on Deno in Supabase, not in the Vite/TS app build)

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const MODEL = Deno.env.get('AI_TUTOR_MODEL') ?? 'gpt-4o-mini'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type TutorTurn = { role: 'student' | 'tutor'; text: string }
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY is not configured' }, 500)
  }

  let payload: {
    system?: string
    context?: TutorContext
    history?: TutorTurn[]
    message?: string
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { system, context, history = [], message } = payload
  if (!message || typeof message !== 'string') {
    return json({ error: 'Missing message' }, 400)
  }

  const ctxLines: string[] = []
  if (context?.concept) ctxLines.push(`Concept: ${context.concept}`)
  if (context?.prompt) ctxLines.push(`Question: ${context.prompt}`)
  if (context?.code?.length) ctxLines.push(`Code:\n${context.code.join('\n')}`)
  if (context?.hint) ctxLines.push(`Built-in hint (you may build on this): ${context.hint}`)
  ctxLines.push(
    context?.answered
      ? 'The student has ALREADY answered — review mode: you may fully explain.'
      : 'The student is STILL answering — do NOT reveal the answer; nudge only.',
  )

  const messages = [
    { role: 'system', content: system ?? 'You are a helpful, Socratic coding tutor.' },
    { role: 'system', content: ctxLines.join('\n') },
    ...history.slice(-8).map((t) => ({
      role: t.role === 'student' ? 'user' : 'assistant',
      content: t.text,
    })),
    { role: 'user', content: message },
  ]

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.5,
        max_tokens: 220,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      return json({ error: 'OpenAI request failed', detail }, 502)
    }

    const data = await res.json()
    const reply: string = data?.choices?.[0]?.message?.content?.trim() ?? ''
    return json({ reply })
  } catch (err) {
    return json({ error: 'Upstream error', detail: String(err) }, 502)
  }
})
