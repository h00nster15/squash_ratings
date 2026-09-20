export interface Player {
  id: string
  name: string
  /** Initial rating if not the default 1500 (e.g. a junior handicap). */
  startRating?: number
}

export interface Match {
  id: string
  /** ISO date (YYYY-MM-DD). Matches on the same day form one rating period. */
  date: string
  playerAId: string
  playerBId: string
  /** Games won by each side, e.g. 3 and 1 for a 3-1 result. */
  gamesA: number
  gamesB: number
  /** Set when the match was played as part of a tournament. */
  tournamentId?: string
  round?: string
  /** How much of a match this counts as for rating (default 1); see GameResult.weight. */
  weight?: number
  /**
   * Ceiling for ratings earned in this draw. A player whose matches in a rating
   * period all carry a cap cannot leave the period above the lowest of them —
   * dominating a closed junior pool cannot read as adult strength.
   */
  cap?: number
}

export type TournamentFormat = 'roundrobin' | 'knockout'

export interface Tournament {
  id: string
  name: string
  /** ISO date; every match in the tournament is rated in this period. */
  date: string
  format: TournamentFormat
  division?: string
  entrantIds: string[]
}
