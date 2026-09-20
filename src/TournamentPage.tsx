import { useMemo, useState, type FormEvent } from 'react'
import { GAME_OPTIONS, type DataProps } from './shared.ts'
import { computeRatings } from './rating/squash.ts'
import type { Match, Player, Tournament } from './rating/types.ts'
import { newId } from './storage.ts'

const KO_ROUNDS = ['64강', '32강', '16강', '8강', '준결승', '3·4위전', '결승']

export function TournamentPage({ id, data, setData }: DataProps & { id: string }) {
  const { players, matches, tournaments } = data
  const t = tournaments.find((x) => x.id === id)

  // Ratings over everything, so seeds reflect the club ladder and Δ shows this
  // tournament's effect on it (its date is one rating period).
  const { players: rated, snapshots } = useMemo(() => computeRatings(players, matches), [players, matches])
  const ratingOf = useMemo(() => new Map(rated.map((p) => [p.id, p.rating.rating])), [rated])
  const nameOf = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players])

  const mine = useMemo(() => matches.filter((m) => m.tournamentId === id), [matches, id])
  const delta = useMemo(() => {
    const d = new Map<string, number>()
    for (const s of snapshots) {
      if (!mine.some((m) => m.id === s.matchId)) continue
      for (const pid of Object.keys(s.after)) d.set(pid, s.after[pid].rating - s.before[pid].rating)
    }
    return d
  }, [snapshots, mine])

  const [newName, setNewName] = useState('')
  const [pick, setPick] = useState('')

  if (!t) {
    return (
      <section className="panel">
        <p className="muted">
          Unknown tournament. <a href="#tournaments">Back</a>
        </p>
      </section>
    )
  }

  const entrants = t.entrantIds
    .map((pid) => ({ id: pid, name: nameOf.get(pid) ?? '?', rating: ratingOf.get(pid) ?? 1500 }))
    .sort((a, b) => b.rating - a.rating)

  function update(fn: (x: Tournament) => Tournament) {
    setData((d) => ({ ...d, tournaments: d.tournaments.map((x) => (x.id === id ? fn(x) : x)) }))
  }
  function addEntrant(pid: string) {
    if (!pid || t!.entrantIds.includes(pid)) return
    update((x) => ({ ...x, entrantIds: [...x.entrantIds, pid] }))
    setPick('')
  }
  function addNewPlayer(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const p: Player = { id: newId(), name }
    setData((d) => ({
      ...d,
      players: [...d.players, p],
      tournaments: d.tournaments.map((x) => (x.id === id ? { ...x, entrantIds: [...x.entrantIds, p.id] } : x)),
    }))
    setNewName('')
  }
  function removeEntrant(pid: string) {
    if (mine.some((m) => m.playerAId === pid || m.playerBId === pid)) return
    update((x) => ({ ...x, entrantIds: x.entrantIds.filter((e) => e !== pid) }))
  }
  /** Create, replace or (with null games) delete the match between two entrants. */
  function setResult(a: string, b: string, round: string | undefined, gamesA: number | null, gamesB: number | null, existingId?: string) {
    setData((d) => {
      const rest = existingId ? d.matches.filter((m) => m.id !== existingId) : d.matches
      if (gamesA === null || gamesB === null || gamesA === gamesB) return { ...d, matches: rest }
      const m: Match = { id: existingId ?? newId(), date: t!.date, playerAId: a, playerBId: b, gamesA, gamesB, tournamentId: id, round }
      return { ...d, matches: [...rest, m] }
    })
  }
  function deleteTournament() {
    if (!confirm(`Delete "${t!.name}" and its ${mine.length} results?`)) return
    setData((d) => ({ ...d, tournaments: d.tournaments.filter((x) => x.id !== id), matches: d.matches.filter((m) => m.tournamentId !== id) }))
    location.hash = '#tournaments'
  }

  const available = players.filter((p) => !t.entrantIds.includes(p.id))

  return (
    <>
      <section className="panel">
        <a href="#tournaments" className="muted small">
          ← Tournaments
        </a>
        <div className="panel-head">
          <h2>
            {t.name} <span className="muted small">{t.date}{t.division ? ` · ${t.division}` : ''}</span>
          </h2>
          <span className="muted small">
            {t.format === 'roundrobin' ? 'Round robin' : 'Knockout'} · {entrants.length} players · {mine.length} results
          </span>
        </div>

        <div className="two-col">
          <div>
            <h3>Entrants <span className="muted small">(seeded by club rating)</span></h3>
            {entrants.length === 0 ? (
              <p className="muted small">Add players to the draw.</p>
            ) : (
              <table>
                <tbody>
                  {entrants.map((p, i) => (
                    <tr key={p.id}>
                      <td className="muted">{i + 1}</td>
                      <td className="strong">{p.name}</td>
                      <td className="num muted">{Math.round(p.rating)}</td>
                      <td>
                        <button type="button" className="link" aria-label="Remove" onClick={() => removeEntrant(p.id)} disabled={mine.some((m) => m.playerAId === p.id || m.playerBId === p.id)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="match-form">
            <label>
              Add club player
              <select value={pick} onChange={(e) => addEntrant(e.target.value)}>
                <option value="">Select…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({Math.round(ratingOf.get(p.id) ?? 1500)})
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={addNewPlayer} className="inline-form">
              <input placeholder="New player name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button type="submit" disabled={!newName.trim()}>
                Add
              </button>
            </form>
          </div>
        </div>
      </section>

      {t.format === 'roundrobin' ? (
        <RoundRobin entrants={entrants} results={mine} delta={delta} setResult={setResult} />
      ) : (
        <Knockout entrants={entrants} results={mine} delta={delta} nameOf={nameOf} setResult={setResult} />
      )}

      <p>
        <button type="button" className="ghost danger" onClick={deleteTournament}>
          Delete tournament
        </button>
      </p>
    </>
  )
}

type Entrant = { id: string; name: string; rating: number }
type SetResult = (a: string, b: string, round: string | undefined, gamesA: number | null, gamesB: number | null, existingId?: string) => void

function GamesPicker({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} aria-label={label}>
      <option value="">–</option>
      {GAME_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

function DeltaCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="num muted">—</td>
  const r = Math.round(value)
  return (
    <td className={`num ${r > 0 ? 'up' : r < 0 ? 'down' : 'muted'}`}>
      {r > 0 ? '+' : ''}
      {r}
    </td>
  )
}

function RoundRobin({ entrants, results, delta, setResult }: { entrants: Entrant[]; results: Match[]; delta: Map<string, number>; setResult: SetResult }) {
  // Every pairing once; a pair's result may have been stored either way round.
  const pairs: { a: Entrant; b: Entrant; m?: Match }[] = []
  for (let i = 0; i < entrants.length; i++)
    for (let j = i + 1; j < entrants.length; j++) {
      const a = entrants[i]
      const b = entrants[j]
      const m = results.find((x) => (x.playerAId === a.id && x.playerBId === b.id) || (x.playerAId === b.id && x.playerBId === a.id))
      pairs.push({ a, b, m })
    }
  // Draft scores for pairs with only one side chosen so far.
  const [draft, setDraft] = useState<Record<string, [number | null, number | null]>>({})

  const standing = entrants.map((p) => {
    const s = { ...p, played: 0, wins: 0, losses: 0, gf: 0, ga: 0 }
    for (const m of results) {
      if (m.playerAId !== p.id && m.playerBId !== p.id) continue
      const my = m.playerAId === p.id ? m.gamesA : m.gamesB
      const their = m.playerAId === p.id ? m.gamesB : m.gamesA
      s.played++
      s.gf += my
      s.ga += their
      if (my > their) s.wins++
      else s.losses++
    }
    return s
  })
  standing.sort((a, b) => b.wins - a.wins || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)

  return (
    <div className="two-col wide-left">
      <section className="panel">
        <h2>Results <span className="muted small">{results.length}/{pairs.length}</span></h2>
        {pairs.length === 0 ? (
          <p className="muted">Add at least two entrants.</p>
        ) : (
          <table>
            <tbody>
              {pairs.map(({ a, b, m }) => {
                const key = `${a.id}|${b.id}`
                const stored: [number | null, number | null] = m ? (m.playerAId === a.id ? [m.gamesA, m.gamesB] : [m.gamesB, m.gamesA]) : [null, null]
                const [ga, gb] = draft[key] ?? stored
                const commit = (na: number | null, nb: number | null) => {
                  setDraft((d) => ({ ...d, [key]: [na, nb] }))
                  if (na === null && nb === null && m) setResult(a.id, b.id, undefined, null, null, m.id)
                  else if (na !== null && nb !== null && na !== nb) {
                    setResult(a.id, b.id, undefined, na, nb, m?.id)
                    setDraft((d) => {
                      const { [key]: _, ...rest } = d
                      return rest
                    })
                  }
                }
                return (
                  <tr key={key} className={m ? '' : 'unrated'}>
                    <td className={ga !== null && gb !== null && ga > gb ? 'strong' : ''}>{a.name}</td>
                    <td className="score-cell">
                      <GamesPicker value={ga} onChange={(v) => commit(v, gb)} label={`${a.name} games`} />
                      <span className="muted">–</span>
                      <GamesPicker value={gb} onChange={(v) => commit(ga, v)} label={`${b.name} games`} />
                    </td>
                    <td className={ga !== null && gb !== null && gb > ga ? 'strong' : ''}>{b.name}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel">
        <h2>Standings</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">P</th>
              <th className="num">W–L</th>
              <th className="num">Games</th>
              <th className="num">Δ rating</th>
            </tr>
          </thead>
          <tbody>
            {standing.map((s, i) => (
              <tr key={s.id}>
                <td className="muted">{i + 1}</td>
                <td className="strong">{s.name}</td>
                <td className="num">{s.played}</td>
                <td className="num">
                  {s.wins}–{s.losses}
                </td>
                <td className="num muted">
                  {s.gf}–{s.ga}
                </td>
                <DeltaCell value={delta.get(s.id)} />
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Knockout({ entrants, results, delta, nameOf, setResult }: { entrants: Entrant[]; results: Match[]; delta: Map<string, number>; nameOf: Map<string, string>; setResult: SetResult }) {
  const [form, setForm] = useState({ round: '8강', a: '', b: '', ga: 3, gb: 0 })
  const valid = form.a && form.b && form.a !== form.b && form.ga !== form.gb
  function add(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setResult(form.a, form.b, form.round, form.ga, form.gb)
    setForm((f) => ({ ...f, a: '', b: '', ga: 3, gb: 0 }))
  }
  const byRound = KO_ROUNDS.map((r) => ({ round: r, list: results.filter((m) => m.round === r) })).filter((g) => g.list.length)
  const other = results.filter((m) => !KO_ROUNDS.includes(m.round ?? ''))
  if (other.length) byRound.push({ round: 'Other', list: other })

  return (
    <div className="two-col wide-left">
      <section className="panel">
        <h2>Results</h2>
        {byRound.length === 0 ? <p className="muted">No results yet.</p> : null}
        {byRound.map((g) => (
          <table key={g.round} className="ko-round">
            <tbody>
              <tr className="group-row">
                <td colSpan={4} className="strong">
                  {g.round}
                </td>
              </tr>
              {g.list.map((m) => (
                <tr key={m.id}>
                  <td className={m.gamesA > m.gamesB ? 'strong' : ''}>{nameOf.get(m.playerAId)}</td>
                  <td className="mono">
                    {m.gamesA}–{m.gamesB}
                  </td>
                  <td className={m.gamesB > m.gamesA ? 'strong' : ''}>{nameOf.get(m.playerBId)}</td>
                  <td>
                    <button type="button" className="link" aria-label="Delete" onClick={() => setResult(m.playerAId, m.playerBId, m.round, null, null, m.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Δ rating</th>
            </tr>
          </thead>
          <tbody>
            {entrants
              .filter((p) => delta.has(p.id))
              .sort((a, b) => (delta.get(b.id) ?? 0) - (delta.get(a.id) ?? 0))
              .map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <DeltaCell value={delta.get(p.id)} />
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Add result</h2>
        <form onSubmit={add} className="match-form">
          <label>
            Round
            <select value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })}>
              {KO_ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="sides">
            <label>
              Player A
              <select value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })}>
                <option value="">Select…</option>
                {entrants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Player B
              <select value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })}>
                <option value="">Select…</option>
                {entrants.map((p) => (
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
              <select value={form.ga} onChange={(e) => setForm({ ...form, ga: Number(e.target.value) })}>
                {GAME_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Games B
              <select value={form.gb} onChange={(e) => setForm({ ...form, gb: Number(e.target.value) })}>
                {GAME_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={!valid}>
            Add
          </button>
        </form>
      </section>
    </div>
  )
}
