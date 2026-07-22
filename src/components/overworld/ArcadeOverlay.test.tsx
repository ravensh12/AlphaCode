import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import arcadeSource from './ArcadeOverlay.tsx?raw'
import { ArcadeOverlay, type ArcadeOverlayProps } from './ArcadeOverlay'
import {
  advanceQuizChain,
  answerQuizChain,
  startQuizChain,
  timeoutQuizChain,
  type QuizChainQuestion,
} from './quizChain'

const SESSION: QuizChainQuestion[] = [
  {
    concept: 'arrays',
    prompt: 'nums = [4, 9, 2]; what is nums[0]?',
    choices: ['4', '9', '2', '0'],
    answerIndex: 0,
  },
  {
    concept: 'stacks',
    prompt: 'Push A, B — which pops first?',
    choices: ['A', 'B'],
    answerIndex: 1,
  },
  {
    concept: 'binarySearch',
    prompt: 'Each guess removes about…',
    choices: ['half', 'one item', 'nothing'],
    answerIndex: 0,
  },
]

function render(overrides: Partial<ArcadeOverlayProps> = {}) {
  return renderToStaticMarkup(
    <ArcadeOverlay
      session={SESSION}
      sessionsRemainingToday={2}
      onAnswer={() => undefined}
      onXp={() => undefined}
      onClose={() => undefined}
      {...overrides}
    />,
  )
}

describe('ArcadeOverlay', () => {
  it('renders the first question, progress dots, timer, and XP tally', () => {
    const html = render()
    expect(html).toContain('Pattern Arcade · 1/3')
    expect(html).toContain('nums = [4, 9, 2]; what is nums[0]?')
    expect((html.match(/arcade-dot[ "]/g) ?? []).length).toBe(3)
    expect(html).toContain('arcade-dot is-now')
    expect(html).toContain('20s') // soft timer starts at the shared constant
    expect(html).toContain('+0 XP')
    expect(html).toContain('2 sessions left today')
    // Choices are live buttons before the reveal.
    expect(html).not.toContain('disabled=""')
  })

  it('reveals with gentle timeout copy when the soft timer expires', () => {
    const timedOut = timeoutQuizChain(startQuizChain(), SESSION).state
    const html = render({ initialChain: timedOut })
    expect(html).toContain('Time! The answer is “4.”')
    expect(html).toContain('No rush')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Next')
  })

  it('shows correct/incorrect feedback states from the chain', () => {
    const right = answerQuizChain(startQuizChain(), SESSION, 0, 1_000).state
    expect(render({ initialChain: right })).toContain('Clean recall')

    const wrong = answerQuizChain(startQuizChain(), SESSION, 2, 1_000).state
    const html = render({ initialChain: wrong })
    expect(html).toContain('The answer is “4.”')
    expect(html).toContain('is-wrong')
  })

  it('renders the results card when the chain is done', () => {
    let chain = startQuizChain()
    for (const question of SESSION) {
      chain = answerQuizChain(chain, SESSION, question.answerIndex, 1_000).state
      chain = advanceQuizChain(chain, SESSION.length)
    }
    expect(chain.done).toBe(true)
    const html = render({ initialChain: chain })
    expect(html).toContain('3 / 3 recalled')
    expect(html).toContain('rescheduled')
    expect(html).toContain('Done')
  })

  it('empty session shows the friendly empty state with due-review pointers', () => {
    const html = render({
      session: [],
      duePointers: [
        { id: 'problem:two-sum', label: 'Retain Two Sum' },
        { id: 'concept:stacks', label: 'Stacks warm-up' },
      ],
    })
    expect(html).toContain('Nothing to replay yet')
    expect(html).toContain('Worth reviewing now')
    expect(html).toContain('Retain Two Sum')
    expect(html).toContain('Stacks warm-up')
    expect(html).toContain('Back to the city')
  })

  it('cap exhausted (and nothing running) shows the daily-cap copy', () => {
    const html = render({ session: [], sessionsRemainingToday: 0 })
    expect(html).toContain('All played out for today')
    expect(html).toContain('recharge overnight')
  })

  it('calls no progress APIs — rewards leave via injected callbacks only', () => {
    expect(arcadeSource).not.toMatch(/useProgress|ProgressContext/)
    expect(arcadeSource).not.toMatch(/usePlayerLevel|addXp\(/)
    expect(arcadeSource).not.toMatch(/recordConceptResult/)
    expect(arcadeSource).not.toMatch(/localStorage|sessionStorage/)
  })

  it('renders modal dialog semantics in every state', () => {
    // Live question, results, and empty state all carry aria-modal and the
    // focusable card the shared focus trap anchors to.
    let chain = startQuizChain()
    for (const question of SESSION) {
      chain = answerQuizChain(chain, SESSION, question.answerIndex, 1_000).state
      chain = advanceQuizChain(chain, SESSION.length)
    }
    for (const html of [
      render(),
      render({ initialChain: chain }),
      render({ session: [] }),
    ]) {
      expect(html).toContain('role="dialog"')
      expect(html).toContain('aria-modal="true"')
      expect(html).toContain('tabindex="-1"')
    }
  })

  it('wires the shared modal hook (initial focus, focus trap, Escape close)', () => {
    expect(arcadeSource).toContain("from './useModalOverlay'")
    expect(arcadeSource).toContain('useModalOverlay(props.onClose)')
    expect(arcadeSource).toContain('onKeyDown={modal.onKeyDown}')
    expect(arcadeSource).toContain('ref={modal.cardRef}')
  })
})
