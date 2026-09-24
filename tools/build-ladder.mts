// Build the KSF ladders from the scraped dataset.
//
//   node tools/build-ladder.mts
//
// Reads data/ksf/{matches,players}.json, runs the hybrid rating (src/rating/
// hybrid.ts) and writes
//   data/ksf/ladder.json           players + one rating table per ladder × term
//   data/ksf/matches-compact.json  per-match rows for the player pages
//
// Ladders are rated SEPARATELY, because a junior draw carries no information
// about adult strength: a 46-6 record in a girls' U18 draw proves dominance of
// that pool and nothing else. So
//   open    – the national (senior) ladder: 일반부 draws only. A student
//             appears here only through such results, and is provisional
//             until they have a few.
//   student – 12세이하 / 15세이하 / 18세이하 / 대학부 draws, one pool: players
//             link the age groups as they move up (U18 → 대학부 especially),
//             whereas 대학부 is barely linked to 일반부 (1-18 in open draws).
//             Only players whose last rated draw was a student draw, and who
//             have not aged out, are LISTED; everyone's matches still count.
// Every match belongs to exactly one ladder. Each tournament is one rating
// period. Team events, doubles and walkovers (0-0) are skipped.

import fs from 'node:fs'
import path from 'node:path'
import { blend, computeHybrid, GLICKO_SHARE } from '../src/rating/hybrid.ts'
import { FORMAT_WEIGHT, formatWeight } from '../src/rating/squash.ts'
import type { Match, Player } from '../src/rating/types.ts'

const DIR = path.resolve('data/ksf')

const OPEN = { key: 'open', label: '국가 (일반부)' }
const STUDENT = { key: 'student', label: '학생부' }
const isStudentDivision = (division: string) => /(12|15|18)세이하|대학부/.test(division)
/** Which ladder a division's matches belong to. */
const ladderOf = (division: string) => (isStudentDivision(division) ? STUDENT.key : OPEN.key)
/** Oldest age (in the current year) still listed on the student ladder, by kind of draw last played. */
const MAX_AGE = { junior: 18, university: 26 }

// Ratings use only the last RATING_MONTHS of results. The shorter terms do not
// re-rate anyone: every player keeps the same current rating, and the term adds
// how far it moved inside that window plus the window's win–loss record.
const RATING_MONTHS = 36
// A rating is only shown once there is a body of results behind it. Below these counts
// the player is not listed for that term — their matches still move everyone else's
// rating, and their own page still shows every result.
const MIN_MATCHES: Record<string, number> = { y3: 10, y1: 7, m6: 3, m3: 0 }

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
let rawPlayers: RawPlayer[] = JSON.parse(fs.readFileSync(path.join(DIR, 'players.json'), 'utf8'))

// --- One person, several 등록번호 -------------------------------------------
// The portal gives an entrant with no registration a throwaway id (98…, an empty
// profile), so a player can hold a real number and a temporary one per event —
// and their record arrives split in two. data/ksf/merges.json lists the pairs
// settled by 소속 and by never appearing in the same draw; each id there is
// rewritten to the first one, before anything is rated. Its "review" list is
// deliberately not applied.
const { merge: MERGES } = JSON.parse(fs.readFileSync(path.join(DIR, 'merges.json'), 'utf8')) as {
  merge: { name: string; birthYear: number; ids: string[]; why: string }[]
}
const alias = new Map<string, string>()
for (const m of MERGES) for (const id of m.ids.slice(1)) alias.set(id, m.ids[0])
const realId = (id: string | null) => (id && alias.get(id)) ?? id
for (const m of rawMatches) {
  m.playerAId = realId(m.playerAId)
  m.playerBId = realId(m.playerBId)
}
for (const p of rawPlayers) {
  const keep = alias.get(p.idNo) && rawPlayers.find((q) => q.idNo === alias.get(p.idNo))
  if (!keep) continue
  for (const t of p.teams) if (!keep.teams.includes(t)) keep.teams.push(t)
  keep.sido ??= p.sido
  keep.sex ??= p.sex
  keep.birthYear ??= p.birthYear
}
const merged = rawPlayers.length
rawPlayers = rawPlayers.filter((p) => !alias.has(p.idNo))
if (alias.size) console.log(alias.size + ' 등록번호 merged into ' + MERGES.length + ' people (' + merged + ' → ' + rawPlayers.length + ' players)')

const now = new Date()
const since = (months: number) => {
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}
const RATING_SINCE = since(RATING_MONTHS)

type Singles = RawMatch & { playerAId: string; playerBId: string; gamesA: number; gamesB: number }
/** Every singles match, oldest first; only those on/after RATING_SINCE are rated. */
// A squash match is at most best of five, so no side can win four games: a row that
// says otherwise is a typo in the portal and is dropped rather than rated (owner,
// 2026-09-24, about 2024-03-21 남자 15세이하 결승 "1:4").
const impossible = (m: RawMatch) => Math.max(m.gamesA ?? 0, m.gamesB ?? 0) > 3
const allSingles = rawMatches.filter(
  (m): m is Singles =>
    !!m.playerAId && !!m.playerBId && m.playerAId !== m.playerBId &&
    m.gamesA != null && m.gamesB != null && m.gamesA + m.gamesB > 0 && !impossible(m),
)
for (const m of rawMatches.filter(impossible)) {
  console.log(`dropped (impossible score): ${m.date} ${m.division} ${m.round} ${m.playerA} ${m.gamesA}:${m.gamesB} ${m.playerB}`)
}
const singles = allSingles.filter((m) => m.date >= RATING_SINCE)

// --- Where a player enters a pool --------------------------------------------
// The age groups inside the student pool barely play each other, so with a
// common start a rating only says where a player stands among their own draw
// — a 12세이하 champion at 1750 reads as a 대학부 contender. Rather than cap
// anyone, each player enters the pool at the level of the FIRST draw they
// played in the rating window (the open ladder has one level). Dominating a
// younger draw then lands a notch below the next group's middle; beating
// older players is the way past it, and nothing stops the climb — the start
// only sets where it begins. Players carry their rating up as they age.
const START_RATING: [RegExp, number][] = [
  [/12세이하/, 1200],
  [/15세이하/, 1350],
  [/18세이하/, 1450],
  [/대학부/, 1500],
]
const startRatingOf = (division: string) => START_RATING.find(([re]) => re.test(division))?.[1] ?? 1500


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

// --- Rate one pool ---------------------------------------------------------
function rate(subset: Singles[]) {
  // Each player starts at the level of their first draw in this pool.
  const firstDivision = new Map<string, string>()
  for (const m of subset) for (const id of [m.playerAId, m.playerBId]) if (!firstDivision.has(id)) firstDivision.set(id, m.division) // date-ordered
  const players: Player[] = rawPlayers.map((p) => ({ id: p.idNo, name: p.name, startRating: startRatingOf(firstDivision.get(p.idNo) ?? '') }))
  const matches: Match[] = subset.map((m, i) => ({
    id: String(i),
    date: m.date,
    playerAId: m.playerAId,
    playerBId: m.playerBId,
    gamesA: m.gamesA,
    gamesB: m.gamesB,
    weight: formatWeight(m.gamesA, m.gamesB),
  }))
  const { players: rated, glicko, elo } = computeHybrid(players, matches)

  // Blended rating after each tournament, per player, for the trend sparkline:
  // Glicko-2 after the tournament's period, Elo after the player's last match in it.
  const history = new Map<string, { date: string; rating: number }[]>()
  const eloAfter = new Map(elo.snapshots.map((s) => [s.matchId, s.after]))
  for (const s of glicko.snapshots) {
    const m = subset[Number(s.matchId)]
    for (const id of [m.playerAId, m.playerBId]) {
      const h = history.get(id) ?? []
      const r = Math.round(blend(s.after[id].rating, eloAfter.get(s.matchId)![id]))
      if (h.length && h[h.length - 1].date === m.date) h[h.length - 1].rating = r
      else h.push({ date: m.date, rating: r })
      history.set(id, h)
    }
  }

  // Each side's blended change over a whole tournament: the Glicko-2 period
  // delta blended with the sum of that player's Elo deltas in the tournament.
  const eloByTournament = new Map<string, number>() // "toCd|player" → Σ Elo delta
  for (const s of elo.snapshots) {
    const m = subset[Number(s.matchId)]
    for (const id of [m.playerAId, m.playerBId]) {
      const k = `${m.toCd}|${id}`
      eloByTournament.set(k, (eloByTournament.get(k) ?? 0) + s.after[id] - s.before[id])
    }
  }
  const tournamentDelta = new Map<Singles, { [id: string]: number }>()
  for (const s of glicko.snapshots) {
    const m = subset[Number(s.matchId)]
    const d: { [id: string]: number } = {}
    for (const id of [m.playerAId, m.playerBId]) {
      d[id] = blend(s.after[id].rating - s.before[id].rating, eloByTournament.get(`${m.toCd}|${id}`) ?? 0)
    }
    tournamentDelta.set(m, d)
  }

  const entries = rated
    .filter((p) => p.matches > 0)
    .map((p) => ({
      id: p.id,
      rating: Math.round(p.rating),
      glicko: Math.round(p.glicko),
      elo: Math.round(p.elo),
      rd: Math.round(p.rd),
      matches: p.matches,
      wins: p.wins,
      losses: p.losses,
      lastPlayed: p.lastPlayed,
      history: history.get(p.id) ?? [],
      start: p.startRating ?? 1500,
    }))
  return { entries, tournamentDelta }
}

type Entry = ReturnType<typeof rate>['entries'][number]
type TermEntry = Entry & { delta: number | null; termMatches: number; termWins: number; termLosses: number }

/** Term views of one pool's current ratings: same rating, plus the window's Δ and record. */
function termsOf(subset: Singles[], current: Entry[]) {
  const terms: Record<string, { label: string; since: string; entries: TermEntry[] }> = {}
  for (const t of TERMS) {
    const from = since(t.months)
    const entries: TermEntry[] = current.map((e) => {
      const inWindow = subset.filter((m) => m.date >= from && (m.playerAId === e.id || m.playerBId === e.id))
      const wins = inWindow.filter((m) => (m.playerAId === e.id ? m.gamesA > m.gamesB : m.gamesB > m.gamesA)).length
      // Rating just before the window opened: last history point before `from`, else the start.
      const before = [...e.history].reverse().find((h) => h.date < from)
      const base = before ? before.rating : e.start
      return {
        ...e,
        history: e.history.filter((h) => h.date >= from),
        delta: t.months === RATING_MONTHS ? null : e.rating - base,
        termMatches: inWindow.length,
        termWins: wins,
        termLosses: inWindow.length - wins,
      }
    })
    // The primary term counts the whole window's matches; the shorter ones count only
    // what happened inside them, so a player drops off a term they barely played.
    const min = MIN_MATCHES[t.key] ?? 0
    const listed = entries.filter((e) => (t.months === RATING_MONTHS ? e.matches : e.termMatches) >= min)
    terms[t.key] = { label: t.label, since: from, entries: listed }
  }
  return terms
}

// --- Build every ladder ----------------------------------------------------
const ladders: Record<string, { label: string; matches: number; terms: ReturnType<typeof termsOf> }> = {}
const deltaOf = new Map<Singles, { [id: string]: number }>()
const laddersOfPlayer = new Map<string, string[]>() // where a player is listed
const playedOn = new Map<string, string[]>() // where a player has rated matches at all
const birthYear = new Map(rawPlayers.map((p) => [p.idNo, p.birthYear]))
const lastRatedDivision = new Map<string, string>()
for (const m of singles) for (const id of [m.playerAId, m.playerBId]) lastRatedDivision.set(id, m.division) // date-ordered
/** Still a student: last rated draw was a student draw, and not past that draw's age limit. */
const isStudentNow = (id: string) => {
  const div = lastRatedDivision.get(id) ?? ''
  const b = birthYear.get(id)
  if (!isStudentDivision(div) || b == null) return false
  return now.getFullYear() - b <= (/대학부/.test(div) ? MAX_AGE.university : MAX_AGE.junior)
}
for (const L of [OPEN, STUDENT]) {
  const subset = singles.filter((m) => ladderOf(m.division) === L.key)
  const { entries: rated, tournamentDelta } = rate(subset)
  // Players who left student draws still shaped everyone's ratings, but leave the student list.
  const entries = L.key === STUDENT.key ? rated.filter((e) => isStudentNow(e.id)) : rated
  for (const [m, d] of tournamentDelta) deltaOf.set(m, d)
  // Anyone with a rated match stays in players[] so their name resolves wherever they
  // appear; `ladders` says where they are actually LISTED, which is a shorter list.
  for (const e of rated) playedOn.set(e.id, [...(playedOn.get(e.id) ?? []), L.key])
  const qualified = entries.filter((e) => e.matches >= (MIN_MATCHES.y3 ?? 0))
  for (const e of qualified) laddersOfPlayer.set(e.id, [...(laddersOfPlayer.get(e.id) ?? []), L.key])
  ladders[L.key] = { label: L.label, matches: subset.length, terms: termsOf(subset, entries) }
  console.log(`${L.key.padEnd(6)} ${L.label.padEnd(14)} ${String(subset.length).padStart(5)} matches, ${qualified.length} listed`
    + ` (${entries.length - qualified.length} under ${MIN_MATCHES.y3} matches${L.key === STUDENT.key ? `, ${rated.length - entries.length} no longer students` : ''})`)
}

// --- Static player info ----------------------------------------------------
const lastDivision = new Map<string, string>()
for (const m of allSingles) for (const id of [m.playerAId, m.playerBId]) lastDivision.set(id, m.division) // date-ordered
const info = rawPlayers
  .filter((p) => playedOn.has(p.idNo))
  .map((p) => ({
    id: p.idNo,
    name: p.name,
    birthYear: p.birthYear,
    sex: p.sex,
    team: p.teams[0] ?? null, // scraper walks tournaments newest-first
    sido: p.sido,
    lastDivision: lastDivision.get(p.idNo) ?? null,
    ladders: laddersOfPlayer.get(p.idNo) ?? [],
  }))

const tournaments = [...new Map(allSingles.map((m) => [m.toCd, { toCd: m.toCd, name: m.tournament, date: m.date }])).values()]
  .sort((a, b) => a.date.localeCompare(b.date))

fs.writeFileSync(
  path.join(DIR, 'ladder.json'),
  JSON.stringify({
    builtAt: now.toISOString(), ratingSince: RATING_SINCE, matches: singles.length,
    glickoShare: GLICKO_SHARE, formatWeight: FORMAT_WEIGHT, minMatches: MIN_MATCHES,
    tournaments, players: info, ladders,
  }),
)

// Compact per-match rows with each side's rating change over that tournament
// (on whichever ladder the match belongs to; null before the rating window).
const compact = allSingles.map((m) => {
  const s = deltaOf.get(m)
  const delta = (id: string) => (s ? Math.round(s[id]) : null)
  return { d: m.date, t: m.toCd, v: m.division, l: ladderOf(m.division), r: roundLabel(m), a: m.playerAId, b: m.playerBId, ga: m.gamesA, gb: m.gamesB, da: delta(m.playerAId), db: delta(m.playerBId) }
})
fs.writeFileSync(path.join(DIR, 'matches-compact.json'), JSON.stringify(compact))

const byId = new Map(info.map((p) => [p.id, p]))
for (const sex of ['남자', '여자']) {
  console.log(`\nOpen ladder top 10 (${sex}):`)
  for (const e of ladders.open.terms.y3.entries.filter((e) => byId.get(e.id)!.sex === sex).slice(0, 10)) {
    const p = byId.get(e.id)!
    console.log(`  ${String(e.rating).padStart(4)} ±${String(e.rd).padStart(3)}  ${p.name} (${p.birthYear}, ${p.lastDivision})  ${e.wins}-${e.losses}  last ${e.lastPlayed}`)
  }
}
