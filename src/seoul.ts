// Typed access to the prebuilt Seoul Club Squash League dataset (tools/build-seoul.mts).
// Separate from the KSF national data in ksf.ts: nothing here feeds the national ladder.
import leagueJson from '../data/seoul/league.json'

export interface Rubber {
  bracket: number
  a: string
  b: string
  ga: number
  gb: number
  /** Rally points, when the sheet recorded them. */
  pa: number | null
  pb: number | null
  /** bo5 / bo3 / single; sets how much the rubber counts. */
  format: 'bo5' | 'bo3' | 'single'
  /** Blended rating change for each side, and its Glicko-2 / Elo parts. */
  da?: number
  db?: number
  dga?: number
  dgb?: number
  dea?: number
  deb?: number
}

export interface Tie {
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
  winner: 'home' | 'away' | null
}

export interface Week {
  week: number
  dates: string[]
  ties: Tie[]
}

export interface Standing {
  team: number
  played: number
  won: number
  lost: number
  rubbersFor: number
  rubbersAgainst: number
  gamesFor: number
  gamesAgainst: number
  points: number
}

export interface LeaguePlayer {
  id: string
  name: string
  team: number | null
  bracket: number
  sub: boolean
  /** Blended league rating (glickoShare × Glicko-2 + the rest Elo). */
  rating: number
  glicko: number
  elo: number
  rd: number
  matches: number
  wins: number
  losses: number
  lastPlayed: string | null
  history: { date: string; rating: number }[]
}

export const league = leagueJson as {
  builtAt: string
  source: string
  season: string
  year: number
  tieWinBonus: number
  startByBracket: Record<string, number>
  glickoShare: number
  formatWeight: Record<'bo5' | 'bo3' | 'single', number>
  teams: { no: number; name: string; players: string[] }[]
  substitutes: { name: string; bracket: number }[]
  standings: Standing[]
  weeks: Week[]
  ratings: LeaguePlayer[]
}

export const playersByName = new Map(league.ratings.map((p) => [p.name, p]))
export const playersById = new Map(league.ratings.map((p) => [p.id, p]))

/** Every rubber a player has played, newest first, from their side. */
export function resultsOf(name: string) {
  const out: { week: number; date: string; team: number; opponentTeam: number; rubber: Rubber; me: 'a' | 'b'; won: boolean }[] = []
  for (const w of league.weeks)
    for (const t of w.ties)
      for (const r of t.rubbers) {
        if (r.a !== name && r.b !== name) continue
        const me = r.a === name ? 'a' : 'b'
        out.push({
          week: w.week, date: t.date,
          team: me === 'a' ? t.home : t.away,
          opponentTeam: me === 'a' ? t.away : t.home,
          rubber: r, me,
          won: me === 'a' ? r.ga > r.gb : r.gb > r.ga,
        })
      }
  return out.sort((x, y) => y.date.localeCompare(x.date) || y.week - x.week)
}
export const teamName = (no: number | null) => (no === null ? 'Sub' : `Team ${no}`)

/** RD above which a rating is too uncertain to rank on. */
export const PROVISIONAL_RD = 250
