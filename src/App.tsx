import { useEffect, useState } from 'react'
import { ClubLadder } from './ClubLadder.tsx'
import { NationalLadder } from './NationalLadder.tsx'
import { PlayerPage } from './PlayerPage.tsx'
import './App.css'

// Hash routes: #national (default) · #club · #player/<idNo>
type Route = { view: 'national' } | { view: 'club' } | { view: 'player'; id: string }

function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h === 'club') return { view: 'club' }
  const m = h.match(/^player\/(.+)$/)
  if (m) return { view: 'player', id: m[1] }
  return { view: 'national' }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

function App() {
  const route = useRoute()
  const tab = route.view === 'club' ? 'club' : 'national'

  return (
    <main className="layout">
      <header>
        <div className="panel-head">
          <h1>Squash Ratings</h1>
          <nav className="segmented" aria-label="Ladder">
            <a className={tab === 'national' ? 'on' : ''} href="#national">
              KSF National
            </a>
            <a className={tab === 'club' ? 'on' : ''} href="#club">
              Club
            </a>
          </nav>
        </div>
        <p className="muted">
          Glicko-2 with margin of victory. A rating is shown as{' '}
          <span className="mono">rating ± RD</span>; the ± shrinks as a player plays more.
        </p>
      </header>

      {route.view === 'player' ? <PlayerPage id={route.id} /> : route.view === 'club' ? <ClubLadder /> : <NationalLadder />}
    </main>
  )
}

export default App
