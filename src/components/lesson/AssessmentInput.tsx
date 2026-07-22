import type { KeyboardEvent } from 'react'
import type {
  AssessmentResponseV1,
  AssessmentV1,
  TraceInnerAssessmentResponseV1,
  TraceInnerAssessmentV1,
} from '../../types/assessment'
import {
  createAssessmentResponse,
  createInnerAssessmentResponse,
  deterministicOrderIds,
  moveOrderItem,
  replaceTraceFrameResponse,
  traceFrameResponse,
} from '../../lib/assessmentResponses'
import {
  PythonWorkbench,
  type PythonJudgeRunner,
} from './PythonWorkbench'
import type { PythonJudgeRunResult } from '../../workers/pythonJudgeProtocol'
import './AssessmentInput.css'

/** IDE wiring for pythonCode steps — optional so plain rendering still works. */
export type PythonAssessmentTooling = {
  /** Shared judge client used for pre-submit "Run code" against example cases. */
  runJudge?: PythonJudgeRunner
  /** Full judge result of the latest graded submission (never in exam mode). */
  submitResult?: PythonJudgeRunResult | null
  onRunningChange?: (running: boolean) => void
}

type AssessmentInputProps = {
  assessment: AssessmentV1
  response: AssessmentResponseV1
  onChange: (response: AssessmentResponseV1) => void
  disabled?: boolean
  /** Zero-based active frame when rendering a trace assessment. */
  activeFrameIndex?: number
  python?: PythonAssessmentTooling
}

type InnerInputProps = {
  assessment: TraceInnerAssessmentV1
  response: TraceInnerAssessmentResponseV1
  onChange: (response: TraceInnerAssessmentResponseV1) => void
  disabled: boolean
}

function domId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '-')
}

function InnerAssessmentInput({
  assessment,
  response,
  onChange,
  disabled,
}: InnerInputProps) {
  const baseId = `assessment-${domId(assessment.id)}`

  switch (assessment.kind) {
    case 'singleChoice': {
      const selected =
        response.kind === 'singleChoice' ? response.optionId : ''
      return (
        <fieldset className="assessment-fieldset" disabled={disabled}>
          <legend className="assessment-sr-only">{assessment.prompt}</legend>
          <div className="assessment-choice-list">
            {assessment.options.map((option) => {
              const optionId = `${baseId}-${domId(option.id)}`
              return (
                <label
                  className={`assessment-choice ${
                    selected === option.id ? 'selected' : ''
                  }`}
                  htmlFor={optionId}
                  key={option.id}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={`${baseId}-choice`}
                    value={option.id}
                    checked={selected === option.id}
                    disabled={disabled}
                    onChange={() =>
                      onChange({
                        kind: 'singleChoice',
                        optionId: option.id,
                      })
                    }
                  />
                  <span className="assessment-choice-marker" aria-hidden="true" />
                  <span className="assessment-choice-label">{option.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      )
    }

    case 'shortAnswer': {
      const answer = response.kind === 'shortAnswer' ? response.answer : ''
      const multiline = assessment.matcher.mode === 'exactLines'
      return (
        <div className="assessment-text-field">
          <label htmlFor={`${baseId}-answer`}>
            <span className="assessment-sr-only">{assessment.prompt}: </span>
            Your answer
          </label>
          {multiline ? (
            <textarea
              id={`${baseId}-answer`}
              value={answer}
              rows={4}
              placeholder={assessment.placeholder}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) =>
                onChange({ kind: 'shortAnswer', answer: event.target.value })
              }
            />
          ) : (
            <input
              id={`${baseId}-answer`}
              type="text"
              value={answer}
              placeholder={assessment.placeholder}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) =>
                onChange({ kind: 'shortAnswer', answer: event.target.value })
              }
            />
          )}
        </div>
      )
    }

    case 'predict': {
      const answer = response.kind === 'predict' ? response.answer : ''
      return (
        <div className="assessment-text-field">
          <label htmlFor={`${baseId}-prediction`}>
            <span className="assessment-sr-only">{assessment.prompt}: </span>
            Your prediction
          </label>
          <textarea
            id={`${baseId}-prediction`}
            value={answer}
            rows={assessment.matcher.mode === 'exactLines' ? 4 : 2}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onChange({ kind: 'predict', answer: event.target.value })
            }
          />
        </div>
      )
    }

    case 'order': {
      const orderResponse =
        response.kind === 'order'
          ? response
          : {
              kind: 'order' as const,
              itemIds: assessment.items.map(({ id }) => id),
            }
      const itemIds = deterministicOrderIds(assessment, orderResponse)
      const itemById = new Map(
        assessment.items.map((item) => [item.id, item]),
      )

      function move(itemId: (typeof itemIds)[number], direction: -1 | 1) {
        if (disabled) return
        onChange({
          kind: 'order',
          itemIds: moveOrderItem(itemIds, itemId, direction),
        })
      }

      function handleKeyDown(
        event: KeyboardEvent<HTMLLIElement>,
        itemId: (typeof itemIds)[number],
      ) {
        if (!event.altKey) return
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          move(itemId, -1)
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          move(itemId, 1)
        }
      }

      return (
        <div className="assessment-order">
          <p className="assessment-sr-only" id={`${baseId}-order-prompt`}>
            {assessment.prompt}
          </p>
          <p className="assessment-order-help" id={`${baseId}-order-help`}>
            Put the steps in order. Use the move buttons or Alt + arrow keys.
          </p>
          <ol
            className="assessment-order-list"
            aria-labelledby={`${baseId}-order-prompt`}
            aria-describedby={`${baseId}-order-help`}
          >
            {itemIds.map((itemId, index) => {
              const item = itemById.get(itemId)
              if (!item) return null
              return (
                <li
                  className="assessment-order-item"
                  key={item.id}
                  tabIndex={disabled ? -1 : 0}
                  aria-posinset={index + 1}
                  aria-setsize={itemIds.length}
                  onKeyDown={(event) => handleKeyDown(event, item.id)}
                >
                  <span className="assessment-order-position" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="assessment-order-label">{item.label}</span>
                  <span className="assessment-order-actions">
                    <button
                      type="button"
                      aria-label={`Move ${item.label} up`}
                      disabled={disabled || index === 0}
                      onClick={() => move(item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${item.label} down`}
                      disabled={disabled || index === itemIds.length - 1}
                      onClick={() => move(item.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )
    }
  }
}

export function AssessmentInput({
  assessment,
  response,
  onChange,
  disabled = false,
  activeFrameIndex = 0,
  python,
}: AssessmentInputProps) {
  if (assessment.kind === 'trace') {
    const boundedFrameIndex = Math.min(
      Math.max(0, activeFrameIndex),
      Math.max(0, assessment.frames.length - 1),
    )
    const frame = assessment.frames[boundedFrameIndex]
    if (!frame) {
      return (
        <p className="assessment-input-error" role="alert">
          This trace has no frames to answer.
        </p>
      )
    }
    const frameResponse = traceFrameResponse(
      assessment,
      response,
      boundedFrameIndex,
    )
    return (
      <div
        className="assessment-input assessment-trace-input"
        data-assessment-id={frame.assessment.id}
        data-frame-id={frame.id}
      >
        <InnerAssessmentInput
          assessment={frame.assessment}
          response={frameResponse}
          disabled={disabled}
          onChange={(nextResponse) =>
            onChange(
              replaceTraceFrameResponse(
                assessment,
                response,
                boundedFrameIndex,
                nextResponse,
              ),
            )
          }
        />
      </div>
    )
  }

  if (assessment.kind === 'pythonCode') {
    const code =
      response.kind === 'pythonCode'
        ? response.code
        : (createAssessmentResponse(assessment) as Extract<
            AssessmentResponseV1,
            { kind: 'pythonCode' }
          >).code
    return (
      <div
        className="assessment-input assessment-code-input"
        data-assessment-id={assessment.id}
      >
        <PythonWorkbench
          assessment={assessment}
          code={code}
          disabled={disabled}
          onChange={(nextCode) =>
            onChange({ kind: 'pythonCode', code: nextCode })
          }
          runJudge={python?.runJudge}
          submitResult={python?.submitResult}
          onRunningChange={python?.onRunningChange}
        />
      </div>
    )
  }

  const innerResponse =
    response.kind === assessment.kind
      ? response
      : createInnerAssessmentResponse(assessment)

  return (
    <div
      className="assessment-input"
      data-assessment-id={assessment.id}
    >
      <InnerAssessmentInput
        assessment={assessment}
        response={innerResponse}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  )
}
