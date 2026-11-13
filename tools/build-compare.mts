// Compare the ways of ranking Korean senior squash: the federation's points (season total, one-year rolling
// total, one-year average) and the match ratings (the national ladder and a 12-month re-rating).
//
//   node tools/build-compare.mts      (after build-points.mts and build-ladder.mts)
//
// Reads data/ksf/{points-history,matches,ladder}.json and writes data/ksf/compare.json for the Compare tab:
//   accuracy – before every senior singles match since 2022, did the player ranked higher the day before win?
//              Counted on the matches every ranking could call (both players ranked), and per year.
//   players  – today's value of every ranking for each 일반부 player, so the tab can rank them any way.
//
// Points players (federation ids) and match players (results-portal ids) are joined by sex and name; a name two
// players share is left out of the accuracy test. The ratings are re-run before each tournament on earlier results
// only; today's numbers for the national ladder are the site's own (ladder.json). The re-run leaves out the
// 전국체육대회 singles and team-event rubbers the site also rates, so its history is close to the site's, not equal.

import fs from 'node:fs'
import path from 'node:path'
import { computeHybrid } from '../src/rating/hybrid.ts'
import { formatWeight } from '../src/rating/squash.ts'

const DIR = path.resolve('data/ksf')
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
const H = read('points-history.json')
const MATCHES: any[] = read('matches.json')
const LADDER = read('ladder.json')
const T: any[] = H.tournaments
const today = new Date().toISOString().slice(0, 10)
const FROM = '2022-01-01' // the rolling and averaged lists need a year of points behind them (points start in 2021)

// ---- Points rankings (same rules as src/RankingPoints.tsx) ----
const tierOf = (t: any) => (t.team ? null : (t.grade ?? (/전국체육대회/.test(t.name) ? 'C' : null)))
const expires = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`
const inYear = (t: any, asOf: string) => t.date <= asOf && asOf < expires(t.date)
const byPlayer = new Map<string, any[]>()
for (const e of H.entries) byPlayer.set(e.p, [...(byPlayer.get(e.p) ?? []), e])
/** Best 6 individual results of the year, divided by how many were played but at least `min`. */
const average = (min: number) => (id: string, asOf: string) => {
  const best = (byPlayer.get(id) ?? []).filter((e) => tierOf(T[e.t]) && inYear(T[e.t], asOf)).map((e) => e.points).sort((a, b) => b - a).slice(0, 6)
  return best.length ? best.reduce((a, b) => a + b, 0) / Math.max(min, best.length) : 0
}
type Option = { key: string; group: string; label: string; int: boolean; f?: (id: string, asOf: string) => number; g?: (m: any) => [number, number]; today?: Map<string, number> }
const OPTIONS: Option[] = [
  { key: 'season', group: '연맹 포인트', label: '시즌 합계 (연맹 방식)', int: true,
    f: (id, asOf) => (byPlayer.get(id) ?? []).reduce((a, e) => a + (T[e.t].date <= asOf && T[e.t].season === Number(asOf.slice(0, 4)) ? e.points : 0), 0) },
  { key: 'rolling', group: '연맹 포인트', label: '1년 롤링 합계', int: true, f: (id, asOf) => (byPlayer.get(id) ?? []).reduce((a, e) => a + (inYear(T[e.t], asOf) ? e.points : 0), 0) },
  { key: 'avg-1', group: '연맹 포인트', label: '1년 평균 (나간 대회 수로 나눔)', int: false, f: average(1) },
  { key: 'avg-2', group: '연맹 포인트', label: '1년 평균 (최소 2로 나눔)', int: false, f: average(2) },
  { key: 'avg-3', group: '연맹 포인트', label: '1년 평균 (최소 3으로 나눔)', int: false, f: average(3) },
  { key: 'avg-6', group: '연맹 포인트', label: '1년 평균 (항상 6으로 나눔)', int: false, f: average(6) },
]

// ---- Match ratings ----
const senior = (div: string) => /일반부|대학부/.test(div)
const sexOf = (div: string) => (div.startsWith('남') ? '남' : div.startsWith('여') ? '여' : '')
const dayBefore = (d: string) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10) }
const monthsBefore = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() - n); return x.toISOString().slice(0, 10) }
const rated = MATCHES.filter((m) => m.event === '개인전' && senior(m.division) && m.playerAId && m.playerBId && m.playerAId !== m.playerBId &&
  m.gamesA != null && m.gamesB != null && m.gamesA + m.gamesB > 0 && Math.max(m.gamesA, m.gamesB) <= 3).sort((a, b) => a.date.localeCompare(b.date))
const startOf = new Map<string, string>()
for (const m of rated) if (!startOf.has(m.toCd) || m.date < startOf.get(m.toCd)!) startOf.set(m.toCd, m.date)
const POOLS: Record<string, (m: any) => boolean> = { open: (m) => /일반부/.test(m.division), senior: () => true }
const cache = new Map<string, Map<string, { rating: number; matches: number; recent: number }>>()
/** Ratings from `pool` matches in the `months` up to `end`, with each player's matches and those of the last 12 months. */
function rateUpTo(end: string, months: number, pool: string) {
  const key = `${end}|${months}|${pool}`
  if (cache.has(key)) return cache.get(key)!
  const from = monthsBefore(end, months), year = monthsBefore(end, 12)
  const window = rated.filter((m) => POOLS[pool](m) && m.date >= from && m.date <= end)
  const recent = new Map<string, number>()
  for (const m of window) for (const id of [m.playerAId, m.playerBId]) recent.set(id, (recent.get(id) ?? 0) + (m.date >= year ? 1 : 0))
  const { players } = computeHybrid([...recent.keys()].map((id) => ({ id, name: id })),
    window.map((m, i) => ({ id: String(i), date: m.date, playerAId: m.playerAId, playerBId: m.playerBId, gamesA: m.gamesA, gamesB: m.gamesB, weight: formatWeight(m.gamesA, m.gamesB) })))
  const map = new Map(players.filter((p) => p.matches > 0).map((p) => [p.id, { rating: p.rating, matches: p.matches, recent: recent.get(p.id) ?? 0 }]))
  cache.set(key, map)
  return map
}
// The national ladder's own listing rules (tools/build-ladder.mts MIN_MATCHES): 3 years needs 6 matches, the 1-year tab 3 in the last year.
const RATINGS = [
  { key: 'site-y1', label: '국가 랭킹 · 1년', months: 36, pool: 'open', term: 'y1', ok: (x: any) => x.recent >= 3 },
  { key: 'site-y3', label: '국가 랭킹 · 3년', months: 36, pool: 'open', term: 'y3', ok: (x: any) => x.matches >= 6 },
  { key: 'rerate-12', label: '최근 12개월로 다시 계산', months: 12, pool: 'senior', term: null, ok: () => true },
]
const who = new Map<string, string>(LADDER.players.map((p: any) => [p.id, (p.sex === '남자' ? '남' : '여') + p.name]))
for (const r of RATINGS) {
  const value = (x: any) => (x && r.ok(x) ? x.rating : 0)
  OPTIONS.push({ key: r.key, group: '경기 결과 레이팅', label: r.label, int: true,
    g: (m) => { const at = rateUpTo(dayBefore(startOf.get(m.toCd)!), r.months, r.pool); return [value(at.get(m.playerAId)), value(at.get(m.playerBId))] },
    // Today: the site's published numbers for its own terms; the re-rating is computed.
    today: r.term
      ? new Map(LADDER.ladders.open.terms[r.term].entries.filter((e: any) => e.qualified).map((e: any) => [who.get(e.id)!, e.rating]))
      : (() => { const names = new Map<string, string>(); for (const m of rated) { names.set(m.playerAId, sexOf(m.division) + m.playerA); names.set(m.playerBId, sexOf(m.division) + m.playerB) }
        return new Map([...rateUpTo(today, r.months, r.pool)].filter(([, x]) => r.ok(x)).map(([id, x]) => [names.get(id)!, x.rating])) })() })
}

// ---- Accuracy ----
const bySexName = new Map<string, any>()
for (const p of H.players) { const k = p.sex + p.name; bySexName.set(k, bySexName.has(k) ? null : p) }
const games = MATCHES.filter((m) => m.event === '개인전' && senior(m.division) && m.date >= FROM && m.date <= today && (m.winner === 'A' || m.winner === 'B'))
  .map((m) => {
    const a = bySexName.get(sexOf(m.division) + m.playerA), b = bySexName.get(sexOf(m.division) + m.playerB)
    return a && b ? { a: a.id, b: b.id, aWon: m.winner === 'A', day: dayBefore(m.date), year: m.date.slice(0, 4), m } : null
  }).filter((g): g is NonNullable<typeof g> => !!g)
const scored = games.map((g) => ({ g, v: OPTIONS.map((o) => (o.g ? o.g(g.m) : [o.f!(g.a, g.day), o.f!(g.b, g.day)])) }))
const calls = (v: number[]) => v[0] > 0 && v[1] > 0 && v[0] !== v[1]
const common = scored.filter((s) => s.v.every(calls))
const tally = (list: typeof scored, i: number) => ({ n: list.length, ok: list.filter((s) => (s.v[i][0] > s.v[i][1]) === s.g.aWon).length })
const years = [...new Set(common.map((s) => s.g.year))].sort()

// ---- Today's values per 일반부 player (a player listed under two federation ids gets one row) ----
const sectionNow = (p: any) => { const s = Object.keys(p.sections).map(Number).sort((a, b) => a - b); return p.sections[s.filter((y) => y <= Number(today.slice(0, 4))).at(-1) ?? s[0]] }
const players: Record<string, { name: string; team: string; v: Record<string, number> }[]> = { 남: [], 여: [] }
const round1 = (x: number) => Math.round(x * 10) / 10
for (const sex of ['남', '여']) {
  const rows = players[sex]
  const add = (name: string, team: string, v: Record<string, number>) => {
    const o = rows.find((r) => r.name === name)
    if (!o) rows.push({ name, team, v })
    else for (const k in v) o.v[k] = Math.max(o.v[k], v[k])
  }
  for (const p of H.players.filter((p: any) => p.sex === sex && sectionNow(p) === '일반부'))
    add(p.name, p.team, Object.fromEntries(OPTIONS.map((o) => [o.key, round1(o.f ? o.f(p.id, today) : (o.today!.get(sex + p.name) ?? 0))])))
  // Rated players with no federation 일반부 points still show under the ratings.
  const named = new Set(rows.map((r) => r.name))
  for (const name of new Set(OPTIONS.flatMap((o) => (o.today ? [...o.today.keys()] : []))))
    if (name.startsWith(sex) && !named.has(name.slice(1)))
      add(name.slice(1), '', Object.fromEntries(OPTIONS.map((o) => [o.key, round1(o.today?.get(name) ?? 0)])))
  players[sex] = rows.filter((r) => Object.values(r.v).some((x) => x > 0))
}

const out = {
  built: today,
  from: FROM,
  options: OPTIONS.map(({ key, group, label, int }) => ({ key, group, label, int })),
  accuracy: {
    matches: common.length,
    years,
    rows: OPTIONS.map((o, i) => ({
      key: o.key,
      ...tally(common, i),
      byYear: years.map((y) => tally(common.filter((s) => s.g.year === y), i)),
      own: tally(scored.filter((s) => calls(s.v[i])), i),
    })),
  },
  players,
}
fs.writeFileSync(path.join(DIR, 'compare.json'), JSON.stringify(out))
console.log(`compare.json: ${common.length} matches every ranking could call, ${players.남.length} men / ${players.여.length} women`)
for (const r of out.accuracy.rows) console.log(r.key.padEnd(10), `${((100 * r.ok) / r.n).toFixed(1)}%`, `own ${((100 * r.own.ok) / r.own.n).toFixed(1)}% of ${r.own.n}`)
