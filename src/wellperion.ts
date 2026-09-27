// The Wellperion club's results, kept in the club's Google Sheet (Players / Matches tabs,
// the same ones its WSR ladder reads) and served by its Apps Script (ClubRatings.gs in
// ../wellperion-squash). One list of results, two ratings: WSR comes from the script, the
// national-scale rating is worked out here with the same engine as the national ladder.
import { org } from './org.ts'
import { blend, computeHybrid } from './rating/hybrid.ts'
import type { Match, Player } from './rating/types.ts'

export interface ClubPlayer {
  id: string
  /** 표시명; null for a player not public (공개 = N) when not signed in. */
  name: string | null
  /** 실명, only for a signed-in coach — the key the sheet uses. */
  realName?: string
  hidden: boolean
  kind: string
  division: string
  gender: string
  ageGroup: string
  ksfId: string | null
  wsr: number
  reliability: number
  counted: number
  provisional: boolean
}

export interface ClubMatch {
  id: string | null
  date: string
  winner: string
  loser: string
  score: string
  /** [winner's games, loser's games], or null when no score was logged. */
  games: [number, number] | null
  type: string
  event: string
  /** 전국 반영: rated in the national ladder too, once both players are linked to KSF. */
  national: boolean
}

export interface ClubData {
  ok: boolean
  admin: boolean
  players: ClubPlayer[]
  matches: ClubMatch[]
  updated: string
  /**
   * Each player's WSR just before and after every day they played, oldest first:
   * club id → [date, before, after][]. Absent from a script deployed before it existed.
   */
  wsrHistory?: Record<string, [string, number, number][]>
  error?: string
  needKey?: boolean
}

const store = (k: string) => `${org.storageKey}.club.${k}`
const read = (k: string) => {
  try {
    return localStorage.getItem(store(k)) || ''
  } catch {
    return ''
  }
}
const write = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(store(k), v)
    else localStorage.removeItem(store(k))
  } catch {
    // private mode: the session still works, it just isn't remembered
  }
}

/** The club password (RANKINGS_KEY) for viewing, and a coach's data token for editing. */
export const clubKey = { get: () => read('key'), set: (v: string) => write('key', v) }
export const clubToken = { get: () => read('token'), set: (v: string) => write('token', v) }

function url(action: string, extra: Record<string, string> = {}) {
  const u = new URL(org.clubSource!.execUrl)
  u.searchParams.set('action', action)
  for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v)
  return u.toString()
}

export async function fetchClub(): Promise<ClubData> {
  const res = await fetch(url('club-ratings', { key: clubKey.get(), token: clubToken.get() }))
  return (await res.json()) as ClubData
}

/** A coach signs in with the manager password; the script answers with the data token. */
export async function signIn(password: string): Promise<void> {
  const res = await fetch(url('app-login', { key: password }))
  const j = (await res.json()) as { ok: boolean; token?: string; error?: string }
  if (!j.ok || !j.token) throw new Error(j.error === 'Wrong password' ? '비밀번호가 맞지 않습니다.' : j.error || '로그인 실패')
  clubToken.set(j.token)
}

// Writes are POSTs with a text/plain JSON body, which Apps Script accepts without a CORS preflight.
async function post(action: string, body: Record<string, unknown>) {
  const res = await fetch(org.clubSource!.execUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: clubToken.get(), action, ...body }),
  })
  const j = (await res.json()) as { ok: boolean; error?: string; id?: string }
  if (!j.ok) throw new Error(j.error || '저장하지 못했습니다')
  return j
}

export const addClubMatch = (m: { date: string; winner: string; loser: string; score: string; type: string; event: string; national: boolean }) =>
  post('club-match', m)
export const setClubMatchNational = (id: string, national: boolean) => post('club-match-update', { id, national })
export const deleteClubMatch = (id: string) => post('club-match-update', { id, delete: true })
export const saveClubPlayer = (p: { name: string; ksfId?: string; kind?: string }) => post('club-player', p)

// --- National-scale rating from the same results ------------------------------

/** A result logged without a score counts as an ordinary win (3-1), like WSR does. */
export const gamesOf = (m: ClubMatch): [number, number] => m.games ?? [3, 1]

/** The engine's id for the i-th club match (a row without an ID still needs one). */
export const matchKey = (m: ClubMatch, i: number) => m.id ?? `m${i}`

export function nationalScale(players: ClubPlayer[], matches: ClubMatch[]) {
  const ps: Player[] = players.map((p) => ({ id: p.id, name: p.name ?? '' }))
  const ms: Match[] = matches.map((m, i) => {
    const [a, b] = gamesOf(m)
    return { id: matchKey(m, i), date: m.date, playerAId: m.winner, playerBId: m.loser, gamesA: a, gamesB: b }
  })
  return computeHybrid(ps, ms)
}

/** One day a player played: their rating going in and coming out. */
export interface DayChange {
  date: string
  before: number
  after: number
}

/**
 * A player's national-scale rating before and after each day they played, oldest first.
 * The Glicko half updates once per day (all of a day's matches together), the Elo half
 * match by match, so a day is the smallest step both halves agree on.
 */
export function nationalHistory(nat: ReturnType<typeof nationalScale>, matches: ClubMatch[], playerId: string): DayChange[] {
  const glicko = new Map(nat.glicko.snapshots.map((s) => [s.matchId, s]))
  const elo = new Map(nat.elo.snapshots.map((s) => [s.matchId, s]))
  const days: DayChange[] = []
  matches.forEach((m, i) => {
    if (m.winner !== playerId && m.loser !== playerId) return
    const g = glicko.get(matchKey(m, i))
    const e = elo.get(matchKey(m, i))
    if (!g || !e) return
    const after = blend(g.after[playerId].rating, e.after[playerId])
    const last = days[days.length - 1]
    if (last?.date === m.date) last.after = after
    else days.push({ date: m.date, before: blend(g.before[playerId].rating, e.before[playerId]), after })
  })
  return days
}

export const wsrHistory = (data: ClubData, playerId: string): DayChange[] =>
  (data.wsrHistory?.[playerId] ?? []).map(([date, before, after]) => ({ date, before, after }))

/**
 * WSR → national scale, fitted by least squares on players with enough results in both
 * (WSR reliability ≥ 50% and at least 3 matches). Null until 5 such players exist.
 */
export function fitScales(pairs: { wsr: number; rating: number }[]) {
  if (pairs.length < 5) return null
  const n = pairs.length
  const mx = pairs.reduce((a, p) => a + p.wsr, 0) / n
  const my = pairs.reduce((a, p) => a + p.rating, 0) / n
  const sxx = pairs.reduce((a, p) => a + (p.wsr - mx) ** 2, 0)
  if (sxx < 1e-6) return null
  const slope = pairs.reduce((a, p) => a + (p.wsr - mx) * (p.rating - my), 0) / sxx
  if (!(slope > 0)) return null // the two scales disagree on direction: no honest conversion
  const intercept = my - slope * mx
  const ssTot = pairs.reduce((a, p) => a + (p.rating - my) ** 2, 0)
  const ssRes = pairs.reduce((a, p) => a + (p.rating - (intercept + slope * p.wsr)) ** 2, 0)
  return {
    slope,
    intercept,
    /** How well one scale predicts the other, 0–1. */
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    players: n,
    toRating: (wsr: number) => intercept + slope * wsr,
    toWsr: (rating: number) => (rating - intercept) / slope,
  }
}
