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
}
