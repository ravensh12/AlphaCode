import type {
  AnswerMatcherV1,
  AssessmentId,
  AssessmentV1,
  PythonValueCodecV1,
  TraceInnerAssessmentV1,
} from '../../types/assessment'
import { ASSESSMENT_SCHEMA_VERSION } from '../../types/assessment'
import type { CurriculumManifest, SkillId } from '../../types/curriculum'
import type { DiagramSpec, DiagramValue } from '../../types/diagram'
import type {
  Lesson,
  LessonStep,
  TraceFrame,
  VariableValue,
} from '../../types/lesson'
import {
  PROBLEM_LESSON_SCHEMA_VERSION,
  type ProblemLessonAssessmentStepV1,
  type ProblemLessonContentRef,
  type ProblemLessonSpecV1,
  type ProblemLessonStepV1,
  type ProblemLessonVariantId,
  type ProblemLessonVariantV1,
} from '../../types/problemLesson'
import {
  createSeededRandom,
  seededShuffle,
  type SeedValue,
} from '../../lib/seededRandom'

export const PROBLEM_LESSON_LIMITS = {
  variants: 16,
  assessments: 64,
  diagramSequence: 32,
  sequenceValues: 256,
  diagramNodes: 256,
  diagramEdges: 512,
  gridRows: 64,
  gridColumns: 64,
  gridCells: 4_096,
  recursionFrames: 128,
  bitRows: 16,
  bitWidth: 256,
  traceCodeLines: 500,
  traceFrames: 64,
  predictCodeLines: 200,
  pythonCases: 64,
  pythonArguments: 16,
  pythonCodecDepth: 8,
  pythonCaseBytes: 65_536,
  pythonPlanBytes: 262_144,
  pythonTimeoutMs: 5_000,
  pythonMemoryMb: 256,
  pythonOutputBytes: 65_536,
  pythonSourceBytes: 100_000,
  specBytes: 1_000_000,
} as const

const ASSESSMENT_EVIDENCE_KINDS = new Set([
  'acquisition',
  'independent-transfer',
  'delayed-retrieval',
  'code-tests',
])

export type ProblemLessonValidationIssue = {
  path: string
  code: string
  message: string
}

export type ProblemLessonValidationResult =
  | {
      valid: true
      issues: readonly []
    }
  | {
      valid: false
      issues: readonly ProblemLessonValidationIssue[]
    }

export type CompileProblemLessonOptions = {
  seed?: SeedValue
  variantId?: ProblemLessonVariantId
}

export class ProblemLessonValidationError extends Error {
  readonly issues: readonly ProblemLessonValidationIssue[]

  constructor(issues: readonly ProblemLessonValidationIssue[]) {
    super(
      `Invalid problem lesson:\n${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('\n')}`,
    )
    this.name = 'ProblemLessonValidationError'
    this.issues = issues
  }
}

type AddIssue = (
  path: string,
  code: string,
  message: string,
) => void

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function safePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function validIndex(value: unknown, length: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < length
}

function validateIndex(
  value: unknown,
  length: number,
  path: string,
  addIssue: AddIssue,
): void {
  if (!validIndex(value, length)) {
    addIssue(path, 'diagram.index', `must be an integer between 0 and ${length - 1}`)
  }
}

function validateUniqueStrings(
  values: readonly string[],
  path: string,
  addIssue: AddIssue,
): Set<string> {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (!nonEmpty(value)) {
      addIssue(`${path}[${index}]`, 'id.empty', 'must be a non-empty string')
    } else if (seen.has(value)) {
      addIssue(`${path}[${index}]`, 'id.duplicate', `duplicate id "${value}"`)
    }
    seen.add(value)
  })
  return seen
}

function validateReferences(
  values: readonly (string | null | undefined)[],
  ids: ReadonlySet<string>,
  path: string,
  addIssue: AddIssue,
): void {
  values.forEach((value, index) => {
    if (value != null && !ids.has(value)) {
      addIssue(
        `${path}[${index}]`,
        'diagram.reference',
        `references unknown id "${value}"`,
      )
    }
  })
}

function validateDiagramValue(
  value: DiagramValue,
  path: string,
  addIssue: AddIssue,
): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    addIssue(path, 'diagram.number', 'must be a finite number')
  }
}

function validateGridCoordinates(
  coordinates: readonly { row: number; column: number }[] | undefined,
  rows: number,
  columns: number,
  path: string,
  addIssue: AddIssue,
): void {
  coordinates?.forEach((coordinate, index) => {
    validateIndex(coordinate.row, rows, `${path}[${index}].row`, addIssue)
    validateIndex(
      coordinate.column,
      columns,
      `${path}[${index}].column`,
      addIssue,
    )
  })
}

function collectTreeChildren(diagram: Extract<DiagramSpec, { kind: 'tree' }>): string[] {
  if (diagram.variant === 'binary') {
    return diagram.nodes.flatMap((node) =>
      [node.left, node.right].filter((id): id is string => id != null),
    )
  }
  if (diagram.variant === 'trie') {
    return diagram.nodes.flatMap((node) =>
      (node.children ?? []).map(({ nodeId }) => nodeId),
    )
  }
  return []
}

function validateAcyclicReferences(
  references: ReadonlyMap<string, readonly string[]>,
  path: string,
  addIssue: AddIssue,
  allowSelfReferences = false,
): void {
  const state = new Map<string, 'visiting' | 'visited'>()
  let reported = false

  const visit = (id: string): void => {
    if (state.get(id) === 'visited' || reported) return
    if (state.get(id) === 'visiting') {
      addIssue(path, 'diagram.cycle', 'references must not contain a cycle')
      reported = true
      return
    }
    state.set(id, 'visiting')
    for (const next of references.get(id) ?? []) {
      if (allowSelfReferences && next === id) continue
      visit(next)
    }
    state.set(id, 'visited')
  }

  references.forEach((_children, id) => visit(id))
}

export function validateDiagramSpec(
  diagram: DiagramSpec,
  rootPath = 'diagram',
): readonly ProblemLessonValidationIssue[] {
  const issues: ProblemLessonValidationIssue[] = []
  const addIssue: AddIssue = (path, code, message) => {
    issues.push({ path, code, message })
  }

  switch (diagram.kind) {
    case 'array': {
      if (diagram.values.length > PROBLEM_LESSON_LIMITS.sequenceValues) {
        addIssue(rootPath, 'diagram.size', 'array exceeds the value cap')
      }
      diagram.values.forEach((value, index) => {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          addIssue(`${rootPath}.values[${index}]`, 'diagram.number', 'must be finite')
        }
      })
      if (diagram.highlight != null) {
        validateIndex(
          diagram.highlight,
          diagram.values.length,
          `${rootPath}.highlight`,
          addIssue,
        )
      }
      diagram.pointers?.forEach((pointer, index) => {
        validateIndex(
          pointer.index,
          diagram.values.length,
          `${rootPath}.pointers[${index}].index`,
          addIssue,
        )
        if (!nonEmpty(pointer.label)) {
          addIssue(
            `${rootPath}.pointers[${index}].label`,
            'diagram.label',
            'must not be empty',
          )
        }
      })
      diagram.visited?.forEach((index, itemIndex) =>
        validateIndex(
          index,
          diagram.values.length,
          `${rootPath}.visited[${itemIndex}]`,
          addIssue,
        ),
      )
      break
    }
    case 'string': {
      if (diagram.chars.length > PROBLEM_LESSON_LIMITS.sequenceValues) {
        addIssue(rootPath, 'diagram.size', 'string exceeds the character cap')
      }
      diagram.pointers?.forEach((pointer, index) =>
        validateIndex(
          pointer.index,
          diagram.chars.length,
          `${rootPath}.pointers[${index}].index`,
          addIssue,
        ),
      )
      diagram.visited?.forEach((index, itemIndex) =>
        validateIndex(
          index,
          diagram.chars.length,
          `${rootPath}.visited[${itemIndex}]`,
          addIssue,
        ),
      )
      break
    }
    case 'hashmap': {
      if (diagram.entries.length > PROBLEM_LESSON_LIMITS.sequenceValues) {
        addIssue(rootPath, 'diagram.size', 'hash map exceeds the entry cap')
      }
      validateUniqueStrings(
        diagram.entries.map(({ key }) => key),
        `${rootPath}.entries.key`,
        addIssue,
      )
      diagram.entries.forEach((entry, index) => {
        if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) {
          addIssue(
            `${rootPath}.entries[${index}].value`,
            'diagram.number',
            'must be finite',
          )
        }
      })
      break
    }
    case 'stack':
      if (diagram.items.length > PROBLEM_LESSON_LIMITS.sequenceValues) {
        addIssue(rootPath, 'diagram.size', 'stack exceeds the item cap')
      }
      break
    case 'binarySearch': {
      if (diagram.values.length > PROBLEM_LESSON_LIMITS.sequenceValues) {
        addIssue(rootPath, 'diagram.size', 'binary search exceeds the value cap')
      }
      diagram.values.forEach((value, index) => {
        if (!Number.isFinite(value)) {
          addIssue(`${rootPath}.values[${index}]`, 'diagram.number', 'must be finite')
        }
      })
      for (const key of ['low', 'high', 'mid'] as const) {
        if (diagram[key] != null) {
          validateIndex(
            diagram[key],
            diagram.values.length,
            `${rootPath}.${key}`,
            addIssue,
          )
        }
      }
      if (
        diagram.low != null &&
        diagram.high != null &&
        diagram.low > diagram.high
      ) {
        addIssue(rootPath, 'diagram.bounds', 'low must not exceed high')
      }
      break
    }
    case 'linkedList': {
      if (diagram.nodes.length > PROBLEM_LESSON_LIMITS.diagramNodes) {
        addIssue(rootPath, 'diagram.size', 'linked list exceeds the node cap')
      }
      const ids = validateUniqueStrings(
        diagram.nodes.map(({ id }) => id),
        `${rootPath}.nodes.id`,
        addIssue,
      )
      validateReferences(
        [diagram.head],
        ids,
        `${rootPath}.head`,
        addIssue,
      )
      diagram.nodes.forEach((node, index) => {
        validateReferences(
          [node.next, node.random],
          ids,
          `${rootPath}.nodes[${index}]`,
          addIssue,
        )
        if (typeof node.value === 'number' && !Number.isFinite(node.value)) {
          addIssue(
            `${rootPath}.nodes[${index}].value`,
            'diagram.number',
            'must be finite',
          )
        }
      })
      validateReferences(
        diagram.pointers?.map(({ nodeId }) => nodeId) ?? [],
        ids,
        `${rootPath}.pointers`,
        addIssue,
      )
      validateReferences(
        diagram.highlightedNodeIds ?? [],
        ids,
        `${rootPath}.highlightedNodeIds`,
        addIssue,
      )
      break
    }
    case 'tree': {
      if (diagram.variant === 'heap') {
        if (diagram.values.length > PROBLEM_LESSON_LIMITS.diagramNodes) {
          addIssue(rootPath, 'diagram.size', 'heap exceeds the value cap')
        }
        diagram.values.forEach((value, index) => {
          if (typeof value === 'number' && !Number.isFinite(value)) {
            addIssue(
              `${rootPath}.values[${index}]`,
              'diagram.number',
              'must be finite',
            )
          }
        })
        if (diagram.highlight != null) {
          validateIndex(
            diagram.highlight,
            diagram.values.length,
            `${rootPath}.highlight`,
            addIssue,
          )
        }
        diagram.pointers?.forEach((pointer, index) =>
          validateIndex(
            pointer.index,
            diagram.values.length,
            `${rootPath}.pointers[${index}].index`,
            addIssue,
          ),
        )
        break
      }

      if (diagram.nodes.length > PROBLEM_LESSON_LIMITS.diagramNodes) {
        addIssue(rootPath, 'diagram.size', 'tree exceeds the node cap')
      }
      const ids = validateUniqueStrings(
        diagram.nodes.map(({ id }) => id),
        `${rootPath}.nodes.id`,
        addIssue,
      )
      validateReferences(
        [diagram.rootId],
        ids,
        `${rootPath}.rootId`,
        addIssue,
      )
      const children = collectTreeChildren(diagram)
      validateReferences(children, ids, `${rootPath}.children`, addIssue)
      const references =
        diagram.variant === 'binary'
          ? new Map<string, readonly string[]>(
              diagram.nodes.map((node) => [
                node.id,
                [node.left, node.right].filter(
                  (id): id is string => id != null,
                ),
              ]),
            )
          : new Map<string, readonly string[]>(
              diagram.nodes.map((node) => [
                node.id,
                (node.children ?? []).map(({ nodeId }) => nodeId),
              ]),
            )
      validateAcyclicReferences(references, rootPath, addIssue)
      const parentCount = new Map<string, number>()
      children.forEach((id) => parentCount.set(id, (parentCount.get(id) ?? 0) + 1))
      parentCount.forEach((count, id) => {
        if (count > 1) {
          addIssue(
            rootPath,
            'diagram.treeParent',
            `node "${id}" has more than one parent`,
          )
        }
      })
      if (diagram.variant === 'binary') {
        diagram.nodes.forEach((node, index) => {
          if (typeof node.value === 'number' && !Number.isFinite(node.value)) {
            addIssue(
              `${rootPath}.nodes[${index}].value`,
              'diagram.number',
              'must be finite',
            )
          }
        })
      } else {
        diagram.nodes.forEach((node, nodeIndex) => {
          const chars = node.children?.map(({ char }) => char) ?? []
          validateUniqueStrings(
            chars,
            `${rootPath}.nodes[${nodeIndex}].children.char`,
            addIssue,
          )
        })
      }
      validateReferences(
        diagram.pointers?.map(({ nodeId }) => nodeId) ?? [],
        ids,
        `${rootPath}.pointers`,
        addIssue,
      )
      validateReferences(
        diagram.highlightedNodeIds ?? [],
        ids,
        `${rootPath}.highlightedNodeIds`,
        addIssue,
      )
      break
    }
    case 'graph': {
      if (diagram.nodes.length > PROBLEM_LESSON_LIMITS.diagramNodes) {
        addIssue(rootPath, 'diagram.size', 'graph exceeds the node cap')
      }
      const ids = validateUniqueStrings(
        diagram.nodes.map(({ id }) => id),
        `${rootPath}.nodes.id`,
        addIssue,
      )
      if (diagram.variant === 'graph') {
        if (diagram.edges.length > PROBLEM_LESSON_LIMITS.diagramEdges) {
          addIssue(rootPath, 'diagram.size', 'graph exceeds the edge cap')
        }
        const edgeIds = validateUniqueStrings(
          diagram.edges.map(({ id }) => id),
          `${rootPath}.edges.id`,
          addIssue,
        )
        diagram.edges.forEach((edge, index) => {
          validateReferences(
            [edge.from, edge.to],
            ids,
            `${rootPath}.edges[${index}]`,
            addIssue,
          )
          if (edge.weight != null && !Number.isFinite(edge.weight)) {
            addIssue(
              `${rootPath}.edges[${index}].weight`,
              'diagram.number',
              'must be finite',
            )
          }
        })
        validateReferences(
          diagram.highlightedEdgeIds ?? [],
          edgeIds,
          `${rootPath}.highlightedEdgeIds`,
          addIssue,
        )
      } else {
        const references = new Map<string, readonly string[]>(
          diagram.nodes.map((node) => [node.id, [node.parentId]]),
        )
        validateAcyclicReferences(references, rootPath, addIssue, true)
        diagram.nodes.forEach((node, index) => {
          validateReferences(
            [node.parentId],
            ids,
            `${rootPath}.nodes[${index}].parentId`,
            addIssue,
          )
          if (
            (node.rank != null && (!safePositiveInteger(node.rank) && node.rank !== 0)) ||
            (node.size != null && !safePositiveInteger(node.size))
          ) {
            addIssue(
              `${rootPath}.nodes[${index}]`,
              'diagram.unionFind',
              'rank must be non-negative and size must be positive integers',
            )
          }
        })
      }
      validateReferences(
        diagram.highlightedNodeIds ?? [],
        ids,
        `${rootPath}.highlightedNodeIds`,
        addIssue,
      )
      break
    }
    case 'grid': {
      const rows = diagram.cells.length
      const columns = diagram.cells[0]?.length ?? 0
      if (
        rows > PROBLEM_LESSON_LIMITS.gridRows ||
        columns > PROBLEM_LESSON_LIMITS.gridColumns ||
        rows * columns > PROBLEM_LESSON_LIMITS.gridCells
      ) {
        addIssue(rootPath, 'diagram.size', 'grid exceeds row, column, or cell cap')
      }
      diagram.cells.forEach((row, rowIndex) => {
        if (row.length !== columns) {
          addIssue(
            `${rootPath}.cells[${rowIndex}]`,
            'diagram.rectangular',
            'all grid rows must have the same length',
          )
        }
        row.forEach((value, columnIndex) =>
          validateDiagramValue(
            value,
            `${rootPath}.cells[${rowIndex}][${columnIndex}]`,
            addIssue,
          ),
        )
      })
      if (diagram.rowLabels && diagram.rowLabels.length !== rows) {
        addIssue(
          `${rootPath}.rowLabels`,
          'diagram.labels',
          'rowLabels must match the row count',
        )
      }
      if (diagram.columnLabels && diagram.columnLabels.length !== columns) {
        addIssue(
          `${rootPath}.columnLabels`,
          'diagram.labels',
          'columnLabels must match the column count',
        )
      }
      validateGridCoordinates(
        diagram.highlightedCells,
        rows,
        columns,
        `${rootPath}.highlightedCells`,
        addIssue,
      )
      validateGridCoordinates(
        diagram.pointers,
        rows,
        columns,
        `${rootPath}.pointers`,
        addIssue,
      )
      if (diagram.variant === 'dpTable') {
        validateGridCoordinates(
          diagram.dependencyCells,
          rows,
          columns,
          `${rootPath}.dependencyCells`,
          addIssue,
        )
      }
      break
    }
    case 'intervals': {
      if (diagram.intervals.length > PROBLEM_LESSON_LIMITS.sequenceValues) {
        addIssue(rootPath, 'diagram.size', 'interval diagram exceeds the item cap')
      }
      const ids = validateUniqueStrings(
        diagram.intervals.map(({ id }) => id),
        `${rootPath}.intervals.id`,
        addIssue,
      )
      diagram.intervals.forEach((interval, index) => {
        if (
          !finiteNumber(interval.start) ||
          !finiteNumber(interval.end) ||
          interval.start > interval.end
        ) {
          addIssue(
            `${rootPath}.intervals[${index}]`,
            'diagram.interval',
            'start and end must be finite with start <= end',
          )
        }
      })
      validateReferences(
        diagram.highlightedIntervalIds ?? [],
        ids,
        `${rootPath}.highlightedIntervalIds`,
        addIssue,
      )
      if (diagram.cursor != null && !Number.isFinite(diagram.cursor)) {
        addIssue(`${rootPath}.cursor`, 'diagram.number', 'must be finite')
      }
      break
    }
    case 'recursion': {
      if (diagram.frames.length > PROBLEM_LESSON_LIMITS.recursionFrames) {
        addIssue(rootPath, 'diagram.size', 'recursion diagram exceeds the frame cap')
      }
      const ids = validateUniqueStrings(
        diagram.frames.map(({ id }) => id),
        `${rootPath}.frames.id`,
        addIssue,
      )
      validateReferences(
        [diagram.activeFrameId],
        ids,
        `${rootPath}.activeFrameId`,
        addIssue,
      )
      diagram.frames.forEach((frame, frameIndex) => {
        Object.entries(frame.arguments ?? {}).forEach(([key, value]) => {
          validateDiagramValue(
            value,
            `${rootPath}.frames[${frameIndex}].arguments.${key}`,
            addIssue,
          )
        })
        if (frame.result !== undefined) {
          validateDiagramValue(
            frame.result,
            `${rootPath}.frames[${frameIndex}].result`,
            addIssue,
          )
        }
      })
      break
    }
    case 'bits': {
      if (diagram.rows.length > PROBLEM_LESSON_LIMITS.bitRows) {
        addIssue(rootPath, 'diagram.size', 'bits diagram exceeds the row cap')
      }
      validateUniqueStrings(
        diagram.rows.map(({ id }) => id),
        `${rootPath}.rows.id`,
        addIssue,
      )
      const width = diagram.rows[0]?.bits.length ?? 0
      diagram.rows.forEach((row, index) => {
        if (!/^[01]+$/u.test(row.bits)) {
          addIssue(
            `${rootPath}.rows[${index}].bits`,
            'diagram.bits',
            'must contain only 0 and 1',
          )
        }
        if (row.bits.length !== width) {
          addIssue(
            `${rootPath}.rows[${index}].bits`,
            'diagram.bitsWidth',
            'all bit rows must have the same width',
          )
        }
        if (row.bits.length > PROBLEM_LESSON_LIMITS.bitWidth) {
          addIssue(
            `${rootPath}.rows[${index}].bits`,
            'diagram.size',
            'bit row exceeds the width cap',
          )
        }
      })
      diagram.highlightedBitIndices?.forEach((index, itemIndex) =>
        validateIndex(
          index,
          width,
          `${rootPath}.highlightedBitIndices[${itemIndex}]`,
          addIssue,
        ),
      )
      break
    }
  }

  return issues
}

function validateSerializable(
  value: unknown,
  rootPath: string,
  addIssue: AddIssue,
): void {
  const ancestors = new Set<object>()

  const visit = (current: unknown, path: string): void => {
    if (
      current == null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        addIssue(path, 'serializable.number', 'numbers must be finite')
      }
      return
    }
    if (typeof current === 'undefined') return
    if (typeof current !== 'object') {
      addIssue(path, 'serializable.type', `cannot serialize ${typeof current}`)
      return
    }
    if (ancestors.has(current)) {
      addIssue(path, 'serializable.cycle', 'cyclic values are not allowed')
      return
    }
    ancestors.add(current)
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`))
    } else {
      Object.entries(current).forEach(([key, item]) =>
        visit(item, `${path}.${key}`),
      )
    }
    ancestors.delete(current)
  }

  visit(value, rootPath)
}

function matcherExpected(matcher: AnswerMatcherV1): VariableValue {
  switch (matcher.mode) {
    case 'normalized':
      return matcher.acceptedAnswers[0]
    case 'exactLines':
      return matcher.acceptedAnswers[0].join('\n')
    case 'numericTolerance':
      return matcher.expected
    case 'boolean':
      return String(matcher.expected)
  }
}

function validateMatcher(
  matcher: AnswerMatcherV1,
  path: string,
  addIssue: AddIssue,
): void {
  if (matcher.mode === 'normalized') {
    if (matcher.acceptedAnswers.length === 0) {
      addIssue(path, 'assessment.answers', 'acceptedAnswers must not be empty')
    }
    matcher.acceptedAnswers.forEach((answer, index) => {
      if (!nonEmpty(answer)) {
        addIssue(
          `${path}.acceptedAnswers[${index}]`,
          'assessment.answers',
          'accepted answers must not be blank',
        )
      }
    })
    const normalizedAnswers = matcher.acceptedAnswers.map((answer) =>
      answer.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/gu, ' '),
    )
    if (new Set(normalizedAnswers).size !== normalizedAnswers.length) {
      addIssue(
        `${path}.acceptedAnswers`,
        'assessment.answers',
        'acceptedAnswers must be unique after normalization',
      )
    }
    return
  }
  if (matcher.mode === 'exactLines') {
    if (matcher.acceptedAnswers.length === 0) {
      addIssue(path, 'assessment.answers', 'acceptedAnswers must not be empty')
    }
    matcher.acceptedAnswers.forEach((answer, answerIndex) => {
      if (answer.length === 0) {
        addIssue(
          `${path}.acceptedAnswers[${answerIndex}]`,
          'assessment.answers',
          'an exact-lines answer must contain at least one line',
        )
      }
      answer.forEach((line, lineIndex) => {
        if (line.includes('\n') || line.includes('\r')) {
          addIssue(
            `${path}.acceptedAnswers[${answerIndex}][${lineIndex}]`,
            'assessment.lines',
            'individual exact lines cannot contain line breaks',
          )
        }
      })
    })
    return
  }
  if (matcher.mode === 'boolean') return
  if (
    !finiteNumber(matcher.expected) ||
    !finiteNumber(matcher.absoluteTolerance) ||
    matcher.absoluteTolerance < 0 ||
    (matcher.relativeTolerance != null &&
      (!finiteNumber(matcher.relativeTolerance) ||
        matcher.relativeTolerance < 0))
  ) {
    addIssue(
      path,
      'assessment.tolerance',
      'numeric values and tolerances must be finite and tolerances non-negative',
    )
  }
}

function validateCodec(
  codec: PythonValueCodecV1,
  path: string,
  depth: number,
  addIssue: AddIssue,
): void {
  if (depth > PROBLEM_LESSON_LIMITS.pythonCodecDepth) {
    addIssue(path, 'python.codecDepth', 'codec nesting exceeds the depth cap')
    return
  }
  switch (codec.kind) {
    case 'list':
    case 'linkedList':
    case 'binaryTree':
      validateCodec(codec.item, `${path}.item`, depth + 1, addIssue)
      break
    case 'tuple':
      if (codec.items.length > PROBLEM_LESSON_LIMITS.pythonArguments) {
        addIssue(path, 'python.codecSize', 'tuple codec has too many items')
      }
      codec.items.forEach((item, index) =>
        validateCodec(item, `${path}.items[${index}]`, depth + 1, addIssue),
      )
      break
    case 'graph':
      validateCodec(codec.item, `${path}.item`, depth + 1, addIssue)
      break
    case 'json':
    case 'integer':
    case 'float':
    case 'string':
    case 'boolean':
      break
  }
}

function validateFailurePolicy(
  assessment: AssessmentV1,
  path: string,
  stepIds: ReadonlySet<string>,
  addIssue: AddIssue,
): void {
  const policy = assessment.failurePolicy
  if (!policy) return
  if (
    !safePositiveInteger(policy.maxAttempts) ||
    policy.maxAttempts > 20
  ) {
    addIssue(
      `${path}.failurePolicy.maxAttempts`,
      'assessment.failurePolicy',
      'maxAttempts must be an integer from 1 to 20',
    )
  }
  if (
    policy.kind === 'rewind' &&
    !stepIds.has(policy.checkpointStepId)
  ) {
    addIssue(
      `${path}.failurePolicy.checkpointStepId`,
      'assessment.failurePolicy',
      'rewind checkpoint must reference a step in this variant',
    )
  }
}

function validateAssessment(
  assessment: AssessmentV1,
  path: string,
  skillIds: ReadonlySet<SkillId>,
  stepIds: ReadonlySet<string>,
  seenAssessmentIds: Set<AssessmentId>,
  addIssue: AddIssue,
): void {
  if (assessment.schemaVersion !== ASSESSMENT_SCHEMA_VERSION) {
    addIssue(
      `${path}.schemaVersion`,
      'assessment.version',
      `must be ${ASSESSMENT_SCHEMA_VERSION}`,
    )
  }
  if (!/^assessment:.+/u.test(assessment.id)) {
    addIssue(`${path}.id`, 'assessment.id', 'must be a stable assessment:* id')
  } else if (seenAssessmentIds.has(assessment.id)) {
    addIssue(`${path}.id`, 'id.duplicate', `duplicate id "${assessment.id}"`)
  }
  seenAssessmentIds.add(assessment.id)
  if (!nonEmpty(assessment.prompt)) {
    addIssue(`${path}.prompt`, 'assessment.prompt', 'must not be empty')
  }
  if (!ASSESSMENT_EVIDENCE_KINDS.has(assessment.evidenceKind)) {
    addIssue(
      `${path}.evidenceKind`,
      'assessment.evidenceKind',
      `unknown evidence kind "${assessment.evidenceKind}"`,
    )
  }
  if (assessment.evidenceKinds) {
    const distinctKinds = new Set(assessment.evidenceKinds)
    if (distinctKinds.size !== assessment.evidenceKinds.length) {
      addIssue(
        `${path}.evidenceKinds`,
        'assessment.evidenceKind',
        'evidenceKinds must not contain duplicates',
      )
    }
    assessment.evidenceKinds.forEach((evidenceKind, index) => {
      if (!ASSESSMENT_EVIDENCE_KINDS.has(evidenceKind)) {
        addIssue(
          `${path}.evidenceKinds[${index}]`,
          'assessment.evidenceKind',
          `unknown evidence kind "${evidenceKind}"`,
        )
      }
    })
  }
  assessment.skillIds?.forEach((skillId, index) => {
    if (!skillIds.has(skillId)) {
      addIssue(
        `${path}.skillIds[${index}]`,
        'skill.unknown',
        `unknown skill "${skillId}"`,
      )
    }
  })
  validateFailurePolicy(assessment, path, stepIds, addIssue)

  switch (assessment.kind) {
    case 'singleChoice': {
      if (assessment.options.length < 2 || assessment.options.length > 12) {
        addIssue(
          `${path}.options`,
          'assessment.options',
          'single choice requires 2 to 12 options',
        )
      }
      const optionIds = validateUniqueStrings(
        assessment.options.map(({ id }) => id),
        `${path}.options.id`,
        addIssue,
      )
      assessment.options.forEach((option, index) => {
        if (!/^option:.+/u.test(option.id)) {
          addIssue(
            `${path}.options[${index}].id`,
            'assessment.optionId',
            'must be a stable option:* id',
          )
        }
        if (!nonEmpty(option.label)) {
          addIssue(
            `${path}.options[${index}].label`,
            'assessment.optionLabel',
            'must not be empty',
          )
        }
      })
      if (!optionIds.has(assessment.correctOptionId)) {
        addIssue(
          `${path}.correctOptionId`,
          'assessment.correctOption',
          'must reference an existing option id',
        )
      }
      break
    }
    case 'shortAnswer':
      validateMatcher(assessment.matcher, `${path}.matcher`, addIssue)
      break
    case 'predict':
      if (
        assessment.code.length === 0 ||
        assessment.code.length > PROBLEM_LESSON_LIMITS.predictCodeLines
      ) {
        addIssue(
          `${path}.code`,
          'assessment.code',
          'predict code must be non-empty and within the line cap',
        )
      }
      if (
        assessment.currentLineIndex != null &&
        !validIndex(assessment.currentLineIndex, assessment.code.length)
      ) {
        addIssue(
          `${path}.currentLineIndex`,
          'assessment.line',
          'currentLineIndex is outside the code bounds',
        )
      }
      validateMatcher(assessment.matcher, `${path}.matcher`, addIssue)
      break
    case 'order': {
      if (assessment.items.length < 2 || assessment.items.length > 20) {
        addIssue(
          `${path}.items`,
          'assessment.items',
          'order assessment requires 2 to 20 items',
        )
      }
      const itemIds = validateUniqueStrings(
        assessment.items.map(({ id }) => id),
        `${path}.items.id`,
        addIssue,
      )
      assessment.items.forEach((item, index) => {
        if (!/^item:.+/u.test(item.id)) {
          addIssue(
            `${path}.items[${index}].id`,
            'assessment.itemId',
            'must be a stable item:* id',
          )
        }
        if (!nonEmpty(item.label)) {
          addIssue(
            `${path}.items[${index}].label`,
            'assessment.itemLabel',
            'must not be empty',
          )
        }
      })
      const correctIds = validateUniqueStrings(
        assessment.correctOrderIds,
        `${path}.correctOrderIds`,
        addIssue,
      )
      if (
        correctIds.size !== itemIds.size ||
        [...itemIds].some((id) => !correctIds.has(id))
      ) {
        addIssue(
          `${path}.correctOrderIds`,
          'assessment.correctOrder',
          'must be an exact permutation of item ids',
        )
      }
      break
    }
    case 'trace': {
      if (
        assessment.code.length === 0 ||
        assessment.code.length > PROBLEM_LESSON_LIMITS.traceCodeLines
      ) {
        addIssue(
          `${path}.code`,
          'assessment.code',
          'trace code must be non-empty and within the line cap',
        )
      }
      if (
        assessment.frames.length === 0 ||
        assessment.frames.length > PROBLEM_LESSON_LIMITS.traceFrames
      ) {
        addIssue(
          `${path}.frames`,
          'assessment.traceFrames',
          'trace must have frames within the frame cap',
        )
      }
      validateUniqueStrings(
        assessment.frames.map(({ id }) => id),
        `${path}.frames.id`,
        addIssue,
      )
      assessment.frames.forEach((frame, index) => {
        const framePath = `${path}.frames[${index}]`
        if (!/^frame:.+/u.test(frame.id)) {
          addIssue(
            `${framePath}.id`,
            'assessment.frameId',
            'must be a stable frame:* id',
          )
        }
        if (!validIndex(frame.currentLineIndex, assessment.code.length)) {
          addIssue(
            `${framePath}.currentLineIndex`,
            'assessment.line',
            'trace frame line is outside the code bounds',
          )
        }
        if (frame.diagram) {
          validateDiagramSpec(frame.diagram, `${framePath}.diagram`).forEach(
            (issue) => addIssue(issue.path, issue.code, issue.message),
          )
        }
        validateAssessment(
          frame.assessment,
          `${framePath}.assessment`,
          skillIds,
          stepIds,
          seenAssessmentIds,
          addIssue,
        )
      })
      break
    }
    case 'pythonCode': {
      const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/u
      if (!nonEmpty(assessment.starterCode)) {
        addIssue(
          `${path}.starterCode`,
          'python.source',
          'starterCode must not be empty',
        )
      }
      if (
        assessment.entrypoint.kind === 'function' &&
        !identifier.test(assessment.entrypoint.name)
      ) {
        addIssue(
          `${path}.entrypoint.name`,
          'python.entrypoint',
          'function name must be a Python identifier',
        )
      }
      if (
        assessment.entrypoint.kind === 'classMethod' &&
        (!identifier.test(assessment.entrypoint.className) ||
          !identifier.test(assessment.entrypoint.methodName))
      ) {
        addIssue(
          `${path}.entrypoint`,
          'python.entrypoint',
          'class and method names must be Python identifiers',
        )
      }
      if (
        assessment.codecs.arguments.length >
        PROBLEM_LESSON_LIMITS.pythonArguments
      ) {
        addIssue(
          `${path}.codecs.arguments`,
          'python.arguments',
          'codec plan exceeds the argument cap',
        )
      }
      assessment.codecs.arguments.forEach((codec, index) =>
        validateCodec(codec, `${path}.codecs.arguments[${index}]`, 0, addIssue),
      )
      validateCodec(assessment.codecs.result, `${path}.codecs.result`, 0, addIssue)
      if (
        assessment.cases.length === 0 ||
        assessment.cases.length > PROBLEM_LESSON_LIMITS.pythonCases
      ) {
        addIssue(
          `${path}.cases`,
          'python.cases',
          'Python assessments require cases within the case cap',
        )
      }
      validateUniqueStrings(
        assessment.cases.map(({ id }) => id),
        `${path}.cases.id`,
        addIssue,
      )
      let caseBytes = 0
      assessment.cases.forEach((testCase, index) => {
        const casePath = `${path}.cases[${index}]`
        if (!/^case:.+/u.test(testCase.id)) {
          addIssue(
            `${casePath}.id`,
            'python.caseId',
            'must be a stable case:* id',
          )
        }
        if (
          testCase.arguments.length !== assessment.codecs.arguments.length ||
          testCase.arguments.length > PROBLEM_LESSON_LIMITS.pythonArguments
        ) {
          addIssue(
            `${casePath}.arguments`,
            'python.arguments',
            'case arguments must match the codec plan',
          )
        }
        const bytes = new TextEncoder().encode(JSON.stringify(testCase)).length
        caseBytes += bytes
        if (bytes > PROBLEM_LESSON_LIMITS.pythonCaseBytes) {
          addIssue(casePath, 'python.caseSize', 'case exceeds the byte cap')
        }
      })
      if (caseBytes > PROBLEM_LESSON_LIMITS.pythonPlanBytes) {
        addIssue(`${path}.cases`, 'python.planSize', 'test plan exceeds the byte cap')
      }
      const limits = assessment.limits
      if (
        !safePositiveInteger(limits.timeoutMs) ||
        limits.timeoutMs > PROBLEM_LESSON_LIMITS.pythonTimeoutMs ||
        !safePositiveInteger(limits.memoryMb) ||
        limits.memoryMb > PROBLEM_LESSON_LIMITS.pythonMemoryMb ||
        !safePositiveInteger(limits.maxOutputBytes) ||
        limits.maxOutputBytes > PROBLEM_LESSON_LIMITS.pythonOutputBytes ||
        !safePositiveInteger(limits.maxSourceBytes) ||
        limits.maxSourceBytes > PROBLEM_LESSON_LIMITS.pythonSourceBytes
      ) {
        addIssue(
          `${path}.limits`,
          'python.limits',
          'execution limits must be positive and within platform caps',
        )
      }
      const sourceBytes = new TextEncoder().encode(assessment.starterCode).length
      if (
        sourceBytes > limits.maxSourceBytes ||
        sourceBytes > PROBLEM_LESSON_LIMITS.pythonSourceBytes
      ) {
        addIssue(
          `${path}.starterCode`,
          'python.sourceSize',
          'starterCode exceeds the source byte limit',
        )
      }
      if (assessment.comparator.kind === 'numericTolerance') {
        const comparator = assessment.comparator
        if (
          !finiteNumber(comparator.absoluteTolerance) ||
          comparator.absoluteTolerance < 0 ||
          (comparator.relativeTolerance != null &&
            (!finiteNumber(comparator.relativeTolerance) ||
              comparator.relativeTolerance < 0))
        ) {
          addIssue(
            `${path}.comparator`,
            'python.comparator',
            'comparator tolerances must be finite and non-negative',
          )
        }
      }
      if (
        assessment.comparator.kind === 'unordered' &&
        assessment.comparator.recursive !== undefined &&
        typeof assessment.comparator.recursive !== 'boolean'
      ) {
        addIssue(
          `${path}.comparator.recursive`,
          'python.comparator',
          'unordered recursive must be boolean',
        )
      }
      if (assessment.observation?.kind === 'argument') {
        if (
          !Number.isSafeInteger(assessment.observation.argumentIndex) ||
          assessment.observation.argumentIndex < 0 ||
          assessment.observation.argumentIndex >=
            assessment.codecs.arguments.length
        ) {
          addIssue(
            `${path}.observation.argumentIndex`,
            'python.observation',
            'observation argumentIndex must reference an argument codec',
          )
        }
        validateCodec(
          assessment.observation.codec,
          `${path}.observation.codec`,
          0,
          addIssue,
        )
      }
      assessment.verificationNotes?.forEach((note, index) => {
        if (!nonEmpty(note)) {
          addIssue(
            `${path}.verificationNotes[${index}]`,
            'python.verification',
            'verification notes must not be blank',
          )
        }
      })
      break
    }
  }
}

function variantSteps(variant: ProblemLessonVariantV1): readonly ProblemLessonStepV1[] {
  return [
    variant.explanation,
    variant.workedExample,
    variant.quizIntro,
    ...variant.assessments,
  ]
}

function assessmentTopology(assessment: AssessmentV1): unknown {
  switch (assessment.kind) {
    case 'singleChoice':
      return [
        assessment.kind,
        assessment.id,
        assessment.options.map(({ id }) => id),
      ]
    case 'order':
      return [
        assessment.kind,
        assessment.id,
        assessment.items.map(({ id }) => id),
      ]
    case 'trace':
      return [
        assessment.kind,
        assessment.id,
        assessment.frames.map((frame) => [
          frame.id,
          assessmentTopology(frame.assessment),
        ]),
      ]
    case 'pythonCode':
      return [
        assessment.kind,
        assessment.id,
        assessment.cases.map(({ id }) => id),
      ]
    case 'shortAnswer':
    case 'predict':
      return [assessment.kind, assessment.id]
  }
}

function variantTopology(variant: ProblemLessonVariantV1): string {
  return JSON.stringify(
    variantSteps(variant).map((step) => [
      step.kind,
      step.id,
      step.kind === 'assessment'
        ? assessmentTopology(step.assessment)
        : undefined,
    ]),
  )
}

function validateStep(
  step: ProblemLessonStepV1,
  path: string,
  allSkills: ReadonlySet<SkillId>,
  stepIds: ReadonlySet<string>,
  assessmentIds: Set<AssessmentId>,
  addIssue: AddIssue,
): void {
  if (!nonEmpty(step.id)) {
    addIssue(`${path}.id`, 'step.id', 'must not be empty')
  }
  if (!nonEmpty(step.prompt)) {
    addIssue(`${path}.prompt`, 'step.prompt', 'must not be empty')
  }
  step.skillIds?.forEach((skillId, index) => {
    if (!allSkills.has(skillId)) {
      addIssue(
        `${path}.skillIds[${index}]`,
        'skill.unknown',
        `unknown skill "${skillId}"`,
      )
    }
  })
  if (step.diagram) {
    validateDiagramSpec(step.diagram, `${path}.diagram`).forEach((issue) =>
      addIssue(issue.path, issue.code, issue.message),
    )
  }
  if (
    step.diagramSequence &&
    step.diagramSequence.length > PROBLEM_LESSON_LIMITS.diagramSequence
  ) {
    addIssue(
      `${path}.diagramSequence`,
      'diagram.sequenceSize',
      'diagram sequence exceeds the frame cap',
    )
  }
  step.diagramSequence?.forEach((diagram, index) => {
    validateDiagramSpec(diagram, `${path}.diagramSequence[${index}]`).forEach(
      (issue) => addIssue(issue.path, issue.code, issue.message),
    )
  })
  if (
    step.kind === 'workedExample' &&
    step.code.length === 0
  ) {
    addIssue(
      `${path}.code`,
      'step.code',
      'worked example code must not be empty',
    )
  } else if (
    step.kind === 'workedExample' &&
    step.currentLineIndex != null &&
    !validIndex(step.currentLineIndex, step.code.length)
  ) {
    addIssue(
      `${path}.currentLineIndex`,
      'step.line',
      'worked example line is outside the code bounds',
    )
  }
  if (step.kind === 'assessment') {
    if (
      !nonEmpty(step.feedback.correct) ||
      !nonEmpty(step.feedback.incorrect)
    ) {
      addIssue(
        `${path}.feedback`,
        'assessment.feedback',
        'correct and incorrect feedback must not be empty',
      )
    }
    if (step.prompt !== step.assessment.prompt) {
      addIssue(
        `${path}.prompt`,
        'assessment.promptMismatch',
        'step and assessment prompts must match',
      )
    }
    validateAssessment(
      step.assessment,
      `${path}.assessment`,
      allSkills,
      stepIds,
      assessmentIds,
      addIssue,
    )
  }
}

export function validateProblemLesson(
  spec: ProblemLessonSpecV1,
  manifest: CurriculumManifest,
): ProblemLessonValidationResult {
  const issues: ProblemLessonValidationIssue[] = []
  const addIssue: AddIssue = (path, code, message) => {
    issues.push({ path, code, message })
  }

  validateSerializable(spec, 'spec', addIssue)
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(spec)).length
    if (bytes > PROBLEM_LESSON_LIMITS.specBytes) {
      addIssue('spec', 'spec.size', 'problem lesson exceeds the byte cap')
    }
  } catch {
    // The serializability walk already reports cycles and unsupported values.
  }

  if (spec.schemaVersion !== PROBLEM_LESSON_SCHEMA_VERSION) {
    addIssue(
      'spec.schemaVersion',
      'spec.version',
      `must be ${PROBLEM_LESSON_SCHEMA_VERSION}`,
    )
  }
  if (spec.curriculumId !== manifest.id) {
    addIssue(
      'spec.curriculumId',
      'manifest.curriculum',
      `must match manifest id "${manifest.id}"`,
    )
  }
  if (spec.manifestContentVersion !== manifest.version.content) {
    addIssue(
      'spec.manifestContentVersion',
      'manifest.version',
      `must match manifest content version "${manifest.version.content}"`,
    )
  }
  const problem = manifest.problems.find(({ id }) => id === spec.problemId)
  if (!problem) {
    addIssue(
      'spec.problemId',
      'manifest.problem',
      `problem "${spec.problemId}" is not in the manifest`,
    )
  } else if (spec.problemContentVersion !== problem.contentVersion) {
    addIssue(
      'spec.problemContentVersion',
      'manifest.problemVersion',
      `must match problem content version "${problem.contentVersion}"`,
    )
  }
  if (!nonEmpty(spec.description)) {
    addIssue('spec.description', 'spec.description', 'must not be empty')
  }
  if (!nonEmpty(spec.pattern)) {
    addIssue('spec.pattern', 'spec.pattern', 'must not be empty')
  }
  if (
    !safePositiveInteger(spec.estimatedMinutes) ||
    spec.estimatedMinutes > 240
  ) {
    addIssue(
      'spec.estimatedMinutes',
      'spec.duration',
      'must be an integer from 1 to 240',
    )
  }

  const allSkills = new Set(manifest.skills.map(({ id }) => id))
  validateUniqueStrings(spec.skillIds, 'spec.skillIds', addIssue)
  spec.skillIds.forEach((skillId, index) => {
    if (!allSkills.has(skillId)) {
      addIssue(
        `spec.skillIds[${index}]`,
        'skill.unknown',
        `unknown skill "${skillId}"`,
      )
    }
  })
  if (
    spec.variants.length === 0 ||
    spec.variants.length > PROBLEM_LESSON_LIMITS.variants
  ) {
    addIssue(
      'spec.variants',
      'variant.count',
      'variants must be non-empty and within the variant cap',
    )
  }
  validateUniqueStrings(
    spec.variants.map(({ id }) => id),
    'spec.variants.id',
    addIssue,
  )

  const baselineTopology = spec.variants[0]
    ? variantTopology(spec.variants[0])
    : undefined
  spec.variants.forEach((variant, variantIndex) => {
    const variantPath = `spec.variants[${variantIndex}]`
    if (!/^variant:.+/u.test(variant.id)) {
      addIssue(
        `${variantPath}.id`,
        'variant.id',
        'must be a stable variant:* id',
      )
    }
    if (
      baselineTopology != null &&
      variantTopology(variant) !== baselineTopology
    ) {
      addIssue(
        variantPath,
        'variant.topology',
        'all variants must have identical step and assessment topology',
      )
    }
    if (
      variant.assessments.length === 0 ||
      variant.assessments.length > PROBLEM_LESSON_LIMITS.assessments
    ) {
      addIssue(
        `${variantPath}.assessments`,
        'assessment.count',
        'variant assessments must be non-empty and within the cap',
      )
    }
    const steps = variantSteps(variant)
    const stepIds = validateUniqueStrings(
      steps.map(({ id }) => id),
      `${variantPath}.steps.id`,
      addIssue,
    )
    const assessmentIds = new Set<AssessmentId>()
    steps.forEach((step, stepIndex) =>
      validateStep(
        step,
        `${variantPath}.steps[${stepIndex}]`,
        allSkills,
        stepIds,
        assessmentIds,
        addIssue,
      ),
    )
  })

  return issues.length === 0
    ? { valid: true, issues: [] }
    : { valid: false, issues }
}

function materializeAssessment(
  assessment: AssessmentV1,
  seed: SeedValue,
  problemId: string,
): AssessmentV1 {
  switch (assessment.kind) {
    case 'singleChoice':
      return {
        ...assessment,
        options:
          assessment.shuffleOptions === false
            ? [...assessment.options]
            : seededShuffle(
                assessment.options,
                seed,
                'problem',
                problemId,
                'assessment',
                assessment.id,
                'options',
              ),
        skillIds: assessment.skillIds ? [...assessment.skillIds] : undefined,
      }
    case 'order':
      return {
        ...assessment,
        items:
          assessment.shuffleItems === false
            ? [...assessment.items]
            : seededShuffle(
                assessment.items,
                seed,
                'problem',
                problemId,
                'assessment',
                assessment.id,
                'items',
              ),
        correctOrderIds: [...assessment.correctOrderIds],
        skillIds: assessment.skillIds ? [...assessment.skillIds] : undefined,
      }
    case 'trace':
      return {
        ...assessment,
        code: [...assessment.code],
        frames: assessment.frames.map((frame) => ({
          ...frame,
          assessment: materializeAssessment(
            frame.assessment,
            seed,
            problemId,
          ) as TraceInnerAssessmentV1,
        })),
        skillIds: assessment.skillIds ? [...assessment.skillIds] : undefined,
      }
    case 'predict':
      return {
        ...assessment,
        code: [...assessment.code],
        skillIds: assessment.skillIds ? [...assessment.skillIds] : undefined,
      }
    case 'pythonCode':
      return {
        ...assessment,
        skillIds: assessment.skillIds ? [...assessment.skillIds] : undefined,
        codecs: {
          arguments: [...assessment.codecs.arguments],
          result: assessment.codecs.result,
        },
        cases: assessment.cases.map((testCase) => ({
          ...testCase,
          arguments: [...testCase.arguments],
        })),
      }
    case 'shortAnswer':
      return {
        ...assessment,
        skillIds: assessment.skillIds ? [...assessment.skillIds] : undefined,
      }
  }
}

type CompatibilityFields = Pick<
  LessonStep,
  | 'code'
  | 'currentLineIndex'
  | 'variables'
  | 'targetVariables'
  | 'expectedState'
  | 'answerTiles'
  | 'inputMode'
>

function optionLabel(
  assessment: Extract<AssessmentV1, { kind: 'singleChoice' }>,
): string {
  return (
    assessment.options.find(({ id }) => id === assessment.correctOptionId)
      ?.label ?? assessment.correctOptionId
  )
}

function compatibilityFields(
  assessment: Exclude<AssessmentV1, { kind: 'trace' }>,
): CompatibilityFields {
  switch (assessment.kind) {
    case 'singleChoice':
      return {
        code: [],
        variables: ['answer'],
        targetVariables: ['answer'],
        expectedState: { answer: optionLabel(assessment) },
        answerTiles: assessment.options.map(({ label }) => label),
        inputMode: 'text',
      }
    case 'shortAnswer': {
      const expected = matcherExpected(assessment.matcher)
      return {
        code: [],
        variables: ['answer'],
        targetVariables: ['answer'],
        expectedState: { answer: expected },
        inputMode: typeof expected === 'number' ? 'numeric' : 'text',
      }
    }
    case 'predict': {
      const expected = matcherExpected(assessment.matcher)
      return {
        code: [...assessment.code],
        currentLineIndex: assessment.currentLineIndex,
        variables: ['answer'],
        targetVariables: ['answer'],
        expectedState: { answer: expected },
        inputMode: typeof expected === 'number' ? 'numeric' : 'text',
      }
    }
    case 'order': {
      const labels = new Map(
        assessment.items.map(({ id, label }) => [id, label]),
      )
      const expected = assessment.correctOrderIds
        .map((id) => labels.get(id) ?? id)
        .join(' → ')
      return {
        code: [],
        variables: ['answer'],
        targetVariables: ['answer'],
        expectedState: { answer: expected },
        answerTiles: assessment.items.map(({ label }) => label),
        inputMode: 'text',
      }
    }
    case 'pythonCode':
      return {
        code: assessment.starterCode.split('\n'),
        variables: [],
        targetVariables: [],
        expectedState: {},
      }
  }
}

function traceCompatibility(
  assessment: Extract<AssessmentV1, { kind: 'trace' }>,
  feedback: ProblemLessonAssessmentStepV1['feedback'],
): CompatibilityFields & { traceFrames: TraceFrame[] } {
  const traceFrames = assessment.frames.map((frame): TraceFrame => {
    const fields = compatibilityFields(frame.assessment)
    return {
      prompt: frame.assessment.prompt,
      currentLineIndex: frame.currentLineIndex,
      diagram: frame.diagram,
      assessment: frame.assessment,
      assessmentId: frame.assessment.id,
      variables: fields.variables,
      targetVariables: fields.targetVariables,
      expectedState: fields.expectedState,
      feedback: { ...feedback },
      answerTiles: fields.answerTiles,
    }
  })
  const first = traceFrames[0]
  return {
    code: [...assessment.code],
    currentLineIndex: first?.currentLineIndex,
    variables: first?.variables ?? [],
    targetVariables: first?.targetVariables ?? [],
    expectedState: first?.expectedState ?? {},
    answerTiles: first?.answerTiles,
    inputMode:
      first && typeof first.expectedState[first.targetVariables[0]] === 'number'
        ? 'numeric'
        : 'text',
    traceFrames,
  }
}

function compilePassiveStep(
  step: Exclude<ProblemLessonStepV1, ProblemLessonAssessmentStepV1>,
  spec: ProblemLessonSpecV1,
  contentRef: ProblemLessonContentRef,
): LessonStep {
  const type =
    step.kind === 'explanation'
      ? 'concept'
      : step.kind === 'workedExample'
        ? 'demonstration'
        : 'quizIntro'
  const section = step.kind === 'quizIntro' ? 'quiz' : 'teach'
  const code = step.kind === 'workedExample' ? [...step.code] : []
  return {
    id: step.id,
    type,
    section,
    phaseLabel:
      step.kind === 'explanation'
        ? 'Learn'
        : step.kind === 'workedExample'
          ? 'Walkthrough'
          : 'Quiz',
    prompt: step.prompt,
    hook: step.hook,
    code,
    currentLineIndex:
      step.kind === 'workedExample' ? step.currentLineIndex : undefined,
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: { correct: '', incorrect: '' },
    conceptTags: [],
    skillIds: [...(step.skillIds ?? spec.skillIds)],
    contentRef,
    diagram: step.diagram,
    diagramSequence: step.diagramSequence
      ? [...step.diagramSequence]
      : undefined,
    bullets: step.bullets ? [...step.bullets] : undefined,
    callout: step.callout,
  }
}

function compileAssessmentStep(
  step: ProblemLessonAssessmentStepV1,
  spec: ProblemLessonSpecV1,
  contentRef: ProblemLessonContentRef,
  seed: SeedValue,
): LessonStep {
  const assessment = materializeAssessment(
    step.assessment,
    seed,
    spec.problemId,
  )
  const fields =
    assessment.kind === 'trace'
      ? traceCompatibility(assessment, step.feedback)
      : compatibilityFields(assessment)
  return {
    id: step.id,
    type: assessment.kind === 'trace' ? 'traceVariables' : 'practice',
    section: 'quiz',
    phaseLabel: 'Quiz',
    prompt: step.prompt,
    hook: step.hook,
    ...fields,
    feedback: { ...step.feedback },
    conceptTags: [],
    skillIds: [
      ...(step.skillIds ?? assessment.skillIds ?? spec.skillIds),
    ],
    contentRef,
    assessment,
    masteryId: assessment.id,
    diagram:
      step.diagram ??
      (assessment.kind === 'trace'
        ? assessment.frames[0]?.diagram
        : undefined),
    diagramSequence: step.diagramSequence
      ? [...step.diagramSequence]
      : undefined,
    hints: step.hints ? [...step.hints] : undefined,
    bullets: step.bullets ? [...step.bullets] : undefined,
    callout: step.callout,
  }
}

export function compileProblemLesson(
  spec: ProblemLessonSpecV1,
  manifest: CurriculumManifest,
  options: CompileProblemLessonOptions = {},
): Lesson {
  const validation = validateProblemLesson(spec, manifest)
  if (!validation.valid) {
    throw new ProblemLessonValidationError(validation.issues)
  }

  const problem = manifest.problems.find(({ id }) => id === spec.problemId)
  if (!problem) {
    // Kept as a defensive guard even though validation has already checked it.
    throw new ProblemLessonValidationError([
      {
        path: 'spec.problemId',
        code: 'manifest.problem',
        message: `problem "${spec.problemId}" is not in the manifest`,
      },
    ])
  }

  const seed =
    options.seed ??
    `${spec.curriculumId}|${spec.problemId}|${spec.problemContentVersion}`
  const selectedVariant = options.variantId
    ? spec.variants.find(({ id }) => id === options.variantId)
    : createSeededRandom(
        seed,
        'problem',
        spec.problemId,
        'variant',
      ).pick(spec.variants)

  if (!selectedVariant) {
    throw new ProblemLessonValidationError([
      {
        path: 'options.variantId',
        code: 'variant.unknown',
        message: `variant "${options.variantId}" does not exist`,
      },
    ])
  }

  const contentRef: ProblemLessonContentRef = {
    schemaVersion: PROBLEM_LESSON_SCHEMA_VERSION,
    curriculumId: spec.curriculumId,
    manifestContentVersion: spec.manifestContentVersion,
    problemId: spec.problemId,
    problemContentVersion: spec.problemContentVersion,
    variantId: selectedVariant.id,
  }
  const steps = variantSteps(selectedVariant).map((step) =>
    step.kind === 'assessment'
      ? compileAssessmentStep(step, spec, contentRef, seed)
      : compilePassiveStep(step, spec, contentRef),
  )

  return {
    id: problem.id,
    title: problem.title,
    description: spec.description,
    pattern: spec.pattern,
    estimatedMinutes: spec.estimatedMinutes,
    conceptTags: [],
    skillIds: [...spec.skillIds],
    contentRef,
    unlockRequirements: {},
    steps,
  }
}
