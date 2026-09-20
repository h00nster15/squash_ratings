/**
 * Elo, updated match by match in the order played.
 *
 * Kept deliberately plain: expected score on the usual 400-point logistic
 * scale, and a K-factor that scales with the match weight (a best-of-3
 * moves a rating less than a best-of-5) and shrinks once a player has a
 * record, so newcomers settle quickly and veterans do not swing.
 */
import { matchScore } from './squash.ts'
import type { Match, Player } from './types.ts'

export const ELO_DEFAULT = 1500
/** K for a player's first ELO_SETTLE_MATCHES matches, then K_SETTLED. */
export const K_NEW = 40
export const K_SETTLED = 24
export const ELO_SETTLE_MATCHES = 10

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400))
}

export interface EloSnapshot {
  matchId: string
  before: Record<string, number>
  after: Record<string, number>
}

export interface EloHistory {
  ratings: Map<string, number>
  played: Map<string, number>
  snapshots: EloSnapshot[]
}

/** Replay `matches` (date order, then the order given) and return every player's Elo. */
export function computeElo(players: Player[], matches: Match[]): EloHistory {
  const ratings = new Map<string, number>()
  const played = new Map<string, number>()
  for (const p of players) {
    ratings.set(p.id, p.startRating ?? ELO_DEFAULT)
    played.set(p.id, 0)
  }

  const ordered = matches
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => ratings.has(m.playerAId) && ratings.has(m.playerBId))
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || a.i - b.i)
    .map(({ m }) => m)

  const snapshots: EloSnapshot[] = []
  for (const m of ordered) {
    const a = ratings.get(m.playerAId)!
    const b = ratings.get(m.playerBId)!
    const sA = matchScore(m.gamesA, m.gamesB)
    const eA = expectedScore(a, b)
    const w = m.weight ?? 1
    const kA = (played.get(m.playerAId)! < ELO_SETTLE_MATCHES ? K_NEW : K_SETTLED) * w
    const kB = (played.get(m.playerBId)! < ELO_SETTLE_MATCHES ? K_NEW : K_SETTLED) * w
    const a2 = a + kA * (sA - eA)
    const b2 = b + kB * (1 - sA - (1 - eA))
    ratings.set(m.playerAId, a2)
    ratings.set(m.playerBId, b2)
    played.set(m.playerAId, played.get(m.playerAId)! + 1)
    played.set(m.playerBId, played.get(m.playerBId)! + 1)
    snapshots.push({
      matchId: m.id,
      before: { [m.playerAId]: a, [m.playerBId]: b },
      after: { [m.playerAId]: a2, [m.playerBId]: b2 },
    })
  }
  return { ratings, played, snapshots }
}
