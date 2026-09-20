// Typed access to the prebuilt KSF dataset (tools/build-ladder.mts).
import ladderJson from '../data/ksf/ladder.json'
import matchesJson from '../data/ksf/matches-compact.json'

export interface PlayerInfo {
  id: string
  name: string
  birthYear: number | null
  sex: string | null
  team: string | null
  sido: string | null
  startRating: number
  lastDivision: string | null
}

/** A player's rating computed from one term's results. */
export interface TermEntry {
  id: string
  rating: number
  rd: number
  matches: number
  wins: number
  losses: number
  lastPlayed: string | null
  history: { date: string; rating: number }[]
}

export interface Term {
  label: string
  since: string | null
  entries: TermEntry[] // sorted by rating, descending
}

export interface Tournament {
  toCd: string
  name: string
  date: string
}

/** One singles match; `da`/`db` are each side's all-time rating change over the whole tournament. */
export interface CompactMatch {
  d: string
  t: string
  v: string
  r: string | null
  a: string
  b: string
  ga: number
  gb: number
  da: number
  db: number
}

export const ladder = ladderJson as {
  builtAt: string
  matches: number
  tournaments: Tournament[]
  players: PlayerInfo[]
  terms: Record<string, Term>
}
export const matches = matchesJson as CompactMatch[]

export const TERM_KEYS = Object.keys(ladder.terms)
export const playersById = new Map(ladder.players.map((p) => [p.id, p]))
export const tournamentsById = new Map(ladder.tournaments.map((t) => [t.toCd, t]))

export const SEXES = ['남자', '여자'] as const
export type Sex = (typeof SEXES)[number]

/** Players who have not competed since this date are hidden from the all-time ladder unless asked for. */
export const ACTIVE_SINCE = (() => {
  const d = new Date(ladder.builtAt)
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
})()

/** RD above which a rating is too uncertain to rank on. */
export const PROVISIONAL_RD = 200

export const isActive = (e: TermEntry) => (e.lastPlayed ?? '') >= ACTIVE_SINCE

/** Rank within sex for a term, over the same population the ladder shows by default. */
const rankCache = new Map<string, Map<string, number>>()
export function rankOf(termKey: string, id: string): number | null {
  let ranks = rankCache.get(termKey)
  if (!ranks) {
    ranks = new Map()
    const term = ladder.terms[termKey]
    for (const sex of SEXES) {
      let n = 0
      for (const e of term.entries) {
        if (playersById.get(e.id)?.sex !== sex) continue
        if (termKey === 'all' && !isActive(e)) continue
        ranks.set(e.id, ++n)
      }
    }
    rankCache.set(termKey, ranks)
  }
  return ranks.get(id) ?? null
}

export function entryOf(termKey: string, id: string): TermEntry | undefined {
  return ladder.terms[termKey]?.entries.find((e) => e.id === id)
}
