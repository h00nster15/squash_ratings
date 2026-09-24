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
// Codes are read out of the page's own HTML, so they arrive escaped. A few draws
// really are keyed by an apostrophe (kindCd "'"), which the portal writes as
// &#039;; sent back to the API unescaped, those draws answer empty.
const unescapeHtml = (s) =>
  String(s ?? '').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

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
      kindCd: unescapeHtml(m[1]),
      detailClassCd: unescapeHtml(m[2]),
      kindNm: cells[0] ?? '',
      detailClassNm: cells[1] ?? '',
      format: cells[2] ?? '',
      entrants: Number((cells[3] ?? '').replace(/\D/g, '')) || 0,
    })
  }
  return divisions
}

/**
 * Every (대회, 종별, 세부종목, 경기구분) one 등록번호 appears in, from the portal's
 * 대회참가이력 page. Match rows name players but never identify them — 개인전 rows
 * carry no team either — so when a draw holds two entrants of the same name, this
 * is what tells them apart.
 */
const historyCache = new Map()
async function appearances(idNo) {
  if (historyCache.has(idNo)) return historyCache.get(idNo)
  const out = new Set()
  try {
    const html = await postForm('INF503', { classCd: CLASS_CD, idNo, pageIndex: 1 })
    let tournament = null
    for (const row of html.slice(html.indexOf('대회참가이력')).split('<tr').slice(1)) {
      const title = row.match(/<strong>([\s\S]*?)<\/strong>/)
      if (title) { tournament = clean(title[1]); continue }
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]))
      if (tournament && cells.length >= 3) out.add([tournament, cells[0], cells[1], cells[2]].join('|'))
    }
  } catch { /* no history page: the name stays unresolved */ }
  historyCache.set(idNo, out)
  return out
}

/** How deep in a knockout a round sits: 결승 1, 준결승 2, 준준결승 3 …, 예선 last. */
function drawDepth(round) {
  if (!round) return null
  if (/^결승/.test(round)) return 1
  const m = round.match(/^(준+)결승/)
  if (m) return m[1].length + 1
  return /^예선/.test(round) ? 99 : null
}

/** Majority sex and age band of an entry list, or null if it has no usable entrants. */
function inferDraw(entrants, startDate) {
  const year = Number((startDate ?? '').slice(0, 4))
  const withInfo = entrants.filter((p) => p.sexNm && p.birthYear)
  if (!year || !withInfo.length) return null
  const men = withInfo.filter((p) => p.sexNm === '남자').length
  const sex = men * 2 >= withInfo.length ? '남자' : '여자'
  const oldest = Math.max(...withInfo.map((p) => year - Number(p.birthYear)))
  const band = oldest <= 12 ? '12세이하부' : oldest <= 15 ? '15세이하부' : oldest <= 18 ? '18세이하부' : '일반부'
  return { sex, band, mixed: men > 0 && men < withInfo.length }
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

        // The portal's labels are unreliable for older events: 2018–2022 draws are
        // named "GU11 P" (that one is the men's open), and 2018–2021 student events
        // have men under "여자 …부" and vice versa. When the label is not a real
        // 남자/여자 …부 name, or its sex disagrees with the entrants, relabel from the
        // entrants: age band of the oldest entrant that year, and — because such a
        // draw can hold both sexes — the sex of each match's own two players.
        const draw = inferDraw(entrants, t.start)
        // A label is only usable when it names both sex and age band ("여자 일반부").
        // Open events are often listed as a bare "남자부" / "여자부"; those get the
        // band from the entrants like any other unlabelled draw.
        const labelSex = d.kindNm.match(/^(남자|여자)\s+\S*부/)?.[1] ?? null
        const trustLabel = labelSex !== null && (!draw || draw.sex === labelSex && !draw.mixed)
        const sexOf = new Map(entrants.map((p) => [p.idNo, p.sexNm]))
        const divisionFor = (idA, idB) => {
          if (trustLabel || !draw) return d.kindNm
          const sexes = [sexOf.get(idA), sexOf.get(idB)].filter(Boolean)
          const sex = sexes.length && sexes.every((x) => x === sexes[0]) ? sexes[0] : draw.sex
          return `${sex} ${draw.band}`
        }

        // Name -> the entrants carrying it in this division; two people can share one.
        const byName = new Map()
        for (const p of entrants) {
          if (!p.idNo) continue
          byName.set(p.korNm, [...(byName.get(p.korNm) ?? []), p.idNo])
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

        // One side of a match: the entrants of that name who, by their own
        // 대회참가이력, played this very round of this draw.
        const candidates = async (name, round) => {
          const ids = byName.get(name) ?? []
          if (ids.length < 2) return ids
          const key = [t.name, d.kindNm, d.detailClassNm, round].join('|')
          const hits = []
          for (const id of ids) if ((await appearances(id)).has(key)) hits.push(id)
          return hits
        }
        /** Of two entrants in one match, the one who played a later round won it. */
        const advanced = async (ids, round) => {
          const depth = drawDepth(round)
          if (depth === null) return null
          const prefix = [t.name, d.kindNm, d.detailClassNm, ''].join('|')
          const reached = []
          for (const id of ids) {
            const depths = [...(await appearances(id))]
              .filter((k) => k.startsWith(prefix))
              .map((k) => drawDepth(k.split('|')[3]))
              .filter((x) => x !== null && x < depth)
            reached.push(depths.length ? Math.min(...depths) : null)
          }
          const best = Math.min(...reached.filter((x) => x !== null))
          const winners = ids.filter((_, i) => reached[i] === best)
          return winners.length === 1 ? winners[0] : null
        }

        for (const m of schedule) {
          if (!m.korNmL || !m.korNmR) continue
          let [a, b] = await Promise.all([candidates(m.korNmL, m.rhNm), candidates(m.korNmR, m.rhNm)])
          // The same name on both sides: those two candidates ARE the two players,
          // and the one who went on to a later round won this match.
          if (m.korNmL === m.korNmR && a.length === 2 && b.length === 2) {
            const winner = await advanced(a, m.rhNm)
            const loser = winner ? a.find((id) => id !== winner) : null
            if (winner && loser) {
              const leftWon = Number(m.scoreL) > Number(m.scoreR)
              a = [leftWon ? winner : loser]
              b = [leftWon ? loser : winner]
            }
          }
          const idA = a.length === 1 ? a[0] : null
          const idB = b.length === 1 ? b[0] : null
          if (!idA || !idB) unresolved++
          const gamesA = Number(m.scoreL)
          const gamesB = Number(m.scoreR)
          matches.push({
            tournament: t.name,
            toCd: t.toCd,
            // gameDate is usually "-" (fall back to the tournament start) and sometimes "2019.03.10".
            date: m.gameDate && m.gameDate !== '-' ? m.gameDate.replace(/\./g, '-') : t.start,
            division: divisionFor(idA, idB),
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
