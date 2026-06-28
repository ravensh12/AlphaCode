import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader } from './components/Loader'
import { prefetchBossBattle } from './lib/prefetchBattle'
import { LandingPage } from './pages/LandingPage'
import { AuthPage } from './pages/AuthPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { IntroPage } from './pages/IntroPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { CourseHomePage } from './pages/CourseHomePage'
import { QuestMapPage } from './pages/QuestMapPage'
import { WorldHubPage } from './pages/WorldHubPage'
import { LessonPage } from './pages/LessonPage'
import { ReviewPage } from './pages/ReviewPage'
import { StartRedirect } from './pages/StartRedirect'
import { FinalJourneyPage } from './pages/FinalJourneyPage'
import { FinalExamPage } from './pages/FinalExamPage'
import { ProfilePage } from './pages/ProfilePage'
import { WarmupPage } from './pages/WarmupPage'

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
const ThresholdPage = lazy(() => import('./pages/ThresholdPage'))

export default function App() {
  // Once the player is in the overworld (three.js already loaded), warm the
  // boss-battle chunk during idle time so pressing E doesn't stall on a cold
  // fetch + parse of the arena modules mid-navigation.
  const location = useLocation()
  useEffect(() => {
    if (location.pathname === '/quest') prefetchBossBattle()
  }, [location.pathname])

  return (
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
            <OnboardingPage />
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
        path="/world/:lessonId"
        element={
          <ProtectedRoute>
            <WorldHubPage />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
