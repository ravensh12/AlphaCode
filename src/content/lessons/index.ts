import type { Lesson } from '../../types/lesson'
import { generateVariablesAreBoxes } from './variablesAreBoxes'
import { generatePredictTheOutput } from './predictTheOutput'
import { generateIfStatements } from './ifStatements'
import { generateLoops } from './loops'
import { generateDebugTheCode } from './debugTheCode'

/**
 * Each lesson is procedurally generated, so it produces fresh numbers (and
 * sometimes a fresh program) every time it's started or replayed.
 */
const GENERATORS: Record<string, () => Lesson> = {
  'variables-are-boxes': generateVariablesAreBoxes,
  'predict-the-output': generatePredictTheOutput,
  'if-statements': generateIfStatements,
  loops: generateLoops,
  'debug-the-code': generateDebugTheCode,
}

export function hasLesson(id: string | undefined): boolean {
  return !!id && id in GENERATORS
}

/** Build a fresh, randomized instance of the lesson. */
export function generateLesson(id: string | undefined): Lesson | undefined {
  if (!id) return undefined
  return GENERATORS[id]?.()
}
