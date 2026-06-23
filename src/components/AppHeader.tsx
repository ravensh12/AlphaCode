import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../context/AuthContext'
import { IconGrid } from './icons'
import './AppHeader.css'

export function AppHeader() {
  const { displayName, isGuest, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const onCoursePage = location.pathname === '/home'

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <header className="app-header">
      <div className="container app-header-inner">
        <Brand to={isGuest ? '/start' : '/home'} />
        <div className="app-header-right">
          {!onCoursePage && !isGuest && (
            <Link className="btn ghost app-header-course" to="/home">
              <IconGrid size={16} />
              <span className="app-header-course-label">Course</span>
            </Link>
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
