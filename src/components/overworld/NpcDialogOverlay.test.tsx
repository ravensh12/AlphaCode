import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import npcSource from './NpcDialogOverlay.tsx?raw'
import { NpcDialogOverlay, type NpcDialogOverlayProps } from './NpcDialogOverlay'
import { districtQuestionChain } from '../../content/districtQuestions'
import {
  NPC_STREAK_BONUS_XP,
  advanceQuizChain,
  answerQuizChain,
  startQuizChain,
} from './quizChain'

const QUESTIONS = districtQuestionChain('stack')
const RULES = { streakBonusXp: NPC_STREAK_BONUS_XP }

function render(overrides: Partial<NpcDialogOverlayProps> = {}) {
  return renderToStaticMarkup(
    <NpcDialogOverlay
      npcName="Moss"
      districtTitle="Stack City"
      questions={QUESTIONS}
      onAnswer={() => undefined}
      onXp={() => undefined}
      onClose={() => undefined}
      {...overrides}
    />,
  )
}

describe('NpcDialogOverlay', () => {
  it('renders the 3-question chain header, dots, and streak chip', () => {
    const html = render()
    expect(html).toContain('Stack City · Moss')
    expect(html).toContain(QUESTIONS[0].prompt)
    expect((html.match(/npc-dot[ "]/g) ?? []).length).toBe(3)
    expect(html).toContain('Streak ×0')
    expect(html).toContain('+0 XP')
  })

  it('displays the streak bonus while consecutive answers land', () => {
    let chain = startQuizChain()
    chain = answerQuizChain(chain, QUESTIONS, QUESTIONS[0].answerIndex, 900, RULES).state
    chain = advanceQuizChain(chain, QUESTIONS.length)
    chain = answerQuizChain(chain, QUESTIONS, QUESTIONS[1].answerIndex, 900, RULES).state

    const html = render({ initialChain: chain })
    expect(html).toContain('Streak ×2')
    expect(html).toContain(`+${NPC_STREAK_BONUS_XP} bonus XP flowing`)
    expect(html).toContain('npc-chip-streak')
    expect(html).toContain('Exactly right — the district approves.')
  })

  it('finishes with a perfect-chain celebration and best-streak readout', () => {
    let chain = startQuizChain()
    for (const question of QUESTIONS) {
      chain = answerQuizChain(chain, QUESTIONS, question.answerIndex, 900, RULES).state
      chain = advanceQuizChain(chain, QUESTIONS.length)
    }
    expect(chain.done).toBe(true)
    const html = render({ initialChain: chain })
    expect(html).toContain('3 / 3')
    expect(html).toContain('perfect chain!')
    expect(html).toContain('Best streak ×3')
    expect(html).toContain('Wave goodbye')
  })

  it('shows gentle copy after a miss', () => {
    const wrongIndex = (QUESTIONS[0].answerIndex + 1) % QUESTIONS[0].choices.length
    const chain = answerQuizChain(startQuizChain(), QUESTIONS, wrongIndex, 900, RULES).state
    const html = render({ initialChain: chain })
    expect(html).toContain('Close! It’s')
    expect(html).toContain('You’ll nail it next pass.')
  })

  it('calls no progress APIs — rewards leave via injected callbacks only', () => {
    expect(npcSource).not.toMatch(/useProgress|ProgressContext/)
    expect(npcSource).not.toMatch(/usePlayerLevel|addXp\(/)
    expect(npcSource).not.toMatch(/recordConceptResult/)
    expect(npcSource).not.toMatch(/localStorage|sessionStorage/)
  })

  it('renders modal dialog semantics on both the chat and result states', () => {
    let chain = startQuizChain()
    for (const question of QUESTIONS) {
      chain = answerQuizChain(chain, QUESTIONS, question.answerIndex, 900, RULES).state
      chain = advanceQuizChain(chain, QUESTIONS.length)
    }
    for (const html of [render(), render({ initialChain: chain })]) {
      expect(html).toContain('role="dialog"')
      expect(html).toContain('aria-modal="true"')
      expect(html).toContain('tabindex="-1"')
    }
  })

  it('wires the shared modal hook (initial focus, focus trap, Escape close)', () => {
    expect(npcSource).toContain("from './useModalOverlay'")
    expect(npcSource).toContain('useModalOverlay(props.onClose)')
    expect(npcSource).toContain('onKeyDown={modal.onKeyDown}')
    expect(npcSource).toContain('ref={modal.cardRef}')
  })
})
