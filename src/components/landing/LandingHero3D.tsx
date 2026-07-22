import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'

/* ============================================================================
   Poster-first hero backdrop. First paint is the static rooftop poster
   (CSS background on .landing-hero-bg — the LCP element). This component
   then, only when appropriate, hydrates the live 3D rooftop on top:

   - waits for the browser to go idle after mount (never competes with LCP)
   - skips entirely for prefers-reduced-motion, no-WebGL, or Save-Data
   - pauses the frameloop when the hero scrolls offscreen or the tab hides
   - fades the canvas in over the poster once the first frame is ready
   ========================================================================== */

const HeroRooftopScene = lazy(() => import('./HeroRooftopScene'))

/** Decorative backdrop: if the 3D scene throws, keep the poster, no UI. */
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function canRunLive(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData) return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export function LandingHero3D() {
  const host = useRef<HTMLDivElement>(null)
  const [mount, setMount] = useState(false)
  const [visible, setVisible] = useState(true)
  const [tabAwake, setTabAwake] = useState(true)
  const [ready, setReady] = useState(false)

  // Hydrate after idle, only if the environment can afford it.
  useEffect(() => {
    if (!canRunLive()) return
    const start = () => setMount(true)
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 2500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(start, 900)
    return () => window.clearTimeout(id)
  }, [])

  // Pause when the hero leaves the viewport or the tab hides.
  useEffect(() => {
    if (!mount || !host.current) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    )
    io.observe(host.current)
    const onVis = () => setTabAwake(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [mount])

  // Reveal the canvas shortly after mount — by then the first frames have
  // rendered and the crossfade from the poster is seamless.
  useEffect(() => {
    if (!mount) return
    const id = window.setTimeout(() => setReady(true), 450)
    return () => window.clearTimeout(id)
  }, [mount])

  return (
    <div
      ref={host}
      className={`landing-hero-live${ready ? ' is-ready' : ''}`}
      aria-hidden="true"
    >
      {mount && (
        <SilentBoundary>
          <Suspense fallback={null}>
            <HeroRooftopScene active={visible && tabAwake} />
          </Suspense>
        </SilentBoundary>
      )}
    </div>
  )
}
