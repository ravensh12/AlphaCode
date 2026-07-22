import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { IconGrid, IconTerminal, IconTrophy } from '../components/icons'
import { LandingHero3D } from '../components/landing/LandingHero3D'
import { useAuth } from '../context/AuthContext'
import { playClick } from '../lib/soundFx'
import './LandingPage.css'

/* The real NeetCode-150 topic tracks, in curriculum order (see
   src/content/curricula/neetcode150/manifest.ts). */
const DISTRICTS = [
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window',
  'Stack',
  'Binary Search',
  'Linked List',
  'Trees',
  'Tries',
  'Heap / Priority Queue',
  'Backtracking',
  'Graphs',
  'Advanced Graphs',
  '1-D Dynamic Programming',
  '2-D Dynamic Programming',
  'Greedy',
  'Intervals',
  'Math & Geometry',
  'Bit Manipulation',
]

export function LandingPage() {
  const { status } = useAuth()
  const inCity = status === 'authenticated' || status === 'guest'
  const playTo = inCity ? '/start' : '/auth'

  return (
    <div className="page landing">
      <header className="landing-nav">
        <div className="container landing-nav-inner">
          <Brand />
          <nav className="landing-nav-actions">
            {inCity ? (
              <Link className="btn subtle" to="/quest">
                Continue quest
              </Link>
            ) : (
              <Link className="btn ghost" to="/auth">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-bg" aria-hidden="true" />
          <LandingHero3D />
          <div className="landing-hero-veil" aria-hidden="true" />
          <div className="landing-rain" aria-hidden="true" />
          <div className="container landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">The NeetCode 150, playable</p>
              <h1 className="landing-title">
                Learn algorithms.
                <br />
                <span className="landing-title-accent">Survive Code City.</span>
              </h1>
              <p className="landing-lede">
                A neon open world where every checkpoint is a real interview problem. Fight
                through the streets, drop into the in-game IDE, and write Python that
                actually runs. <strong className="landing-lede-claim">Train until you can
                pass a Google interview — by playing a game.</strong>
              </p>
              <div className="landing-cta">
                <Link className="btn lg" to={playTo} onClick={() => playClick()}>
                  Play now
                </Link>
                {!inCity && (
                  <Link className="btn ghost lg" to="/auth">
                    Sign in
                  </Link>
                )}
              </div>
              <p className="landing-meta">
                <span>150 curated problems</span>
                <span>Real Python</span>
                <span>Plays in the browser</span>
              </p>
            </div>
          </div>
        </section>

        <section className="landing-proof" aria-label="What you get">
          <div className="container landing-proof-inner">
            <div className="landing-proof-item">
              <span className="landing-proof-icon cyan" aria-hidden="true">
                <IconGrid size={20} />
              </span>
              <p>
                <strong>The real NeetCode 150.</strong> Arrays &amp; Hashing through Dynamic
                Programming, in the canonical order.
              </p>
            </div>
            <div className="landing-proof-item">
              <span className="landing-proof-icon violet" aria-hidden="true">
                <IconTerminal size={20} />
              </span>
              <p>
                <strong>An IDE inside the game.</strong> Write and run real Python against real
                test cases to clear each mission.
              </p>
            </div>
            <div className="landing-proof-item">
              <span className="landing-proof-icon magenta" aria-hidden="true">
                <IconTrophy size={20} />
              </span>
              <p>
                <strong>Bosses certify mastery.</strong> Each district ends in a boss fight
                only working code can win.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-ide">
          <div className="landing-ide-bg" aria-hidden="true" />
          <div className="container landing-ide-inner">
            <div className="landing-ide-copy">
              <p className="landing-kicker">The weapon is code</p>
              <h2>Missions end at a terminal.</h2>
              <p className="landing-ide-lede">
                Corrupted terminals are scrambling the streets. Restoring one drops you into
                the in-game IDE with a real problem from the 150 — your solution runs against
                real test cases, and the checkpoint only unseals when they pass.
              </p>
            </div>
            <div className="landing-terminal" role="img" aria-label="The in-game mission terminal: a Python solution to Contains Duplicate with all nine test cases passing.">
              <div className="landing-terminal-bar">
                <span className="landing-terminal-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="landing-terminal-title">
                  mission terminal — contains duplicate
                </span>
                <span className="landing-terminal-status">running</span>
              </div>
              <pre className="landing-terminal-code" aria-hidden="true">
                <code>
                  <span className="ln">1</span>
                  <span className="kw">def</span> <span className="fn">contains_duplicate</span>(codes):{'\n'}
                  <span className="ln">2</span>    seen = <span className="fn">set</span>(){'\n'}
                  <span className="ln">3</span>    <span className="kw">for</span> code <span className="kw">in</span> codes:{'\n'}
                  <span className="ln">4</span>        <span className="kw">if</span> code <span className="kw">in</span> seen:{'\n'}
                  <span className="ln">5</span>            <span className="kw">return</span> <span className="cst">True</span>{'\n'}
                  <span className="ln">6</span>        seen.<span className="fn">add</span>(code){'\n'}
                  <span className="ln">7</span>    <span className="kw">return</span> <span className="cst">False</span>
                </code>
              </pre>
              <div className="landing-terminal-run" aria-hidden="true">
                <span className="landing-terminal-pass">9/9 tests passed</span>
                <span className="landing-terminal-note">checkpoint unsealed</span>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-shots">
          <div className="container">
            <h2 className="landing-shots-title">Shot in-engine. This is the game.</h2>
            <div className="landing-shots-grid">
              <figure className="landing-shot">
                <img
                  src="/landing/hero-street.jpg"
                  alt="Third-person view of the player sprinting down a Code City street at night, following a neon trail toward a glowing checkpoint pillar."
                  loading="lazy"
                />
                <figcaption>Checkpoint run — Arrays &amp; Hashing, Level 1</figcaption>
              </figure>
              <figure className="landing-shot">
                <img
                  src="/landing/city-canyon.jpg"
                  alt="A night avenue in Code City, emissive skyscraper windows on both sides and the mission trail cutting across the asphalt."
                  loading="lazy"
                />
                <figcaption>Downtown, after dark</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="landing-districts" aria-label="Curriculum">
          <div className="container">
            <p className="landing-kicker">18 districts &middot; 150 problems</p>
            <h2 className="landing-districts-title">One city. The whole interview.</h2>
            <ol className="landing-districts-list">
              {DISTRICTS.map((name, i) => (
                <li key={name}>
                  <span className="landing-district-n">{String(i + 1).padStart(2, '0')}</span>
                  {name}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-final">
          <div className="landing-final-bg" aria-hidden="true" />
          <div className="container landing-final-inner">
            <h2>The city is waiting.</h2>
            <p>Sign in to save your run, or drop in as a guest.</p>
            <Link className="btn lg" to={playTo} onClick={() => playClick()}>
              Play now
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="container">
          <span className="landing-footer-brand">
            <strong>AlphaCode</strong>
            <span className="landing-footer-tag">Learn to code &middot; survive Code City</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
