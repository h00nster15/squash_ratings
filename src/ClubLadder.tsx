import { useMemo, useState, type FormEvent } from 'react'
import { winProbability } from './rating/glicko2.ts'
import { computeRatings } from './rating/squash.ts'
import type { Match, Player } from './rating/types.ts'
import { GAME_OPTIONS, type DataProps } from './shared.ts'
import { newId, today } from './storage.ts'

export function ClubLadder({ data: { players, matches, tournaments }, setData }: DataProps) {
  const tournamentName = useMemo(() => new Map(tournaments.map((t) => [t.id, t.name])), [tournaments])

  const { players: rated, snapshots } = useMemo(
    () => computeRatings(players, matches),
    [players, matches],
  )
  const byId = useMemo(() => new Map(rated.map((p) => [p.id, p])), [rated])
  const snapshotByMatch = useMemo(
    () => new Map(snapshots.map((s) => [s.matchId, s])),
    [snapshots],
  )

  // --- Add player ---
  const [newName, setNewName] = useState('')
  function addPlayer(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const player: Player = { id: newId(), name }
    setData((d) => ({ ...d, players: [...d.players, player] }))
    setNewName('')
  }

  // --- Record match ---
  const [form, setForm] = useState({
    playerAId: '',
    playerBId: '',
    gamesA: 3,
    gamesB: 0,
    date: today(),
  })
  const playerA = byId.get(form.playerAId)
  const playerB = byId.get(form.playerBId)
  const formValid =
    playerA && playerB && playerA.id !== playerB.id && form.gamesA !== form.gamesB
  const forecast =
    playerA && playerB && playerA.id !== playerB.id
      ? winProbability(playerA.rating, playerB.rating)
      : null

  function recordMatch(e: FormEvent) {
    e.preventDefault()
    if (!formValid) return
    const match: Match = { id: newId(), ...form }
    setData((d) => ({ ...d, matches: [...d.matches, match] }))
    setForm((f) => ({ ...f, gamesA: 3, gamesB: 0 }))
  }

  function deleteMatch(id: string) {
    setData((d) => ({ ...d, matches: d.matches.filter((m) => m.id !== id) }))
  }

  const recentMatches = [...matches]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30)

  return (
    <>

      <section className="panel">
        <h2>Ladder</h2>
        {rated.length === 0 ? (
          <p className="muted">No players yet — add one below.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th className="num">Rating</th>
                <th className="num">±</th>
                <th className="num">W–L</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {rated.map((p, i) => (
                <tr key={p.id} className={p.matches === 0 ? 'unrated' : ''}>
                  <td>{i + 1}</td>
                  <td>{p.name}</td>
                  <td className="num strong">{Math.round(p.rating.rating)}</td>
                  <td className="num muted">{Math.round(p.rating.rd)}</td>
                  <td className="num">
                    {p.wins}–{p.losses}
                  </td>
                  <td className="muted">{p.lastPlayed ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Record match</h2>
          <form onSubmit={recordMatch} className="match-form">
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </label>
            <div className="sides">
              <label>
                Player A
                <select
                  value={form.playerAId}
                  onChange={(e) => setForm({ ...form, playerAId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Player B
                <select
                  value={form.playerBId}
                  onChange={(e) => setForm({ ...form, playerBId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="sides">
              <label>
                Games A
                <select
                  value={form.gamesA}
                  onChange={(e) => setForm({ ...form, gamesA: Number(e.target.value) })}
                >
                  {GAME_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Games B
                <select
                  value={form.gamesB}
                  onChange={(e) => setForm({ ...form, gamesB: Number(e.target.value) })}
                >
                  {GAME_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {forecast !== null && (
              <p className="muted forecast">
                Forecast: {playerA!.name} {Math.round(forecast * 100)}% –{' '}
                {Math.round((1 - forecast) * 100)}% {playerB!.name}
              </p>
            )}
            <button type="submit" disabled={!formValid}>
              Record
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Add player</h2>
          <form onSubmit={addPlayer} className="inline-form">
            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" disabled={!newName.trim()}>
              Add
            </button>
          </form>
        </section>
      </div>

      <section className="panel">
        <h2>Recent matches</h2>
        {recentMatches.length === 0 ? (
          <p className="muted">No matches recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Result</th>
                <th className="num">Δ A</th>
                <th className="num">Δ B</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentMatches.map((m) => {
                const a = byId.get(m.playerAId)
                const b = byId.get(m.playerBId)
                const s = snapshotByMatch.get(m.id)
                const dA = s ? s.after[m.playerAId].rating - s.before[m.playerAId].rating : 0
                const dB = s ? s.after[m.playerBId].rating - s.before[m.playerBId].rating : 0
                return (
                  <tr key={m.id}>
                    <td className="muted">
                      {m.date}
                      {m.tournamentId && (
                        <span className="small">
                          {' '}
                          · {tournamentName.get(m.tournamentId) ?? 'tournament'}
                          {m.round ? ` ${m.round}` : ''}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={m.gamesA > m.gamesB ? 'strong' : ''}>
                        {a?.name ?? '?'}
                      </span>{' '}
                      <span className="mono">
                        {m.gamesA}–{m.gamesB}
                      </span>{' '}
                      <span className={m.gamesB > m.gamesA ? 'strong' : ''}>
                        {b?.name ?? '?'}
                      </span>
                    </td>
                    <td className="num">
                      <Delta value={dA} />
                    </td>
                    <td className="num">
                      <Delta value={dB} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link"
                        onClick={() => deleteMatch(m.id)}
                        aria-label="Delete match"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function Delta({ value }: { value: number }) {
  const rounded = Math.round(value)
  const cls = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'muted'
  return (
    <span className={cls}>
      {rounded > 0 ? '+' : ''}
      {rounded}
    </span>
  )
}

