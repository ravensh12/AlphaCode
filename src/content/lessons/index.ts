import type { Lesson } from '../../types/lesson'
import { generateArraysAndLoops } from './arraysAndLoops'
import { generateStrings } from './stringsLesson'
import { generateHashMaps } from './hashMaps'
import { generateTwoPointers } from './twoPointers'
import { generateStacks } from './stacks'
import { generateBinarySearch } from './binarySearch'
import { insertTeachCheckpoints } from './checkpoints'

const GENERATORS: Record<string, () => Lesson> = {
  'arrays-and-loops': generateArraysAndLoops,
  strings: generateStrings,
  'hash-maps': generateHashMaps,
  'two-pointers': generateTwoPointers,
  stacks: generateStacks,
  'binary-search': generateBinarySearch,
}

export function hasLesson(id: string | undefined): boolean {
  return !!id && id in GENERATORS
}

export function generateLesson(id: string | undefined): Lesson | undefined {
  if (!id) return undefined
  const lesson = GENERATORS[id]?.()
  if (!lesson) return undefined
  return {
    ...lesson,
    steps: insertTeachCheckpoints(id, lesson.steps),
  }
}
