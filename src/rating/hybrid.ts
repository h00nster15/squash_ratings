/**
 * Hybrid rating for the club league: Glicko-2 (one period per league night,
 * with its uncertainty) blended with plain Elo (match by match). The league
 * rating is the weighted mean of the two; ± is Glicko-2's RD.
 *
 * Match formats count differently: see FORMAT_WEIGHT. The weight scales both
 * engines — Glicko-2 via GameResult.weight, Elo via its K-factor.
 */
import { computeElo } from './elo.ts'
import { computeRatings } from './squash.ts'
import type { Match, Player } from './types.ts'

/** Share of Glicko-2 in the blended rating; the rest is Elo. */
export const GLICKO_SHARE = 0.5

export type MatchFormat = 'bo5' | 'bo3' | 'single'

/** How much of a full match each format counts for. Tune here. */
export const FORMAT_WEIGHT: Record<MatchFormat, number> = { bo5: 1, bo3: 0.75, single: 0.5 }

/** Infer the format from the games: first to 3 is a best-of-5, first to 2 a best-of-3, 1-0 a single game. */
export function matchFormat(gamesA: number, gamesB: number): MatchFormat {
  const top = Math.max(gamesA, gamesB)
  return top >= 3 ? 'bo5' : top === 2 ? 'bo3' : 'single'
}

export interface HybridPlayer extends Player {
  rating: number
  glicko: number
  elo: number
  rd: number
  matches: number
  wins: number
  losses: number
  lastPlayed: string | null
}

export interface HybridDelta {
  /** Blended change for each side. */
  [id: string]: { rating: number; glicko: number; elo: number }
}

export function blend(glicko: number, elo: number): number {
  return GLICKO_SHARE * glicko + (1 - GLICKO_SHARE) * elo
}

/**
 * Rate `matches`. A match without an explicit weight gets its format's
 * weight. Returns players sorted by blended rating and a per-match delta map.
 */
export function computeHybrid(players: Player[], matches: Match[]) {
  const weighted = matches.map((m) => ({ ...m, weight: m.weight ?? FORMAT_WEIGHT[matchFormat(m.gamesA, m.gamesB)] }))
  const g = computeRatings(players, weighted)
  const e = computeElo(players, weighted)

  const eloSnap = new Map(e.snapshots.map((s) => [s.matchId, s]))
  const deltas = new Map<string, HybridDelta>()
  for (const s of g.snapshots) {
    const es = eloSnap.get(s.matchId)
    const d: HybridDelta = {}
    for (const id of Object.keys(s.after)) {
      const dg = s.after[id].rating - s.before[id].rating
      const de = es ? es.after[id] - es.before[id] : 0
      d[id] = { rating: blend(dg, de), glicko: dg, elo: de }
    }
    deltas.set(s.matchId, d)
  }

  const rated: HybridPlayer[] = g.players.map((p) => {
    const elo = e.ratings.get(p.id) ?? p.startRating ?? 1500
    return {
      id: p.id,
      name: p.name,
      startRating: p.startRating,
      rating: blend(p.rating.rating, elo),
      glicko: p.rating.rating,
      elo,
      rd: p.rating.rd,
      matches: p.matches,
      wins: p.wins,
      losses: p.losses,
      lastPlayed: p.lastPlayed,
    }
  })
  rated.sort((a, b) => b.rating - a.rating)
  return { players: rated, deltas, glicko: g, elo: e }
}
