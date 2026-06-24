import { useEffect, useRef, useState } from 'react'
import type { DiagramSpec } from '../types/lesson'
import { diagramChangedIndices } from '../lib/diagramDiff'

/** Time each diagram beat holds before advancing within a slide. */
export const DIAGRAM_FRAME_MS = 1400

/** Extra reading time on the final frame before the slide can advance. */
export const DIAGRAM_SEQUENCE_TAIL_MS = 1200

export function useDiagramSequence(
  frames: DiagramSpec[] | undefined,
  stepId: string,
): {
  diagram: DiagramSpec | undefined
  prevDiagram: DiagramSpec | undefined
  frameIndex: number
  frameCount: number
  sequenceComplete: boolean
  sequenceDurationMs: number
  changedIndices: number[]
} {
  const sequence = frames && frames.length > 1 ? frames : null
  const [frameIndex, setFrameIndex] = useState(0)
  const prevFrameRef = useRef<DiagramSpec | undefined>(undefined)

  useEffect(() => {
    setFrameIndex(0)
    prevFrameRef.current = undefined
  }, [stepId])

  useEffect(() => {
    if (!sequence) return
    if (frameIndex >= sequence.length - 1) return

    const t = window.setTimeout(() => {
      setFrameIndex((i) => i + 1)
    }, DIAGRAM_FRAME_MS)

    return () => window.clearTimeout(t)
  }, [sequence, frameIndex, stepId])

  const diagram = sequence ? sequence[frameIndex] : frames?.[0]
  const prevDiagram =
    sequence && frameIndex > 0 ? sequence[frameIndex - 1] : prevFrameRef.current

  useEffect(() => {
    if (diagram) prevFrameRef.current = diagram
  }, [diagram])

  const changedIndices = diagramChangedIndices(prevDiagram, diagram)

  const frameCount = sequence?.length ?? (frames?.length ? 1 : 0)
  const sequenceComplete = !sequence || frameIndex >= sequence.length - 1
  const sequenceDurationMs = sequence
    ? sequence.length * DIAGRAM_FRAME_MS + DIAGRAM_SEQUENCE_TAIL_MS
    : 0

  return {
    diagram,
    prevDiagram: frameIndex > 0 ? prevDiagram : undefined,
    frameIndex,
    frameCount,
    sequenceComplete,
    sequenceDurationMs,
    changedIndices,
  }
}
