// Fetch the Wellperion club results marked 전국 반영 (both players linked to a KSF 등록번호)
// from the club's Apps Script, for the national ladder.
//
//   node tools/fetch-club.mts          (npm run club)   then   npm run ladder
//
// Writes data/wellperion/club-matches.json: KSF ids, date, games — no names. If the club
// ladder has a password (RANKINGS_KEY), pass it as WELLPERION_KEY=… in the environment.
import fs from 'node:fs'
import path from 'node:path'
import { ORGS } from '../src/orgs.ts'

const exec = ORGS.wellperion.clubSource?.execUrl
if (!exec) throw new Error('src/orgs.ts: wellperion.clubSource is not set')
const url = new URL(exec)
url.searchParams.set('action', 'club-national')
if (process.env.WELLPERION_KEY) url.searchParams.set('key', process.env.WELLPERION_KEY)

const res = await fetch(url)
const j = (await res.json()) as {
  ok: boolean
  error?: string
  needKey?: boolean
  matches: { id: string | null; date: string; winnerKsf: string; loserKsf: string; gamesWinner: number; gamesLoser: number; type: string; event: string }[]
  skipped: { id: string | null; date: string; why: string }[]
}
if (!j.ok) throw new Error(j.needKey ? 'The club ladder needs its password: WELLPERION_KEY=… npm run club' : `club-national: ${j.error}`)

const dir = path.resolve('data/wellperion')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'club-matches.json'), JSON.stringify({ fetched: new Date().toISOString(), matches: j.matches }, null, 2) + '\n')
console.log(`${j.matches.length} club results for the national ladder → data/wellperion/club-matches.json`)
for (const s of j.skipped) console.log(`  not included: ${s.date} (${s.why})`)
