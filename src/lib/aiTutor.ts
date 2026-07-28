/**
 * AI tutor client. Calls a Supabase Edge Function (`ai-tutor`) that proxies
 * OpenAI server-side, so the OpenAI key NEVER ships to the browser.
 *
 * Security model:
 *  - The OpenAI key lives only in the edge function's secrets (`OPENAI_API_KEY`).
 *  - The browser calls the function through the Supabase client, which attaches
 *    the project anon key + the signed-in user's JWT automatically.
 *  - If Supabase / the function isn't configured, we degrade gracefully to an
 *    offline Socratic hint built from the question itself — the trial still works.
 *
 * Deploy (one time):
 *   supabase functions deploy ai-tutor --no-verify-jwt
 *   supabase secrets set OPENAI_API_KEY=sk-...   # the rotated key, never committed
 */

import { supabase } from './supabaseClient'

export type TutorRole = 'student' | 'tutor'
export type TutorTurn = { role: TutorRole; text: string }

export type TutorContext = {
  /** The question stem the learner is working on. */
  prompt: string
  /** Optional code shown with the question. */
  code?: string[]
  /** Concept label, e.g. "Binary Search". */
  concept: string
  /** The built-in scaffold hint for this question (the tutor can build on it). */
  hint: string
  /** Whether the learner has already answered (review mode lets the tutor reveal more). */
  answered: boolean
}

export type TutorReply = {
  text: string
  /** True when the answer came from the live model; false for the offline fallback. */
  online: boolean
  /** Why the fallback kicked in — shown on the "offline" badge, and logged. */
  reason?: string
}

const SYSTEM_PROMPT = `You are "Bit", a warm, encouraging coding tutor inside a learning game for beginners.
You help a student as they learn, quiz, and review these topics: arrays & loops, strings, hash maps, two pointers, stacks, and binary search.

RULES:
- Be Socratic. NEVER reveal the final answer or the exact value/letter to pick while the student is still answering. Guide their thinking with a question or a small nudge.
- Once the student has already answered (review mode), you MAY explain the full reasoning clearly.
- Keep replies short: 2-4 sentences, friendly, concrete. Use plain language a 12-year-old understands.
- Refer to the specific code or numbers in front of them when helpful.
- If they're stuck, suggest the very next thinking step, not the destination.`

function offlineFallback(ctx: TutorContext): string {
  if (ctx.answered) {
    return `Here's the idea behind ${ctx.concept}: ${ctx.hint} Re-read the prompt with that in mind and the answer should click.`
  }
  return `Let's think it through together. ${ctx.hint} What does that tell you about the very next step?`
}

/**
 * `functions.invoke` rejects with a FunctionsHttpError whose readable body sits
 * on `context` (a Response). Without unwrapping it, a broken deployment looks
 * identical to a missing one — both just say "FunctionsHttpError".
 */
async function describeInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    const status = context.status
    try {
      const body = (await context.clone().json()) as {
        error?: string
        detail?: string
      }
      const parts = [body.error, body.detail].filter(Boolean)
      if (parts.length > 0) return `${status}: ${parts.join(' — ')}`
    } catch {
      /* non-JSON error body */
    }
    return `HTTP ${status}`
  }
  return error instanceof Error ? error.message : String(error)
}

export async function askTutor(
  ctx: TutorContext,
  history: TutorTurn[],
  studentMessage: string,
): Promise<TutorReply> {
  if (!supabase) {
    const reason = 'Supabase is not configured in this build'
    console.warn(`[ai-tutor] offline hints: ${reason}`)
    return { text: offlineFallback(ctx), online: false, reason }
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai-tutor', {
      body: {
        system: SYSTEM_PROMPT,
        context: ctx,
        history,
        message: studentMessage,
      },
    })
    if (error) throw error
    const reply = (data as { reply?: string } | null)?.reply
    if (typeof reply === 'string' && reply.trim()) {
      return { text: reply.trim(), online: true }
    }
    const reason = 'the ai-tutor function returned an empty reply'
    console.warn(`[ai-tutor] offline hints: ${reason}`)
    return { text: offlineFallback(ctx), online: false, reason }
  } catch (error) {
    const reason = await describeInvokeError(error)
    console.warn(`[ai-tutor] offline hints: ${reason}`)
    return { text: offlineFallback(ctx), online: false, reason }
  }
}
