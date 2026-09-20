import { useMemo } from 'react'
import {
  entryOf,
  ladder,
  matches,
  playersById,
  PROVISIONAL_RD,
  rankOf,
  TERM_KEYS,
  tournamentsById,
  type CompactMatch,
} from './ksf.ts'
import { Sparkline } from './Sparkline.tsx'

export function PlayerPage({ id }: { id: string }) {
  const player = playersById.get(id)
  const all = entryOf('all', id)

  // This player's matches, newest first, grouped by tournament.
  const groups = useMemo(() => {
    const mine = matches.filter((m) => m.a === id || m.b === id)
    const byTournament = new Map<string, CompactMatch[]>()
    for (const m of mine) byTournament.set(m.t, [...(byTournament.get(m.t) ?? []), m])
    return [...byTournament.entries()]
      .map(([toCd, ms]) => ({ tournament: tournamentsById.get(toCd), toCd, matches: ms.reverse(), delta: ms[0].a === id ? ms[0].da : ms[0].db }))
      .sort((a, b) => (b.tournament?.date ?? '').localeCompare(a.tournament?.date ?? ''))
  }, [id])

  // Head-to-head, most played first.
  const h2h = useMemo(() => {
    const rec = new Map<string, { wins: number; losses: number; last: string }>()
    for (const g of groups) {
      for (const m of g.matches) {
        const opp = m.a === id ? m.b : m.a
        const won = (m.a === id ? m.ga : m.gb) > (m.a === id ? m.gb : m.ga)
        const r = rec.get(opp) ?? { wins: 0, losses: 0, last: '' }
        if (won) r.wins++
        else r.losses++
        if (m.d > r.last) r.last = m.d
        rec.set(opp, r)
      }
    }
    return [...rec.entries()]
      .map(([opp, r]) => ({ opp: playersById.get(opp), oppId: opp, ...r }))
      .sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || b.last.localeCompare(a.last))
  }, [groups, id])

  if (!player || !all) {
    return (
      <section className="panel">
        <p className="muted">
          Unknown player. <a href="#national">Back to the ladder</a>
        </p>
      </section>
    )
  }

  const rank = rankOf('all', id)

  return (
    <>
      <section className="panel">
        <a href="#national" className="muted small">
          ← Ladder
        </a>
        <div className="panel-head">
          <h2>
            {player.name}{' '}
            <span className="muted small">
              {player.birthYear ?? '?'} · {player.sex ?? '?'} · {player.lastDivision ?? '—'}
            </span>
          </h2>
          <span className="muted small">
            {player.team ?? '—'}
            {player.sido ? ` · ${player.sido}` : ''}
          </span>
        </div>

        <div className="stats">
          <div className="stat">
            <span className="stat-label">All-time rating</span>
            <span className="stat-value">
              {all.rating} <span className="muted small">±{all.rd}</span>
            </span>
            <span className="muted small">
              {rank ? `#${rank} ${player.sex}` : 'inactive'} · started at {player.startRating}
            </span>
          </div>
          {TERM_KEYS.filter((k) => k !== 'all').map((k) => {
            const e = entryOf(k, id)
            const r = e ? rankOf(k, id) : null
            return (
              <div className="stat" key={k}>
                <span className="stat-label">{ladder.terms[k].label}</span>
                <span className={`stat-value ${e && e.rd > PROVISIONAL_RD ? 'muted' : ''}`}>
                  {e ? e.rating : '—'} {e && <span className="muted small">±{e.rd}</span>}
                </span>
                <span className="muted small">{e ? `#${r} · ${e.wins}–${e.losses}` : 'no results'}</span>
              </div>
            )
          })}
          <div className="stat">
            <span className="stat-label">Record</span>
            <span className="stat-value">
              {all.wins}–{all.losses}
            </span>
            <span className="muted small">{all.matches} matches · last {all.lastPlayed}</span>
          </div>
        </div>

        <div className="chart">
          <Sparkline points={all.history} width={800} height={120} />
          <div className="muted small chart-axis">
            <span>{all.history[0]?.date}</span>
            <span>{all.history[all.history.length - 1]?.date}</span>
          </div>
        </div>
      </section>

      <div className="two-col wide-left">
        <section className="panel">
          <h2>Matches</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.toCd} group={g} me={id} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Head-to-head</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Opponent</th>
                  <th className="num">W–L</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {h2h.map((r) => (
                  <tr key={r.oppId}>
                    <td>
                      <a className="player-link" href={`#player/${r.oppId}`}>
                        {r.opp?.name ?? r.oppId}
                      </a>
                      <span className="muted small"> {entryOf('all', r.oppId)?.rating ?? ''}</span>
                    </td>
                    <td className={`num ${r.wins > r.losses ? 'up' : r.wins < r.losses ? 'down' : ''}`}>
                      {r.wins}–{r.losses}
                    </td>
                    <td className="muted small">{r.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}

function GroupRows({
  group,
  me,
}: {
  group: { tournament?: { name: string; date: string }; matches: CompactMatch[]; delta: number }
  me: string
}) {
  const d = group.delta
  return (
    <>
      <tr className="group-row">
        <td colSpan={3}>
          <span className="strong">{group.tournament?.name ?? '?'}</span>{' '}
          <span className="muted small">
            {group.tournament?.date} · {group.matches[0].v}
          </span>
        </td>
        <td className={`num ${d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}`}>
          {d > 0 ? '+' : ''}
          {d}
        </td>
      </tr>
      {group.matches.map((m, i) => {
        const home = m.a === me
        const oppId = home ? m.b : m.a
        const my = home ? m.ga : m.gb
        const their = home ? m.gb : m.ga
        return (
          <tr key={i}>
            <td className="muted small">{m.r ?? ''}</td>
            <td>
              <a className="player-link" href={`#player/${oppId}`}>
                {playersById.get(oppId)?.name ?? oppId}
              </a>
            </td>
            <td className={`mono ${my > their ? 'up' : 'down'}`}>
              {my}–{their}
            </td>
            <td></td>
          </tr>
        )
      })}
    </>
  )
}
