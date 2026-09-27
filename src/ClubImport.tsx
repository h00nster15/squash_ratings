import { useMemo, useState } from 'react'
import { buildRows, type Cell, FIELD_LABEL, type Field, findHeader, guessMapping, type Mapping, type Mode, text } from './clubImport.ts'
import { addClubMatches, type ClubData } from './wellperion.ts'

type XLSX = typeof import('xlsx')
const TYPE_LABEL: Record<string, string> = { challenge: '챌린지', league: '리그', tournament: '대회', practice: '연습' }
const SHOWN = 300 // preview rows drawn; the counts above the table cover them all

interface Book {
  fileName: string
  sheets: string[]
  rowsBySheet: Record<string, Cell[][]>
  parseSerial: (n: number) => { y: number; m: number; d: number } | null
}

/**
 * Coach tool: results from an Excel (or CSV) file into the club sheet. Pick a file → the
 * columns are matched by their header words (and can be changed) → a preview marks each
 * row ready, already in the sheet, or wrong (with the reason) → names not on the roster
 * can be added as new players → one save writes everything, or nothing if a row fails.
 */
export function ClubImport({ data, reload }: { data: ClubData; reload: () => Promise<void> }) {
  const [book, setBook] = useState<Book | null>(null)
  const [sheet, setSheet] = useState('')
  const [mapping, setMapping] = useState<Mapping>({})
  const [mode, setMode] = useState<Mode>('wl')
  const [adding, setAdding] = useState<Map<string, string>>(new Map()) // name → kind
  const [include, setInclude] = useState<Set<number>>(new Set()) // duplicate lines ticked back in
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const rows = useMemo(() => book?.rowsBySheet[sheet] ?? [], [book, sheet])
  const header = useMemo(() => findHeader(rows), [rows])
  const headers = rows[header] ?? []

  function pickSheet(b: Book, name: string) {
    setSheet(name)
    const rs = b.rowsBySheet[name]
    const g = guessMapping(rs[findHeader(rs)] ?? [])
    setMapping(g.mapping)
    setMode(g.mode)
    setAdding(new Map())
    setInclude(new Set())
  }

  async function onFile(file: File) {
    setMsg('')
    setBusy(true)
    try {
      const X: XLSX = await import('xlsx')
      const wb = X.read(await file.arrayBuffer(), { type: 'array' })
      const rowsBySheet: Record<string, Cell[][]> = {}
      for (const n of wb.SheetNames) rowsBySheet[n] = X.utils.sheet_to_json<Cell[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' })
      const b: Book = {
        fileName: file.name,
        sheets: wb.SheetNames.filter((n) => rowsBySheet[n].length > 0),
        rowsBySheet,
        parseSerial: (n) => {
          const p = X.SSF.parse_date_code(n)
          return p ? { y: p.y, m: p.m, d: p.d } : null
        },
      }
      if (!b.sheets.length) throw new Error('비어 있는 파일입니다.')
      setBook(b)
      pickSheet(b, b.sheets[0])
    } catch (e) {
      setBook(null)
      setMsg(`파일을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  // Names not on the roster, from a pass that adds nobody; then the real pass.
  const unknownNames = useMemo(() => {
    if (!book) return []
    const pass = buildRows(rows, header, mapping, mode, data.players, data.matches, new Set(), book.parseSerial)
    return [...new Set(pass.flatMap((r) => r.unknown))].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [book, rows, header, mapping, mode, data])
  const parsed = useMemo(
    () => (book ? buildRows(rows, header, mapping, mode, data.players, data.matches, new Set(adding.keys()), book.parseSerial) : []),
    [book, rows, header, mapping, mode, data, adding],
  )
  const chosen = parsed.filter((r) => r.status === 'ok' || (r.status === 'duplicate' && include.has(r.line)))
  const counts = {
    ok: parsed.filter((r) => r.status === 'ok').length,
    duplicate: parsed.filter((r) => r.status === 'duplicate').length,
    error: parsed.filter((r) => r.status === 'error').length,
  }
  const need: Field[] = mode === 'wl' ? ['date', 'winner', 'loser'] : ['date', 'playerA', 'playerB', 'score']
  const missing = need.filter((f) => mapping[f] === undefined)
  const optional: Field[] = mode === 'wl' ? ['score', 'type', 'event', 'national'] : ['type', 'event', 'national']

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      const newPlayers = [...adding.entries()].filter(([n]) => chosen.some((r) => r.winner === n || r.loser === n)).map(([name, kind]) => ({ name, kind }))
      const r = await addClubMatches(
        chosen.map(({ date, winner, loser, score, type, event, national }) => ({ date, winner, loser, score, type, event, national })),
        newPlayers,
      )
      await reload()
      setBook(null)
      setMsg(`${(r as { added?: number }).added ?? chosen.length}건을 가져왔습니다${newPlayers.length ? ` (새 선수 ${newPlayers.length}명 추가 — 공개 N)` : ''}.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function template() {
    const X: XLSX = await import('xlsx')
    const ws = X.utils.aoa_to_sheet([
      ['일자', '승자', '패자', '스코어', '유형', '이벤트', '전국 반영'],
      ['2026-09-27', '홍길동', '김철수', '11-7 11-5 9-11 11-8', '챌린지', '', 'N'],
      ['2026-09-27', '김철수', '이영희', '3-1', '리그', '9월 리그', 'N'],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 9 }]
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, ws, '결과')
    X.writeFile(wb, 'wellperion-결과-양식.xlsx')
  }

  const colSelect = (f: Field) => (
    <label key={f}>
      {FIELD_LABEL[f]}
      <select
        value={mapping[f] ?? ''}
        onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === '' ? undefined : Number(e.target.value) })}
      >
        <option value="">{need.includes(f) ? '선택' : '없음'}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {text(h) || `열 ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <section className="panel">
      <h2>엑셀로 결과 가져오기</h2>
      <div className="inline-form">
        <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <button type="button" className="ghost" style={{ marginTop: 0 }} onClick={() => void template()}>
          양식 받기
        </button>
      </div>
      <p className="muted small">
        한 줄에 한 경기. 첫 줄(머리글)의 이름으로 열을 찾습니다 — 일자 · 승자 · 패자 · 스코어 · 유형 · 이벤트 · 전국 반영. 승자/패자 대신 선수 A · 선수 B와
        A 기준 스코어로 된 파일도 됩니다. 선수 이름은 Players 탭의 실명과 같아야 합니다 (띄어쓰기는 무시).
      </p>

      {book && (
        <>
          <div className="filters">
            <span className="muted small">{book.fileName}</span>
            {book.sheets.length > 1 && (
              <select value={sheet} onChange={(e) => pickSheet(book, e.target.value)} aria-label="시트">
                {book.sheets.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            <div className="segmented" role="group" aria-label="형식">
              <button type="button" className={mode === 'wl' ? 'on' : ''} onClick={() => setMode('wl')}>승자 · 패자</button>
              <button type="button" className={mode === 'ab' ? 'on' : ''} onClick={() => setMode('ab')}>선수 A · B + 스코어</button>
            </div>
          </div>

          <div className="import-map">{[...need, ...optional].map(colSelect)}</div>
          {missing.length > 0 && <p className="down small">필요한 열을 골라 주세요: {missing.map((f) => FIELD_LABEL[f]).join(', ')}</p>}

          {missing.length === 0 && unknownNames.length > 0 && (
            <div className="import-unknown">
              <p className="small">
                <b>명단에 없는 이름 {unknownNames.length}개</b> — 오타면 파일을 고쳐 다시 올리고, 새 선수면 체크해서 함께 추가하세요 (공개 N으로 추가됩니다).
              </p>
              <ul>
                {unknownNames.map((n) => (
                  <li key={n}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={adding.has(n)}
                        onChange={(e) => {
                          const next = new Map(adding)
                          if (e.target.checked) next.set(n, 'junior')
                          else next.delete(n)
                          setAdding(next)
                        }}
                      />
                      {n}
                    </label>
                    {adding.has(n) && (
                      <select value={adding.get(n)} onChange={(e) => setAdding(new Map(adding).set(n, e.target.value))} aria-label={`${n} 구분`}>
                        <option value="junior">주니어</option>
                        <option value="adult">성인</option>
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {missing.length === 0 && (
            <>
              <p className="small">
                <span className="up">가져올 수 있음 {counts.ok}</span> · <span className="muted">이미 있음 {counts.duplicate}</span> ·{' '}
                <span className={counts.error ? 'down' : 'muted'}>오류 {counts.error}</span>
                {counts.error > 0 && <span className="muted"> — 오류 줄은 건너뜁니다</span>}
              </p>
              <div className="table-wrap import-preview">
                <table>
                  <thead>
                    <tr>
                      <th className="num">줄</th>
                      <th>일자</th>
                      <th>결과</th>
                      <th className="sm-hide">유형</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, SHOWN).map((r) => (
                      <tr key={r.line} className={r.status === 'ok' ? '' : 'unrated'}>
                        <td className="num muted">{r.line}</td>
                        <td>{r.date || '—'}</td>
                        <td>
                          <strong>{r.winner || '?'}</strong> {r.score || '(스코어 없음)'} {r.loser || '?'}
                          {r.event && <span className="muted small"> · {r.event}</span>}
                          {r.national && <span className="muted small"> · 전국</span>}
                        </td>
                        <td className="muted small sm-hide">{TYPE_LABEL[r.type]}</td>
                        <td className="small">
                          {r.status === 'ok' ? (
                            <span className="up">✓</span>
                          ) : r.status === 'duplicate' ? (
                            <label className="check" title="같은 날 같은 두 선수가 같은 스코어로 또 경기했다면 체크">
                              <input
                                type="checkbox"
                                checked={include.has(r.line)}
                                onChange={(e) => {
                                  const next = new Set(include)
                                  if (e.target.checked) next.add(r.line)
                                  else next.delete(r.line)
                                  setInclude(next)
                                }}
                              />
                              <span className="muted">{r.message}</span>
                            </label>
                          ) : (
                            <span className="down">{r.message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.length > SHOWN && <p className="muted small">처음 {SHOWN}줄만 표시 — 가져오기는 전체 {parsed.length}줄 기준입니다.</p>}
              <p>
                <button type="button" disabled={busy || chosen.length === 0} onClick={() => void save()}>
                  {busy ? '저장 중…' : `${chosen.length}건 가져오기`}
                </button>{' '}
                <button type="button" className="ghost" disabled={busy} onClick={() => setBook(null)}>
                  취소
                </button>
              </p>
            </>
          )}
        </>
      )}
      {msg && <p className="small">{msg}</p>}
    </section>
  )
}
