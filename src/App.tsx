import { useState } from 'react'
import { ClubLadder } from './ClubLadder.tsx'
import { NationalLadder } from './NationalLadder.tsx'
import './App.css'

type View = 'club' | 'national'

function App() {
  const [view, setView] = useState<View>('national')

  return (
    <main className="layout">
      <header>
        <div className="panel-head">
          <h1>Squash Ratings</h1>
          <nav className="segmented" aria-label="Ladder">
            <button type="button" className={view === 'national' ? 'on' : ''} onClick={() => setView('national')}>
              KSF National
            </button>
            <button type="button" className={view === 'club' ? 'on' : ''} onClick={() => setView('club')}>
              Club
            </button>
          </nav>
        </div>
        <p className="muted">
          Glicko-2 with margin of victory. A rating is shown as{' '}
          <span className="mono">rating ± RD</span>; the ± shrinks as a player plays more.
        </p>
      </header>

      {view === 'national' ? <NationalLadder /> : <ClubLadder />}
    </main>
  )
}

export default App
