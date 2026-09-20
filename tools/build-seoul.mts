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
// Ratings are the hybrid in src/rating/hybrid.ts: Glicko-2 (one period per
// league night) blended with Elo (match by match). Best-of-5 rubbers count in
// full, best-of-3 and single games for less (FORMAT_WEIGHT).

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { computeHybrid, FORMAT_WEIGHT, GLICKO_SHARE, matchFormat, type MatchFormat } from '../src/rating/hybrid.ts'
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
  /** Rally points for each side, when the sheet has them (the tie-break after games). */
  pa: number | null
  pb: number | null
  /** bo5 / bo3 / single, inferred from the games; sets the rubber's rating weight. */
  format: MatchFormat
  /** Blended rating change for each side; filled after rating. */
  da?: number
  db?: number
  /** The Glicko-2 and Elo parts of that change. */
  dga?: number
  dgb?: number
  dea?: number
  deb?: number
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
  homePoints: number | null
  awayPoints: number | null
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
        rubbers.push({ bracket: Number(x[off]) || 0, a, b, ga, gb, pa: null, pb: null, format: matchFormat(ga, gb) })
      }
      // Rally points live in the two summary blocks below ("Team | n | Rubbers | Games | Game Pts").
      const pointsOf = new Map<string, number>()
      for (let k = r + 1, blocks = 0; k < rows.length && blocks < 2; k++) {
        const x = rows[k]
        if (x[off + 2] !== 'Team' || x[off + 4] !== 'Rubbers') continue
        blocks++
        for (let j = k + 1; j < rows.length && rows[j][off + 3] !== 'Total'; j++) {
          const y = rows[j]
          const pts = Number(y[off + 6])
          if (y[off + 3] && y[off + 6] !== '' && Number.isFinite(pts)) pointsOf.set(y[off + 3], pts)
        }
      }
      for (const x of rubbers) {
        x.pa = pointsOf.get(x.a) ?? null
        x.pb = pointsOf.get(x.b) ?? null
      }
      const homeRubbers = rubbers.filter((x) => x.ga > x.gb).length
      const awayRubbers = rubbers.filter((x) => x.gb > x.ga).length
      const homeGames = rubbers.reduce((s, x) => s + x.ga, 0)
      const awayGames = rubbers.reduce((s, x) => s + x.gb, 0)
      const hasPoints = rubbers.length > 0 && rubbers.every((x) => x.pa !== null && x.pb !== null)
      const homePoints = hasPoints ? rubbers.reduce((s, x) => s + x.pa!, 0) : null
      const awayPoints = hasPoints ? rubbers.reduce((s, x) => s + x.pb!, 0) : null
      // Tie-break order, as the league sheet scores it: rubbers, games, rally points.
      const winner: Tie['winner'] =
        rubbers.length === 0
          ? null
          : homeRubbers !== awayRubbers
            ? homeRubbers > awayRubbers ? 'home' : 'away'
            : homeGames !== awayGames
              ? homeGames > awayGames ? 'home' : 'away'
              : homePoints !== null && awayPoints !== null && homePoints !== awayPoints
                ? homePoints > awayPoints ? 'home' : 'away'
                : null
      const date = tieDate.get(`${week}:${tieKey(home, away)}`) ?? weekDates.get(week)?.[0] ?? `${YEAR}-01-01`
      ties.push({
        week, date, home, away, rubbers,
        homeRubbers, awayRubbers, homeGames, awayGames, homePoints, awayPoints,
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
    matches.push({ id, date: t.date, playerAId: idOf(x.a), playerBId: idOf(x.b), gamesA: x.ga, gamesB: x.gb, round: `Week ${t.week}`, weight: FORMAT_WEIGHT[x.format] })
    rubberByMatch.set(id, x)
  }),
)

const { players: rated, deltas, glicko, elo } = computeHybrid(players, matches)
const matchById = new Map(matches.map((m) => [m.id, m]))
for (const [id, d] of deltas) {
  const m = matchById.get(id)!
  const x = rubberByMatch.get(id)!
  const a = d[m.playerAId], b = d[m.playerBId]
  x.da = a.rating; x.db = b.rating
  x.dga = a.glicko; x.dgb = b.glicko
  x.dea = a.elo; x.deb = b.elo
}

// Blended rating after each night, for sparklines: Glicko-2 after the night's
// period and Elo after the last rubber that night.
const history = new Map<string, { date: string; rating: number }[]>()
const eloAfter = new Map(elo.snapshots.map((s) => [s.matchId, s.after]))
for (const s of glicko.snapshots) {
  const m = matchById.get(s.matchId)!
  for (const id of [m.playerAId, m.playerBId]) {
    const h = history.get(id) ?? []
    const r = GLICKO_SHARE * s.after[id].rating + (1 - GLICKO_SHARE) * eloAfter.get(s.matchId)![id]
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
    rating: Math.round(p.rating * 10) / 10,
    glicko: Math.round(p.glicko * 10) / 10,
    elo: Math.round(p.elo * 10) / 10,
    rd: Math.round(p.rd * 10) / 10,
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
  glickoShare: GLICKO_SHARE,
  formatWeight: FORMAT_WEIGHT,
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
