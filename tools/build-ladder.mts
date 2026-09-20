// Build the national ladder from the scraped KSF dataset.
//
//   node tools/build-ladder.mts
//
// Reads data/ksf/{matches,players}.json, runs the same Glicko-2 engine the
// club ladder uses (src/rating/) over every singles match, and writes
//   data/ksf/ladder.json           players + one rating table per term
//   data/ksf/matches-compact.json  per-match rows for the player pages
//
// Each tournament is one rating period (all its matches carry the start
// date), which is the textbook Glicko setup. Team events, doubles and
// walkovers (0-0) are skipped.

import fs from 'node:fs'
import path from 'node:path'
import { computeRatings } from '../src/rating/squash.ts'
import type { Match, Player } from '../src/rating/types.ts'

const DIR = path.resolve('data/ksf')

// Junior handicap. Juniors mostly play each other, so their pool is self-referential
// and a dominant U12 would otherwise climb to adult-looking numbers. Starting each
// age band lower anchors the pool; only results against higher bands pull a player up.
// Keyed on age at the player's first recorded match. Elementary (U12) and middle
// school (U15) pools inflate the most, so they get the largest offsets. Tune here.
const START_BY_AGE: [maxAge: number, rating: number][] = [
  [12, 1000],
  [15, 1200],
  [18, 1400],
]

// Rating terms: "all" uses every result; the others only results within the
// window ending at build time, so they read as current form.
const TERMS: { key: string; label: string; months: number | null }[] = [
  { key: 'all', label: 'All time', months: null },
  { key: 'y1', label: '1 year', months: 12 },
  { key: 'm6', label: '6 months', months: 6 },
  { key: 'm3', label: '3 months', months: 3 },
]

interface RawMatch {
  toCd: string
  tournament: string
  date: string
  division: string
  round: string | null
  playerAId: string | null
  playerBId: string | null
  gamesA: number | null
  gamesB: number | null
}

interface RawPlayer {
  idNo: string
  name: string
  birthYear: number | null
  sex: string | null
  teams: string[]
  sido: string | null
}

const rawMatches: RawMatch[] = JSON.parse(fs.readFileSync(path.join(DIR, 'matches.json'), 'utf8'))
const rawPlayers: RawPlayer[] = JSON.parse(fs.readFileSync(path.join(DIR, 'players.json'), 'utf8'))

type Singles = RawMatch & { playerAId: string; playerBId: string; gamesA: number; gamesB: number }
const singles = rawMatches.filter(
  (m): m is Singles =>
    !!m.playerAId && !!m.playerBId && m.playerAId !== m.playerBId &&
    m.gamesA != null && m.gamesB != null && m.gamesA + m.gamesB > 0,
)

// --- Starting ratings ------------------------------------------------------
const firstYear = new Map<string, number>()
for (const m of singles) {
  const y = Number(m.date.slice(0, 4))
  for (const id of [m.playerAId, m.playerBId]) if (y < (firstYear.get(id) ?? Infinity)) firstYear.set(id, y)
}
function startRating(p: RawPlayer): number | undefined {
  const y = firstYear.get(p.idNo)
  if (!y || !p.birthYear) return undefined
  const age = y - p.birthYear
  return START_BY_AGE.find(([max]) => age <= max)?.[1]
}
const players: Player[] = rawPlayers.map((p) => ({ id: p.idNo, name: p.name, startRating: startRating(p) }))

// --- Round labels ----------------------------------------------------------
// The portal names rounds 결승 / 준결승경기N / 준준결승경기N / 준준준결승경기N /
// 준준준준결승 N, and "예선경기N" for whichever round is one deeper than the deepest
// named round of that division. Normalise to 결승 / 준결승 / 8강 / 16강 / 32강 / 64강.
// League rounds ("1R / A조") are kept as they are.
function roundDepth(round: string | null): number | null {
  if (!round) return null
  if (/^결승/.test(round)) return 1 // 2 players left
  const m = round.match(/^(준+)결승/)
  return m ? m[1].length + 1 : null // 준결승 = 2 (4 left), 준준결승 = 3 (8 left) …
}
function depthLabel(depth: number): string {
  return depth === 1 ? '결승' : depth === 2 ? '준결승' : `${2 ** depth}강`
}
const deepestNamed = new Map<string, number>()
for (const m of singles) {
  const d = roundDepth(m.round)
  if (d === null) continue
  const key = `${m.toCd}|${m.division}`
  if (d > (deepestNamed.get(key) ?? 0)) deepestNamed.set(key, d)
}
function roundLabel(m: Singles): string | null {
  if (!m.round) return null
  const d = roundDepth(m.round)
  if (d !== null) return depthLabel(d)
  if (/^예선/.test(m.round)) return depthLabel((deepestNamed.get(`${m.toCd}|${m.division}`) ?? 2) + 1)
  return m.round
}

// --- Rate one term ---------------------------------------------------------
function rate(subset: Singles[]) {
  const matches: Match[] = subset.map((m, i) => ({
    id: String(i),
    date: m.date,
    playerAId: m.playerAId,
    playerBId: m.playerBId,
    gamesA: m.gamesA,
    gamesB: m.gamesB,
  }))
  const { players: rated, snapshots } = computeRatings(players, matches)

  // Rating after each tournament, per player, for the trend sparkline.
  const history = new Map<string, { date: string; rating: number }[]>()
  for (const s of snapshots) {
    const m = subset[Number(s.matchId)]
    for (const id of [m.playerAId, m.playerBId]) {
      const h = history.get(id) ?? []
      const r = Math.round(s.after[id].rating)
      if (h.length && h[h.length - 1].date === m.date) h[h.length - 1].rating = r
      else h.push({ date: m.date, rating: r })
      history.set(id, h)
    }
  }

  const entries = rated
    .filter((p) => p.matches > 0)
    .map((p) => ({
      id: p.id,
      rating: Math.round(p.rating.rating),
      rd: Math.round(p.rating.rd),
      matches: p.matches,
      wins: p.wins,
      losses: p.losses,
      lastPlayed: p.lastPlayed,
      history: history.get(p.id) ?? [],
    }))
  return { entries, snapshots }
}

const now = new Date()
const since = (months: number) => {
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

const terms: Record<string, { label: string; since: string | null; entries: ReturnType<typeof rate>['entries'] }> = {}
let allSnapshots: ReturnType<typeof rate>['snapshots'] = []
for (const t of TERMS) {
  const from = t.months ? since(t.months) : null
  const subset = from ? singles.filter((m) => m.date >= from) : singles
  const { entries, snapshots } = rate(subset)
  terms[t.key] = { label: t.label, since: from, entries }
  if (t.key === 'all') allSnapshots = snapshots
  console.log(`${t.label.padEnd(9)} ${subset.length} matches, ${entries.length} rated players`)
}

// --- Static player info ----------------------------------------------------
const lastDivision = new Map<string, string>()
for (const m of singles) for (const id of [m.playerAId, m.playerBId]) lastDivision.set(id, m.division) // singles is date-ordered
const info = rawPlayers
  .filter((p) => firstYear.has(p.idNo))
  .map((p) => ({
    id: p.idNo,
    name: p.name,
    birthYear: p.birthYear,
    sex: p.sex,
    team: p.teams[0] ?? null, // scraper walks tournaments newest-first
    sido: p.sido,
    startRating: startRating(p) ?? 1500,
    lastDivision: lastDivision.get(p.idNo) ?? null,
  }))

const tournaments = [...new Map(singles.map((m) => [m.toCd, { toCd: m.toCd, name: m.tournament, date: m.date }])).values()]
  .sort((a, b) => a.date.localeCompare(b.date))

fs.writeFileSync(
  path.join(DIR, 'ladder.json'),
  JSON.stringify({ builtAt: now.toISOString(), matches: singles.length, tournaments, players: info, terms }),
)

// Compact per-match rows with each side's all-time rating change over that tournament.
const compact = allSnapshots.map((s) => {
  const m = singles[Number(s.matchId)]
  const delta = (id: string) => Math.round(s.after[id].rating - s.before[id].rating)
  return { d: m.date, t: m.toCd, v: m.division, r: roundLabel(m), a: m.playerAId, b: m.playerBId, ga: m.gamesA, gb: m.gamesB, da: delta(m.playerAId), db: delta(m.playerBId) }
})
fs.writeFileSync(path.join(DIR, 'matches-compact.json'), JSON.stringify(compact))

const byId = new Map(info.map((p) => [p.id, p]))
console.log('\nAll-time top 10:')
for (const e of terms.all.entries.slice(0, 10)) {
  const p = byId.get(e.id)!
  console.log(`  ${String(e.rating).padStart(4)} ±${String(e.rd).padStart(3)}  ${p.name} (${p.birthYear}, start ${p.startRating}, ${p.team ?? '-'})  ${e.wins}-${e.losses}  last ${e.lastPlayed}`)
}
