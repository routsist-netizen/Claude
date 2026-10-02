import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api'
import { Icon, Logo } from './components/Icon'
import { Notice } from './components/controls'
import { DataProvider, useData } from './data'
import { useT } from './i18n'
import BakeDetail from './pages/BakeDetail'
import Guide from './pages/Guide'
import Journal from './pages/Journal'
import Login from './pages/Login'
import RecipeEditor from './pages/RecipeEditor'
import Recipes from './pages/Recipes'
import SchedulePage from './pages/Schedule'
import Stats from './pages/Stats'

export default function App() {
  const t = useT()
  const [user, setUser] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    api
      .me()
      .then((u) => setUser(u.username))
      .catch(() => setUser(null))
  }, [])

  if (user === undefined) return <div className="center">{t.common.loading}</div>
  if (user === null) return <Login onLogin={setUser} />

  const logout = async () => {
    await api.logout().catch(() => {})
    setUser(null)
  }

  return (
    <DataProvider key={user}>
      <div className="app">
        <header className="topbar">
          <NavLink to="/" className="brand">
            <Logo />
            {t.appName}
          </NavLink>
          <span className="spacer" />
          <span className="user-chip">{user}</span>
          <button className="icon-btn" onClick={logout} aria-label={t.nav.logout} title={t.nav.logout}>
            <Icon name="logout" />
          </button>
        </header>
        <nav className="bottom-nav" aria-label={t.nav.label}>
          <NavLink to="/" end>
            <Icon name="loaf" />
            {t.nav.recipes}
          </NavLink>
          <NavLink to="/schedule">
            <Icon name="clock" />
            {t.nav.schedule}
          </NavLink>
          <NavLink to="/guide">
            <Icon name="list" />
            {t.nav.guide}
          </NavLink>
          <NavLink to="/journal">
            <Icon name="book" />
            {t.nav.journal}
          </NavLink>
          <NavLink to="/stats">
            <Icon name="chart" />
            {t.nav.stats}
          </NavLink>
        </nav>
        <main>
          <Loaded>
            <Routes>
              <Route path="/" element={<Recipes />} />
              <Route path="/recipes/:id" element={<RecipeEditor />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/journal/:id" element={<BakeDetail />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Loaded>
        </main>
      </div>
    </DataProvider>
  )
}

function Loaded({ children }: { children: React.ReactNode }) {
  const t = useT()
  const { loading, error } = useData()
  if (loading) return <div className="center">{t.common.loading}</div>
  if (error) return <Notice kind="error">{error === 'offline' ? t.common.offline : t.common.error}</Notice>
  return <>{children}</>
}
