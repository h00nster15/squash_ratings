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
import { computeRatings, formatWeight } from '../src/rating/squash.ts'
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
// 대학부 is another closed pool (university players mostly meet each other), so a
// player whose first rated match is in a 대학부 draw also starts below 1500.
const UNIVERSITY_START = 1300

// How much a match in each kind of draw counts for rating (1 = a full match).
// Closed pools inflate their winners: a 46-6 record in a girls' U18 draw says
// little about adult strength, so those results move ratings less. Tune here.
const DIVISION_WEIGHT: [pattern: RegExp, weight: number][] = [
  [/12세이하/, 0.5],
  [/15세이하/, 0.6],
  [/18세이하/, 0.7],
  [/대학부/, 0.7],
]
const divisionWeight = (division: string) => DIVISION_WEIGHT.find(([re]) => re.test(division))?.[1] ?? 1

// Ceiling on ratings earned inside each closed pool. However dominant a player
// is in a junior or university draw, they cannot rate above this until they
// beat people in an open (일반부) draw. Tune here.
const DIVISION_CAP: [pattern: RegExp, cap: number][] = [
  [/12세이하/, 1400],
  [/15세이하/, 1550],
  [/18세이하/, 1700],
  [/대학부/, 1600],
]
const divisionCap = (division: string) => DIVISION_CAP.find(([re]) => re.test(division))?.[1]

// Ratings use only the last RATING_MONTHS of results. The shorter terms do not
// re-rate anyone: every player keeps the same current rating, and the term adds
// how far it moved inside that window plus the window's win–loss record.
const RATING_MONTHS = 36
const TERMS: { key: string; label: string; months: number }[] = [
  { key: 'y3', label: '3 years', months: RATING_MONTHS },
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

const now = new Date()
const since = (months: number) => {
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}
const RATING_SINCE = since(RATING_MONTHS)

type Singles = RawMatch & { playerAId: string; playerBId: string; gamesA: number; gamesB: number }
/** Every singles match, oldest first; only those on/after RATING_SINCE are rated. */
const allSingles = rawMatches.filter(
  (m): m is Singles =>
    !!m.playerAId && !!m.playerBId && m.playerAId !== m.playerBId &&
    m.gamesA != null && m.gamesB != null && m.gamesA + m.gamesB > 0,
)
const singles = allSingles.filter((m) => m.date >= RATING_SINCE)

// --- Starting ratings ------------------------------------------------------
// Age is taken at the player's first RATED match, so a junior who entered the
// window as an adult is not handicapped for results that no longer count.
const firstYear = new Map<string, number>()
const firstDivision = new Map<string, string>()
for (const m of singles) {
  // singles is date-ordered, so the first time we see a player is their first rated match
  const y = Number(m.date.slice(0, 4))
  for (const id of [m.playerAId, m.playerBId]) {
    if (!firstYear.has(id)) {
      firstYear.set(id, y)
      firstDivision.set(id, m.division)
    }
  }
}
function startRating(p: RawPlayer): number | undefined {
  const y = firstYear.get(p.idNo)
  if (!y || !p.birthYear) return undefined
  const age = y - p.birthYear
  const byAge = START_BY_AGE.find(([max]) => age <= max)?.[1]
  const byDivision = /대학부/.test(firstDivision.get(p.idNo) ?? '') ? UNIVERSITY_START : undefined
  if (byAge === undefined) return byDivision
  return byDivision === undefined ? byAge : Math.min(byAge, byDivision)
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
for (const m of allSingles) {
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
    weight: divisionWeight(m.division) * formatWeight(m.gamesA, m.gamesB),
    cap: divisionCap(m.division),
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

const { entries: current, snapshots: allSnapshots } = rate(singles)
const startOf = new Map(players.map((p) => [p.id, p.startRating ?? 1500]))

type TermEntry = (typeof current)[number] & { delta: number | null; termMatches: number; termWins: number; termLosses: number }
const terms: Record<string, { label: string; since: string; entries: TermEntry[] }> = {}
for (const t of TERMS) {
  const from = since(t.months)
  const entries: TermEntry[] = current.map((e) => {
    const inWindow = singles.filter((m) => m.date >= from && (m.playerAId === e.id || m.playerBId === e.id))
    const wins = inWindow.filter((m) => (m.playerAId === e.id ? m.gamesA > m.gamesB : m.gamesB > m.gamesA)).length
    // Rating just before the window opened: last history point before `from`, else the start rating.
    const before = [...e.history].reverse().find((h) => h.date < from)
    const base = before ? before.rating : startOf.get(e.id) ?? 1500
    return {
      ...e,
      history: e.history.filter((h) => h.date >= from),
      delta: t.months === RATING_MONTHS ? null : e.rating - base,
      termMatches: inWindow.length,
      termWins: wins,
      termLosses: inWindow.length - wins,
    }
  })
  terms[t.key] = { label: t.label, since: from, entries }
  console.log(`${t.label.padEnd(9)} since ${from}: ${entries.filter((e) => e.termMatches).length} players with results`)
}

// --- Static player info ----------------------------------------------------
const lastDivision = new Map<string, string>()
for (const m of allSingles) for (const id of [m.playerAId, m.playerBId]) lastDivision.set(id, m.division) // date-ordered
const rated = new Set(current.map((e) => e.id))
const info = rawPlayers
  .filter((p) => rated.has(p.idNo))
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

const tournaments = [...new Map(allSingles.map((m) => [m.toCd, { toCd: m.toCd, name: m.tournament, date: m.date }])).values()]
  .sort((a, b) => a.date.localeCompare(b.date))

fs.writeFileSync(
  path.join(DIR, 'ladder.json'),
  JSON.stringify({ builtAt: now.toISOString(), ratingSince: RATING_SINCE, matches: singles.length, tournaments, players: info, terms }),
)

// Compact per-match rows with each side's all-time rating change over that tournament.
const snapshotOf = new Map(allSnapshots.map((s) => [singles[Number(s.matchId)], s]))
const compact = allSingles.map((m) => {
  const s = snapshotOf.get(m)
  const delta = (id: string) => (s ? Math.round(s.after[id].rating - s.before[id].rating) : null)
  return { d: m.date, t: m.toCd, v: m.division, r: roundLabel(m), a: m.playerAId, b: m.playerBId, ga: m.gamesA, gb: m.gamesB, da: delta(m.playerAId), db: delta(m.playerBId) }
})
fs.writeFileSync(path.join(DIR, 'matches-compact.json'), JSON.stringify(compact))

const byId = new Map(info.map((p) => [p.id, p]))
console.log('\nAll-time top 10:')
for (const e of terms.y3.entries.slice(0, 10)) {
  const p = byId.get(e.id)!
  console.log(`  ${String(e.rating).padStart(4)} ±${String(e.rd).padStart(3)}  ${p.name} (${p.birthYear}, start ${p.startRating}, ${p.team ?? '-'})  ${e.wins}-${e.losses}  last ${e.lastPlayed}`)
}
