import { Fragment, useMemo, useState } from 'react'
import history from '../data/ksf/points-history.json'
import { Sparkline } from './Sparkline.tsx'

// The federation's ranking points (koreasquash.or.kr 국내랭킹), counted two ways
// (tools/build-points.mts dates them):
//   season  – the federation's rule: a season's points, reset every 1 January
//   rolling – PSA style: a tournament's points count for one year from the day it ended

interface Tournament {
  key: string
  season: number
  label: string
  name: string
  grade: string | null
  team: boolean
  date: string
  source: 'portal' | 'festival' | 'estimated' | 'season-end'
}
interface Player { id: string; name: string; sex: string; team: string; sections: Record<string, string> }
interface Entry { p: string; t: number; place: string; points: number }

const T = history.tournaments as Tournament[]
const PLAYERS = history.players as Player[]
const ENTRIES = history.entries as Entry[]
const byPlayer = new Map<string, Entry[]>()
for (const e of ENTRIES) byPlayer.set(e.p, [...(byPlayer.get(e.p) ?? []), e])

type Mode = 'rolling' | 'season'
const MODES: { key: Mode; label: string }[] = [
  { key: 'rolling', label: '1년 롤링 (PSA 방식)' },
  { key: 'season', label: '시즌 (연맹 방식)' },
]
const SEXES = [{ key: '남', label: '남자' }, { key: '여', label: '여자' }]
const KINDS = ['일반부', '대학부']

const today = new Date().toISOString().slice(0, 10)
/** The day a tournament's points stop counting on the rolling list: one year after it ended. */
const expires = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`
const counts = (mode: Mode, t: Tournament, asOf: string) =>
  t.date <= asOf && (mode === 'rolling' ? asOf < expires(t.date) : t.season === Number(asOf.slice(0, 4)))
const total = (id: string, mode: Mode, asOf: string) =>
  (byPlayer.get(id) ?? []).reduce((a, e) => a + (counts(mode, T[e.t], asOf) ? e.points : 0), 0)
/** The section a player was listed in that season, else the nearest season before, else after. */
function sectionOf(p: Player, year: number) {
  const seasons = Object.keys(p.sections).map(Number).sort((a, b) => a - b)
  const at = [...seasons].reverse().find((s) => s <= year) ?? seasons[0]
  return p.sections[at]
}
/** Every day the lists change: a tournament ends, a year of points expires, or a season starts. */
const DATES = (() => {
  const s = new Set<string>([today])
  for (const t of T) {
    s.add(t.date)
    if (expires(t.date) <= today) s.add(expires(t.date))
  }
  return [...s].filter((d) => d >= '2021-01-01' && d <= today).sort().reverse()
})()
// The rolling list is only complete from a year after the first season scraped.
const ROLLING_FROM = '2022-01-01'

function rank<T extends { pts: number }>(rows: T[]) {
  let last = -1
  let r = 0
  return rows.map((row, i) => {
    if (row.pts !== last) r = i + 1
    last = row.pts
    return { ...row, rank: row.pts > 0 ? r : null }
  })
}

export function RankingPoints() {
  const [mode, setMode] = useState<Mode>('rolling')
  const [sex, setSex] = useState('남')
  const [kind, setKind] = useState('일반부')
  const [asOf, setAsOf] = useState(DATES[0])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const other: Mode = mode === 'rolling' ? 'season' : 'rolling'
  const year = Number(asOf.slice(0, 4))

  const rows = useMemo(() => {
    const list = PLAYERS.filter((p) => p.sex === sex && sectionOf(p, year) === kind)
      .map((p) => ({ p, pts: total(p.id, mode, asOf), alt: total(p.id, other, asOf) }))
      .filter((r) => r.pts > 0 || r.alt > 0)
      .sort((a, b) => b.pts - a.pts || b.alt - a.alt || a.p.name.localeCompare(b.p.name, 'ko'))
    const altRank = new Map(rank([...list].sort((a, b) => b.alt - a.alt).map((r) => ({ id: r.p.id, pts: r.alt }))).map((r) => [r.id, r.rank]))
    return rank(list).map((r) => ({ ...r, altRank: altRank.get(r.p.id) ?? null }))
  }, [mode, other, sex, kind, asOf, year])

  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => !q || r.p.name.toLowerCase().includes(q) || r.p.team.toLowerCase().includes(q))
  const estimated = T.filter((t) => t.source === 'estimated')

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>KSF 랭킹 포인트</h2>
          <span className="muted small">
            {asOf} 기준 · {MODES.find((m) => m.key === mode)!.label}
          </span>
        </div>
        <div className="filters">
          <div className="segmented" role="group" aria-label="Counting">
            {MODES.map((m) => (
              <button key={m.key} type="button" className={mode === m.key ? 'on' : ''} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Sex">
            {SEXES.map((s) => (
              <button key={s.key} type="button" className={sex === s.key ? 'on' : ''} onClick={() => setSex(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Section">
            {KINDS.map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {k}
              </button>
            ))}
          </div>
          <select value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="기준일">
            {DATES.map((d) => {
              const ended = T.filter((t) => t.date === d)
              return (
                <option key={d} value={d}>
                  {d === today ? `${d} (오늘)` : d}
                  {ended.length ? ` · ${ended.map((t) => t.label).join(', ')}` : ''}
                </option>
              )
            })}
          </select>
          <input placeholder="Search name or team" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {mode === 'rolling' && asOf < ROLLING_FROM && (
          <p className="muted small">2021년 이전 포인트는 자료가 없어, {ROLLING_FROM} 이전의 롤링 합계는 실제보다 적게 나옵니다.</p>
        )}

        {shown.length === 0 ? (
          <p className="muted">No players match.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th className="sm-hide">Team</th>
                  <th className="num">Points</th>
                  <th className="num" title={`${MODES.find((m) => m.key === other)!.label} 순위와 비교`}>
                    {other === 'season' ? '시즌 순위' : '롤링 순위'}
                  </th>
                  <th className="sm-hide">Trend</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.p.id}>
                    <tr className={r.pts === 0 ? 'unrated' : ''}>
                      <td className="muted">{r.rank ?? '—'}</td>
                      <td>
                        <button type="button" className="link" onClick={() => setOpen(open === r.p.id ? null : r.p.id)}>
                          {r.p.name}
                        </button>
                        <span className="muted small sm-only"> · {r.p.team}</span>
                      </td>
                      <td className="muted small sm-hide">{r.p.team || '—'}</td>
                      <td className="num strong">{r.pts}</td>
                      <RankShift here={r.rank} there={r.altRank} />
                      <td className="sm-hide">
                        <Sparkline points={trend(r.p.id, mode, asOf)} />
                      </td>
                    </tr>
                    {open === r.p.id && (
                      <tr>
                        <td colSpan={6}>
                          <Breakdown id={r.p.id} mode={mode} asOf={asOf} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="muted small">
        Source: 대한스쿼시연맹 국내랭킹 (koreasquash.or.kr), {history.built} 수집, 2021–{T[T.length - 1]?.season} 시즌. 대회마다
        등급(A·B·C)에 따라 순위별 포인트가 주어집니다. <strong>시즌</strong>은 연맹 방식대로 그해 1월 1일부터 기준일까지의 포인트,{' '}
        <strong>1년 롤링</strong>은 PSA처럼 대회가 끝난 날부터 1년 동안만 포인트가 남는 방식입니다(기준일에 1년이 지난 대회는 빠짐).
        이름을 누르면 대회별 포인트와 만료일이 나옵니다. 오른쪽 순위 칸은 다른 방식으로 셌을 때의 순위와 그 차이입니다.
        대회 종료일은 대한체육회 경기결과에서 대회명으로 찾았고, 전국체육대회는 대회 기간의 마지막 날입니다. 경기결과에 없는{' '}
        {estimated.length}개 대회는 다른 해 같은 대회의 날짜로 추정했습니다
        {estimated.length ? ` (${estimated.map((t) => `${t.season} ${t.name}`).join(', ')})` : ''}. 연맹 페이지의 2024·2025 시즌
        합계는 선수별 대회 목록의 합과 다르게 표시되어(일부 대회만 반영된 것으로 보임), 여기서는 대회 목록을 기준으로 합산했습니다.
      </p>
    </>
  )
}

/** The player's total on every list-changing day up to the chosen one, for the trend line. */
function trend(id: string, mode: Mode, asOf: string) {
  return [...DATES].reverse().filter((d) => d <= asOf && d >= '2021-01-01').map((d) => ({ date: d, rating: total(id, mode, d) }))
}

function RankShift({ here, there }: { here: number | null; there: number | null }) {
  if (there === null) return <td className="num muted">—</td>
  const d = here === null ? 0 : there - here
  return (
    <td className="num">
      {there}
      {here !== null && d !== 0 && (
        <span className={`small ${d > 0 ? 'up' : 'down'}`} title={d > 0 ? '이 방식에서 더 높음' : '이 방식에서 더 낮음'}>
          {' '}
          ({d > 0 ? '↑' : '↓'}
          {Math.abs(d)})
        </span>
      )}
    </td>
  )
}

function Breakdown({ id, mode, asOf }: { id: string; mode: Mode; asOf: string }) {
  const list = (byPlayer.get(id) ?? []).map((e) => ({ e, t: T[e.t] })).sort((a, b) => b.t.date.localeCompare(a.t.date))
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>대회</th>
            <th>종료일</th>
            <th className="num">순위</th>
            <th className="num">포인트</th>
            <th className="sm-hide">롤링 만료</th>
            <th>{asOf} 반영</th>
          </tr>
        </thead>
        <tbody>
          {list.map(({ e, t }) => {
            const on = counts(mode, t, asOf)
            return (
              <tr key={t.key} className={on ? '' : 'unrated'}>
                <td>
                  {t.season} {t.label}
                </td>
                <td className="muted small" title={t.source === 'estimated' ? '경기결과에 없어 다른 해 날짜로 추정' : ''}>
                  {t.date}
                  {t.source === 'estimated' ? ' (추정)' : t.source === 'season-end' ? ' (시즌 말)' : ''}
                </td>
                <td className="num">{e.place === '0' ? '참가' : e.place}</td>
                <td className="num">{e.points}</td>
                <td className="muted small sm-hide">{expires(t.date)}</td>
                <td className="small">{t.date > asOf ? '아직' : on ? '✓' : mode === 'rolling' ? '만료' : '지난 시즌'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
