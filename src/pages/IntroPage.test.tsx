import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { IntroFinalCard } from './IntroPage'

function renderCard() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <IntroFinalCard />
    </MemoryRouter>,
  )
}

describe('IntroPage marketing', () => {
  it('states the exact complete-course scope', () => {
    const markup = renderCard()

    expect(markup).toContain('aria-label="Course scope: 150 missions, 18 topics, 6 realms"')
    expect(markup).toContain('<strong>150</strong><span>Missions</span>')
    expect(markup).toContain('<strong>18</strong><span>Topics</span>')
    expect(markup).toContain('<strong>6</strong><span>Realms</span>')
  })

  it('qualifies proficiency with every completion requirement', () => {
    const markup = renderCard()

    expect(markup).toContain(
      'Beat the full course to prove proficiency across NeetCode 150 patterns.',
    )
    expect(markup).toContain(
      'To beat AlphaCode: finish all 150 original missions, pass delayed retention checks, clear the assessment and boss in each of six realms, and pass the 18-topic Final Certification Trial.',
    )
  })

  it('makes no unconditional guarantee or affiliation claim', () => {
    const markup = renderCard()

    expect(markup).not.toMatch(/\bguarantee(?:d|s)?\b/iu)
    expect(markup).toContain(
      'AlphaCode is independent and not affiliated with NeetCode or LeetCode.',
    )
  })

  it('sends the intro CTA directly to the quest', () => {
    const markup = renderCard()

    expect(markup).toContain('href="/quest"')
    expect(markup).toContain('>Begin the quest<')
    expect(markup).not.toMatch(/placement/iu)
  })
})
