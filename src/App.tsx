import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader } from './components/Loader'
import { prefetchBossBattle } from './lib/prefetchBattle'
import { LandingPage } from './pages/LandingPage'
import { AuthPage } from './pages/AuthPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { StartRedirect } from './pages/StartRedirect'

// 3D game routes pull in three.js — load them lazily so the rest stays light.
const Overworld3DPage = lazy(() =>
  import('./pages/Overworld3DPage').then((m) => ({ default: m.Overworld3DPage })),
)
const BossBattlePage = lazy(() =>
  import('./pages/BossBattlePage').then((m) => ({ default: m.BossBattlePage })),
)
const FinalBossPage = lazy(() =>
  import('./pages/FinalBossPage').then((m) => ({ default: m.FinalBossPage })),
)
// Post-campaign game modes (also three.js-heavy — loaded on demand).
const BossRushPage = lazy(() =>
  import('./pages/BossRushPage').then((m) => ({ default: m.BossRushPage })),
)
const EndlessSiegePage = lazy(() =>
  import('./pages/EndlessSiegePage').then((m) => ({ default: m.EndlessSiegePage })),
)
const ThresholdPage = lazy(() => import('./pages/ThresholdPage'))

// Content pages carry the lesson engine + every generated lesson. Lazy-load
// them too so a first visit only pays for the landing/auth shell; the app
// shell (Landing/Auth/StartRedirect) stays eager for an instant first paint.
const IntroPage = lazy(() => import('./pages/IntroPage').then((m) => ({ default: m.IntroPage })))
const CourseHomePage = lazy(() =>
  import('./pages/CourseHomePage').then((m) => ({ default: m.CourseHomePage })),
)
const QuestMapPage = lazy(() =>
  import('./pages/QuestMapPage').then((m) => ({ default: m.QuestMapPage })),
)
const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })))
const AcademyTrackPage = lazy(() =>
  import('./pages/AcademyTrackPage').then((m) => ({ default: m.AcademyTrackPage })),
)
const AcademyMissionPage = lazy(() =>
  import('./pages/AcademyMissionPage').then((m) => ({ default: m.AcademyMissionPage })),
)
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })))
const FinalJourneyPage = lazy(() =>
  import('./pages/FinalJourneyPage').then((m) => ({ default: m.FinalJourneyPage })),
)
const FinalExamPage = lazy(() =>
  import('./pages/FinalExamPage').then((m) => ({ default: m.FinalExamPage })),
)
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const DemoGuaranteePage = lazy(() =>
  import('./pages/DemoGuaranteePage').then((m) => ({
    default: m.DemoGuaranteePage,
  })),
)
const WarmupPage = lazy(() => import('./pages/WarmupPage').then((m) => ({ default: m.WarmupPage })))

// One-shot idle prefetch of the screens reachable from the overworld in one
// click (Levels list, lessons/dojo). Without this the FIRST press of
// "Levels" or E-at-a-dojo stalls on a cold chunk fetch + parse — measured as
// a visible freeze on the route switch. Uses the same import specifiers as
// the lazy() routes above, so modules are deduped.
let questSiblingsWarmed = false
function prefetchQuestSiblings(): void {
  if (questSiblingsWarmed || typeof window === 'undefined') return
  questSiblingsWarmed = true
  const run = () => {
    void import('./pages/QuestMapPage').catch(() => {
      questSiblingsWarmed = false
    })
    void import('./pages/LessonPage').catch(() => {
      questSiblingsWarmed = false
    })
  }
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run, { timeout: 3000 })
  } else {
    window.setTimeout(run, 500)
  }
}

export default function App() {
  // Once the player is in the overworld (three.js already loaded), warm the
  // boss-battle chunk during idle time so pressing E doesn't stall on a cold
  // fetch + parse of the arena modules mid-navigation. Same for the Levels
  // list and the lesson engine — the two screens one click away.
  const location = useLocation()
  useEffect(() => {
    if (location.pathname === '/quest') {
      prefetchBossBattle()
      prefetchQuestSiblings()
    }
  }, [location.pathname])

  return (
    <Suspense fallback={<Loader label="Loading" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/intro"
        element={
          <ProtectedRoute>
            <IntroPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Navigate to="/quest" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/start"
        element={
          <ProtectedRoute>
            <StartRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <CourseHomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/demo/guarantee"
        element={
          <ProtectedRoute>
            <DemoGuaranteePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warmup"
        element={
          <ProtectedRoute>
            <WarmupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quest"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loader label="Loading the realm" />}>
              <Overworld3DPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/quest/list"
        element={
          <ProtectedRoute>
            <QuestMapPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/battle/:lessonId"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loader label="Entering the arena" />}>
              <BossBattlePage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/academy/:realmId/:trackId/:problemSlug"
        element={
          <ProtectedRoute>
            <AcademyMissionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/academy/:realmId/:trackId"
        element={
          <ProtectedRoute>
            <AcademyTrackPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lesson/:lessonId/:section"
      element={
        <ProtectedRoute>
          <LessonPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/lesson/:lessonId"
        element={
          <ProtectedRoute>
            <LessonPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/review/:lessonId"
        element={
          <ProtectedRoute>
            <ReviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/threshold"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loader label="Crossing the Threshold" />}>
              <ThresholdPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/final/journey"
        element={
          <ProtectedRoute>
            <FinalJourneyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/final/exam"
        element={
          <ProtectedRoute>
            <FinalExamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/final/boss"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loader label="Entering the final arena" />}>
              <FinalBossPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gauntlet/boss-rush"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loader label="Entering the gauntlet" />}>
              <BossRushPage />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/gauntlet/endless"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loader label="Entering the siege" />}>
              <EndlessSiegePage />
            </Suspense>
          </ProtectedRoute>
        }
      />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
