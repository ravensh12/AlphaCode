import type {
  AssessmentResponseV1,
  AssessmentV1,
  OrderAssessmentV1,
  OrderResponseV1,
  TraceInnerAssessmentResponseV1,
  TraceInnerAssessmentV1,
  TraceResponseV1,
} from '../types/assessment'

export function createInnerAssessmentResponse(
  assessment: TraceInnerAssessmentV1,
): TraceInnerAssessmentResponseV1 {
  switch (assessment.kind) {
    case 'singleChoice':
      return { kind: 'singleChoice', optionId: '' }
    case 'shortAnswer':
      return { kind: 'shortAnswer', answer: '' }
    case 'predict':
      return { kind: 'predict', answer: '' }
    case 'order':
      return {
        kind: 'order',
        itemIds: assessment.items.map(({ id }) => id),
      }
  }
}

export function createAssessmentResponse(
  assessment: AssessmentV1,
): AssessmentResponseV1 {
  switch (assessment.kind) {
    case 'singleChoice':
    case 'shortAnswer':
    case 'predict':
    case 'order':
      return createInnerAssessmentResponse(assessment)
    case 'trace':
      return {
        kind: 'trace',
        frames: assessment.frames.map((frame) => ({
          frameId: frame.id,
          response: createInnerAssessmentResponse(frame.assessment),
        })),
      }
    case 'pythonCode':
      return { kind: 'pythonCode', code: assessment.starterCode }
  }
}

export function traceFrameResponse(
  assessment: Extract<AssessmentV1, { kind: 'trace' }>,
  response: AssessmentResponseV1,
  frameIndex: number,
): TraceInnerAssessmentResponseV1 {
  const frame = assessment.frames[frameIndex] ?? assessment.frames[0]
  if (!frame) {
    throw new RangeError('Trace assessments must contain at least one frame')
  }
  if (response.kind === 'trace') {
    const submitted = response.frames.find(({ frameId }) => frameId === frame.id)
    if (submitted?.response.kind === frame.assessment.kind) {
      return submitted.response
    }
  }
  return createInnerAssessmentResponse(frame.assessment)
}

export function replaceTraceFrameResponse(
  assessment: Extract<AssessmentV1, { kind: 'trace' }>,
  response: AssessmentResponseV1,
  frameIndex: number,
  frameResponse: TraceInnerAssessmentResponseV1,
): TraceResponseV1 {
  const frame = assessment.frames[frameIndex] ?? assessment.frames[0]
  if (!frame) {
    throw new RangeError('Trace assessments must contain at least one frame')
  }
  const current =
    response.kind === 'trace'
      ? response
      : (createAssessmentResponse(assessment) as TraceResponseV1)
  const byFrame = new Map(
    current.frames.map((entry) => [entry.frameId, entry.response]),
  )
  byFrame.set(frame.id, frameResponse)
  return {
    kind: 'trace',
    frames: assessment.frames.map((assessmentFrame) => ({
      frameId: assessmentFrame.id,
      response:
        byFrame.get(assessmentFrame.id) ??
        createInnerAssessmentResponse(assessmentFrame.assessment),
    })),
  }
}

/** Keep submitted stable ids, then append missing items in content-supplied order. */
export function deterministicOrderIds(
  assessment: OrderAssessmentV1,
  response: OrderResponseV1,
): OrderAssessmentV1['correctOrderIds'] {
  const validIds = new Set(assessment.items.map(({ id }) => id))
  const seen = new Set<string>()
  const ordered = response.itemIds.filter((id) => {
    if (!validIds.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
  for (const { id } of assessment.items) {
    if (!seen.has(id)) ordered.push(id)
  }
  return ordered
}

export function moveOrderItem(
  itemIds: readonly OrderAssessmentV1['items'][number]['id'][],
  itemId: OrderAssessmentV1['items'][number]['id'],
  direction: -1 | 1,
): OrderAssessmentV1['correctOrderIds'] {
  const from = itemIds.indexOf(itemId)
  const to = from + direction
  if (from < 0 || to < 0 || to >= itemIds.length) return [...itemIds]
  const moved = [...itemIds]
  ;[moved[from], moved[to]] = [moved[to], moved[from]]
  return moved
}
