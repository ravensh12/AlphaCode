import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { TutorChatMessage } from '../../lib/missionStash'
import {
  buildTutorMessages,
  isTutorConfigured,
  requestTutorReply,
  tutorErrorMessage,
  type TutorProblemContext,
} from '../../lib/tutorClient'
import { IconArrowRight, IconBolt } from '../icons'
import './TutorPanel.css'

/* ============================================================================
   Collapsible AI-tutor drawer for lesson/mission pages. Context (problem,
   current code, latest run result) is read fresh from `getContext` on every
   question, so answers always reference what's on screen right now. Replies
   stream in as they arrive. With no key configured the launcher stays as a
   subtle affordance and the panel explains itself in kid-friendly terms.
   ========================================================================== */

const EMPTY_HINT =
  'Stuck? Ask me anything about this problem — I give hints and explanations, not spoilers.'

export function TutorPanel({
  getContext,
  initialMessages,
  onMessagesChange,
}: {
  /** Fresh mission context, read at question time. */
  getContext: () => TutorProblemContext
  /** Restored session chat (from the mission stash). */
  initialMessages?: TutorChatMessage[]
  /** Fires whenever the chat history changes (for the mission stash). */
  onMessagesChange?: (messages: TutorChatMessage[]) => void
}) {
  const configured = isTutorConfigured()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<TutorChatMessage[]>(
    () => initialMessages ?? [],
  )
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const onMessagesChangeRef = useRef(onMessagesChange)
  onMessagesChangeRef.current = onMessagesChange

  useEffect(() => () => abortRef.current?.abort(), [])

  // Keep the newest message in view while replies stream in.
  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, pending, open])

  const commitMessages = useCallback((next: TutorChatMessage[]) => {
    setMessages(next)
    onMessagesChangeRef.current?.(next)
  }, [])

  const send = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const question = draft.trim()
      if (!question || pending != null || !configured) return
      setDraft('')
      setError(null)
      const withQuestion: TutorChatMessage[] = [
        ...messages,
        { role: 'user', content: question },
      ]
      commitMessages(withQuestion)
      setPending('')
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const reply = await requestTutorReply(
          buildTutorMessages(getContext(), messages, question),
          {
            signal: controller.signal,
            onDelta: (delta) => setPending((prev) => (prev ?? '') + delta),
          },
        )
        commitMessages([
          ...withQuestion,
          {
            role: 'assistant',
            content:
              reply.trim() ||
              'Hmm, I came up blank on that one. Try asking a different way?',
          },
        ])
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(tutorErrorMessage(requestError))
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setPending(null)
      }
    },
    [commitMessages, configured, draft, getContext, messages, pending],
  )

  // Portaled to <body>: lesson layouts use transformed/filtered ancestors,
  // which would otherwise turn position:fixed into ancestor-relative.
  return createPortal(
    <>
      <button
        type="button"
        className={`tutor-launcher ${configured ? '' : 'is-unavailable'} ${open ? 'is-open' : ''}`}
        aria-expanded={open}
        aria-controls="tutor-panel"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <IconBolt size={15} />
        Tutor
      </button>

      {open && (
        <aside id="tutor-panel" className="tutor-panel" aria-label="AI tutor">
          <header className="tutor-head">
            <div className="tutor-head-copy">
              <strong>Mission Tutor</strong>
              <span>Hints and explanations — not spoilers</span>
            </div>
            <button
              type="button"
              className="tutor-close"
              aria-label="Close tutor"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          {!configured ? (
            <div className="tutor-empty" role="note">
              {'The tutor isn\u2019t plugged in on this computer yet, so it can\u2019t answer questions right now. Everything else in the mission works normally!'}
            </div>
          ) : (
            <>
              <div className="tutor-log" ref={logRef}>
                {messages.length === 0 && pending == null && (
                  <div className="tutor-empty">{EMPTY_HINT}</div>
                )}
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`tutor-msg tutor-msg--${message.role}`}
                  >
                    {message.content}
                  </div>
                ))}
                {pending != null && (
                  <div className="tutor-msg tutor-msg--assistant is-pending">
                    {pending.length > 0 ? (
                      pending
                    ) : (
                      <span className="tutor-thinking" aria-label="Tutor is thinking">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                )}
                {error && (
                  <div className="tutor-error" role="alert">
                    {error}
                  </div>
                )}
              </div>

              <form className="tutor-composer" onSubmit={(e) => void send(e)}>
                <input
                  type="text"
                  value={draft}
                  placeholder="Ask about this problem…"
                  aria-label="Ask the tutor"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  aria-label="Send question"
                  disabled={pending != null || draft.trim().length === 0}
                >
                  <IconArrowRight size={16} />
                </button>
              </form>
            </>
          )}
        </aside>
      )}
    </>,
    document.body,
  )
}
