import { Fragment, useMemo, useState } from 'react'
import history from '../data/ksf/points-history.json'
import { Sparkline } from './Sparkline.tsx'

// The federation's ranking points (koreasquash.or.kr 국내랭킹), counted three ways
// (tools/build-points.mts dates them):
//   season  – the federation's rule: a season's points, reset every 1 January
//   rolling – PSA style: a tournament's points count for one year from the day it ended
//   average – the same year's points ranked like PSA: the average of the best BEST individual results

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

type Mode = 'average' | 'rolling' | 'season'
const MODES: { key: Mode; label: string }[] = [
  { key: 'rolling', label: '1년 롤링 (PSA 방식)' },
  { key: 'season', label: '시즌 (연맹 방식)' },
  { key: 'average', label: '1년 평균' },
]
const averaged = (mode: Mode) => mode === 'average'

/** PSA averages a player's best 11 or more results of the year, about what a top professional plays. The federation's
 *  calendar has 8 individual tournaments, so here it is the best 6; a player with fewer is averaged over those played. */
const BEST = 6
/** The federation's grade of an individual tournament (전국체육대회 개인전 is C by its rule); null for team events and
 *  international points, which an average leaves out. */
const tierOf = (t: Tournament) => (t.team ? null : (t.grade ?? (/전국체육대회/.test(t.name) ? 'C' : null)))
/** The entries an averaged ranking on `asOf` counts: individual graded tournaments in the year's window, best BEST. */
function bestCounted(id: string, asOf: string) {
  return (byPlayer.get(id) ?? []).filter((e) => tierOf(T[e.t]) && counts('rolling', T[e.t], asOf))
    .sort((a, b) => b.points - a.points).slice(0, BEST)
}
const SEXES = [{ key: '남', label: '남자' }, { key: '여', label: '여자' }]
const KINDS = ['일반부', '대학부']

const today = new Date().toISOString().slice(0, 10)
/** The day a tournament's points stop counting on the rolling list: one year after it ended. */
const expires = (date: string) => `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`
const counts = (mode: Mode, t: Tournament, asOf: string) =>
  t.date <= asOf && (mode === 'season' ? t.season === Number(asOf.slice(0, 4)) : asOf < expires(t.date))
// An averaged list divides by the results counted: the best BEST, or every tournament in the window if fewer.
const average = (id: string, asOf: string) => {
  const best = bestCounted(id, asOf)
  return best.length ? Math.round(best.reduce((a, e) => a + e.points, 0) / best.length * 10) / 10 : 0
}
const total = (id: string, mode: Mode, asOf: string) =>
  averaged(mode)
    ? average(id, asOf)
    : (byPlayer.get(id) ?? []).reduce((a, e) => a + (counts(mode, T[e.t], asOf) ? e.points : 0), 0)
const fmt = (mode: Mode, pts: number) => (averaged(mode) ? pts.toFixed(1) : String(pts))
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
  const other: Mode = mode === 'season' ? 'rolling' : 'season'
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
        {mode !== 'season' && asOf < ROLLING_FROM && (
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
                      <td className="num strong">{fmt(mode, r.pts)}</td>
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
      {averaged(mode) && <MonthEnds mode={mode} sex={sex} kind={kind} />}
      {averaged(mode) && <YearEnds mode={mode} sex={sex} kind={kind} />}
      {averaged(mode) && <Grades />}
      <p className="muted small">
        Source: 대한스쿼시연맹 국내랭킹 (koreasquash.or.kr), {history.built} 수집, 2021–{T[T.length - 1]?.season} 시즌. 대회마다
        등급(A·B·C)에 따라 순위별 포인트가 주어집니다. <strong>시즌</strong>은 연맹 방식대로 그해 1월 1일부터 기준일까지의 포인트,{' '}
        <strong>1년 롤링</strong>은 PSA처럼 대회가 끝난 날부터 1년 동안만 포인트가 남는 방식입니다(기준일에 1년이 지난 대회는 빠짐).{' '}
        <strong>1년 평균</strong>은 같은 1년의 연맹 포인트를 PSA처럼 평균으로 셉니다: 최근 1년 개인전 성적 중 상위 {BEST}개의
        평균(PSA는 상위 11개 이상; 국내는 개인전이 1년에 8개라 {BEST}개)이라, 대회를 많이 나가서 쌓은 합계가 아니라 잘한 대회의 수준으로
        순위가 정해집니다. {BEST}개보다 적게 나간 선수는 나간 대회 수로 나누고, 단체전과 국제랭킹포인트는 빠집니다(전국체육대회 개인전은
        규정대로 C등급).
        이름을 누르면 대회별 포인트와 만료일이 나옵니다. 오른쪽 순위 칸은 다른 방식으로 셌을 때의 순위와 그 차이입니다.
        대회 종료일은 대한체육회 경기결과에서 대회명으로 찾았고, 전국체육대회는 대회 기간의 마지막 날입니다. 경기결과에 없는{' '}
        {estimated.length}개 대회는 다른 해 같은 대회의 날짜로 추정했습니다
        {estimated.length ? ` (${estimated.map((t) => `${t.season} ${t.name}`).join(', ')})` : ''}. 연맹 페이지의 2024·2025 시즌
        합계는 선수별 대회 목록의 합과 다르게 표시되어(일부 대회만 반영된 것으로 보임), 여기서는 대회 목록을 기준으로 합산했습니다.
      </p>
    </>
  )
}

/** The ranking an averaged list would publish on `asOf`: player id → { rank, pts } for one section. */
function rankOn(mode: Mode, sex: string, kind: string, asOf: string) {
  const y = Number(asOf.slice(0, 4))
  const list = rank(PLAYERS.filter((p) => p.sex === sex && sectionOf(p, y) === kind)
    .map((p) => ({ p, pts: total(p.id, mode, asOf) })).filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts))
  return new Map(list.map((r) => [r.p.id, r]))
}
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

/** A monthly ranking, as PSA published before it went weekly: the list on the last day of each month of one year
 *  (this month: today). Korea has about one individual tournament a month, so a month is the natural step. */
function MonthEnds({ mode, sex, kind }: { mode: Mode; sex: string; kind: string }) {
  const thisYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => ({ m, asOf: lastDay(year, m) < today ? lastDay(year, m) : today }))
    .filter(({ m }) => year < thisYear || m <= Number(today.slice(5, 7)))
  const table = useMemo(() => {
    const byMonth = months.map(({ asOf }) => rankOn(mode, sex, kind, asOf))
    const ids = new Set(byMonth.flatMap((m) => [...m.values()].filter((r) => r.rank !== null && r.rank <= 10).map((r) => r.p.id)))
    const last = byMonth[byMonth.length - 1]
    return [...ids].map((id) => ({ p: PLAYERS.find((x) => x.id === id)!, cells: byMonth.map((m) => m.get(id) ?? null) }))
      .sort((a, b) => (last.get(a.p.id)?.rank ?? 999) - (last.get(b.p.id)?.rank ?? 999) || a.p.name.localeCompare(b.p.name, 'ko'))
  }, [mode, sex, kind, year]) // eslint-disable-line react-hooks/exhaustive-deps
  const ended = (m: number) => T.filter((t) => tierOf(t) && t.date.slice(0, 7) === `${year}-${String(m).padStart(2, '0')}`)
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>월별 순위 {year}</h2>
        <span className="muted small">{MODES.find((x) => x.key === mode)!.label} · 매월 말일 기준 · 그해 한 번이라도 10위 안에 든 선수</span>
      </div>
      <div className="filters">
        <div className="segmented" role="group" aria-label="Year">
          {Array.from({ length: thisYear - 2020 }, (_, i) => 2021 + i).map((y) => (
            <button key={y} type="button" className={year === y ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {months.map(({ m }) => (
                <th key={m} className="num" title={ended(m).map((t) => t.label).join(', ') || '대회 없음'}>
                  {m}월{ended(m).length ? ' •' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map(({ p, cells }) => (
              <tr key={p.id}>
                <td>{p.name}<span className="muted small sm-hide"> · {p.team}</span></td>
                {cells.map((c, i) => {
                  const prev = i ? cells[i - 1]?.rank ?? null : null
                  return (
                    <td key={i} className={`num ${c?.rank && c.rank <= 3 ? 'strong' : ''}`} title={c ? `${c.pts.toFixed(1)}점` : ''}>
                      {c?.rank ?? <span className="muted">—</span>}
                      {c?.rank && prev && prev !== c.rank ? <span className={`small ${prev > c.rank ? 'up' : 'down'}`}>{prev > c.rank ? '↑' : '↓'}</span> : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">• = 그달에 끝난 대회(마우스를 올리면 이름). 칸에 마우스를 올리면 평균 포인트. 화살표는 지난달 대비.</p>
    </section>
  )
}

/** Averaged ranks at the end of each season (31 December; this year: today), for everyone who made the top 10 once. */
function YearEnds({ mode, sex, kind }: { mode: Mode; sex: string; kind: string }) {
  const years = Array.from({ length: Number(today.slice(0, 4)) - 2020 }, (_, i) => 2021 + i)
  const table = useMemo(() => {
    const byYear = years.map((y) => rankOn(mode, sex, kind, y === Number(today.slice(0, 4)) ? today : `${y}-12-31`))
    const ids = new Set(byYear.flatMap((m) => [...m.values()].filter((r) => r.rank !== null && r.rank <= 10).map((r) => r.p.id)))
    const last = byYear[byYear.length - 1]
    return [...ids].map((id) => ({ p: PLAYERS.find((x) => x.id === id)!, cells: byYear.map((m) => m.get(id) ?? null) }))
      .sort((a, b) => (last.get(a.p.id)?.rank ?? 999) - (last.get(b.p.id)?.rank ?? 999) || a.p.name.localeCompare(b.p.name, 'ko'))
  }, [mode, sex, kind])
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>연말 순위 {years[0]}–{years[years.length - 1]}</h2>
        <span className="muted small">{MODES.find((m) => m.key === mode)!.label} · 한 번이라도 10위 안에 든 선수 · 칸 = 순위 (평균 포인트)</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {years.map((y) => <th key={y} className="num">{y === Number(today.slice(0, 4)) ? `${y} (오늘)` : y}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.map(({ p, cells }) => (
              <tr key={p.id}>
                <td>{p.name}<span className="muted small"> · {p.team}</span></td>
                {cells.map((c, i) => (
                  <td key={years[i]} className={`num ${c?.rank && c.rank <= 3 ? 'strong' : ''}`}>
                    {c ? <>{c.rank}<span className="muted small"> ({c.pts.toFixed(1)})</span></> : <span className="muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** The federation's grade table (2025 국가대표 포인트 규정, 대학·일반부 개인전). */
function Grades() {
  const places = [['1', '우승'], ['2', '준우승'], ['3', '3–4위'], ['5', '5–8위'], ['9', '9–16위'], ['0', '참가']] as const
  const KSF: Record<string, number[]> = { A: [400, 320, 240, 160, 80, 30], B: [200, 160, 120, 80, 40, 20], C: [100, 80, 60, 40, 20, 10] }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>대회 등급표</h2>
        <span className="muted small">대한스쿼시연맹 2025 국가대표 포인트 규정 (대학·일반부 개인전)</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>등급</th><th>국내 대회</th><th>국제 대회 (같은 등급)</th></tr>
          </thead>
          <tbody>
            <tr><td className="strong">A</td><td>코리아시니어오픈</td><td className="muted small">세계선수권, PSA World Tour Platinum</td></tr>
            <tr><td className="strong">B</td><td>전한국, 대한체육회장배, 전국학생선수권(대학부)</td><td className="muted small">PSA World Tour</td></tr>
            <tr><td className="strong">C</td><td>회장배(전북), 전국실업선수권, 전국체육대회, 연맹 주최 전국대회</td><td className="muted small">아시아경기대회, 아시아선수권, PSA Challenger 30</td></tr>
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>순위</th>
              {Object.keys(KSF).map((g) => <th key={g} className="num">{g}등급</th>)}
            </tr>
          </thead>
          <tbody>
            {places.map(([k, label], i) => (
              <tr key={k}>
                <td>{label}</td>
                {Object.keys(KSF).map((g) => <td key={g} className="num">{KSF[g][i]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        연맹 규정: 대학부는 국내대회에서 일반부 포인트의 70%, B등급은 3개 대회 중 상위 2개만 반영. 시즌 합계로 순위를 정하고, 동점이면
        상위 등급 입상 → 같은 등급 상위 입상 → 포인트 받은 대회 수 순. 국제대회는 D–H등급(PSA Challenger·Satellite, 국가별 오픈)까지 따로
        정해져 있습니다.
      </p>
    </section>
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
  const best = new Set(averaged(mode) ? bestCounted(id, asOf) : [])
  const status = (e: Entry, t: Tournament) =>
    t.date > asOf ? '아직'
      : !averaged(mode) ? (counts(mode, t, asOf) ? '✓' : mode === 'rolling' ? '만료' : '지난 시즌')
      : !tierOf(t) ? '해당 없음' : best.has(e) ? '✓' : counts('rolling', t, asOf) ? `상위 ${BEST}개 밖` : '만료'
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
            const on = status(e, t) === '✓'
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
                <td className="small">{status(e, t)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
