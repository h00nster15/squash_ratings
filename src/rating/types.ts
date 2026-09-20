export interface Player {
  id: string
  name: string
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
