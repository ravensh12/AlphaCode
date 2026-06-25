import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Loader } from './components/Loader'
import { LandingPage } from './pages/LandingPage'
import { AuthPage } from './pages/AuthPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { CourseHomePage } from './pages/CourseHomePage'
import { QuestMapPage } from './pages/QuestMapPage'
import { WorldHubPage } from './pages/WorldHubPage'
import { LessonPage } from './pages/LessonPage'
import { ReviewPage } from './pages/ReviewPage'
import { StartRedirect } from './pages/StartRedirect'

// 3D game routes pull in three.js — load them lazily so the rest stays light.
const Overworld3DPage = lazy(() =>
  import('./pages/Overworld3DPage').then((m) => ({ default: m.Overworld3DPage })),
)
const BossBattlePage = lazy(() =>
  import('./pages/BossBattlePage').then((m) => ({ default: m.BossBattlePage })),
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
