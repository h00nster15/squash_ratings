// Scrape the 대한스쿼시연맹 ranking points (koreasquash.or.kr → 대회정보 → 국내랭킹) into
// data/ksf/points.json: for every season, the players in each section (남/여 × 일반부/대학부)
// and each player's list of points per tournament (대회 with its grade, 순위, 포인트).
//
//   node tools/scrape-ksf-points.mjs              # seasons 2021 to this year
//   node tools/scrape-ksf-points.mjs 2025 2026    # only these seasons
//
// The site is EUC-KR: form values go out percent-encoded in CP949 and pages come back in
// it, so both directions go through TextDecoder('euc-kr') / a small CP949 encoder.
// The point lists carry no dates; tools/build-points.mts matches them to tournaments.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = 'http://www.koreasquash.or.kr'
const OUT = path.resolve('data/ksf/points.json')
const DELAY_MS = 200
const SECTIONS = [['남', '일반부'], ['남', '대학부'], ['여', '일반부'], ['여', '대학부']]

const thisYear = new Date().getFullYear()
const seasons = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : Array.from({ length: thisYear - 2020 }, (_, i) => 2021 + i)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const decode = (buf) => new TextDecoder('euc-kr').decode(buf)
const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
// Node has no CP949 encoder; iconv (Git for Windows ships one) does the few Korean form values.
const cp949 = (s) => [...execFileSync('iconv', ['-f', 'utf-8', '-t', 'cp949'], { input: s })]
  .map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('')

async function get(url, body) {
  await sleep(DELAY_MS)
  const res = await fetch(BASE + url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
    : undefined)
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return decode(await res.arrayBuffer())
}

// A row's cells; the point lists put the 순번 in a <th>.
const cells = (row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => m[1])

// One section's table: 순위 · 이전(변동) · 성명 (with the personId link) · Point · 소속 · 부문.
async function section(season, sex, kind) {
  const html = await get('/ranking.asp', `sex=${cp949(sex)}&kind=${cp949(kind)}&season=${season}&mm=12`)
  const out = []
  for (const row of html.split('<tr').slice(1)) {
    const id = row.match(/ajaxPersonPointList\.asp\?personId=(\d+)/)
    if (!id) continue
    const c = cells(row).map(clean)
    out.push({ personId: id[1], rank: Number(c[0]) || null, name: c[2], total: Number(c[3]) || 0, team: c[4], sex, kind })
  }
  return out
}

// One player's season: 순번 · 대회 · 순위 · 포인트.
async function pointList(personId, season) {
  const html = await get(`/ajaxPersonPointList.asp?personId=${personId}&season=${season}`)
  const out = []
  for (const row of html.split('<tr').slice(1)) {
    const c = cells(row).map(clean)
    if (c.length < 4 || !/^\d+$/.test(c[0])) continue
    out.push({ tournament: c[1], place: c[2], points: Number(c[3]) || 0 })
  }
  return out
}

const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { source: `${BASE}/ranking.asp`, seasons: {} }
for (const season of seasons) {
  const players = []
  for (const [sex, kind] of SECTIONS) players.push(...await section(season, sex, kind))
  const lists = {}
  for (const p of players) {
    if (!lists[p.personId]) lists[p.personId] = await pointList(p.personId, season)
  }
  data.seasons[season] = { fetched: new Date().toISOString().slice(0, 10), players, lists }
  const entries = Object.values(lists).reduce((a, l) => a + l.length, 0)
  console.log(`${season}: ${players.length} players, ${entries} point entries`)
}
fs.writeFileSync(OUT, JSON.stringify(data, null, 1))
console.log('wrote', path.relative(process.cwd(), OUT))
