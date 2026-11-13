import { useMemo, useState } from 'react'
import data from '../data/ksf/compare.json'

// Two rankings side by side — the federation's points counted several ways, or the match ratings — with how
// often each one picked the winner before a match (tools/build-compare.mts builds the data).

interface Option { key: string; group: string; label: string; int: boolean }
interface Tally { n: number; ok: number }
interface Row { name: string; team: string; v: Record<string, number> }

const OPTIONS = data.options as Option[]
const ACC = new Map(data.accuracy.rows.map((r) => [r.key, r as Tally & { byYear: Tally[]; own: Tally }]))
const PLAYERS = data.players as Record<string, Row[]>
const pct = (t: Tally) => (t.n ? `${((100 * t.ok) / t.n).toFixed(1)}%` : '—')
const BEST = Math.max(...data.accuracy.rows.map((r) => r.ok / r.n))
const SIZES = [20, 40, 999]

/** Rank of every player an option ranks (ties share a rank). */
function ranks(rows: Row[], key: string) {
  const sorted = rows.filter((r) => r.v[key] > 0).sort((a, b) => b.v[key] - a.v[key])
  const out = new Map<Row, number>()
  sorted.forEach((r, i) => out.set(r, i > 0 && r.v[key] === sorted[i - 1].v[key] ? out.get(sorted[i - 1])! : i + 1))
  return out
}
/** Spearman correlation over the players both rankings rank. */
function correlation(a: Map<Row, number>, b: Map<Row, number>) {
  const both = [...a.keys()].filter((r) => b.has(r))
  if (both.length < 3) return null
  const x = both.map((r) => a.get(r)!), y = both.map((r) => b.get(r)!)
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length
  let n = 0, dx = 0, dy = 0
  x.forEach((v, i) => { n += (v - mx) * (y[i] - my); dx += (v - mx) ** 2; dy += (y[i] - my) ** 2 })
  return n / Math.sqrt(dx * dy)
}
const label = (o: Option) => `${o.label} · 예측 ${pct(ACC.get(o.key)!)}`

export function RankingCompare() {
  const [a, setA] = useState('site-y1')
  const [b, setB] = useState('avg-1')
  const [sex, setSex] = useState('남')
  const [view, setView] = useState<'rank' | 'player'>('rank')
  const [size, setSize] = useState(20)
  const oa = OPTIONS.find((o) => o.key === a)!, ob = OPTIONS.find((o) => o.key === b)!
  const rows = PLAYERS[sex]
  const ra = useMemo(() => ranks(rows, a), [rows, a])
  const rb = useMemo(() => ranks(rows, b), [rows, b])
  const val = (o: Option, r: Row) => (r.v[o.key] > 0 ? (o.int ? Math.round(r.v[o.key]) : r.v[o.key].toFixed(1)) : '—')
  const top10 = (m: Map<Row, number>) => new Set([...m].filter(([, k]) => k <= 10).map(([r]) => r))
  const shared = [...top10(ra)].filter((r) => top10(rb).has(r)).length
  const corr = correlation(ra, rb)
  const byRank = (m: Map<Row, number>) => [...m].sort((x, y) => x[1] - y[1])
  const listA = byRank(ra), listB = byRank(rb)
  const players = [...new Set([...listA.map(([r]) => r), ...listB.map(([r]) => r)])]
    .sort((x, y) => (ra.get(x) ?? 1e9) - (ra.get(y) ?? 1e9) || (rb.get(x) ?? 1e9) - (rb.get(y) ?? 1e9))

  const picker = (value: string, set: (k: string) => void, aria: string) => (
    <select value={value} onChange={(e) => set(e.target.value)} aria-label={aria}>
      {[...new Set(OPTIONS.map((o) => o.group))].map((g) => (
        <optgroup key={g} label={g}>
          {OPTIONS.filter((o) => o.group === g).map((o) => <option key={o.key} value={o.key}>{label(o)}</option>)}
        </optgroup>
      ))}
    </select>
  )
  const other = (m: Map<Row, number>, r: Row) => (m.has(r) ? `상대 ${m.get(r)}위` : '상대 순위 없음')

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>랭킹 비교</h2>
          <span className="muted small">{data.built} 기준 · 일반부</span>
        </div>
        <div className="filters">
          {picker(a, setA, '첫째 랭킹')}
          {picker(b, setB, '둘째 랭킹')}
          <div className="segmented" role="group" aria-label="Sex">
            {[['남', '남자'], ['여', '여자']].map(([k, l]) => (
              <button key={k} type="button" className={sex === k ? 'on' : ''} onClick={() => setSex(k)}>{l}</button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="View">
            <button type="button" className={view === 'rank' ? 'on' : ''} onClick={() => setView('rank')}>순위별</button>
            <button type="button" className={view === 'player' ? 'on' : ''} onClick={() => setView('player')}>선수별</button>
          </div>
          <div className="segmented" role="group" aria-label="Rows">
            {SIZES.map((n) => (
              <button key={n} type="button" className={size === n ? 'on' : ''} onClick={() => setSize(n)}>{n === 999 ? '전체' : `상위 ${n}`}</button>
            ))}
          </div>
        </div>
        <p className="small">
          예측 성공률 <strong>{pct(ACC.get(a)!)}</strong> vs <strong>{pct(ACC.get(b)!)}</strong> · 순위 상관{' '}
          <strong>{corr === null ? '—' : corr.toFixed(2)}</strong> · 상위 10명 중 <strong>{shared}명</strong> 겹침
        </p>

        <div className="table-wrap">
          {view === 'rank' ? (
            <table>
              <thead>
                <tr><th className="num">순위</th><th>{oa.label}</th><th>{ob.label}</th></tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.min(size, Math.max(listA.length, listB.length)) }, (_, i) => {
                  const x = listA[i]?.[0], y = listB[i]?.[0]
                  return (
                    <tr key={i} className={x && x === y ? 'same' : ''}>
                      <td className="num strong">{i + 1}</td>
                      <td>{x && <>{x.name} <span className="muted small">{val(oa, x)} · {other(rb, x)}</span></>}</td>
                      <td>{y && <>{y.name} <span className="muted small">{val(ob, y)} · {other(ra, y)}</span></>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">{oa.label}</th><th className="num sm-hide">값</th>
                  <th className="num">{ob.label}</th><th className="num sm-hide">값</th>
                  <th className="num">차이</th>
                </tr>
              </thead>
              <tbody>
                {players.slice(0, size).map((r) => {
                  const d = ra.has(r) && rb.has(r) ? ra.get(r)! - rb.get(r)! : null
                  return (
                    <tr key={r.name}>
                      <td>{r.name}{r.team && <span className="muted small sm-hide"> · {r.team}</span>}</td>
                      <td className="num strong">{ra.get(r) ?? '—'}</td><td className="num muted small sm-hide">{val(oa, r)}</td>
                      <td className="num strong">{rb.get(r) ?? '—'}</td><td className="num muted small sm-hide">{val(ob, r)}</td>
                      <td className="num">
                        {d ? <span className={`small ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '↑' : '↓'}{Math.abs(d)}</span> : d === 0 ? '=' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="muted small">
          {view === 'rank'
            ? '같은 줄에 같은 선수면 색으로 표시합니다. "상대 N위"는 다른 랭킹에서 그 선수의 순위입니다. 동점은 같은 순위라 줄 번호와 다를 수 있습니다.'
            : '차이 ↑ = 둘째 랭킹에서 더 높은 순위, ↓ = 더 낮은 순위.'}
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>예측 성공률</h2>
          <span className="muted small">{data.from.slice(0, 4)}년부터 경기 {data.accuracy.matches}개</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>랭킹</th>
                <th className="num">맞힘</th>
                <th className="num">성공률</th>
                {data.accuracy.years.map((y) => <th key={y} className="num sm-hide">{y}</th>)}
                <th className="num sm-hide" title="두 선수 모두 순위가 있는 모든 경기">전체 경기*</th>
              </tr>
            </thead>
            <tbody>
              {OPTIONS.map((o) => {
                const t = ACC.get(o.key)!
                return (
                  <tr key={o.key} className={[t.ok / t.n === BEST ? 'same' : '', o.key === a || o.key === b ? 'picked' : ''].join(' ')}>
                    <td>{o.label}<span className="muted small"> · {o.group}</span></td>
                    <td className="num muted small">{t.ok}/{t.n}</td>
                    <td className="num strong">{pct(t)}</td>
                    {t.byYear.map((y, i) => <td key={i} className="num sm-hide">{pct(y)}</td>)}
                    <td className="num muted small sm-hide">{pct(t.own)} / {t.own.n}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          일반부·대학부 개인전 경기마다, 그 전날의 랭킹에서 순위가 높은 선수가 이겼는지를 셉니다. 모든 랭킹이 두 선수 모두에게 순위를 매긴 경기만
          비교해야 공정해서 그 경기 수로 셉니다(* 각 랭킹이 셀 수 있는 모든 경기에서의 성공률). 국가 랭킹은 사이트와 같은 규칙(일반부 경기, 최근
          3년, 1년 탭은 최근 1년 3경기 이상)으로 경기마다 그 전까지의 결과로 다시 계산했고, 오늘 순위는 사이트 값 그대로입니다. 다시 계산할 때
          전국체육대회와 단체전 경기는 빠져 있어 과거 값은 사이트와 조금 다를 수 있습니다. 포인트 쪽 선수와 경기 결과 쪽 선수는 이름으로
          맞췄고, 이름이 같은 선수가 둘 이상이면 뺐습니다.
        </p>
      </section>
    </>
  )
}
