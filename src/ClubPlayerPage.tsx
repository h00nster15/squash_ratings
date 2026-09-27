import { useEffect, useMemo, useRef, useState } from 'react'
import { type ClubData, type DayChange, gamesOf, nationalHistory, nationalScale, wsrByMatch } from './wellperion.ts'

type Scale = 'wsr' | 'national'
const TYPE_LABEL: Record<string, string> = { challenge: '챌린지', league: '리그', tournament: '대회', practice: '연습' }

/** Rounding and sign per scale: WSR to 0.01, the national scale to whole points. */
const fmt = (scale: Scale, v: number) => (scale === 'wsr' ? v.toFixed(2) : String(Math.round(v)))
function fmtDelta(scale: Scale, d: number) {
  const r = scale === 'wsr' ? Math.round(d * 100) / 100 : Math.round(d)
  if (r === 0) return '±0'
  return `${r > 0 ? '+' : '−'}${scale === 'wsr' ? Math.abs(r).toFixed(2) : Math.abs(r)}`
}
const deltaClass = (scale: Scale, d: number) => {
  const r = scale === 'wsr' ? Math.round(d * 100) : Math.round(d)
  return r > 0 ? 'up' : r < 0 ? 'down' : 'muted'
}

/**
 * One Wellperion player: both ratings now, how they moved day by day (chart), and every
 * result with the change it made. Same-day results share one change — the national
 * scale's Glicko half and WSR both update a day at a time.
 */
export function ClubPlayerPage({ data, id, scale, setScale }: { data: ClubData; id: string; scale: Scale; setScale: (s: Scale) => void }) {
  const { players, matches, admin } = data
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const nat = useMemo(() => nationalScale(players, matches), [players, matches])
  const player = byId.get(id)
  const rated = nat.players.find((p) => p.id === id)

  // WSR moves match by match; the national scale a day at a time (its Glicko half rates a
  // day's results together), so its change sits on the day, not on each result.
  const wsrChanges = useMemo(() => wsrByMatch(matches, id), [matches, id])
  const natDays = useMemo(() => nationalHistory(nat, matches, id), [nat, matches, id])
  const hasWsrHistory = matches.some((m) => m.wsr)
  const points = scale === 'wsr' ? [...wsrChanges.values()] : natDays
  const dayByDate = new Map(natDays.map((d) => [d.date, d]))

  // Results newest first, grouped by day.
  const groups = useMemo(() => {
    const byDate = new Map<string, typeof matches>()
    for (const m of matches) {
      if (m.winner !== id && m.loser !== id) continue
      byDate.set(m.date, [...(byDate.get(m.date) ?? []), m])
    }
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [matches, id])

  if (!player || (!admin && player.hidden)) {
    return (
      <section className="panel">
        <p className="muted">
          선수를 찾을 수 없습니다. <a href="#wellperion">← 랭킹</a>
        </p>
      </section>
    )
  }
  const name = (pid: string) => {
    const p = byId.get(pid)
    return (admin ? p?.realName : null) ?? p?.name ?? '비공개 선수'
  }
  const wins = groups.reduce((n, [, ms]) => n + ms.filter((m) => m.winner === id).length, 0)
  const losses = groups.reduce((n, [, ms]) => n + ms.filter((m) => m.loser === id).length, 0)
  const unit = scale === 'wsr' ? 'WSR' : '국가 기준 레이팅'

  return (
    <>
      <section className="panel">
        <a href="#wellperion" className="muted small">
          ← 랭킹
        </a>
        <div className="panel-head">
          <h2>
            {name(id)} <span className="muted small">{player.division}{player.ksfId ? ' · 국가 연결' : ''}</span>
          </h2>
          <span className="muted small">{wins}승 {losses}패</span>
        </div>

        <div className="stats">
          <div className="stat">
            <span className="stat-label">WSR</span>
            <span className={`stat-value ${player.provisional ? 'muted' : ''}`}>{player.wsr.toFixed(2)}</span>
            <span className="muted small">
              신뢰도 {player.reliability}%{player.provisional ? ' · 잠정' : ''}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">국가 기준 레이팅</span>
            <span className={`stat-value ${!rated || rated.matches < 3 ? 'muted' : ''}`}>
              {rated ? Math.round(rated.rating) : '—'} {rated && <span className="muted small">±{Math.round(rated.rd)}</span>}
            </span>
            <span className="muted small">{rated ? `${rated.matches}경기` : '경기 없음'}</span>
          </div>
        </div>

        <div className="filters">
          <div className="segmented" role="group" aria-label="Scale">
            <button type="button" className={scale === 'wsr' ? 'on' : ''} onClick={() => setScale('wsr')}>WSR (1–10)</button>
            <button type="button" className={scale === 'national' ? 'on' : ''} onClick={() => setScale('national')}>국가 기준 레이팅</button>
          </div>
        </div>

        <h3 className="chart-title">{unit} 변화</h3>
        {scale === 'wsr' && !hasWsrHistory ? (
          <p className="muted small">WSR 변화 기록은 클럽 스크립트를 새 버전으로 배포하면 나타납니다.</p>
        ) : points.length === 0 ? (
          <p className="muted small">아직 경기 기록이 없습니다.</p>
        ) : (
          <RatingChart days={points} scale={scale} />
        )}
      </section>

      <section className="panel">
        <h2>경기 기록</h2>
        {groups.length === 0 ? (
          <p className="muted">아직 경기 기록이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table className="history">
              <thead>
                <tr>
                  <th>일자</th>
                  <th>결과</th>
                  <th className="sm-hide">유형</th>
                  <th className="num">{scale === 'wsr' ? 'WSR' : '레이팅'} 변화</th>
                </tr>
              </thead>
              {groups.map(([date, ms]) => {
                const day = dayByDate.get(date)
                return (
                  <tbody key={date}>
                    {ms.map((m, i) => {
                      const won = m.winner === id
                      const opp = won ? m.loser : m.winner
                      const [a, b] = gamesOf(m)
                      return (
                        <tr key={m.id ?? `${date}-${i}`}>
                          {i === 0 && (
                            <td className="muted" rowSpan={ms.length}>
                              {date}
                            </td>
                          )}
                          <td>
                            <span className={`result ${won ? 'up' : 'down'}`}>{won ? '승' : '패'}</span>{' '}
                            {won ? `${a}–${b}` : `${b}–${a}`}{' '}
                            {admin || !byId.get(opp)?.hidden ? (
                              <a className="player-link" href={`#wellperion/player/${encodeURIComponent(opp)}`}>
                                {name(opp)}
                              </a>
                            ) : (
                              name(opp)
                            )}
                            {!m.games && <span className="muted small"> (스코어 없음)</span>}
                            {m.event && <span className="muted small"> · {m.event}</span>}
                          </td>
                          <td className="muted small sm-hide">{TYPE_LABEL[m.type] ?? m.type}</td>
                          {scale === 'wsr' ? (
                            <td className="num">
                              <Change scale={scale} change={wsrChanges.get(m)} />
                            </td>
                          ) : (
                            i === 0 && (
                              <td className="num" rowSpan={ms.length}>
                                <Change scale={scale} change={day} />
                              </td>
                            )
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
          </div>
        )}
        <p className="muted small">
          {scale === 'wsr'
            ? 'WSR 변화는 경기마다 그 경기 직전 → 직후의 WSR입니다 (같은 날은 입력 순서대로). WSR은 모든 선수를 함께 다시 계산하므로, 내 경기가 없어도 상대 선수들의 다른 경기나 12개월이 지난 결과 때문에 조금씩 움직입니다 — 그래서 경기별 변화를 더한 값이 전체 변화와 꼭 같지는 않습니다.'
            : '국가 기준 레이팅은 하루 단위로 계산되므로(같은 날 경기는 한꺼번에 반영) 변화가 그날에 하나로 표시됩니다.'}
        </p>
      </section>
    </>
  )
}

function Change({ scale, change }: { scale: Scale; change?: DayChange }) {
  if (!change) return <span className="muted">—</span>
  const d = change.after - change.before
  return (
    <>
      <span className={deltaClass(scale, d)}>{fmtDelta(scale, d)}</span>
      <span className="muted small block">
        {fmt(scale, change.before)} → {fmt(scale, change.after)}
      </span>
    </>
  )
}

/** Rating after each match (WSR) or day (national scale), from the rating before the first. Hover or tap for values. */
function RatingChart({ days, scale }: { days: DayChange[]; scale: Scale }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = [{ date: '시작', value: days[0].before, delta: null as number | null }, ...days.map((d) => ({ date: d.date, value: d.after, delta: d.after - d.before }))]
  const height = 180
  const pad = { l: 44, r: 12, t: 12, b: 24 }
  const values = points.map((p) => p.value)
  const minSpan = scale === 'wsr' ? 0.5 : 60
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  const x = (i: number) => pad.l + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b)
  const ticks = [lo, (lo + hi) / 2, hi]
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const nearest = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect()
    const px = clientX - rect.left
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    setHover(best)
  }
  const h = hover === null ? null : points[hover]

  return (
    <div
      className="rating-chart"
      ref={wrap}
      onPointerMove={(e) => nearest(e.clientX)}
      onPointerDown={(e) => nearest(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg width={width} height={height} role="img" aria-label={`${fmt(scale, points[0].value)} → ${fmt(scale, points[points.length - 1].value)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end">
              {fmt(scale, t)}
            </text>
          </g>
        ))}
        <text className="axis" x={x(0)} y={height - 6} textAnchor="start">
          {days[0].date}
        </text>
        {points.length > 2 && (
          <text className="axis" x={x(points.length - 1)} y={height - 6} textAnchor="end">
            {days[days.length - 1].date}
          </text>
        )}
        {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} />}
        <path className="line" d={path} />
        {points.map((p, i) => (
          <circle key={i} className={`dot ${i === hover ? 'on' : ''}`} cx={x(i)} cy={y(p.value)} r={i === hover ? 5 : 4} />
        ))}
      </svg>
      {h && hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: 0 }}>
          <span className="muted small">{h.date === '시작' ? '첫 경기 전' : h.date}</span>
          <strong>{fmt(scale, h.value)}</strong>
          {h.delta !== null && <span className={`small ${deltaClass(scale, h.delta)}`}>{fmtDelta(scale, h.delta)}</span>}
        </div>
      )}
    </div>
  )
}
