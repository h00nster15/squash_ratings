// Typed access to the prebuilt KSF dataset (tools/build-ladder.mts).
import ladderJson from '../data/ksf/ladder.json'
import matchesJson from '../data/ksf/matches-compact.json'
import { ABSENCE_DAYS } from './rating/squash.ts'

export interface PlayerInfo {
  id: string
  name: string
  birthYear: number | null
  sex: string | null
  team: string | null
  sido: string | null
  lastDivision: string | null
  /** Ladders the player has results on (open and/or student divisions). */
  ladders: string[]
}

/**
 * A player's current rating on one ladder (from the last 3 years of results
 * there) seen through one term: how far it moved inside that window and the
 * window's record.
 */
export interface TermEntry {
  id: string
  rating: number
  rd: number
  matches: number
  wins: number
  losses: number
  lastPlayed: string | null
  /** Rating after each tournament inside the term. */
  history: { date: string; rating: number }[]
  /** Rating change over the term; null for the primary (3-year) term. */
  delta: number | null
  termMatches: number
  termWins: number
  termLosses: number
}

export interface Term {
  label: string
  since: string
  entries: TermEntry[] // sorted by rating, descending
}

/**
 * One independently rated pool. `open` is the national ladder (일반부 draws
 * only); the others are the student divisions. Results never cross ladders.
 */
export interface Ladder {
  label: string
  matches: number
  terms: Record<string, Term>
}

export interface Tournament {
  toCd: string
  name: string
  date: string
}

/** One singles match; `l` is the ladder it was rated on, `da`/`db` each side's rating change over the whole tournament (null before the rating window). */
export interface CompactMatch {
  d: string
  t: string
  v: string
  l: string
  r: string | null
  a: string
  b: string
  ga: number
  gb: number
  da: number | null
  db: number | null
}

export const ladder = ladderJson as {
  builtAt: string
  ratingSince: string
  matches: number
  tournaments: Tournament[]
  players: PlayerInfo[]
  ladders: Record<string, Ladder>
}
export const matches = matchesJson as CompactMatch[]

export const LADDER_KEYS = Object.keys(ladder.ladders)
/** The national ladder. */
export const OPEN = LADDER_KEYS[0]
export const TERM_KEYS = Object.keys(ladder.ladders[OPEN].terms)
/** The term whose ratings are the ratings; the others only add a window Δ. */
export const PRIMARY = TERM_KEYS[0]
export const playersById = new Map(ladder.players.map((p) => [p.id, p]))
export const tournamentsById = new Map(ladder.tournaments.map((t) => [t.toCd, t]))

export const SEXES = ['남자', '여자'] as const
export type Sex = (typeof SEXES)[number]

/**
 * Players with no match since this date are shown dimmed (the engine also docks
 * their rating when they return — see ABSENCE_DAYS).
 */
export const ACTIVE_SINCE = (() => {
  const d = new Date(ladder.builtAt)
  d.setDate(d.getDate() - ABSENCE_DAYS)
  return d.toISOString().slice(0, 10)
})()

/** Uncertainty above which a rating is too loose to rank on. */
export const PROVISIONAL_RD = 200
/** On the national ladder a player also needs this many open-draw matches before the rating counts as settled. */
export const PROVISIONAL_MATCHES = 5

export const isActive = (e: TermEntry) => (e.lastPlayed ?? '') >= ACTIVE_SINCE
export const isProvisional = (ladderKey: string, e: TermEntry) =>
  e.rd > PROVISIONAL_RD || (ladderKey === OPEN && e.matches < PROVISIONAL_MATCHES)

/** Rank within sex over every rated player on a ladder; the same for every term. */
const rankCache = new Map<string, Map<string, number>>()
export function rankOf(ladderKey: string, id: string): number | null {
  let ranks = rankCache.get(ladderKey)
  if (!ranks) {
    ranks = new Map()
    const term = ladder.ladders[ladderKey]?.terms[PRIMARY]
    for (const sex of SEXES) {
      let n = 0
      for (const e of term?.entries ?? []) {
        if (playersById.get(e.id)?.sex !== sex) continue
        ranks.set(e.id, ++n)
      }
    }
    rankCache.set(ladderKey, ranks)
  }
  return ranks.get(id) ?? null
}

export function entryOf(ladderKey: string, termKey: string, id: string): TermEntry | undefined {
  return ladder.ladders[ladderKey]?.terms[termKey]?.entries.find((e) => e.id === id)
}
