import { useMemo, useState } from 'react'
import ladder from '../data/ksf/ladder.json'

interface LadderPlayer {
  id: string
  name: string
  birthYear: number | null
  sex: string | null
  team: string | null
  sido: string | null
  rating: number
  rd: number
  matches: number
  wins: number
  losses: number
  lastPlayed: string | null
  lastDivision: string | null
  history: { date: string; rating: number }[]
}

const players = ladder.players as LadderPlayer[]

/** Players who have not competed since this date are hidden unless asked for. */
const ACTIVE_SINCE = (() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
})()

const PAGE = 50

export function NationalLadder() {
  const [sex, setSex] = useState<'all' | '남자' | '여자'>('all')
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter(
      (p) =>
        (sex === 'all' || p.sex === sex) &&
        (includeInactive || (p.lastPlayed ?? '') >= ACTIVE_SINCE) &&
        (!q || p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q)),
    )
  }, [sex, query, includeInactive])

  const shown = rows.slice(0, limit)
  const lastTournament = ladder.tournaments[ladder.tournaments.length - 1]

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>KSF National Ladder</h2>
          <span className="muted small">
            {ladder.matches.toLocaleString()} matches · {ladder.tournaments.length} tournaments ·
            through {lastTournament?.date}
          </span>
        </div>
        <div className="filters">
          <input
            placeholder="Search name or team"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
          />
          <div className="segmented" role="group" aria-label="Sex">
            {(['all', '남자', '여자'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={sex === s ? 'on' : ''}
                onClick={() => {
                  setSex(s)
                  setLimit(PAGE)
                }}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked)
                setLimit(PAGE)
              }}
            />
            Include inactive (no match since {ACTIVE_SINCE.slice(0, 7)})
          </label>
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
                {shown.map((p, i) => (
                  <tr key={p.id} className={(p.lastPlayed ?? '') < ACTIVE_SINCE ? 'unrated' : ''}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <span className="strong">{p.name}</span>
                      <span className="muted small">
                        {' '}
                        {p.birthYear ?? '?'}
                        {p.lastDivision ? ` · ${p.lastDivision}` : ''}
                      </span>
                    </td>
                    <td className="muted small">{p.team ?? '—'}</td>
                    <td className="num strong">{p.rating}</td>
                    <td className="num muted">{p.rd}</td>
                    <td>
                      <Sparkline points={p.history} />
                    </td>
                    <td className="num">
                      {p.wins}–{p.losses}
                    </td>
                    <td className="muted">{p.lastPlayed ?? '—'}</td>
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
        Source: 대한체육회 경기결과 (result.sports.or.kr), singles only. Ratings are Glicko-2 with
        each tournament as one rating period; ± is the rating deviation — treat anything above
        ~150 as provisional.
      </p>
    </>
  )
}

/** Rating after each tournament, as a tiny inline line chart. */
function Sparkline({ points }: { points: { date: string; rating: number }[] }) {
  if (points.length < 2) return <span className="muted">—</span>
  const w = 80
  const h = 20
  const ys = points.map((p) => p.rating)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = Math.max(max - min, 40)
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - ((p.rating - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = ys[ys.length - 1] >= ys[0]
  return (
    <svg
      className={`spark ${up ? 'up' : 'down'}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-label={`${ys[0]} → ${ys[ys.length - 1]}`}
    >
      <path d={d} fill="none" strokeWidth="1.5" />
    </svg>
  )
}
