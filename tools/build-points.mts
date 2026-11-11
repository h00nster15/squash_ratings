// Date the federation's ranking points, so they can be counted the PSA way.
//
//   node tools/build-points.mts
//
// Reads data/ksf/points.json (tools/scrape-ksf-points.mjs) and data/ksf/tournaments.json and
// writes data/ksf/points-history.json: every tournament that gave points, with its grade and
// end date, and every player's points per tournament. The app counts them two ways:
//   season  – the federation's own rule: a season's points, reset every 1 January
//   rolling – PSA style: each tournament's points count for one year from its end date
//
// The point lists carry no dates. Each 대회 label is matched to the tournament of that year
// in the results portal by name; the 전국체육대회 dates are the festival's own. A tournament
// the portal does not have gets the usual date of that event in other years, marked
// `estimated` so the page can say so.

import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve('data/ksf')
interface Entry { tournament: string; place: string; points: number }
interface Listed { personId: string; name: string; team: string; sex: string; kind: string; total: number }
const points: { seasons: Record<string, { players: Listed[]; lists: Record<string, Entry[]> }> } =
  JSON.parse(fs.readFileSync(path.join(DIR, 'points.json'), 'utf8'))
const portal: { toCd: string; name: string; end: string }[] = JSON.parse(fs.readFileSync(path.join(DIR, 'tournaments.json'), 'utf8'))

// The label without its grade: '코리아오픈(A)' → '코리아오픈', grade 'A'.
const split = (label: string) => {
  const m = label.match(/^(.*?)\(([A-Z])\)$/)
  return m ? { base: m[1].trim(), grade: m[2] } : { base: label.trim(), grade: null }
}

// How each event is named in the results portal.
const NAMES: Record<string, (n: string) => boolean> = {
  '대한체육회장배': (n) => /대한체육회장배 전국 스쿼시 선수권/.test(n),
  '실업선수권': (n) => /실업/.test(n) && !/단체전/.test(n),
  '실업선수권[단체전]': (n) => /실업/.test(n) && /단체전/.test(n),
  '전 한국': (n) => /전 한국/.test(n),
  '코리아오픈': (n) => /코리아\s?오픈/.test(n),
  '태산배': (n) => /태산배/.test(n),
  '회장배[전북]': (n) => /회장배\(전북\)|전북연맹회장배/.test(n),
  '학생선수권': (n) => /학생 스쿼시/.test(n),
}
// 전국체육대회 (개인전 and 단체전): the festival's last day.
const FESTIVAL: Record<string, string> = { '2023': '2023-10-19', '2024': '2024-10-17', '2025': '2025-10-23' }

type Source = 'portal' | 'festival' | 'estimated' | 'season-end'
const found = new Map<string, { date: string; source: Source; toCd?: string }>()
const labels = new Set<string>()
for (const [season, s] of Object.entries(points.seasons))
  for (const list of Object.values(s.lists)) for (const e of list) labels.add(`${season}|${e.tournament}`)

for (const key of labels) {
  const [season, label] = key.split('|')
  const { base } = split(label)
  if (/전국체육대회/.test(base) && FESTIVAL[season]) { found.set(key, { date: FESTIVAL[season], source: 'festival' }); continue }
  if (/국제랭킹포인트/.test(base)) { found.set(key, { date: `${season}-12-31`, source: 'season-end' }); continue }
  const test = NAMES[base]
  const hit = test && portal.filter((t) => t.end.startsWith(season) && test(t.name)).sort((a, b) => a.end.localeCompare(b.end))
  if (hit && hit.length) found.set(key, { date: hit[hit.length - 1].end, source: 'portal', toCd: hit[hit.length - 1].toCd })
}
// The rest: the median month-day of the same event in the years that are known.
const missing: string[] = []
for (const key of labels) {
  if (found.has(key)) continue
  const [season, label] = key.split('|')
  const { base } = split(label)
  const days = [...found.entries()].filter(([k]) => split(k.split('|')[1]).base === base).map(([, v]) => v.date.slice(5)).sort()
  const md = days.length ? days[Math.floor(days.length / 2)] : '12-31'
  found.set(key, { date: `${season}-${md}`, source: 'estimated' })
  missing.push(`${key} → ${season}-${md}`)
}

const tournaments = [...labels].sort((a, b) => found.get(a)!.date.localeCompare(found.get(b)!.date) || a.localeCompare(b)).map((key) => {
  const [season, label] = key.split('|')
  const { base, grade } = split(label)
  return { key, season: Number(season), label, name: base, grade, team: /단체전/.test(label), ...found.get(key)! }
})
const index = new Map(tournaments.map((t, i) => [t.key, i]))

// One row per player: the id is the federation's, stable across seasons; section per season.
const players = new Map<string, { id: string; name: string; sex: string; team: string; sections: Record<string, string> }>()
const entries: { p: string; t: number; place: string; points: number }[] = []
for (const [season, s] of Object.entries(points.seasons)) {
  for (const p of s.players) {
    const row = players.get(p.personId) ?? { id: p.personId, name: p.name, sex: p.sex, team: p.team, sections: {} }
    row.sections[season] = p.kind
    row.team = p.team || row.team
    players.set(p.personId, row)
  }
  for (const [id, list] of Object.entries(s.lists))
    for (const e of list) entries.push({ p: id, t: index.get(`${season}|${e.tournament}`)!, place: e.place, points: e.points })
}

const out = { built: new Date().toISOString().slice(0, 10), source: 'koreasquash.or.kr 국내랭킹', tournaments, players: [...players.values()], entries }
fs.writeFileSync(path.join(DIR, 'points-history.json'), JSON.stringify(out))
console.log(`${tournaments.length} tournaments (${tournaments.filter((t) => t.source === 'portal').length} dated from the results portal), ${players.size} players, ${entries.length} entries`)
if (missing.length) console.log('estimated dates:\n  ' + missing.join('\n  '))
