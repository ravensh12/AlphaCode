import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ProgressProvider } from './context/ProgressContext'
import { GauntletProvider } from './context/GauntletContext'
import { DemoGuaranteeProvider } from './context/DemoGuaranteeContext'
import { PlayerLevelProvider } from './context/PlayerLevelContext'
import { LevelUpToast } from './components/LevelUpToast'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ProgressProvider>
            <DemoGuaranteeProvider>
              <GauntletProvider>
                <PlayerLevelProvider>
                  <App />
                  <LevelUpToast />
                </PlayerLevelProvider>
              </GauntletProvider>
            </DemoGuaranteeProvider>
          </ProgressProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
