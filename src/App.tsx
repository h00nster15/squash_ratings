import { lazy, Suspense, useEffect, useState } from 'react'
import { ClubLadder } from './ClubLadder.tsx'
import { NationalLadder } from './NationalLadder.tsx'
import { PlayerPage } from './PlayerPage.tsx'
import { org } from './org.ts'
import { loadData, saveData } from './storage.ts'
import { TournamentPage } from './TournamentPage.tsx'
import { Tournaments } from './Tournaments.tsx'
import './App.css'

// The club-league view and its dataset only ship in builds whose org has one.
const SeoulLeague = lazy(() => import('./SeoulLeague.tsx').then((m) => ({ default: m.SeoulLeague })))

// Hash routes: #national (default) · #player/<idNo> · #club · #league · #tournaments · #tournament/<id>
type Route =
  | { view: 'national' }
  | { view: 'league'; player?: string }
  | { view: 'player'; id: string }
  | { view: 'club' }
  | { view: 'tournaments' }
  | { view: 'tournament'; id: string }

function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (h === 'club') return { view: 'club' }
  if (org.leagueLabel) {
    if (h === 'league') return { view: 'league' }
    const lp = h.match(/^league\/player\/(.+)$/)
    if (lp) return { view: 'league', player: decodeURIComponent(lp[1]) }
  }
  if (h === 'tournaments') return { view: 'tournaments' }
  let m = h.match(/^player\/(.+)$/)
  if (m) return { view: 'player', id: m[1] }
  m = h.match(/^tournament\/(.+)$/)
  if (m) return { view: 'tournament', id: m[1] }
  if (h === 'national') return { view: 'national' }
  return { view: org.defaultView }
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

const TABS = [
  ...(org.leagueLabel ? [{ key: 'league', href: '#league', label: org.leagueLabel }] : []),
  { key: 'national', href: '#national', label: 'KSF National' },
  { key: 'club', href: '#club', label: org.clubLabel },
  { key: 'tournaments', href: '#tournaments', label: 'Tournaments' },
] as const

function App() {
  const route = useRoute()
  const [data, setData] = useState(loadData)
  useEffect(() => saveData(data), [data])

  const tab = route.view === 'player' ? 'national' : route.view === 'tournament' ? 'tournaments' : route.view

  return (
    <main className="layout">
      <header>
        <div className="panel-head">
          <h1>{org.title}</h1>
          <nav className="segmented" aria-label="Section">
            {TABS.map((t) => (
              <a key={t.key} className={tab === t.key ? 'on' : ''} href={t.href}>
                {t.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="muted">
          {org.subtitle} A rating is shown as <span className="mono">rating ± uncertainty</span>; the ±
          shrinks as a player plays more.
        </p>
      </header>

      {route.view === 'player' ? (
        <PlayerPage id={route.id} />
      ) : route.view === 'league' ? (
        <Suspense fallback={<p className="muted">Loading league…</p>}>
          <SeoulLeague player={route.player} />
        </Suspense>
      ) : route.view === 'club' ? (
        <ClubLadder data={data} setData={setData} />
      ) : route.view === 'tournaments' ? (
        <Tournaments data={data} setData={setData} />
      ) : route.view === 'tournament' ? (
        <TournamentPage id={route.id} data={data} setData={setData} />
      ) : (
        <NationalLadder />
      )}
    </main>
  )
}

export default App
