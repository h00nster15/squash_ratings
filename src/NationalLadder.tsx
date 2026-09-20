import { useMemo, useState } from 'react'
import {
  ACTIVE_SINCE,
  isActive,
  ladder,
  playersById,
  PROVISIONAL_RD,
  SEXES,
  TERM_KEYS,
  type Sex,
} from './ksf.ts'
import { Sparkline } from './Sparkline.tsx'

const PAGE = 50

export function NationalLadder() {
  const [termKey, setTermKey] = useState('all')
  const [sex, setSex] = useState<Sex>('남자')
  const [division, setDivision] = useState('')
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const term = ladder.terms[termKey]

  // Divisions contested by this sex in the term, most populated first.
  const divisions = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of term.entries) {
      const p = playersById.get(e.id)
      if (!p || p.sex !== sex || !p.lastDivision) continue
      if (termKey === 'all' && !isActive(e)) continue
      count.set(p.lastDivision, (count.get(p.lastDivision) ?? 0) + 1)
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])
  }, [term, termKey, sex])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return term.entries
      .map((e) => ({ e, p: playersById.get(e.id)! }))
      .filter(
        ({ e, p }) =>
          p.sex === sex &&
          (!division || p.lastDivision === division) &&
          (termKey !== 'all' || includeInactive || isActive(e)) &&
          (!q || p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q)),
      )
  }, [term, termKey, sex, division, query, includeInactive])

  const shown = rows.slice(0, limit)
  const lastTournament = ladder.tournaments[ladder.tournaments.length - 1]
  const reset = () => setLimit(PAGE)

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>KSF National Ladder</h2>
          <span className="muted small">
            {term.since ? `results since ${term.since}` : `${ladder.matches.toLocaleString()} matches · ${ladder.tournaments.length} tournaments`}{' '}
            · through {lastTournament?.date}
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
          {termKey === 'all' && (
            <label className="check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => {
                  setIncludeInactive(e.target.checked)
                  reset()
                }}
              />
              Include inactive (no match since {ACTIVE_SINCE.slice(0, 7)})
            </label>
          )}
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
                  <th>Trend</th>
                  <th className="num">W–L</th>
                  <th>Last played</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ e, p }, i) => (
                  <tr key={p.id} className={(termKey === 'all' && !isActive(e)) || e.rd > PROVISIONAL_RD ? 'unrated' : ''}>
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
                    <td>
                      <Sparkline points={e.history} />
                    </td>
                    <td className="num">
                      {e.wins}–{e.losses}
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
        and ranked separately. Ratings are Glicko-2, one rating period per tournament. Juniors
        start lower (U12 1000 · U15 1200 · U18 1400 · adults 1500) so a junior-only record does
        not read as adult strength. Term ratings use only results in that window and restart
        everyone from their starting rating. ± is the rating deviation; rows above ±{PROVISIONAL_RD}{' '}
        are dimmed as provisional. Division = the one the player last competed in.
      </p>
    </>
  )
}
