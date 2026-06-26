import { useEffect, useRef, useState } from 'react'
import { askTutor, type TutorContext, type TutorTurn } from '../../lib/aiTutor'
import './AiTutorPanel.css'

/**
 * Bit, the AI tutor. A Socratic helper that nudges while the learner is still
 * answering (it will not reveal the answer) and explains fully in review. Calls
 * the Supabase `ai-tutor` edge function; degrades to offline hints if the
 * function/key isn't configured.
 */
export function AiTutorPanel({ context }: { context: TutorContext }) {
  const [history, setHistory] = useState<TutorTurn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset the conversation when the question changes.
  useEffect(() => {
    setHistory([])
    setOffline(false)
  }, [context.prompt])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [history, loading])

  async function send(message: string) {
    const text = message.trim()
    if (!text || loading) return
    const nextHistory: TutorTurn[] = [...history, { role: 'student', text }]
    setHistory(nextHistory)
    setInput('')
    setLoading(true)
    const reply = await askTutor(context, history, text)
    setOffline(!reply.online)
    setHistory([...nextHistory, { role: 'tutor', text: reply.text }])
    setLoading(false)
  }

  return (
    <div className="tutor">
      <div className="tutor-head">
        <span className="tutor-avatar" aria-hidden="true">
          <span className="tutor-eye" />
        </span>
        <div className="tutor-id">
          <strong>Bit · AI Tutor</strong>
          <span className="tutor-sub">
            {context.answered ? 'Ask me to explain it' : "I'll nudge, not spoil"}
          </span>
        </div>
        {offline && <span className="tutor-badge" title="Running on built-in hints">offline</span>}
      </div>

      <div className="tutor-log" ref={scrollRef}>
        {history.length === 0 && (
          <p className="tutor-empty">
            Stuck? Ask me anything about this question and I&rsquo;ll help you think it through.
          </p>
        )}
        {history.map((turn, i) => (
          <div key={i} className={`tutor-turn is-${turn.role}`}>
            {turn.text}
          </div>
        ))}
        {loading && (
          <div className="tutor-turn is-tutor is-typing">
            <span /><span /><span />
          </div>
        )}
      </div>

      <div className="tutor-quick">
        <button type="button" onClick={() => send('Give me a hint to get started.')} disabled={loading}>
          Hint
        </button>
        <button type="button" onClick={() => send("I'm stuck — what should I think about first?")} disabled={loading}>
          I&rsquo;m stuck
        </button>
        {context.answered && (
          <button type="button" onClick={() => send('Explain why that is the answer.')} disabled={loading}>
            Explain
          </button>
        )}
      </div>

      <form
        className="tutor-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <input
          type="text"
          value={input}
          placeholder="Ask Bit…"
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
