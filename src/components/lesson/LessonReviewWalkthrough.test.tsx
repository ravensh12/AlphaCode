// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LessonStep } from '../../types/lesson'
import { LessonReviewWalkthrough } from './LessonReviewWalkthrough'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

function teachStep(id: string, prompt: string): LessonStep {
  return {
    id,
    type: 'concept',
    section: 'teach',
    prompt,
    code: [],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: { correct: '', incorrect: '' },
    conceptTags: [],
  }
}

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
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('LessonReviewWalkthrough', () => {
  it('walks all teaching slides then returns to the quiz (review mode)', async () => {
    const onDone = vi.fn()
    const steps = [
      teachStep('t1', 'First idea'),
      teachStep('t2', 'Second idea'),
    ]
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <LessonReviewWalkthrough
          steps={steps}
          title="Lesson"
          mode="review"
          onDone={onDone}
        />,
      )
    })

    expect(container.textContent).toContain('First idea')
    // Not done until the learner reaches the end of the walkthrough.
    clickButton(/next/i)
    expect(container.textContent).toContain('Second idea')
    expect(onDone).not.toHaveBeenCalled()

    clickButton(/back to the quiz/i)
    expect(onDone).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })

  it('labels the finish action as a restart in retake mode', async () => {
    const onDone = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <LessonReviewWalkthrough
          steps={[teachStep('t1', 'Only idea')]}
          title="Lesson"
          mode="retake"
          onDone={onDone}
        />,
      )
    })

    expect(container.textContent).toContain('Start the quiz again')
    clickButton(/start the quiz again/i)
    expect(onDone).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })

  it('hands control straight back when there is no teaching content', async () => {
    const onDone = vi.fn()
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <LessonReviewWalkthrough
          steps={[]}
          title="Lesson"
          mode="review"
          onDone={onDone}
        />,
      )
    })

    expect(onDone).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})
