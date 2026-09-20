// Build the Seoul Club Squash League dataset from the league workbook.
//
//   node tools/build-seoul.mts [path/to/league.xlsx]
//
// Reads the newest .xlsx in data/seoul (or the one given), parses the weekly
// "WKn Result" sheets, Teams and the week dates in LEAGUE Standings, runs the
// club Glicko-2 engine (src/rating/) over every played rubber, and writes
//   data/seoul/league.json   teams, standings, weekly ties, player ratings
//
// This dataset is kept apart from the KSF national data in data/ksf: the two
// are never merged and nothing here touches the national ladder.
//
// Rating periods: one per tie date (the league plays Tue/Wed), so a player's
// rating moves once per night from all their rubbers that night.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { computeRatings } from '../src/rating/squash.ts'
import type { Match, Player } from '../src/rating/types.ts'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

const DIR = path.resolve('data/seoul')

// Bracket handicap. The league seeds each team's five players into brackets
// (1 = strongest), and bracket n mostly plays bracket n, so the pools are
// self-referential like the junior divisions on the national ladder. Starting
// each bracket at a different rating anchors them; cross-bracket results
// (substitutes, reshuffles) pull players across. Tune here.
const START_BY_BRACKET: Record<number, number> = { 1: 1700, 2: 1600, 3: 1500, 4: 1400, 5: 1300 }
const DEFAULT_START = 1500
const DEFAULT_BRACKET = 3

/** Tie points as the league sheet scores them: games won + rubbers won + 4 for winning the tie. */
const TIE_WIN_BONUS = 4

// ---------------------------------------------------------------------------

const file = process.argv[2] ?? newestWorkbook()
const wb = XLSX.readFile(file)
const sheet = (name: string): string[][] => {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][]).map((r) =>
    r.map((c) => String(c ?? '').trim()),
  )
}

function newestWorkbook(): string {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .map((f) => path.join(DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  if (!files.length) throw new Error(`No .xlsx in ${DIR}`)
  return files[0]
}

// --- Season -----------------------------------------------------------------

const teamsSheet = sheet('Teams')
const title = teamsSheet.flat().find((c) => /league/i.test(c)) ?? path.basename(file, '.xlsx')
const yearMatch = title.match(/20\d\d/) ?? path.basename(file).match(/20\d\d/)
const YEAR = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear()
const season = title.replace(/\s*Teams\s*/i, ' ').replace(/\s+-\s+/, ' ').trim()

// --- Teams and brackets ----------------------------------------------------

interface RosterEntry {
  name: string
  team: number | null
  bracket: number
  sub: boolean
}

const roster = new Map<string, RosterEntry>()
const teams: { no: number; players: string[] }[] = []
{
  const head = teamsSheet.findIndex((r) => r.slice(1).every((c, i) => c === '' || c === String(i + 1)) && r[1] === '1')
  if (head < 0) throw new Error('Teams sheet: header row of team numbers not found')
  const teamNos = teamsSheet[head].map((c, i) => (i > 0 && /^\d+$/.test(c) ? Number(c) : null))
  for (const no of teamNos) if (no) teams.push({ no, players: [] })
  for (let r = head + 1; r < teamsSheet.length; r++) {
    const row = teamsSheet[r]
    if (!row.slice(1).some(Boolean)) break
    const bracket = r - head
    row.forEach((name, i) => {
      const no = teamNos[i]
      if (!no || !name || name === '0') return
      teams.find((t) => t.no === no)!.players.push(name)
      roster.set(name, { name, team: no, bracket, sub: false })
    })
  }
  // Substitutes: "n | Name | Rank" rows under the "Substitutes" header.
  const subHead = teamsSheet.findIndex((r) => r[1] === 'Substitutes')
  for (let r = subHead + 1; subHead >= 0 && r < teamsSheet.length; r++) {
    const [, name, rank] = teamsSheet[r]
    if (!name) continue
    if (!roster.has(name)) roster.set(name, { name, team: null, bracket: Number(rank) || DEFAULT_BRACKET, sub: true })
  }
}

// --- Week dates and tie dates (LEAGUE Standings) ---------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
function parseDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})/)
  if (!m) return null
  const mon = MONTHS[m[2].toLowerCase()]
  if (!mon) return null
  return `${YEAR}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** week → dates in order; tie key "a-b" (unordered) → date. */
const weekDates = new Map<number, string[]>()
const tieDate = new Map<string, string>()
const tieKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
{
  let week = 0
  for (const row of sheet('LEAGUE Standings')) {
    if (/^\d+$/.test(row[1])) week = Number(row[1])
    const date = parseDate(row[2] ?? '')
    if (!week || !date) continue
    weekDates.set(week, [...(weekDates.get(week) ?? []), date])
    for (const off of [3, 13]) {
      if (row[off] === 'Team' && row[off + 2] === 'v') {
        const a = Number(row[off + 1])
        const b = Number(row[off + 3])
        if (a && b) tieDate.set(`${week}:${tieKey(a, b)}`, date)
      }
    }
  }
}

// --- Weekly results ---------------------------------------------------------

interface Rubber {
  bracket: number
  a: string
  b: string
  ga: number
  gb: number
  /** Rating change for each side after that night's period; filled after rating. */
  da?: number
  db?: number
}
interface Tie {
  week: number
  date: string
  home: number
  away: number
  rubbers: Rubber[]
  homeRubbers: number
  awayRubbers: number
  homeGames: number
  awayGames: number
  homePts: number
  awayPts: number
  /** null when the tie has not been played (or is a bye). */
  winner: 'home' | 'away' | null
}

const ties: Tie[] = []
const weekSheets = wb.SheetNames.filter((n) => /^WK\d+ Result$/i.test(n)).sort(
  (a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]),
)
for (const name of weekSheets) {
  const week = Number(name.match(/\d+/)![0])
  const rows = sheet(name)
  for (let r = 0; r < rows.length; r++) {
    for (const off of [0, 10, 20]) {
      const row = rows[r]
      const ha = row[off + 1]?.match(/^Team (\d+)$/)
      const hb = row[off + 3]?.match(/^Team (\d+)$/)
      if (row[off] !== 'Player' || !ha || !hb) continue
      const home = Number(ha[1])
      const away = Number(hb[1])
      const rubbers: Rubber[] = []
      for (let k = r + 1; k < rows.length; k++) {
        const x = rows[k]
        if (x[off + 2] !== 'v') break
        const a = x[off + 1]
        const b = x[off + 3]
        const ga = Number(x[off + 4])
        const gb = Number(x[off + 6])
        if (!a || !b || a === '0' || b === '0' || !(ga + gb > 0)) continue
        rubbers.push({ bracket: Number(x[off]) || 0, a, b, ga, gb })
      }
      const homeRubbers = rubbers.filter((x) => x.ga > x.gb).length
      const awayRubbers = rubbers.filter((x) => x.gb > x.ga).length
      const homeGames = rubbers.reduce((s, x) => s + x.ga, 0)
      const awayGames = rubbers.reduce((s, x) => s + x.gb, 0)
      const winner: Tie['winner'] =
        rubbers.length === 0
          ? null
          : homeRubbers !== awayRubbers
            ? homeRubbers > awayRubbers ? 'home' : 'away'
            : homeGames !== awayGames
              ? homeGames > awayGames ? 'home' : 'away'
              : null
      const date = tieDate.get(`${week}:${tieKey(home, away)}`) ?? weekDates.get(week)?.[0] ?? `${YEAR}-01-01`
      ties.push({
        week, date, home, away, rubbers,
        homeRubbers, awayRubbers, homeGames, awayGames,
        homePts: homeGames + homeRubbers + (winner === 'home' ? TIE_WIN_BONUS : 0),
        awayPts: awayGames + awayRubbers + (winner === 'away' ? TIE_WIN_BONUS : 0),
        winner,
      })
    }
  }
}
ties.sort((a, b) => a.week - b.week || a.date.localeCompare(b.date))

// --- Standings ----------------------------------------------------------------

const standings = teams
  .map((t) => {
    const played = ties.filter((x) => x.rubbers.length && (x.home === t.no || x.away === t.no))
    let won = 0, rubbersFor = 0, rubbersAgainst = 0, gamesFor = 0, gamesAgainst = 0, points = 0
    for (const x of played) {
      const isHome = x.home === t.no
      if (x.winner === (isHome ? 'home' : 'away')) won++
      rubbersFor += isHome ? x.homeRubbers : x.awayRubbers
      rubbersAgainst += isHome ? x.awayRubbers : x.homeRubbers
      gamesFor += isHome ? x.homeGames : x.awayGames
      gamesAgainst += isHome ? x.awayGames : x.homeGames
      points += isHome ? x.homePts : x.awayPts
    }
    return { team: t.no, played: played.length, won, lost: played.length - won, rubbersFor, rubbersAgainst, gamesFor, gamesAgainst, points }
  })
  .sort((a, b) => b.points - a.points || b.gamesFor - a.gamesFor || b.rubbersFor - a.rubbersFor || a.team - b.team)

// --- Ratings ------------------------------------------------------------------

// Anyone who played but is on neither a roster nor the sub list gets a default entry.
for (const t of ties) for (const x of t.rubbers) for (const n of [x.a, x.b]) {
  if (!roster.has(n)) roster.set(n, { name: n, team: null, bracket: x.bracket || DEFAULT_BRACKET, sub: true })
}

const idOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '')
const players: Player[] = [...roster.values()].map((p) => ({
  id: idOf(p.name),
  name: p.name,
  startRating: START_BY_BRACKET[p.bracket] ?? DEFAULT_START,
}))
const matches: Match[] = []
const rubberByMatch = new Map<string, Rubber>()
ties.forEach((t, ti) =>
  t.rubbers.forEach((x, ri) => {
    const id = `w${t.week}-t${ti}-r${ri}`
    matches.push({ id, date: t.date, playerAId: idOf(x.a), playerBId: idOf(x.b), gamesA: x.ga, gamesB: x.gb, round: `Week ${t.week}` })
    rubberByMatch.set(id, x)
  }),
)

const { players: rated, snapshots } = computeRatings(players, matches)
for (const s of snapshots) {
  const m = matches.find((x) => x.id === s.matchId)!
  const x = rubberByMatch.get(s.matchId)!
  x.da = s.after[m.playerAId].rating - s.before[m.playerAId].rating
  x.db = s.after[m.playerBId].rating - s.before[m.playerBId].rating
}

// Rating after each night, for sparklines.
const history = new Map<string, { date: string; rating: number }[]>()
for (const s of snapshots) {
  const m = matches.find((x) => x.id === s.matchId)!
  for (const id of [m.playerAId, m.playerBId]) {
    const h = history.get(id) ?? []
    const r = s.after[id].rating
    if (h.length && h[h.length - 1].date === m.date) h[h.length - 1].rating = r
    else h.push({ date: m.date, rating: r })
    history.set(id, h)
  }
}

const ratings = rated.map((p) => {
  const r = roster.get(p.name)!
  return {
    id: p.id,
    name: p.name,
    team: r.team,
    bracket: r.bracket,
    sub: r.sub,
    rating: Math.round(p.rating.rating * 10) / 10,
    rd: Math.round(p.rating.rd * 10) / 10,
    matches: p.matches,
    wins: p.wins,
    losses: p.losses,
    lastPlayed: p.lastPlayed,
    history: history.get(p.id) ?? [],
  }
})

// --- Write ------------------------------------------------------------------------

const weeks = [...new Set(ties.map((t) => t.week))].map((week) => ({
  week,
  dates: weekDates.get(week) ?? [],
  ties: ties.filter((t) => t.week === week),
}))

const out = {
  builtAt: new Date().toISOString(),
  source: path.basename(file),
  season,
  year: YEAR,
  tieWinBonus: TIE_WIN_BONUS,
  startByBracket: START_BY_BRACKET,
  teams: teams.map((t) => ({ no: t.no, name: `Team ${t.no}`, players: t.players })),
  substitutes: [...roster.values()].filter((p) => p.sub).map((p) => ({ name: p.name, bracket: p.bracket })),
  standings,
  weeks,
  ratings,
}
fs.writeFileSync(path.join(DIR, 'league.json'), JSON.stringify(out))

const playedTies = ties.filter((t) => t.rubbers.length)
console.log(
  `${season}: ${teams.length} teams, ${roster.size} players, ${playedTies.length} ties / ${matches.length} rubbers over ${weeks.filter((w) => w.ties.some((t) => t.rubbers.length)).length} weeks → data/seoul/league.json`,
)
