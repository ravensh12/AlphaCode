import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { DiagramSpec } from '../../types/lesson'
import { analyzeSequenceMotion } from '../../lib/diagramMotion'
import { hashMapChangedRows, stackTopChanged } from '../../lib/diagramDiff'
import { ProblemDiagrams } from './ProblemDiagrams'
import './VisualDiagram.css'

type SwapFlyer = {
  id: string
  char: string
  fromX: number
  fromY: number
  dx: number
  dy: number
}

function cellCenter(el: HTMLElement): number {
  return el.offsetLeft + el.offsetWidth / 2
}

function SequenceViz({
  diagram,
  prevDiagram,
  animated,
  motion,
  changedIndices,
  ariaLabel,
  vizClass,
}: {
  diagram: Extract<DiagramSpec, { kind: 'array' } | { kind: 'string' }>
  prevDiagram?: DiagramSpec
  animated?: boolean
  motion?: boolean
  changedIndices?: number[]
  ariaLabel: string
  vizClass: string
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const [pointerLeft, setPointerLeft] = useState<Record<string, number>>({})
  const [swapFlyers, setSwapFlyers] = useState<SwapFlyer[]>([])
  const [swappingIndices, setSwappingIndices] = useState<Set<number>>(new Set())

  const changed = new Set(changedIndices ?? [])
  const cells =
    diagram.kind === 'string'
      ? diagram.chars.split('')
      : diagram.values.map(String)
  const pointers = diagram.pointers ?? []
  const pointerKey = pointers.map((p) => `${p.label}:${p.index}`).join('|')

  const cellClass = (index: number, extra = '') =>
    `viz-cell ${extra} ${animated ? 'viz-cell-animated' : ''} ${motion ? 'viz-cell-motion' : ''} ${changed.has(index) ? 'viz-cell-changed' : ''} ${swappingIndices.has(index) ? 'viz-cell-swapping' : ''}`.trim()

  const measurePointerPositions = () => {
    const next: Record<string, number> = {}
    for (const p of pointers) {
      const cell = cellRefs.current[p.index]
      if (cell) next[p.label] = cellCenter(cell)
    }
    setPointerLeft(next)
  }

  useLayoutEffect(() => {
    measurePointerPositions()
  }, [diagram, pointerKey])

  useLayoutEffect(() => {
    if (!motion || !animated || !prevDiagram || prevDiagram.kind !== diagram.kind) {
      setSwapFlyers([])
      setSwappingIndices(new Set())
      return
    }

    const { swaps } = analyzeSequenceMotion(prevDiagram, diagram)
    if (swaps.length === 0) {
      setSwapFlyers([])
      setSwappingIndices(new Set())
      return
    }

    const flyers: SwapFlyer[] = []
    const swapping = new Set<number>()

    for (const [i, j] of swaps) {
      const cellI = cellRefs.current[i]
      const cellJ = cellRefs.current[j]
      if (!cellI || !cellJ) continue

      const prevValues =
        prevDiagram.kind === 'string'
          ? prevDiagram.chars.split('')
          : prevDiagram.values.map(String)

      swapping.add(i)
      swapping.add(j)

      flyers.push({
        id: `${i}-${j}-a`,
        char: prevValues[i] ?? '',
        fromX: cellCenter(cellI),
        fromY: cellI.offsetTop + cellI.offsetHeight / 2,
        dx: cellCenter(cellJ) - cellCenter(cellI),
        dy: cellJ.offsetTop + cellJ.offsetHeight / 2 - (cellI.offsetTop + cellI.offsetHeight / 2),
      })
      flyers.push({
        id: `${i}-${j}-b`,
        char: prevValues[j] ?? '',
        fromX: cellCenter(cellJ),
        fromY: cellJ.offsetTop + cellJ.offsetHeight / 2,
        dx: cellCenter(cellI) - cellCenter(cellJ),
        dy: cellI.offsetTop + cellI.offsetHeight / 2 - (cellJ.offsetTop + cellJ.offsetHeight / 2),
      })
    }

    setSwapFlyers(flyers)
    setSwappingIndices(swapping)
    measurePointerPositions()
  }, [diagram, prevDiagram, motion, animated])

  useEffect(() => {
    if (swapFlyers.length === 0) return
    const t = window.setTimeout(() => {
      setSwapFlyers([])
      setSwappingIndices(new Set())
    }, 620)
    return () => window.clearTimeout(t)
  }, [swapFlyers])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const ro = new ResizeObserver(() => measurePointerPositions())
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={vizClass} role="img" aria-label={ariaLabel}>
      <div className="viz-sequence">
        {pointers.length > 0 && (
          <div className="viz-pointer-rail" aria-hidden="true">
            {pointers.map((p) => (
              <span
                key={p.label}
                className={`viz-pointer-badge ${motion ? 'viz-pointer-badge-motion' : ''}`}
                style={{ left: pointerLeft[p.label] ?? 0 }}
              >
                {p.label}
              </span>
            ))}
          </div>
        )}

        <div className="viz-row viz-row-sequence" ref={rowRef}>
          {cells.map((val, i) => (
            <div
              key={i}
              ref={(el) => {
                cellRefs.current[i] = el
              }}
              className={cellClass(
                i,
                `${diagram.kind === 'array' && diagram.highlight === i ? 'highlight' : ''} ${
                  pointers.some((p) => p.index === i) ? 'pointed' : ''
                } ${diagram.visited?.includes(i) ? 'visited' : ''}`,
              )}
            >
              <span className="viz-cell-val">{val}</span>
              <span className="viz-cell-idx">{i}</span>
            </div>
          ))}

          {swapFlyers.map((flyer) => (
            <span
              key={flyer.id}
              className="viz-swap-flyer"
              style={
                {
                  left: `${flyer.fromX}px`,
                  top: `${flyer.fromY}px`,
                  '--dx': `${flyer.dx}px`,
                  '--dy': `${flyer.dy}px`,
                } as CSSProperties
              }
            >
              {flyer.char}
            </span>
          ))}
        </div>
      </div>

      {pointers.length > 0 && (
        <div className="viz-pointers viz-pointers-caption">
          {pointers.map((p) => (
            <span key={`${p.label}-${p.index}`} className="viz-pointer">
              {p.label} → {diagram.kind === 'string' ? p.index : `index ${p.index}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function BinarySearchViz({
  diagram,
  prevDiagram,
  animated,
  motion,
  changedIndices,
  vizClass,
}: {
  diagram: Extract<DiagramSpec, { kind: 'binarySearch' }>
  prevDiagram?: DiagramSpec
  animated?: boolean
  motion?: boolean
  changedIndices?: number[]
  vizClass: string
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const [badgeLeft, setBadgeLeft] = useState<Record<string, number>>({})

  const changed = new Set(changedIndices ?? [])
  const badges = [
    diagram.low != null ? { label: 'low', index: diagram.low } : null,
    diagram.mid != null ? { label: 'mid', index: diagram.mid } : null,
    diagram.high != null ? { label: 'high', index: diagram.high } : null,
  ].filter((b): b is { label: string; index: number } => b != null)
  const badgeKey = badges.map((b) => `${b.label}:${b.index}`).join('|')

  const measureBadges = () => {
    const next: Record<string, number> = {}
    for (const b of badges) {
      const cell = cellRefs.current[b.index]
      if (cell) next[b.label] = cellCenter(cell)
    }
    setBadgeLeft(next)
  }

  useLayoutEffect(() => {
    measureBadges()
  }, [diagram, badgeKey])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const ro = new ResizeObserver(() => measureBadges())
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  const cellClass = (index: number, extra = '') =>
    `viz-cell ${extra} ${animated ? 'viz-cell-animated' : ''} ${motion ? 'viz-cell-motion' : ''} ${changed.has(index) ? 'viz-cell-changed' : ''}`.trim()

  return (
    <div className={vizClass} role="img" aria-label="Binary search diagram">
      <div className="viz-sequence">
        {badges.length > 0 && (
          <div className="viz-pointer-rail" aria-hidden="true">
            {badges.map((b) => {
              const moved =
                motion &&
                prevDiagram?.kind === 'binarySearch' &&
                prevDiagram[b.label as 'low' | 'mid' | 'high'] !== b.index
              return (
                <span
                  key={b.label}
                  className={`viz-pointer-badge viz-bs-badge ${b.label} ${motion ? 'viz-pointer-badge-motion' : ''} ${moved ? 'viz-bs-badge-moved' : ''}`}
                  style={{ left: badgeLeft[b.label] ?? 0 }}
                >
                  {b.label}
                </span>
              )
            })}
          </div>
        )}

        <div className="viz-row viz-row-sequence" ref={rowRef}>
          {diagram.values.map((v, i) => {
            const isMid = diagram.mid === i
            const inRange =
              diagram.low != null &&
              diagram.high != null &&
              i >= diagram.low &&
              i <= diagram.high
            return (
              <div
                key={i}
                ref={(el) => {
                  cellRefs.current[i] = el
                }}
                className={cellClass(
                  i,
                  `${isMid ? 'highlight' : ''} ${inRange ? 'in-range' : 'out-range'}`,
                )}
              >
                <span className="viz-cell-val">{v}</span>
                <span className="viz-cell-idx">{isMid ? 'mid' : i}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="viz-pointers viz-bs-pointer-caption">
        {diagram.low != null && (
          <span className="viz-pointer">low → {diagram.low}</span>
        )}
        {diagram.mid != null && (
          <span className="viz-pointer">mid → {diagram.mid}</span>
        )}
        {diagram.high != null && (
          <span className="viz-pointer">high → {diagram.high}</span>
        )}
      </div>
    </div>
  )
}

function StackViz({
  diagram,
  prevDiagram,
  animated,
  motion,
  vizClass,
}: {
  diagram: Extract<DiagramSpec, { kind: 'stack' }>
  prevDiagram?: DiagramSpec
  animated?: boolean
  motion?: boolean
  vizClass: string
}) {
  const prevStack = prevDiagram?.kind === 'stack' ? prevDiagram : undefined
  const grew = !!prevStack && diagram.items.length > prevStack.items.length
  const shrank = !!prevStack && diagram.items.length < prevStack.items.length
  const topChanged = !!prevStack && stackTopChanged(prevStack, diagram)

  return (
    <div className={vizClass} role="img" aria-label="Stack diagram">
      <p className="viz-caption">Stack — last in, first out</p>
      <div className="viz-stack-col">
        {diagram.items.length === 0 ? (
          <span className="viz-empty muted">empty</span>
        ) : (
          [...diagram.items].reverse().map((item, i) => {
            const isTop = i === 0
            const pushIn = isTop && topChanged && grew && motion
            const popSettle = isTop && topChanged && shrank && motion
            return (
              <div
                key={`${item}-${i}-${diagram.items.length}`}
                className={`viz-stack-item ${animated ? 'viz-stack-item-animated' : ''} ${isTop ? 'top' : ''} ${pushIn ? 'viz-stack-push-in' : ''} ${popSettle ? 'viz-stack-pop-settle' : ''} ${isTop && topChanged && animated ? 'viz-stack-top-changed' : ''}`}
              >
                {item}
                {isTop && <span className="viz-stack-tag">top</span>}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function VisualDiagram({
  diagram,
  prevDiagram,
  animated,
  motion,
  changedIndices,
}: {
  diagram: DiagramSpec
  prevDiagram?: DiagramSpec
  animated?: boolean
  motion?: boolean
  changedIndices?: number[]
}) {
  const vizClass = (base: string) =>
    `${base} ${animated ? 'viz-animated' : ''} ${motion ? 'viz-motion' : ''}`.trim()

  switch (diagram.kind) {
    case 'array':
      return (
        <SequenceViz
          diagram={diagram}
          prevDiagram={prevDiagram}
          animated={animated}
          motion={motion}
          changedIndices={changedIndices}
          ariaLabel="Array diagram"
          vizClass={vizClass('viz viz-array')}
        />
      )

    case 'string':
      return (
        <SequenceViz
          diagram={diagram}
          prevDiagram={prevDiagram}
          animated={animated}
          motion={motion}
          changedIndices={changedIndices}
          ariaLabel="String diagram"
          vizClass={vizClass('viz viz-string')}
        />
      )

    case 'hashmap': {
      const changedRows = new Set(
        changedIndices ??
          (prevDiagram?.kind === 'hashmap'
            ? hashMapChangedRows(prevDiagram, diagram)
            : []),
      )
      const lookupPulse =
        motion &&
        prevDiagram?.kind === 'hashmap' &&
        prevDiagram.lookup !== diagram.lookup &&
        diagram.lookup

      return (
        <div className={vizClass('viz viz-hashmap')} role="img" aria-label="Hash map diagram">
          <p className="viz-caption">Hash map — key → value</p>
          <div className="viz-map-rows">
            {diagram.entries.length === 0 ? (
              <span className="viz-empty muted">empty {`{}`}</span>
            ) : (
              diagram.entries.map((e, i) => (
                <div
                  key={e.key}
                  className={`viz-map-row ${changedRows.has(i) ? 'viz-map-row-new' : ''} ${animated ? 'viz-map-row-animated' : ''}`}
                >
                  <span className="viz-map-key">{e.key}</span>
                  <span className="viz-map-arrow">→</span>
                  <span className="viz-map-val">{e.value}</span>
                </div>
              ))
            )}
          </div>
          {diagram.lookup && (
            <p className={`viz-lookup ${lookupPulse ? 'viz-lookup-pulse' : ''}`}>
              Looking for <strong>{diagram.lookup}</strong>…
            </p>
          )}
        </div>
      )
    }

    case 'stack':
      return (
        <StackViz
          diagram={diagram}
          prevDiagram={prevDiagram}
          animated={animated}
          motion={motion}
          vizClass={vizClass('viz viz-stack')}
        />
      )

    case 'binarySearch':
      return (
        <BinarySearchViz
          diagram={diagram}
          prevDiagram={prevDiagram}
          animated={animated}
          motion={motion}
          changedIndices={changedIndices}
          vizClass={vizClass('viz viz-binary')}
        />
      )

    case 'linkedList':
    case 'tree':
    case 'graph':
    case 'grid':
    case 'intervals':
    case 'recursion':
    case 'bits':
      return <ProblemDiagrams diagram={diagram} />
  }
}
