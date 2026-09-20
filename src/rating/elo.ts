/**
 * Elo, updated match by match in the order played.
 *
 * Kept deliberately plain: expected score on the usual 400-point logistic
 * scale, and a K-factor that scales with the match weight (a best-of-3
 * moves a rating less than a best-of-5) and shrinks once a player has a
 * record, so newcomers settle quickly and veterans do not swing.
 *
 * Closed-pool ceilings (Match.cap) and the absence rule apply exactly as in
 * computeRatings: after a capped draw a player cannot rate above the cap, or
 * above the best uncapped opponent they have beaten plus ADULT_WIN_MARGIN; a
 * player back after more than ABSENCE_DAYS re-enters ABSENCE_PENALTY lower.
 */
import { ABSENCE_DAYS, ABSENCE_PENALTY, ADULT_WIN_MARGIN, matchScore } from './squash.ts'
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

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Replay `matches` (date order, then the order given) and return every player's Elo. */
export function computeElo(players: Player[], matches: Match[]): EloHistory {
  const ratings = new Map<string, number>()
  const played = new Map<string, number>()
  const lastPlayed = new Map<string, string>()
  for (const p of players) {
    ratings.set(p.id, p.startRating ?? ELO_DEFAULT)
    played.set(p.id, 0)
  }

  const ordered = matches
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => ratings.has(m.playerAId) && ratings.has(m.playerBId))
    .sort((a, b) => a.m.date.localeCompare(b.m.date) || a.i - b.i)
    .map(({ m }) => m)

  const capLevel = new Map<string, number>()
  const bestAdultWin = new Map<string, number>()
  const clamp = (id: string, r: number) => {
    const cap = capLevel.get(id)
    if (cap === undefined) return r
    const earned = bestAdultWin.has(id) ? bestAdultWin.get(id)! + ADULT_WIN_MARGIN : -Infinity
    return Math.min(r, Math.max(cap, earned))
  }

  const snapshots: EloSnapshot[] = []
  for (const m of ordered) {
    // Absence penalty on the first match back; the snapshot's "before" is the rating as it stood.
    for (const id of [m.playerAId, m.playerBId]) {
      const last = lastPlayed.get(id)
      if (last && daysBetween(last, m.date) > ABSENCE_DAYS) ratings.set(id, ratings.get(id)! - ABSENCE_PENALTY)
    }
    const a = ratings.get(m.playerAId)!
    const b = ratings.get(m.playerBId)!
    const sA = matchScore(m.gamesA, m.gamesB)
    const eA = expectedScore(a, b)
    const w = m.weight ?? 1
    const kA = (played.get(m.playerAId)! < ELO_SETTLE_MATCHES ? K_NEW : K_SETTLED) * w
    const kB = (played.get(m.playerBId)! < ELO_SETTLE_MATCHES ? K_NEW : K_SETTLED) * w
    const winner = m.gamesA > m.gamesB ? m.playerAId : m.gamesB > m.gamesA ? m.playerBId : null
    if (m.cap !== undefined) for (const id of [m.playerAId, m.playerBId]) capLevel.set(id, m.cap)
    if (winner && m.cap === undefined) {
      const beaten = winner === m.playerAId ? b : a
      if (beaten > (bestAdultWin.get(winner) ?? -Infinity)) bestAdultWin.set(winner, beaten)
    }
    const a2 = clamp(m.playerAId, a + kA * (sA - eA))
    const b2 = clamp(m.playerBId, b + kB * (1 - sA - (1 - eA)))
    ratings.set(m.playerAId, a2)
    ratings.set(m.playerBId, b2)
    played.set(m.playerAId, played.get(m.playerAId)! + 1)
    played.set(m.playerBId, played.get(m.playerBId)! + 1)
    lastPlayed.set(m.playerAId, m.date)
    lastPlayed.set(m.playerBId, m.date)
    snapshots.push({
      matchId: m.id,
      before: { [m.playerAId]: a, [m.playerBId]: b },
      after: { [m.playerAId]: a2, [m.playerBId]: b2 },
    })
  }
  return { ratings, played, snapshots }
}
