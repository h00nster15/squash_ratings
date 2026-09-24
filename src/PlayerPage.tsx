import { useMemo } from 'react'
import {
  entryOf,
  isProvisional,
  ladder,
  matches,
  OPEN,
  playersById,
  PRIMARY,
  rankOf,
  TERM_KEYS,
  tournamentsById,
  type CompactMatch,
} from './ksf.ts'
import { Sparkline } from './Sparkline.tsx'

export function PlayerPage({ id }: { id: string }) {
  const player = playersById.get(id)
  // The ladder shown first: national if the player is on it, else the student division they last played.
  const mainLadder = player?.ladders.includes(OPEN) ? OPEN : player?.ladders[player.ladders.length - 1] ?? OPEN
  const all = entryOf(mainLadder, PRIMARY, id)

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

  // Which division(s) the player competed in each year, oldest first.
  const divisionsByYear = useMemo(() => {
    const byYear = new Map<string, Set<string>>()
    for (const g of groups) {
      const year = (g.tournament?.date ?? '').slice(0, 4)
      if (!year) continue
      const set = byYear.get(year) ?? new Set()
      for (const m of g.matches) set.add(m.v)
      byYear.set(year, set)
    }
    return [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [groups])

  if (!player || !all) {
    return (
      <section className="panel">
        <p className="muted">
          Unknown player. <a href="#national">Back to the ladder</a>
        </p>
      </section>
    )
  }


  return (
    <>
      <section className="panel">
        <a href="#national" className="muted small">
          ← Ladder
        </a>
        <div className="panel-head">
          <h2>
            {player.name}{' '}
            <span className="muted small" title="출생연도 · 성별 · 최근 출전 부문 (birth year · sex · latest division played)">
              {player.birthYear ?? '?'} · {player.sex ?? '?'} · {player.lastDivision ?? '—'}
            </span>
          </h2>
          <span className="muted small">
            {player.team ?? '—'}
            {player.sido ? ` · ${player.sido}` : ''}
          </span>
        </div>

        <ul className="year-divisions">
          {divisionsByYear.map(([year, divs]) => (
            <li key={year}>
              <span className="muted small">{year}</span> {[...divs].join(' / ')}
            </li>
          ))}
        </ul>

        {/* One card per ladder the player is LISTED on; results never cross ladders. A
            player under the match minimum has none — their results still count for others. */}
        {player.ladders.length === 0 && (
          <p className="muted small" style={{ margin: '4px 0 12px' }}>
            아직 순위에 오르지 않았습니다 — 최근 3년 {ladder.minMatches?.y3 ?? 0}경기를 채우면 사다리에 표시됩니다.
            아래 전적은 그대로 기록되고, 상대 선수의 레이팅에는 이미 반영돼 있습니다.
          </p>
        )}
        <div className="stats">
          {player.ladders.map((lk) => {
            const e = entryOf(lk, PRIMARY, id)!
            const rank = rankOf(lk, id)
            const provisional = isProvisional(lk, e)
            return (
              <div className="stat" key={lk}>
                <span className="stat-label">{lk === OPEN ? '국가 랭킹' : `${ladder.ladders[lk].label} 랭킹`}</span>
                <span className={`stat-value ${provisional ? 'muted' : ''}`}>
                  {e.rating} <span className="muted small">±{e.rd}</span>
                </span>
                <span className="muted small">
                  {rank ? `#${rank} ${player.sex}` : '—'} · {e.wins}–{e.losses}
                  {provisional ? ' · provisional' : ''}
                </span>
              </div>
            )
          })}
          {TERM_KEYS.filter((k) => k !== PRIMARY).map((k) => {
            const e = entryOf(mainLadder, k, id)
            const d = e && e.termMatches ? Math.round(e.delta ?? 0) : null
            return (
              <div className="stat" key={k}>
                <span className="stat-label">{ladder.ladders[mainLadder].terms[k].label}</span>
                <span className={`stat-value ${d === null ? 'muted' : d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>
                  {d === null ? '—' : `${d > 0 ? '+' : ''}${d}`}
                </span>
                <span className="muted small">{e && e.termMatches ? `${e.termWins}–${e.termLosses} in window` : 'no results in window'}</span>
              </div>
            )
          })}
        </div>

        <div className="chart">
          <span className="muted small">{mainLadder === OPEN ? '국가 랭킹' : ladder.ladders[mainLadder].label} · last {all.lastPlayed}</span>
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
                      <span className="muted small"> {entryOf(mainLadder, PRIMARY, r.oppId)?.rating ?? ''}</span>
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
  group: { tournament?: { name: string; date: string }; matches: CompactMatch[]; delta: number | null }
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
        <td className={`num ${d === null ? 'muted' : d > 0 ? 'up' : d < 0 ? 'down' : 'muted'}`} title={d === null ? 'before the rating window' : ''}>
          {d === null ? '—' : `${d > 0 ? '+' : ''}${d}`}
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
