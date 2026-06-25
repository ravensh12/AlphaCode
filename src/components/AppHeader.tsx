import { useLocation, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../context/AuthContext'
import { IconGrid } from './icons'
import './AppHeader.css'

export function AppHeader() {
  const { displayName, isGuest, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const onCoursePage = location.pathname === '/quest'
  const courseTarget = '/quest'

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  function goIntro() {
    navigate('/')
  }

  function goCourse() {
    navigate(courseTarget)
  }

  return (
    <header className="app-header">
      <div className="container app-header-inner">
        <Brand to="/" onNavigate={goIntro} />
        <div className="app-header-right">
          {!onCoursePage && (
            <button
              type="button"
              className="btn ghost app-header-course"
              onClick={goCourse}
            >
              <IconGrid size={16} />
              <span className="app-header-course-label">Map</span>
            </button>
          )}
          <span className="app-header-user">
            {isGuest ? 'Guest' : displayName}
          </span>
          <button className="btn ghost app-header-signout" onClick={handleSignOut}>
            {isGuest ? 'Exit' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  )
}
