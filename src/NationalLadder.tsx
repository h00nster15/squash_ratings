import { useMemo, useState } from 'react'
import {
  ACTIVE_SINCE,
  isActive,
  ladder,
  playersById,
  PRIMARY,
  PROVISIONAL_RD,
  SEXES,
  TERM_KEYS,
  type Sex,
} from './ksf.ts'
import { org } from './org.ts'
import { Sparkline } from './Sparkline.tsx'

const PAGE = 50

/** 시도 values present among rated players, most common first. */
const SIDOS = (() => {
  const count = new Map<string, number>()
  for (const p of ladder.players) if (p.sido) count.set(p.sido, (count.get(p.sido) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
})()

function DeltaCell({ value }: { value: number | null }) {
  if (value === null) return <td className="num muted">—</td>
  const r = Math.round(value)
  return (
    <td className={`num ${r > 0 ? 'up' : r < 0 ? 'down' : 'muted'}`}>
      {r > 0 ? '+' : ''}
      {r}
    </td>
  )
}

export function NationalLadder() {
  const [termKey, setTermKey] = useState(PRIMARY)
  const [sex, setSex] = useState<Sex>('남자')
  const [division, setDivision] = useState('')
  const [sido, setSido] = useState(org.nationalSido ?? '')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const term = ladder.terms[termKey]
  const isPrimary = termKey === PRIMARY

  // Divisions contested by this sex in the term, most populated first.
  const divisions = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of term.entries) {
      const p = playersById.get(e.id)
      if (!p || p.sex !== sex || !p.lastDivision) continue
      if (sido && p.sido !== sido) continue
      count.set(p.lastDivision, (count.get(p.lastDivision) ?? 0) + 1)
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])
  }, [term, sex, sido])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return term.entries
      .map((e) => ({ e, p: playersById.get(e.id)! }))
      .filter(
        ({ p }) =>
          p.sex === sex &&
          (!sido || p.sido === sido) &&
          (!division || p.lastDivision === division) &&
          (!q || p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q)),
      )
  }, [term, sex, sido, division, query])

  const shown = rows.slice(0, limit)
  const lastTournament = ladder.tournaments[ladder.tournaments.length - 1]
  const reset = () => setLimit(PAGE)

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>{sido ? `${sido} 랭킹` : 'KSF National Ladder'}</h2>
          <span className="muted small">
            {ladder.matches.toLocaleString()} rated matches since {ladder.ratingSince} · through {lastTournament?.date}
            {!isPrimary && ` · Δ and W–L since ${term.since}`}
          </span>
        </div>
        <div className="filters">
          <div className="segmented" role="group" aria-label="Sex">
            {SEXES.map((s) => (
              <button
                key={s}
                type="button"
                className={sex === s ? 'on' : ''}
                onClick={() => {
                  setSex(s)
                  setDivision('')
                  reset()
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Term">
            {TERM_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={termKey === k ? 'on' : ''}
                onClick={() => {
                  setTermKey(k)
                  setDivision('')
                  reset()
                }}
              >
                {ladder.terms[k].label}
              </button>
            ))}
          </div>
          <select
            value={sido}
            onChange={(e) => {
              setSido(e.target.value)
              setDivision('')
              reset()
            }}
            aria-label="시도"
          >
            <option value="">전국</option>
            {SIDOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={division}
            onChange={(e) => {
              setDivision(e.target.value)
              reset()
            }}
            aria-label="Division"
          >
            <option value="">All divisions</option>
            {divisions.map(([d, n]) => (
              <option key={d} value={d}>
                {d} ({n})
              </option>
            ))}
          </select>
          <input
            placeholder="Search name or team"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              reset()
            }}
          />
        </div>

        {shown.length === 0 ? (
          <p className="muted">No players match.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Team</th>
                  <th className="num">Rating</th>
                  <th className="num">±</th>
                  {!isPrimary && <th className="num">Δ</th>}
                  <th>Trend</th>
                  <th className="num">W–L</th>
                  <th>Last played</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ e, p }, i) => (
                  <tr key={p.id} className={!isActive(e) || e.rd > PROVISIONAL_RD || (!isPrimary && !e.termMatches) ? 'unrated' : ''}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <a className="player-link" href={`#player/${p.id}`}>
                        {p.name}
                      </a>
                      <span className="muted small">
                        {' '}
                        {p.birthYear ?? '?'}
                        {p.lastDivision ? ` · ${p.lastDivision}` : ''}
                      </span>
                    </td>
                    <td className="muted small">{p.team ?? '—'}</td>
                    <td className="num strong">{e.rating}</td>
                    <td className="num muted">{e.rd}</td>
                    {!isPrimary && <DeltaCell value={e.termMatches ? e.delta : null} />}
                    <td>
                      <Sparkline points={e.history} />
                    </td>
                    <td className="num">
                      {isPrimary ? `${e.wins}–${e.losses}` : `${e.termWins}–${e.termLosses}`}
                    </td>
                    <td className="muted">{e.lastPlayed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown.length && (
          <button type="button" className="ghost" onClick={() => setLimit((n) => n + PAGE)}>
            Show more ({rows.length - shown.length} left)
          </button>
        )}
      </section>
      <p className="muted small">
        Source: 대한체육회 경기결과 (result.sports.or.kr), singles only. Men and women are rated
        and ranked separately. Ratings are Glicko-2 with an Elo-style floor (RD never below 75, so
        established players keep moving at roughly K = 32), one rating period per tournament.
        Best-of-3 counts 0.75 of a match and a single game 0.5. Juniors
        start lower (U12 1000 · U15 1200 · U18 1400 · adults 1500) so a junior-only record does
        not read as adult strength; junior and 대학부 results also count for less (U12 ½ · U15 0.6 ·
        U18 0.7 · 대학부 0.7 of a match) and cannot lift a rating above that draw's ceiling
        (U12 1400 · U15 1550 · U18 1700 · 대학부 1600); beating 일반부 players raises the ceiling to the best
        one beaten + 100, so only wins over adults move a junior or university player past it. Only the
        last three years of results are rated; the shorter
        terms keep the same ratings and show how much each moved in that window (Δ) with the
        window's W–L. ± is the rating deviation; rows above ±{PROVISIONAL_RD} or with no results
        in the window are dimmed, as are players with no match since {ACTIVE_SINCE} (they stay
        listed while they have results in the last three years, and return with a −100 penalty).
        Division = the one the player last competed in.
      </p>
    </>
  )
}
