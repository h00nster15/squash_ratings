// Reading a spreadsheet of club results for the coach's Excel import (WellperionRatings →
// CoachTools → ClubImport). Pure functions over the rows SheetJS gives back, so the rules —
// which column is which, what a date or a score looks like, which rows are already in the
// sheet — can be checked without a browser. SheetJS itself is loaded only when a file is picked.
import type { ClubMatch, ClubPlayer } from './wellperion.ts'

export type Cell = string | number | boolean | Date | null | undefined
export type Field = 'date' | 'winner' | 'loser' | 'playerA' | 'playerB' | 'score' | 'type' | 'event' | 'national'
export type Mapping = Partial<Record<Field, number>>
/** 'wl': a winner column and a loser column. 'ab': two player columns and a score from A's side. */
export type Mode = 'wl' | 'ab'

export const FIELD_LABEL: Record<Field, string> = {
  date: '일자',
  winner: '승자',
  loser: '패자',
  playerA: '선수 A',
  playerB: '선수 B',
  score: '스코어',
  type: '유형',
  event: '이벤트',
  national: '전국 반영',
}

// Header words per field, compared with spaces removed and lower-cased.
const ALIASES: Record<Field, string[]> = {
  date: ['일자', '날짜', '경기일', '경기일자', 'date', 'day'],
  winner: ['승자', '이긴선수', '승리', '승리자', 'winner', 'won'],
  loser: ['패자', '진선수', '패배', '패배자', 'loser', 'lost'],
  playerA: ['선수a', '선수1', '선수', '홈', 'playera', 'player1', 'player', 'home'],
  playerB: ['선수b', '선수2', '상대', '상대선수', '어웨이', 'playerb', 'player2', 'opponent', 'away'],
  score: ['스코어', '점수', '결과', '게임스코어', 'score', 'result'],
  type: ['유형', '구분', '종류', '경기유형', 'type', 'kind'],
  event: ['이벤트', '대회', '대회명', '리그명', 'event', 'tournament'],
  national: ['전국반영', '전국', '국가반영', 'national'],
}

const norm = (v: Cell) => String(v ?? '').replace(/\s+/g, '').toLowerCase()
export const text = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim())

/** The header row: the first of the top 15 rows where at least two cells name a field. */
export function findHeader(rows: Cell[][]): number {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const hits = rows[r].filter((c) => Object.values(ALIASES).some((a) => a.includes(norm(c)))).length
    if (hits >= 2) return r
  }
  return 0
}

/** Which column holds which field, from the header words; exact words win over partial ones. */
export function guessMapping(headers: Cell[]): { mapping: Mapping; mode: Mode } {
  const mapping: Mapping = {}
  const used = new Set<number>()
  const fields = Object.keys(ALIASES) as Field[]
  for (const exact of [true, false]) {
    for (const f of fields) {
      if (mapping[f] !== undefined) continue
      const i = headers.findIndex((h, j) => {
        if (used.has(j) || !norm(h)) return false
        return ALIASES[f].some((a) => (exact ? norm(h) === a : norm(h).includes(a) && a.length >= 2))
      })
      if (i >= 0) {
        mapping[f] = i
        used.add(i)
      }
    }
  }
  const mode: Mode = mapping.winner !== undefined && mapping.loser !== undefined ? 'wl' : mapping.playerA !== undefined && mapping.playerB !== undefined ? 'ab' : 'wl'
  return { mapping, mode }
}

/** A date cell → YYYY-MM-DD. Excel day numbers, Date objects, 2026-09-03, 2026.9.3, 26.9.3, 9/3/2026. */
export function toDate(v: Cell, parseSerial?: (n: number) => { y: number; m: number; d: number } | null): string {
  const iso = (y: number, m: number, d: number) =>
    y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : ''
  if (v instanceof Date) return isNaN(+v) ? '' : iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') {
    const p = parseSerial?.(v)
    return p ? iso(p.y, p.m, p.d) : ''
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})$/)
  if (m) return iso(2000 + +m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return iso(+m[3], +m[1], +m[2])
  return ''
}

const pairs = (score: string) => (score.match(/\d+\s*[-:]\s*\d+/g) || []).map((p) => p.split(/[-:]/).map((n) => Number(n.trim())) as [number, number])

/**
 * Games won by the first-named side and the second, from "3-1" or "11-7 9-11 11-5 11-8";
 * null when there is no score or no winner (a draw, a blank).
 */
export function gamesOfScore(score: string): [number, number] | null {
  const ps = pairs(score)
  if (!ps.length) return null
  if (ps.every(([x, y]) => Math.max(x, y) >= 5)) {
    const a = ps.filter(([x, y]) => x > y).length
    const b = ps.filter(([x, y]) => y > x).length
    return a === b ? null : [a, b]
  }
  const [x, y] = ps[0]
  return x === y || Math.max(x, y) > 3 ? null : [x, y]
}

/** The same score from the other side: "9-11 11-7" → "11-9 7-11". */
export const flipScore = (score: string) => score.replace(/(\d+)(\s*[-:]\s*)(\d+)/g, (_, a, sep, b) => `${b}${sep}${a}`)

export function typeOf(v: Cell): string {
  const s = norm(v)
  if (/리그|league/.test(s)) return 'league'
  if (/대회|토너먼트|tournament/.test(s)) return 'tournament'
  if (/연습|practice|친선/.test(s)) return 'practice'
  return 'challenge'
}

export const nationalOf = (v: Cell) => v === true || /^(y|yes|o|예|✓|true|1)$/i.test(text(v))

export interface ImportRow {
  /** Row number in the spreadsheet (1-based, as Excel shows it). */
  line: number
  date: string
  winner: string
  loser: string
  score: string
  type: string
  event: string
  national: boolean
  /** Names as written that match no player (after spaces are ignored). */
  unknown: string[]
  status: 'ok' | 'duplicate' | 'error'
  message: string
}

/**
 * Turns the data rows into results. Names are matched to the roster ignoring spaces; a
 * name in `adding` counts as known (it will be created first). A result already in the
 * sheet — same day, same winner and loser, same score — is marked duplicate.
 */
export function buildRows(
  rows: Cell[][],
  header: number,
  mapping: Mapping,
  mode: Mode,
  roster: ClubPlayer[],
  existing: ClubMatch[],
  adding: Set<string>,
  parseSerial?: (n: number) => { y: number; m: number; d: number } | null,
): ImportRow[] {
  const byNorm = new Map(roster.filter((p) => p.realName).map((p) => [norm(p.realName!), p.realName!]))
  const idToName = new Map(roster.map((p) => [p.id, p.realName ?? '']))
  const key = (d: string, w: string, l: string, s: string) => [d, w, l, norm(s)].join('|')
  const seen = new Set(existing.map((m) => key(m.date, idToName.get(m.winner) ?? '', idToName.get(m.loser) ?? '', m.score)))
  const cell = (r: Cell[], f: Field) => (mapping[f] === undefined ? '' : r[mapping[f]!])

  const out: ImportRow[] = []
  rows.forEach((r, i) => {
    if (i <= header || r.every((c) => !text(c))) return
    const nameOf = (raw: string) => byNorm.get(norm(raw)) ?? (adding.has(raw) ? raw : null)
    let a = text(cell(r, mode === 'wl' ? 'winner' : 'playerA'))
    let b = text(cell(r, mode === 'wl' ? 'loser' : 'playerB'))
    let score = text(cell(r, 'score'))
    const row: ImportRow = {
      line: i + 1,
      date: toDate(cell(r, 'date'), parseSerial),
      winner: a,
      loser: b,
      score,
      type: typeOf(cell(r, 'type')),
      event: text(cell(r, 'event')),
      national: nationalOf(cell(r, 'national')),
      unknown: [],
      status: 'ok',
      message: '',
    }
    const fail = (message: string) => out.push({ ...row, status: 'error', message })
    if (!a || !b) return fail(mode === 'wl' ? '승자 또는 패자가 비어 있습니다' : '선수 이름이 비어 있습니다')
    if (mode === 'ab') {
      // Score is from A's side; whoever took more games won, and the score is stored from the winner's side.
      const g = gamesOfScore(score)
      if (!g) return fail('스코어로 승자를 알 수 없습니다')
      if (g[1] > g[0]) {
        ;[a, b] = [b, a]
        score = flipScore(score)
      }
      row.winner = a
      row.loser = b
      row.score = score
    }
    const w = nameOf(a)
    const l = nameOf(b)
    row.unknown = [!w ? a : '', !l ? b : ''].filter(Boolean)
    if (!row.date) return fail(`일자를 읽지 못했습니다 (${text(cell(r, 'date')) || '빈칸'})`)
    if (row.unknown.length) return fail(`명단에 없는 선수: ${row.unknown.join(', ')}`)
    if (w === l) return fail('두 선수가 같습니다')
    row.winner = w!
    row.loser = l!
    const k = key(row.date, row.winner, row.loser, row.score)
    if (seen.has(k)) {
      out.push({ ...row, status: 'duplicate', message: '이미 시트에 있는 결과' })
      return
    }
    seen.add(k) // the same result twice in the file counts once
    out.push(row)
  })
  return out
}
