// Build the national ladder from the scraped KSF dataset.
//
//   node tools/build-ladder.mts
//
// Reads data/ksf/{matches,players}.json, runs the same Glicko-2 engine the
// club ladder uses (src/rating/) over every singles match, and writes
// data/ksf/ladder.json for the app's "KSF National" view.
//
// Each tournament is one rating period (all its matches carry the start
// date), which is the textbook Glicko setup. Team events, doubles, and
// walkovers (0-0) are skipped.

import fs from 'node:fs'
import path from 'node:path'
import { computeRatings } from '../src/rating/squash.ts'
import type { Match, Player } from '../src/rating/types.ts'

const DIR = path.resolve('data/ksf')

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

const singles = rawMatches.filter(
  (m): m is RawMatch & { playerAId: string; playerBId: string; gamesA: number; gamesB: number } =>
    !!m.playerAId && !!m.playerBId && m.playerAId !== m.playerBId &&
    m.gamesA != null && m.gamesB != null && m.gamesA + m.gamesB > 0,
)

const players: Player[] = rawPlayers.map((p) => ({ id: p.idNo, name: p.name }))
const matches: Match[] = singles.map((m, i) => ({
  id: String(i),
  date: m.date,
  playerAId: m.playerAId,
  playerBId: m.playerBId,
  gamesA: m.gamesA,
  gamesB: m.gamesB,
}))

const { players: rated, snapshots } = computeRatings(players, matches)

// Rating after each tournament, per player, for the history sparkline.
const history = new Map<string, { date: string; rating: number }[]>()
const lastDivision = new Map<string, string>()
for (const s of snapshots) {
  const m = singles[Number(s.matchId)]
  for (const id of [m.playerAId, m.playerBId]) {
    const h = history.get(id) ?? []
    const r = Math.round(s.after[id].rating)
    if (h.length && h[h.length - 1].date === m.date) h[h.length - 1].rating = r
    else h.push({ date: m.date, rating: r })
    history.set(id, h)
    lastDivision.set(id, m.division)
  }
}

const info = new Map(rawPlayers.map((p) => [p.idNo, p]))
const ladder = rated
  .filter((p) => p.matches > 0)
  .map((p) => {
    const raw = info.get(p.id)!
    return {
      id: p.id,
      name: p.name,
      birthYear: raw.birthYear,
      sex: raw.sex,
      team: raw.teams[0] ?? null, // scraper walks tournaments newest-first
      sido: raw.sido,
      rating: Math.round(p.rating.rating),
      rd: Math.round(p.rating.rd),
      matches: p.matches,
      wins: p.wins,
      losses: p.losses,
      lastPlayed: p.lastPlayed,
      lastDivision: lastDivision.get(p.id) ?? null,
      history: history.get(p.id) ?? [],
    }
  })

const tournaments = [...new Map(singles.map((m) => [m.toCd, { toCd: m.toCd, name: m.tournament, date: m.date }])).values()]
  .sort((a, b) => a.date.localeCompare(b.date))

const out = {
  builtAt: new Date().toISOString(),
  matches: singles.length,
  tournaments,
  players: ladder,
}
fs.writeFileSync(path.join(DIR, 'ladder.json'), JSON.stringify(out))
console.log(`${ladder.length} rated players from ${singles.length} singles matches across ${tournaments.length} tournaments`)
console.log('Top 10:')
for (const p of ladder.slice(0, 10)) {
  console.log(`  ${String(p.rating).padStart(4)} ±${String(p.rd).padStart(3)}  ${p.name} (${p.birthYear ?? '?'}, ${p.team ?? '-'})  ${p.wins}-${p.losses}  last ${p.lastPlayed}`)
}
