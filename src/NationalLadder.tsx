import { useMemo, useState } from 'react'
import {
  ACTIVE_SINCE,
  ageGroupOf,
  ageGroupsOn,
  isActive,
  isProvisional,
  ladder,
  LADDER_KEYS,
  OPEN,
  playersById,
  PRIMARY,
  PROVISIONAL_MATCHES,
  PROVISIONAL_RD,
  SEXES,
  TERM_KEYS,
  type AgeGroup,
  type Sex,
} from './ksf.ts'
import { org } from './org.ts'
import { Sparkline } from './Sparkline.tsx'

const PAGE = 50

/** Who the list shows: players meeting the term's minimum (and recently played), the rest, or both. */
const STATUSES = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'all', label: 'All' },
] as const
type Status = (typeof STATUSES)[number]['key']

/** Matches needed inside a term before a player is listed on it (from the build). */
const minFor = (termKey: string) => ladder.minMatches?.[termKey] ?? 0

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
  const [ladderKey, setLadderKey] = useState(OPEN)
  const [termKey, setTermKey] = useState(PRIMARY)
  const [sex, setSex] = useState<Sex>('남자')
  const [age, setAge] = useState<AgeGroup | ''>('')
  const [sido, setSido] = useState(org.nationalSido ?? '')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('active')
  const [limit, setLimit] = useState(PAGE)

  // The student pool is rated as one pool; picking an age group only narrows the
  // list to the players whose latest draw was that group.
  const ageGroups = ageGroupsOn(ladderKey)
  const pool = ladder.ladders[ladderKey]
  const term = pool.terms[termKey]
  const isPrimary = termKey === PRIMARY
  const isOpen = ladderKey === OPEN

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return term.entries
      .map((e) => ({ e, p: playersById.get(e.id)! }))
      .filter(
        ({ e, p }) =>
          (status === 'all' || isActive(e) === (status === 'active')) &&
          p.sex === sex &&
          (!age || ageGroupOf(p.lastDivision) === age) &&
          (!sido || p.sido === sido) &&
          (!q || p.name.toLowerCase().includes(q) || (p.team ?? '').toLowerCase().includes(q)),
      )
  }, [term, status, sex, age, sido, query])

  // Only active players are numbered; inactive ones show — wherever they appear.
  const ranks = useMemo(() => {
    let n = 0
    return rows.map(({ e }) => (isActive(e) ? ++n : null))
  }, [rows])
  const shown = rows.slice(0, limit)
  const lastTournament = ladder.tournaments[ladder.tournaments.length - 1]
  const reset = () => setLimit(PAGE)

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>
            {sido ? `${sido} ` : ''}
            {isOpen ? (sido ? '랭킹' : 'KSF National Ladder') : `${pool.label}${age ? ` ${age}` : ''} 랭킹`}
          </h2>
          <span className="muted small">
            {pool.matches.toLocaleString()} rated matches since {ladder.ratingSince} · through {lastTournament?.date}
            {!isPrimary && ` · Δ and W–L since ${term.since}`}
          </span>
        </div>
        <div className="filters">
          <div className="segmented" role="group" aria-label="Ladder">
            {LADDER_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={ladderKey === k ? 'on' : ''}
                onClick={() => {
                  setLadderKey(k)
                  setAge('')
                  reset()
                }}
              >
                {k === OPEN ? '국가' : ladder.ladders[k].label}
              </button>
            ))}
          </div>
          {ageGroups.length > 1 && (
            <div className="segmented" role="group" aria-label="연령">
              {(['', ...ageGroups] as const).map((g) => (
                <button
                  key={g || 'all'}
                  type="button"
                  className={age === g ? 'on' : ''}
                  onClick={() => {
                    setAge(g)
                    reset()
                  }}
                >
                  {g || '전체'}
                </button>
              ))}
            </div>
          )}
          <div className="segmented" role="group" aria-label="Sex">
            {SEXES.map((s) => (
              <button
                key={s}
                type="button"
                className={sex === s ? 'on' : ''}
                onClick={() => {
                  setSex(s)
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
                  reset()
                }}
              >
                {pool.terms[k].label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={status === s.key ? 'on' : ''}
                onClick={() => {
                  setStatus(s.key)
                  reset()
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            value={sido}
            onChange={(e) => {
              setSido(e.target.value)
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
                  <tr
                    key={p.id}
                    className={!isActive(e) || isProvisional(ladderKey, e) ? 'unrated' : ''}
                    title={!isActive(e) ? 'Inactive' : isProvisional(ladderKey, e) ? 'Provisional' : ''}
                  >
                    <td className="muted">{ranks[i] ?? '—'}</td>
                    <td>
                      <a className="player-link" href={`#player/${p.id}`}>
                        {p.name}
                      </a>
                      <span className="muted small" title="출생연도 · 최근 출전 부문 (birth year · latest division played)">
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
        Source: 대한체육회 경기결과 (result.sports.or.kr), singles only. Beside each name: the
        player's birth year and the division they last played in (e.g. 2002 · 남자 일반부). The two ladders are rated on
        their own results and never mix: the national ladder counts 일반부 matches only — a student
        enters it only by playing there, and is provisional until they have {PROVISIONAL_MATCHES} such
        matches — while the student ladder counts 12세이하 · 15세이하 · 18세이하 · 대학부 matches as one
        pool (players link the age groups as they move up). There a player starts at the level of the first draw they played
        — 12세이하 1200, 15세이하 1350, 18세이하 1450, 대학부 1500 — so dominating a younger draw lands
        a step below the next age group rather than reading as senior strength; beating older players
        is the way up, and nothing caps the climb. Picking an age group there lists only the players whose
        latest draw was that group — the ratings are the one pool's either way, so the order never
        changes, only who is listed and the numbering. The student ladder lists only players whose latest draw
        was a student draw (those who moved on drop off, though their past matches still count for
        everyone else). Men and women are ranked separately. Ratings update once per tournament, reward the
        margin of victory, and keep moving for established players; best-of-3 counts 0.75 of a match
        and a single game 0.5. Only the last three years of results are rated; the shorter terms keep
        the same ratings and show how much each moved in that window (Δ) with the window's W–L.
        A rating needs results behind it: a player is active on a term only with{' '}
        <strong>{Math.max(minFor(termKey), isPrimary ? 0 : 1)} matches</strong> in it — 3 years {minFor(PRIMARY)}, 1 year{' '}
        {minFor('y1')}, 6 months {minFor('m6')}, 3 months {Math.max(minFor('m3'), 1)} — and a match since {ACTIVE_SINCE} (a
        player back after a year away returns with a −100 penalty). Only active players are numbered; pick
        Inactive or All to see the rest. Inactive players' matches still count towards everyone else's rating,
        and their own page still shows them. ± is the uncertainty. Dimmed rows are inactive or provisional (±
        above {PROVISIONAL_RD}, or too few open matches).
      </p>
    </>
  )
}
