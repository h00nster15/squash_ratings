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

/**
 * Match format. A best-of-five says more than a best-of-three, which says more
 * than a single game, so shorter formats count as a fraction of a match.
 * Detected from the score: the winner took 3, 2 or 1 games.
 */
export const FORMAT_WEIGHT = { bestOf5: 1, bestOf3: 0.75, singleGame: 0.5 }

export function formatWeight(gamesA: number, gamesB: number): number {
  const won = Math.max(gamesA, gamesB)
  return won >= 3 ? FORMAT_WEIGHT.bestOf5 : won === 2 ? FORMAT_WEIGHT.bestOf3 : FORMAT_WEIGHT.singleGame
}

/**
 * Absence rule. A player who returns after more than ABSENCE_DAYS without a
 * rated match re-enters with their rating cut by ABSENCE_PENALTY (on top of the
 * RD inflation Glicko-2 already applies while they are away). Ladders also hide
 * players past the threshold until they play again.
 */
export const ABSENCE_DAYS = 365
export const ABSENCE_PENALTY = 100

/**
 * How far above the best 일반부 player they have beaten a capped (junior /
 * university) player may rate. See Match.cap.
 */
export const ADULT_WIN_MARGIN = 100

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

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
  // Closed-pool ceilings: the cap of the last capped draw a player entered, and
  // the highest prior rating of an opponent they beat in an uncapped draw.
  const capLevel = new Map<string, number>()
  const bestAdultWin = new Map<string, number>()

  // Group into rating periods by date.
  let i = 0
  while (i < ordered.length) {
    const date = ordered[i].date
    const period: Match[] = []
    while (i < ordered.length && ordered[i].date === date) period.push(ordered[i++])

    // Every update in a period uses the ratings as they stood at the start.
    // `before` is what the snapshots report; `prior` is the same after the
    // absence penalty, and is what the period's maths runs on.
    const before = new Map(ratings)
    const prior = new Map(ratings)
    for (const m of period) {
      for (const id of [m.playerAId, m.playerBId]) {
        const last = stats.get(id)!.lastPlayed
        if (last && daysBetween(last, date) > ABSENCE_DAYS && prior.get(id) === before.get(id)) {
          const r = before.get(id)!
          prior.set(id, { ...r, rating: r.rating - ABSENCE_PENALTY })
        }
      }
    }
    const resultsFor = new Map<string, GameResult[]>()
    for (const m of period) {
      const sA = matchScore(m.gamesA, m.gamesB)
      const weight = (m.weight ?? 1) * formatWeight(m.gamesA, m.gamesB)
      resultsFor.set(m.playerAId, [
        ...(resultsFor.get(m.playerAId) ?? []),
        { opponent: prior.get(m.playerBId)!, score: sA, weight },
      ])
      resultsFor.set(m.playerBId, [
        ...(resultsFor.get(m.playerBId) ?? []),
        { opponent: prior.get(m.playerAId)!, score: 1 - sA, weight },
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

    for (const m of period) {
      const winner = m.gamesA > m.gamesB ? m.playerAId : m.gamesB > m.gamesA ? m.playerBId : null
      const loser = winner === m.playerAId ? m.playerBId : m.playerAId
      for (const id of [m.playerAId, m.playerBId]) if (m.cap !== undefined) capLevel.set(id, m.cap)
      if (winner && m.cap === undefined) {
        const beaten = prior.get(loser)!.rating
        if (beaten > (bestAdultWin.get(winner) ?? -Infinity)) bestAdultWin.set(winner, beaten)
      }
    }
    for (const [id, r] of prior) {
      const updated = updateRating(r, resultsFor.get(id) ?? [])
      const cap = capLevel.get(id)
      if (cap === undefined) {
        ratings.set(id, updated)
        continue
      }
      const earned = bestAdultWin.has(id) ? bestAdultWin.get(id)! + ADULT_WIN_MARGIN : -Infinity
      const limit = Math.max(cap, earned)
      ratings.set(id, updated.rating > limit ? { ...updated, rating: limit } : updated)
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
