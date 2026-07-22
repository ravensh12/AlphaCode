// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORCE_RETAKE_MESSAGE } from '../../hooks/useLessonEngine'
import { ForcedRetakePrompt, ReviewLessonPrompt } from './LessonReviewPrompts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

function clickButton(match: RegExp) {
  const button = [...container.querySelectorAll('button')].find((b) =>
    match.test(b.textContent ?? ''),
  )
  if (!button) throw new Error(`No button matching ${match}`)
  expect(button.getAttribute('type')).toBe('button')
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('ReviewLessonPrompt', () => {
  it('offers a "go back and review lesson" action and fires the callback', () => {
    const onReview = vi.fn()
    const root = createRoot(container)
    act(() => {
      root.render(<ReviewLessonPrompt onReview={onReview} />)
    })

    expect(container.textContent).toContain('Go back and review lesson')
    clickButton(/review lesson/i)
    expect(onReview).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})

describe('ForcedRetakePrompt', () => {
  it('explains the 3-miss retake and fires the retake callback', () => {
    const onRetake = vi.fn()
    const root = createRoot(container)
    act(() => {
      root.render(<ForcedRetakePrompt onRetake={onRetake} />)
    })

    expect(container.textContent).toContain(FORCE_RETAKE_MESSAGE)
    clickButton(/review the lesson/i)
    expect(onRetake).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})
