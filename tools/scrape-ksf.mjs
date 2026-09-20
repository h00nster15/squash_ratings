// Scrape Korean squash tournament results from the 대한체육회 results portal
// (https://result.sports.or.kr/SQ/) into data/ksf/.
//
//   node tools/scrape-ksf.mjs            # all tournaments
//   node tools/scrape-ksf.mjs 2025 2026  # only tournaments starting in these years
//
// Flow, mirroring the site's own pages:
//   INF201.do (list)  -> tournaments        (classCd, toCd)
//   INF202.do (detail)-> divisions          (kindCd, detailClassCd)
//   api/tourplayers.do-> participants       (idNo, birthYear, teamNm, sidoNm)
//   api/schedules.do  -> matches            (korNmL/R, scoreL/R, winnerGb, rhNm)
// Matches carry names only, so each name is resolved to an idNo through the
// division's participant list.

import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://result.sports.or.kr/SQ'
const CLASS_CD = '41' // 스쿼시
const OUT_DIR = path.resolve('data/ksf')
const DELAY_MS = 150

const years = process.argv.slice(2)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

async function postForm(page, params) {
  await sleep(DELAY_MS)
  const res = await fetch(`${BASE}/${page}.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  if (!res.ok) throw new Error(`${page} ${res.status}`)
  return res.text()
}

async function postJson(endpoint, body) {
  await sleep(DELAY_MS)
  const res = await fetch(`${BASE}/api/${endpoint}.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`api/${endpoint} ${res.status}`)
  return res.json()
}

async function listTournaments() {
  const out = new Map()
  for (let pageIndex = 1; ; pageIndex++) {
    const html = await postForm('INF201', { classCd: CLASS_CD, toCd: '', pageIndex })
    let found = 0
    for (const row of html.split('<tr').slice(1)) {
      const m = row.match(/fnEventInfo\('(\d+)', '(\d+)'\)/)
      if (!m) continue
      found++
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]))
      const [, name, place, period, status] = cells
      const [start, end] = parsePeriod(period)
      out.set(m[2], { toCd: m[2], name, place, start, end, status })
    }
    const total = Number(html.match(/총게시물\s*(\d+)건/)?.[1] ?? 0)
    if (!found || out.size >= total) break
  }
  return [...out.values()]
}

/** "2026.08.12  ~  08.15" -> ["2026-08-12", "2026-08-15"] */
function parsePeriod(period) {
  const m = period.match(/(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(?:(\d{4})\.)?(\d{2})\.(\d{2})/)
  if (!m) return [null, null]
  const start = `${m[1]}-${m[2]}-${m[3]}`
  const end = `${m[4] ?? m[1]}-${m[5]}-${m[6]}`
  return [start, end]
}

async function listDivisions(toCd) {
  const html = await postForm('INF202', { classCd: CLASS_CD, toCd, pageIndex: 1 })
  const divisions = []
  for (const row of html.split('<tr').slice(1)) {
    const m = row.match(/fnEventSchedule\('([^']*)',\s*'([^']*)'\)/)
    if (!m) continue
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]))
    divisions.push({
      kindCd: m[1],
      detailClassCd: m[2],
      kindNm: cells[0] ?? '',
      detailClassNm: cells[1] ?? '',
      format: cells[2] ?? '',
      entrants: Number((cells[3] ?? '').replace(/\D/g, '')) || 0,
    })
  }
  return divisions
}

function main() {
  return (async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    let tournaments = await listTournaments()
    if (years.length) tournaments = tournaments.filter((t) => years.includes(t.start?.slice(0, 4)))
    console.log(`${tournaments.length} tournaments`)

    const players = new Map() // idNo -> player
    const matches = []
    let unresolved = 0

    for (const t of tournaments) {
      const divisions = await listDivisions(t.toCd)
      let count = 0
      for (const d of divisions) {
        const key = { classCd: CLASS_CD, toCd: t.toCd, kindCd: d.kindCd, detailClassCd: d.detailClassCd }
        const [entrants, schedule] = await Promise.all([
          postJson('tourplayers', key).catch(() => []),
          postJson('schedules', key).catch(() => []),
        ])

        // Name -> idNo within this division. A name shared by two entrants is ambiguous.
        const byName = new Map()
        for (const p of entrants) {
          if (!p.idNo) continue
          byName.set(p.korNm, byName.has(p.korNm) ? null : p.idNo)
          if (!players.has(p.idNo)) {
            players.set(p.idNo, {
              idNo: p.idNo,
              name: p.korNm,
              birthYear: p.birthYear ? Number(p.birthYear) : null,
              sex: p.sexNm ?? null,
              teams: [],
              sido: p.sidoNm ?? null,
            })
          }
          const rec = players.get(p.idNo)
          if (p.teamNm && !rec.teams.includes(p.teamNm)) rec.teams.push(p.teamNm)
        }

        for (const m of schedule) {
          if (!m.korNmL || !m.korNmR) continue
          const idA = byName.get(m.korNmL) ?? null
          const idB = byName.get(m.korNmR) ?? null
          if (!idA || !idB) unresolved++
          const gamesA = Number(m.scoreL)
          const gamesB = Number(m.scoreR)
          matches.push({
            tournament: t.name,
            toCd: t.toCd,
            // gameDate is usually "-" (fall back to the tournament start) and sometimes "2019.03.10".
            date: m.gameDate && m.gameDate !== '-' ? m.gameDate.replace(/\./g, '-') : t.start,
            division: d.kindNm,
            event: d.detailClassNm,
            format: m.maTypeNm ?? d.format,
            round: m.rhNm ?? null,
            playerA: m.korNmL,
            playerAId: idA,
            teamA: m.teamNmL ?? null,
            playerB: m.korNmR,
            playerBId: idB,
            teamB: m.teamNmR ?? null,
            gamesA: Number.isFinite(gamesA) ? gamesA : null,
            gamesB: Number.isFinite(gamesB) ? gamesB : null,
            winner: m.winnerGb === '1' ? 'A' : m.winnerGb === '2' ? 'B' : null,
          })
          count++
        }
      }
      console.log(`${t.start}  ${t.name}: ${divisions.length} divisions, ${count} matches`)
    }

    matches.sort((a, b) => a.date.localeCompare(b.date))
    fs.writeFileSync(path.join(OUT_DIR, 'tournaments.json'), JSON.stringify(tournaments, null, 2))
    fs.writeFileSync(path.join(OUT_DIR, 'players.json'), JSON.stringify([...players.values()], null, 2))
    fs.writeFileSync(path.join(OUT_DIR, 'matches.json'), JSON.stringify(matches, null, 2))
    fs.writeFileSync(path.join(OUT_DIR, 'matches.csv'), toCsv(matches))
    console.log(`\n${matches.length} matches, ${players.size} players -> ${OUT_DIR}`)
    if (unresolved) console.log(`${unresolved} matches have a player not matched to an idNo (name missing or duplicated in the entry list)`)
  })()
}

function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
