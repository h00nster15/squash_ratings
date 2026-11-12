// Scrape the squash singles of the 전국체육대회 (national sports festival) into
// data/ksf/festival.json. The festival is not on the results portal scrape-ksf.mjs
// reads; 대한체육회 runs it on meet.sports.or.kr:
//   /history/   past festivals (제102회 2021 …), by 회차
//   /national/  the current one, until it moves into the history site
//
//   node tools/scrape-festival.mjs              # 제102회 (2021) to the current one
//   node tools/scrape-festival.mjs 105 106 107  # only these 회차
//
// Matches carry names, 시도 and 소속 but no 등록번호; build-ladder.mts matches each
// name to a player in the KSF data. Team events are skipped (singles only).

import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://meet.sports.or.kr'
const CLASS_CD = '41' // 스쿼시
const FIRST = 102 // 2021; 제101회 (2020) was cancelled
const OUT = path.resolve('data/ksf/festival.json')
const DELAY_MS = 150

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
// The site writes round numbers in full-width digits (예선경기１), like the KSF portal.
const halfWidth = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))

async function request(url, init) {
  await sleep(DELAY_MS)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init)
      if (!res.ok) throw new Error(`${url} ${res.status}`)
      return res
    } catch (e) {
      if (attempt >= 3) throw e
      await sleep(1000 * attempt)
    }
  }
}
const postJson = async (p, body) =>
  (await request(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) })).json()
const postForm = async (p, params) =>
  (await request(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })).text()
const get = async (p, params) => (await request(`${BASE}${p}?${new URLSearchParams(params)}`)).text()

/** 회차 → year and name, from the history site's list (it also lists festivals still to come). */
async function festivals() {
  const j = await postJson('/history/ajax/selectGamenoList.do', { searchGubun: 'G' })
  return j.codeList.flatMap((c) => {
    const m = c.CODE_NM.match(/^(\d{4}) (.+)$/)
    return m ? [{ gameno: Number(c.MINOR_CD), year: Number(m[1]), name: m[2] }] : []
  })
}

/** One match pop-up: round, both sides' 시도 / name / 소속, games and the game scores. */
function parseDetail(html) {
  const scoreTop = [...(html.match(/<div class="scoreTop">([\s\S]*?)<\/div>/)?.[1] ?? '').matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) => clean(m[1]))
  const round = halfWidth(scoreTop[scoreTop.length - 1] ?? '') || null
  // billboardL when the left side won, billboardR when the right side did; the winner's <p> has class "win".
  const board = html.match(/<div class="billboard[LR]">([\s\S]*?)<\/div>/)?.[1] ?? ''
  const sides = [...board.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g)].map((m) => {
    const g = clean(m[2]).match(/\((\d+)\)/)
    return { sido: clean(m[2].match(/<strong>([\s\S]*?)<\/strong>/)?.[1]), games: g ? Number(g[1]) : null, won: /class="win"/.test(m[1]) }
  })
  const record = html.match(/<ul class="detailed-record">([\s\S]*?)<\/ul>/)?.[1] ?? ''
  const points = [...record.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((li) => [...li[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((s) => Number(clean(s[1]))))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
  // "참가선수(시도)" tables, left side first; first row = the player.
  const players = [...html.matchAll(/참가선수\(([^)]*)\)[\s\S]*?<tbody>[\s\S]*?<td>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => ({
    sido: clean(m[1]),
    name: clean(m[2]),
    team: clean(m[3]) || null,
  }))
  return { round, sides, points, players }
}

/** Build the stored row from a pop-up, with the date and score the bracket gave. */
function toMatch(d, { date, division, reason }) {
  const [a, b] = d.players
  const [sa, sb] = d.sides
  if (!a || !b || !sa || !sb) return null
  return {
    date,
    division,
    round: d.round,
    playerA: a.name, sidoA: a.sido, teamA: a.team,
    playerB: b.name, sidoB: b.sido, teamB: b.team,
    gamesA: sa.games, gamesB: sb.games,
    winner: sa.won ? 'A' : sb.won ? 'B' : null,
    points: d.points,
    reason: reason || null,
  }
}

// --- Past festivals (history site) ------------------------------------------------
async function historyMatches(f) {
  const base = { searchGubun: 'G', searchGameno: String(f.gameno), searchClassCd: CLASS_CD }
  const kinds = (await postJson('/history/ajax/selectDaejinKindCdList.do', { ...base, ltGubun: 'T' })).codeList
  const out = []
  for (const k of kinds) {
    const details = (await postJson('/history/ajax/selectDaejinDetailClassCdList.do', { ...base, searchKindCd: k.MINOR_CD, ltGubun: 'T' })).codeList
    const singles = details.find((d) => d.CODE_NM === '개인전')
    if (!singles) continue
    const html = await postForm('/history/schedule/daejin.do', { ...base, searchKindCd: k.MINOR_CD, searchDetailClassCd: singles.MINOR_CD, classNm: '스쿼시' })
    // Hidden inputs per match, in bracket order: detailClassCd, rhCd, winnerGb, reasonNm, score, kindCd.
    const rhs = [...html.matchAll(/name="rhCd" type="hidden" value="(\d+)"/g)].map((m) => m[1])
    const reasons = [...html.matchAll(/name="reasonNm" type="hidden" value="([^"]*)"/g)].map((m) => m[1])
    // The bracket's cell for match idx: onclick="resultDetailT(idx);" then the date "MM/DD".
    const dates = new Map([...html.matchAll(/resultDetailT\((\d+)\);"?>?[\s\S]{0,200}?(\d{1,2})\/(\d{1,2})/g)].map((m) => [Number(m[1]), `${f.year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`]))
    for (const [i, rh] of rhs.entries()) {
      const d = parseDetail(
        await get('/history/schedule/scheduleDetailT.do', {
          ...base, searchKindCd: k.MINOR_CD, searchDetailClassCd: singles.MINOR_CD, searchRhCd: rh, searchGmOrd: rh.substring(2, 8),
        }),
      )
      const m = toMatch(d, { date: dates.get(i) ?? null, division: divisionName(k.CODE_NM), reason: reasons[i] })
      if (m) out.push(m)
    }
  }
  return out
}

// --- The current festival (national site) -----------------------------------------
async function currentMatches(f) {
  const kinds = (await postJson('/national/schedule/selectKindCdListAjax.do', { searchClassCd: CLASS_CD })).codeList
  const out = []
  for (const k of kinds) {
    const details = (await postJson('/national/schedule/selectDetailClassCdListAjax.do', { searchClassCd: CLASS_CD, searchKindCd: k.MINOR_CD })).codeList
    const singles = details.find((d) => d.DETAIL_CLASS_NM === '개인전')
    if (!singles) continue
    const html = await postForm('/national/schedule/scheduleTDaejin.do', {
      searchMenuId: '1506', searchClassCd: CLASS_CD, searchKindCd: k.MINOR_CD, searchDetailClassCd: singles.DETAIL_CLASS_CD, pageIndex: '1',
    })
    // The page embeds its results as a Java map dump: [{GM_DT=10/16, RH_CD=411001, …}, …]
    const list = html.match(/daejinResultList\s*=\s*"\[([\s\S]*?)\]";/)?.[1] ?? ''
    const rows = [...list.matchAll(/\{([^}]*)\}/g)].map((m) => Object.fromEntries(m[1].split(', ').map((kv) => kv.split(/=(.*)/s).slice(0, 2))))
    for (const r of rows) {
      if (r.GM_CONFIRM !== '종료') continue
      const d = parseDetail(
        await get('/national/schedule/scheduleDetailT.do', { searchClassCd: CLASS_CD, searchDetailClassCd: singles.DETAIL_CLASS_CD, searchRhCd: r.RH_CD, searchPcntGbn: r.PCNT_GBN }),
      )
      const [mm, dd] = r.GM_DT.split('/')
      const m = toMatch(d, { date: `${f.year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`, division: divisionName(k.CODE_NM), reason: r.REASON_NM === 'null' ? '' : r.REASON_NM })
      if (m) out.push(m)
    }
  }
  return out
}

/** "남자18세이하부" → "남자 18세이하부", the KSF data's spelling. 제102회 (2021) ran 19세이하부, the same high-school draw. */
const divisionName = (kind) => kind.replace(/^(남자|여자)/, '$1 ').replace('19세이하부', '18세이하부')

const wanted = process.argv.slice(2).map(Number)
const all = await festivals()
// The current festival: the newest 회차 the history site has no squash for yet, if the live site shows it.
const live = (await (await request(`${BASE}/national/main.do`)).text()).match(/제(\d+)회 전국체육대회/)?.[1]
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { events: [] }
const events = new Map(old.events.map((e) => [e.gameno, e]))
for (const f of all.filter((f) => f.gameno >= FIRST && f.gameno <= Number(live ?? 0) && (!wanted.length || wanted.includes(f.gameno))).sort((a, b) => a.gameno - b.gameno)) {
  const classes = (await postJson('/history/ajax/selectToClassCdList.do', { searchGubun: 'G', searchGameno: String(f.gameno), searchSibumYn: 'N' })).codeList
  const inHistory = classes.some((c) => c.MINOR_CD === CLASS_CD)
  const source = inHistory ? 'history' : String(f.gameno) === live ? 'national' : null
  if (!source) {
    console.log(`${f.year} ${f.name}: no squash results found`)
    continue
  }
  const matches = (source === 'history' ? await historyMatches(f) : await currentMatches(f)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  events.set(f.gameno, { gameno: f.gameno, year: f.year, name: `${f.year} ${f.name}`, source, matches })
  const byDiv = {}
  for (const m of matches) byDiv[m.division] = (byDiv[m.division] ?? 0) + 1
  console.log(`${f.year} ${f.name} (${source}): ${matches.length} singles — ${Object.entries(byDiv).map(([d, n]) => `${d} ${n}`).join(', ')}`)
}
const sorted = [...events.values()].sort((a, b) => a.gameno - b.gameno)
fs.writeFileSync(OUT, JSON.stringify({ fetched: new Date().toISOString(), events: sorted }, null, 1) + '\n')
console.log(`→ ${path.relative(process.cwd(), OUT)}`)
