import { lazy, Suspense, useEffect, useState } from 'react'
import { org } from './org.ts'
import { loadData, saveData } from './storage.ts'
import { WellperionRatings } from './WellperionRatings.tsx'
import './App.css'

// Every view is loaded when opened, so an org that shows only its own ratings never
// fetches the KSF national data. The club-league view ships only in builds whose org has one.
const NationalLadder = lazy(() => import('./NationalLadder.tsx').then((m) => ({ default: m.NationalLadder })))
const PlayerPage = lazy(() => import('./PlayerPage.tsx').then((m) => ({ default: m.PlayerPage })))
const RankingPoints = lazy(() => import('./RankingPoints.tsx').then((m) => ({ default: m.RankingPoints })))
const RankingCompare = lazy(() => import('./RankingCompare.tsx').then((m) => ({ default: m.RankingCompare })))
const ClubLadder = lazy(() => import('./ClubLadder.tsx').then((m) => ({ default: m.ClubLadder })))
const Tournaments = lazy(() => import('./Tournaments.tsx').then((m) => ({ default: m.Tournaments })))
const TournamentPage = lazy(() => import('./TournamentPage.tsx').then((m) => ({ default: m.TournamentPage })))
const SeoulLeague = lazy(() => import('./SeoulLeague.tsx').then((m) => ({ default: m.SeoulLeague })))

// Hash routes: #national (default) · #player/<idNo> · #points · #compare · #wellperion · #club · #league · #tournaments · #tournament/<id>
type Route =
  | { view: 'national' }
  | { view: 'points' }
  | { view: 'compare' }
  | { view: 'league'; player?: string }
  | { view: 'player'; id: string }
  | { view: 'club' }
  | { view: 'wellperion'; player?: string }
  | { view: 'tournaments' }
  | { view: 'tournament'; id: string }

function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (org.clubSource) {
    if (h === 'wellperion') return { view: 'wellperion' }
    const wp = h.match(/^wellperion\/player\/(.+)$/)
    if (wp) return { view: 'wellperion', player: decodeURIComponent(wp[1]) }
  }
  if (org.leagueLabel) {
    if (h === 'league') return { view: 'league' }
    const lp = h.match(/^league\/player\/(.+)$/)
    if (lp) return { view: 'league', player: decodeURIComponent(lp[1]) }
  }
  if (org.national) {
    if (h === 'club') return { view: 'club' }
    if (h === 'points') return { view: 'points' }
    if (h === 'compare') return { view: 'compare' }
    if (h === 'tournaments') return { view: 'tournaments' }
    let m = h.match(/^player\/(.+)$/)
    if (m) return { view: 'player', id: m[1] }
    m = h.match(/^tournament\/(.+)$/)
    if (m) return { view: 'tournament', id: m[1] }
    if (h === 'national') return { view: 'national' }
  }
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
  ...(org.clubSource ? [{ key: 'wellperion', href: '#wellperion', label: org.clubSource.label }] : []),
  ...(org.national
    ? [
        { key: 'national', href: '#national', label: 'KSF National' },
        { key: 'points', href: '#points', label: 'Ranking Points' },
        { key: 'compare', href: '#compare', label: 'Compare' },
        { key: 'club', href: '#club', label: org.clubLabel },
        { key: 'tournaments', href: '#tournaments', label: 'Tournaments' },
      ]
    : []),
]

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
          {TABS.length > 1 && (
            <nav className="segmented" aria-label="Section">
              {TABS.map((t) => (
                <a key={t.key} className={tab === t.key ? 'on' : ''} href={t.href}>
                  {t.label}
                </a>
              ))}
            </nav>
          )}
        </div>
        <p className="muted">
          {org.subtitle}
          {org.national && (
            <>
              {' '}A rating is shown as <span className="mono">rating ± uncertainty</span>; the ± shrinks as a player plays more.
            </>
          )}
        </p>
      </header>

      <Suspense fallback={<p className="muted">Loading…</p>}>
        {route.view === 'player' ? (
          <PlayerPage id={route.id} />
        ) : route.view === 'league' ? (
          <SeoulLeague player={route.player} />
        ) : route.view === 'points' ? (
          <RankingPoints />
        ) : route.view === 'compare' ? (
          <RankingCompare />
        ) : route.view === 'wellperion' ? (
          <WellperionRatings player={route.player} />
        ) : route.view === 'club' ? (
          <ClubLadder data={data} setData={setData} />
        ) : route.view === 'tournaments' ? (
          <Tournaments data={data} setData={setData} />
        ) : route.view === 'tournament' ? (
          <TournamentPage id={route.id} data={data} setData={setData} />
        ) : (
          <NationalLadder />
        )}
      </Suspense>
    </main>
  )
}

export default App
