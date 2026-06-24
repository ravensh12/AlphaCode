import { Fragment, useLayoutEffect, useRef, useState } from 'react'

type Token = { text: string; kind: 'var' | 'num' | 'op' | 'plain' }

function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  const re = /(\d+)|([A-Za-z_]\w*)|(==|!=|<=|>=|[=+\-*/%<>])|(\s+)|(.)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m[1]) tokens.push({ text: m[1], kind: 'num' })
    else if (m[2]) tokens.push({ text: m[2], kind: 'var' })
    else if (m[3]) tokens.push({ text: m[3], kind: 'op' })
    else if (m[4]) tokens.push({ text: m[4], kind: 'plain' })
    else tokens.push({ text: m[5] ?? m[0], kind: 'plain' })
  }
  return tokens
}

export function CodePanel({
  code,
  currentLineIndex,
  prevLineIndex,
  showRunHint,
  animated,
  motion,
}: {
  code: string[]
  currentLineIndex?: number
  prevLineIndex?: number
  showRunHint?: boolean
  animated?: boolean
  motion?: boolean
}) {
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const [band, setBand] = useState<{ top: number; height: number } | null>(null)
  const slideHighlight =
    animated &&
    currentLineIndex != null &&
    prevLineIndex != null &&
    prevLineIndex !== currentLineIndex

  useLayoutEffect(() => {
    if (currentLineIndex == null) {
      setBand(null)
      return
    }
    const line = lineRefs.current[currentLineIndex]
    if (!line) return
    setBand({ top: line.offsetTop, height: line.offsetHeight })
  }, [currentLineIndex, code, showRunHint])

  return (
    <div
      className={`code-panel ${animated ? 'code-panel-animated' : ''} ${motion ? 'code-panel-motion' : ''} ${slideHighlight ? 'code-panel-slide-highlight' : ''}`}
      role="img"
      aria-label="Python code"
    >
      <div className="code-panel-bar" aria-hidden="true">
        <span className="code-dot" />
        <span className="code-dot" />
        <span className="code-dot" />
        <span className="code-filename">main.py</span>
      </div>
      <pre className="code-lines">
        {slideHighlight && band && (
          <div
            className="code-line-band"
            aria-hidden="true"
            style={{ top: band.top, height: band.height }}
          />
        )}
        {code.map((line, i) => {
          const active = i === currentLineIndex
          return (
            <div
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              className={`code-line ${active ? 'active' : ''} ${animated && active ? 'active-animated' : ''}`}
            >
              <span className="code-ln">{i + 1}</span>
              <code className="code-text">
                {tokenize(line).map((t, j) => (
                  <Fragment key={j}>
                    {t.kind === 'plain' ? (
                      t.text
                    ) : (
                      <span className={`tok-${t.kind}`}>{t.text}</span>
                    )}
                  </Fragment>
                ))}
              </code>
              {active && showRunHint && (
                <span className="code-run-flag" aria-hidden="true">
                  running
                </span>
              )}
            </div>
          )
        })}
      </pre>
    </div>
  )
}
