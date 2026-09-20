import {
  type GameResult,
  type Glicko2Rating,
  newRating,
  updateRating,
} from './glicko2.ts'
import type { Match, Player } from './types.ts'

/**
 * How much the game score tempers a win. 0 = a win is a win (pure Glicko-2);
 * 1 = the outcome is purely the share of games won. 0.5 gives:
 *   3-0 → 1.00, 3-1 → 0.875, 3-2 → 0.80 for the winner.
 */
export const MARGIN_WEIGHT = 0.5

/** Glicko-2 score for player A in [0, 1], blending win/loss with the games share. */
export function matchScore(gamesA: number, gamesB: number): number {
  const total = gamesA + gamesB
  if (total === 0) return 0.5
  const won = gamesA > gamesB ? 1 : gamesA < gamesB ? 0 : 0.5
  const share = gamesA / total
  return (1 - MARGIN_WEIGHT) * won + MARGIN_WEIGHT * share
}

export interface RatedPlayer extends Player {
  rating: Glicko2Rating
  matches: number
  wins: number
  losses: number
  lastPlayed: string | null
}

export interface RatingSnapshot {
  matchId: string
  before: Record<string, Glicko2Rating>
  after: Record<string, Glicko2Rating>
}

export interface RatingHistory {
  players: RatedPlayer[]
  /** Per-match rating changes, in the same order as the replayed matches. */
  snapshots: RatingSnapshot[]
}

/**
 * Replay all matches in date order and compute current ratings.
 * Each distinct match date is one rating period: every player's rating is
 * updated once per period from all their games that day, and players who
 * did not play have their RD inflated.
 */
export function computeRatings(players: Player[], matches: Match[]): RatingHistory {
  const ratings = new Map<string, Glicko2Rating>()
  const stats = new Map<string, { matches: number; wins: number; losses: number; lastPlayed: string | null }>()
  for (const p of players) {
    ratings.set(p.id, newRating(p.startRating))
    stats.set(p.id, { matches: 0, wins: 0, losses: 0, lastPlayed: null })
  }

  const ordered = [...matches]
    .filter((m) => ratings.has(m.playerAId) && ratings.has(m.playerBId))
    .sort((a, b) => a.date.localeCompare(b.date))

  const snapshots: RatingSnapshot[] = []

  // Group into rating periods by date.
  let i = 0
  while (i < ordered.length) {
    const date = ordered[i].date
    const period: Match[] = []
    while (i < ordered.length && ordered[i].date === date) period.push(ordered[i++])

    // Every update in a period uses the ratings as they stood at the start.
    const before = new Map(ratings)
    const resultsFor = new Map<string, GameResult[]>()
    for (const m of period) {
      const sA = matchScore(m.gamesA, m.gamesB)
      resultsFor.set(m.playerAId, [
        ...(resultsFor.get(m.playerAId) ?? []),
        { opponent: before.get(m.playerBId)!, score: sA },
      ])
      resultsFor.set(m.playerBId, [
        ...(resultsFor.get(m.playerBId) ?? []),
        { opponent: before.get(m.playerAId)!, score: 1 - sA },
      ])

      const a = stats.get(m.playerAId)!
      const b = stats.get(m.playerBId)!
      a.matches++
      b.matches++
      if (m.gamesA > m.gamesB) {
        a.wins++
        b.losses++
      } else if (m.gamesB > m.gamesA) {
        b.wins++
        a.losses++
      }
      a.lastPlayed = date
      b.lastPlayed = date
    }

    for (const [id, r] of before) {
      ratings.set(id, updateRating(r, resultsFor.get(id) ?? []))
    }

    for (const m of period) {
      snapshots.push({
        matchId: m.id,
        before: {
          [m.playerAId]: before.get(m.playerAId)!,
          [m.playerBId]: before.get(m.playerBId)!,
        },
        after: {
          [m.playerAId]: ratings.get(m.playerAId)!,
          [m.playerBId]: ratings.get(m.playerBId)!,
        },
      })
    }
  }

  const rated: RatedPlayer[] = players.map((p) => ({
    ...p,
    rating: ratings.get(p.id)!,
    ...stats.get(p.id)!,
  }))
  rated.sort((a, b) => b.rating.rating - a.rating.rating)
  return { players: rated, snapshots }
}
