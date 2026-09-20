import { useMemo, useState } from 'react'
import { league, playersById, playersByName, PROVISIONAL_RD, resultsOf, teamName, type LeaguePlayer, type Tie } from './seoul.ts'
import { Sparkline } from './Sparkline.tsx'

type View = 'standings' | 'players' | 'results'

const VIEWS: { key: View; label: string }[] = [
  { key: 'standings', label: 'Standings' },
  { key: 'players', label: 'Players' },
  { key: 'results', label: 'Results' },
]

function Delta({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="muted">—</span>
  const r = Math.round(value)
  return (
    <span className={r > 0 ? 'up' : r < 0 ? 'down' : 'muted'}>
      {r > 0 ? '+' : ''}
      {r}
    </span>
  )
}

const FORMAT_LABEL = { bo5: 'Bo5', bo3: 'Bo3', single: '1 game' } as const

function PlayerLink({ name }: { name: string }) {
  const p = playersByName.get(name)
  return p ? (
    <a className="player-link" href={`#league/player/${encodeURIComponent(p.id)}`}>
      {name}
    </a>
  ) : (
    <>{name}</>
  )
}

/** Seoul Club Squash League: team standings, player ratings and weekly results. */
export function SeoulLeague({ player }: { player?: string }) {
  const [view, setView] = useState<View>('standings')
  const selected = player ? playersById.get(player) : undefined
  if (player && !selected) return <p className="muted">No such player. <a href="#league">Back to the league</a></p>
  if (selected) return <PlayerResults p={selected} />
  const playedWeeks = league.weeks.filter((w) => w.ties.some((t) => t.rubbers.length))
  const lastWeek = playedWeeks[playedWeeks.length - 1]
  const rubbers = league.weeks.reduce((n, w) => n + w.ties.reduce((m, t) => m + t.rubbers.length, 0), 0)

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>{league.season}</h2>
          <span className="muted small">
            {rubbers} rubbers over {playedWeeks.length} of {league.weeks.length} weeks
            {lastWeek && ` · through week ${lastWeek.week}`}
          </span>
        </div>
        <div className="filters">
          <div className="segmented" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {view === 'standings' ? <Standings /> : view === 'players' ? <Players /> : <Results />}
      </section>
      <p className="muted small">
        Source: the league workbook ({league.source}), rebuilt with <span className="mono">npm run build:seoul-data</span>.
        Team points as the league scores them: games won + rubbers won + {league.tieWinBonus} for winning the tie
        (ties split on rubbers, then games, then rally points). A player's rating updates every league
        night and rewards the margin of victory; ± is its uncertainty. Best-of-5 rubbers count in full,
        best-of-3 for {league.formatWeight.bo3} and a single game for {league.formatWeight.single} of a match.
        Each bracket starts at its own rating (
        {Object.entries(league.startByBracket)
          .map(([b, r]) => `B${b} ${r}`)
          .join(' · ')}
        ) so a bracket-only record reads at roughly the bracket's level. Rows above ±{PROVISIONAL_RD} are dimmed.
        This ladder is separate from the KSF national ratings.
      </p>
    </>
  )
}

function Standings() {
  const rosterOf = useMemo(() => new Map(league.teams.map((t) => [t.no, t.players])), [])
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th className="num">P</th>
            <th className="num">W–L</th>
            <th className="num">Rubbers</th>
            <th className="num">Games</th>
            <th className="num">Pts</th>
            <th>Players</th>
          </tr>
        </thead>
        <tbody>
          {league.standings.map((s, i) => {
            const roster = rosterOf.get(s.team) ?? []
            return (
              <tr key={s.team} className={roster.length === 0 ? 'unrated' : ''}>
                <td className="muted">{i + 1}</td>
                <td className="strong">{teamName(s.team)}</td>
                <td className="num">{s.played}</td>
                <td className="num">
                  {s.won}–{s.lost}
                </td>
                <td className="num muted">
                  {s.rubbersFor}–{s.rubbersAgainst}
                </td>
                <td className="num muted">
                  {s.gamesFor}–{s.gamesAgainst}
                </td>
                <td className="num strong">{s.points}</td>
                <td className="muted small">{roster.length ? roster.join(', ') : 'bye'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Players() {
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('')
  const [showUnplayed, setShowUnplayed] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return league.ratings.filter(
      (p) =>
        (showUnplayed || p.matches > 0) &&
        (!team || (team === 'sub' ? p.team === null : p.team === Number(team))) &&
        (!q || p.name.toLowerCase().includes(q)),
    )
  }, [query, team, showUnplayed])
  const unplayed = league.ratings.filter((p) => p.matches === 0).length

  return (
    <>
      <div className="filters">
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
          <option value="">All teams</option>
          {league.teams
            .filter((t) => t.players.length)
            .map((t) => (
              <option key={t.no} value={t.no}>
                {t.name}
              </option>
            ))}
          <option value="sub">Substitutes</option>
        </select>
        <input placeholder="Search name" value={query} onChange={(e) => setQuery(e.target.value)} />
        {unplayed > 0 && (
          <label className="check">
            <input type="checkbox" checked={showUnplayed} onChange={(e) => setShowUnplayed(e.target.checked)} />
            Include {unplayed} yet to play
          </label>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted">No players match.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Team</th>
                <th className="num">Bracket</th>
                <th className="num">Rating</th>
                <th className="num">±</th>
                <th>Trend</th>
                <th className="num">W–L</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id} className={p.matches === 0 || p.rd > PROVISIONAL_RD ? 'unrated' : ''}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <PlayerLink name={p.name} />
                    {p.sub && <span className="muted small"> · sub</span>}
                  </td>
                  <td className="muted small">{teamName(p.team)}</td>
                  <td className="num muted">{p.bracket}</td>
                  <td className="num strong">{Math.round(p.rating)}</td>
                  <td className="num muted">{Math.round(p.rd)}</td>
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
    </>
  )
}

function Results() {
  const weeks = [...league.weeks].reverse()
  const [week, setWeek] = useState(() => {
    const played = league.weeks.filter((w) => w.ties.some((t) => t.rubbers.length))
    return played.length ? played[played.length - 1].week : league.weeks[0]?.week ?? 1
  })
  const current = league.weeks.find((w) => w.week === week)
  if (!current) return <p className="muted">No results yet.</p>

  return (
    <>
      <div className="filters">
        <select value={week} onChange={(e) => setWeek(Number(e.target.value))} aria-label="Week">
          {weeks.map((w) => (
            <option key={w.week} value={w.week}>
              Week {w.week} · {w.dates[0] ?? ''}
              {w.ties.some((t) => t.rubbers.length) ? '' : ' (not played)'}
            </option>
          ))}
        </select>
      </div>
      <div className="two-col">
        {current.ties.map((t) => (
          <TieCard key={`${t.home}-${t.away}`} tie={t} />
        ))}
      </div>
    </>
  )
}

function TieCard({ tie: t }: { tie: Tie }) {
  const bye = !league.teams.find((x) => x.no === t.home)?.players.length || !league.teams.find((x) => x.no === t.away)?.players.length
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>
          <span className={t.winner === 'home' ? 'strong' : ''}>{teamName(t.home)}</span>
          {' v '}
          <span className={t.winner === 'away' ? 'strong' : ''}>{teamName(t.away)}</span>
        </h3>
        <span className="muted small">{t.date}</span>
      </div>
      {t.rubbers.length === 0 ? (
        <p className="muted">{bye ? 'Bye' : 'Not played yet'}</p>
      ) : (
        <>
          <p className="muted small">
            Rubbers <span className="mono">{t.homeRubbers}–{t.awayRubbers}</span> · Games{' '}
            <span className="mono">{t.homeGames}–{t.awayGames}</span>
            {t.homePoints !== null && (
              <>
                {' '}
                · Points <span className="mono">{t.homePoints}–{t.awayPoints}</span>
              </>
            )}{' '}
            · Team pts <span className="mono">{t.homePts}–{t.awayPts}</span>
          </p>
          <table>
            <thead>
              <tr>
                <th className="num">B</th>
                <th>Rubber</th>
                <th className="num">Δ</th>
                <th className="num">Δ</th>
              </tr>
            </thead>
            <tbody>
              {t.rubbers.map((r, i) => {
                const pa = playersByName.get(r.a)
                const pb = playersByName.get(r.b)
                return (
                  <tr key={i}>
                    <td className="num muted">{r.bracket || '—'}</td>
                    <td>
                      <span className={r.ga > r.gb ? 'strong' : ''}>
                        <PlayerLink name={r.a} />
                      </span>
                      {pa?.team !== t.home && <span className="muted small"> (sub)</span>}{' '}
                      <span className="mono">
                        {r.ga}–{r.gb}
                      </span>{' '}
                      <span className={r.gb > r.ga ? 'strong' : ''}>
                        <PlayerLink name={r.b} />
                      </span>
                      {pb?.team !== t.away && <span className="muted small"> (sub)</span>}
                      {r.format !== 'bo5' && <span className="muted small"> · {FORMAT_LABEL[r.format]}</span>}
                    </td>
                    <td className="num">
                      <Delta value={r.da} />
                    </td>
                    <td className="num">
                      <Delta value={r.db} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

/** One player's league record: rating summary and every rubber, newest first. */
function PlayerResults({ p }: { p: LeaguePlayer }) {
  const results = resultsOf(p.name)
  const rank = league.ratings.filter((x) => x.matches > 0).findIndex((x) => x.id === p.id) + 1
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>
            {p.name}{' '}
            <span className="muted small">
              {teamName(p.team)} · bracket {p.bracket}
              {p.sub ? ' · sub' : ''}
            </span>
          </h2>
          <a href="#league" className="muted small">
            ← {league.season}
          </a>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Rating</span>
            <span className="stat-value">
              {Math.round(p.rating)} <span className="muted small">± {Math.round(p.rd)}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Rank</span>
            <span className="stat-value">{rank || '—'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">W–L</span>
            <span className="stat-value">
              {p.wins}–{p.losses}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Trend</span>
            <span className="stat-value">
              <Sparkline points={p.history} width={120} height={28} />
            </span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Results</h2>
        {results.length === 0 ? (
          <p className="muted">No rubbers played yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tie</th>
                  <th className="num">B</th>
                  <th>Opponent</th>
                  <th className="num">Score</th>
                  <th>Format</th>
                  <th className="num">Δ</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ week, date, team, opponentTeam, rubber: r, me, won }) => {
                  const opp = me === 'a' ? r.b : r.a
                  const mine = me === 'a' ? r.ga : r.gb
                  const theirs = me === 'a' ? r.gb : r.ga
                  const d = me === 'a' ? r.da : r.db
                  const oppP = playersByName.get(opp)
                  return (
                    <tr key={`${week}-${date}-${opp}`}>
                      <td className="muted">
                        {date} <span className="small">· wk {week}</span>
                      </td>
                      <td className="muted small">
                        {teamName(team)} v {teamName(opponentTeam)}
                      </td>
                      <td className="num muted">{r.bracket || '—'}</td>
                      <td>
                        <PlayerLink name={opp} />
                        {oppP && <span className="muted small"> {Math.round(oppP.rating)}</span>}
                      </td>
                      <td className={`num mono ${won ? 'strong' : ''}`}>
                        {mine}–{theirs}
                      </td>
                      <td className="muted small">{FORMAT_LABEL[r.format]}</td>
                      <td className="num">
                        <Delta value={d} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
