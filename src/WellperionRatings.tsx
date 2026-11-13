import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ClubImport } from './ClubImport.tsx'
import { ClubPlayerPage } from './ClubPlayerPage.tsx'
import { ScoreInput } from './ScoreInput.tsx'
import { emptyScore, readScore, type ScoreEntry } from './score.ts'
import { today } from './storage.ts'
import {
  addClubMatch,
  clubKey,
  clubToken,
  type ClubData,
  type ClubPlayer,
  deleteClubMatch,
  fetchClub,
  fitScales,
  formatPoints,
  gamePoints,
  gamesOf,
  nationalScale,
  saveClubPlayer,
  signIn,
} from './wellperion.ts'

type Scale = 'wsr' | 'national'
/** Who the list shows: players with a result inside WSR's 12-month window, the rest, or both. */
const STATUSES = [
  { key: 'active', label: '활동' },
  { key: 'inactive', label: '비활동' },
  { key: 'all', label: '전체' },
] as const
type Status = (typeof STATUSES)[number]['key']
/** A player is active with a result on or after this date — 12 months back, the same window WSR counts. */
const ACTIVE_SINCE = (() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const MATCH_TYPES = [
  { v: 'challenge', l: '챌린지' },
  { v: 'league', l: '리그' },
  { v: 'tournament', l: '대회' },
  { v: 'practice', l: '연습' },
]

/**
 * The Wellperion club ranking. Results live in the club Google Sheet; the same results
 * give two ratings — WSR (the club's own open-ended scale) and a national-scale rating on the
 * national ladder's scale. The club stays separate from the KSF national data: no club
 * result goes into the national ladder, and no national data comes in here.
 */
export function WellperionRatings({ player }: { player?: string }) {
  const [data, setData] = useState<ClubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scale, setScale] = useState<Scale>('wsr')
  const [division, setDivision] = useState('')
  const [status, setStatus] = useState<Status>('active')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchClub()
      setData(d)
      setError(d.ok || d.needKey ? '' : d.error || '불러오지 못했습니다')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  if (!data && loading) return <section className="panel"><p className="muted">Wellperion 결과를 불러오는 중…</p></section>
  if (data?.needKey) return <ClubKeyForm onDone={reload} />
  if (!data || !data.ok) {
    return (
      <section className="panel">
        <p className="down">Wellperion 결과를 불러오지 못했습니다: {error}</p>
        <button type="button" className="ghost" onClick={() => void reload()}>다시 시도</button>
      </section>
    )
  }
  if (player) return <ClubPlayerPage data={data} id={player} scale={scale} setScale={setScale} />
  return <ClubView data={data} reload={reload} loading={loading} scale={scale} setScale={setScale} division={division} setDivision={setDivision} status={status} setStatus={setStatus} />
}

function ClubKeyForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  // A key kept from an earlier visit that the script no longer accepts.
  const [err, setErr] = useState(clubKey.get() ? '저장된 비밀번호가 맞지 않습니다. 다시 입력해 주세요.' : '')
  return (
    <section className="panel">
      <h2>Wellperion 랭킹</h2>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const k = key.trim()
          setBusy(true)
          setErr('')
          try {
            // The club password, or else the manager password (a coach typing theirs here).
            clubKey.set(k)
            if ((await fetchClub()).needKey) {
              clubKey.set('')
              try {
                await signIn(k)
              } catch {
                setErr('비밀번호가 맞지 않습니다.')
                return
              }
            }
            onDone()
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input type="password" placeholder="클럽 비밀번호" value={key} onChange={(e) => setKey(e.target.value)} />
        <button type="submit" disabled={busy || !key.trim()}>{busy ? '확인 중…' : '보기'}</button>
      </form>
      {err && <p className="down small">{err}</p>}
      <p className="muted small">Wellperion 랭킹 페이지와 같은 클럽 비밀번호입니다. 코치는 관리자 비밀번호를 넣어도 됩니다.</p>
      <CoachSignIn onDone={async () => onDone()} />
    </section>
  )
}

function ClubView({
  data,
  reload,
  loading,
  scale,
  setScale,
  division,
  setDivision,
  status,
  setStatus,
}: {
  data: ClubData
  reload: () => Promise<void>
  loading: boolean
  scale: Scale
  setScale: (s: Scale) => void
  division: string
  setDivision: (d: string) => void
  status: Status
  setStatus: (s: Status) => void
}) {
  const { players, matches, admin } = data
  const nat = useMemo(() => nationalScale(players, matches), [players, matches])
  const ratedById = useMemo(() => new Map(nat.players.map((p) => [p.id, p])), [nat])

  // WSR ↔ national scale, from players with enough results on both.
  const fit = useMemo(
    () =>
      fitScales(
        players
          .filter((p) => p.reliability >= 50 && (ratedById.get(p.id)?.matches ?? 0) >= 3)
          .map((p) => ({ wsr: p.wsr, rating: ratedById.get(p.id)!.rating })),
      ),
    [players, ratedById],
  )

  // Latest result of each player, straight from the results (hidden players included).
  const lastPlayed = useMemo(() => {
    const last = new Map<string, string>()
    for (const m of matches) for (const id of [m.winner, m.loser]) if ((last.get(id) ?? '') < m.date) last.set(id, m.date)
    return last
  }, [matches])
  const isActive = (p: ClubPlayer) => (lastPlayed.get(p.id) ?? '') >= ACTIVE_SINCE

  const divisions = [...new Set(players.map((p) => p.division))].sort()
  const listed = players
    .filter(
      (p) =>
        (admin || !p.hidden) &&
        (!division || p.division === division) &&
        (status === 'all' || isActive(p) === (status === 'active')),
    )
    .map((p) => ({ p, r: ratedById.get(p.id) }))
    .sort((a, b) => (scale === 'wsr' ? b.p.wsr - a.p.wsr : (b.r?.rating ?? 0) - (a.r?.rating ?? 0)))
  // Only active players are numbered; inactive ones show — wherever they appear.
  let n = 0
  const ranks = listed.map(({ p }) => (isActive(p) ? ++n : null))

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Wellperion 랭킹</h2>
          <span className="muted small">
            {matches.length}경기 · {new Date(data.updated).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {loading ? ' · 새로고침 중…' : ''}
          </span>
        </div>
        <div className="filters">
          <div className="segmented" role="group" aria-label="Scale">
            <button type="button" className={scale === 'wsr' ? 'on' : ''} onClick={() => setScale('wsr')}>WSR</button>
            <button type="button" className={scale === 'national' ? 'on' : ''} onClick={() => setScale('national')}>국가 기준 레이팅</button>
          </div>
          <div className="segmented" role="group" aria-label="활동">
            {STATUSES.map((s) => (
              <button key={s.key} type="button" className={status === s.key ? 'on' : ''} onClick={() => setStatus(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          {divisions.length > 1 && (
            <select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="디비전">
              <option value="">전체 디비전</option>
              {divisions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          <button type="button" className="ghost" style={{ marginTop: 0 }} onClick={() => void reload()}>새로고침</button>
        </div>

        {listed.length === 0 ? (
          <p className="muted">아직 표시할 선수가 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>선수</th>
                  <th className="num">{scale === 'wsr' ? 'WSR' : '레이팅'}</th>
                  <th className="num sm-hide">{scale === 'wsr' ? '신뢰도' : '±'}</th>
                  {fit && <th className="num">{scale === 'wsr' ? '≈ 국가 기준' : '≈ WSR'}</th>}
                  <th className="num">W–L</th>
                  <th className="sm-hide">최근 경기</th>
                </tr>
              </thead>
              <tbody>
                {listed.map(({ p, r }, i) => {
                  const unrated = scale === 'wsr' ? p.provisional : !r || r.matches < 3
                  const active = isActive(p)
                  return (
                    <tr key={p.id} className={unrated || p.hidden || !active ? 'unrated' : ''} title={active ? '' : '비활동'}>
                      <td className="muted">{ranks[i] ?? '—'}</td>
                      <td>
                        <a className="player-link" href={`#wellperion/player/${encodeURIComponent(p.id)}`}>
                          <strong>{p.name ?? '비공개 선수'}</strong>
                        </a>
                        <span className="muted small meta">
                          {' '}
                          {p.division}
                          {admin && p.hidden ? ' · 비공개' : ''}
                        </span>
                      </td>
                      <td className="num strong">{scale === 'wsr' ? p.wsr.toFixed(2) : r ? Math.round(r.rating) : '—'}</td>
                      <td className="num muted sm-hide">{scale === 'wsr' ? `${p.reliability}%` : r ? Math.round(r.rd) : '—'}</td>
                      {fit && (
                        <td className="num muted">
                          {scale === 'wsr' ? Math.round(fit.toRating(p.wsr)) : r ? fit.toWsr(r.rating).toFixed(2) : '—'}
                        </td>
                      )}
                      <td className="num">{r ? `${r.wins}–${r.losses}` : '0–0'}</td>
                      <td className="muted sm-hide">{lastPlayed.get(p.id) ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          같은 경기 결과로 두 가지 레이팅을 계산합니다. <b>WSR</b>은 클럽 자체 점수(상한 없음, 주니어 약 1–4 · 상급 성인 7+, 최근 12개월, 최근 30경기)이고,{' '}
          <b>국가 기준 레이팅</b>은 국가 랭킹과 같은 방식·같은 척도로 계산한 점수입니다. 흐린 줄은 아직 경기가 적어 잠정이거나 최근 12개월({ACTIVE_SINCE} 이후)에 경기가 없는 비활동 선수입니다. 순위 번호는 활동 선수에게만 붙습니다.{' '}
          {fit
            ? `환산(≈)은 두 레이팅이 모두 충분한 ${fit.players}명으로 맞춘 추정치입니다 — WSR 1점 ≈ ${Math.round(fit.slope)}점, WSR 5.00 ≈ ${Math.round(fit.toRating(5))} (일치도 ${Math.round(fit.r2 * 100)}%).`
            : '두 레이팅이 모두 충분한 선수가 5명 이상이 되면 서로 환산한 값(≈)을 함께 보여 줍니다.'}
        </p>
      </section>

      {admin ? <CoachTools data={data} reload={reload} /> : <CoachSignIn onDone={reload} />}
    </>
  )
}

function CoachSignIn({ onDone }: { onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <p>
        <button type="button" className="ghost" onClick={() => setOpen(true)}>코치 로그인 — 결과 입력</button>
      </p>
    )
  }
  return (
    <section className="panel">
      <h2>코치 로그인</h2>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErr('')
          try {
            await signIn(pw)
            await onDone()
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input type="password" placeholder="관리자 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="submit" disabled={busy || !pw}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
      <p className="muted small">Wellperion 관리 앱과 같은 비밀번호입니다. 이 브라우저에만 저장됩니다.</p>
      {err && <p className="down small">{err}</p>}
    </section>
  )
}

function CoachTools({ data, reload }: { data: ClubData; reload: () => Promise<void> }) {
  const roster = data.players.filter((p) => p.realName).sort((a, b) => a.realName!.localeCompare(b.realName!, 'ko'))
  const byId = new Map(data.players.map((p) => [p.id, p]))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const run = async (what: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setMsg('')
    try {
      await what()
      await reload()
      setMsg(done)
    } catch (x) {
      setMsg(x instanceof Error ? x.message : String(x))
    } finally {
      setBusy(false)
    }
  }

  // --- Add a result ---
  const [f, setF] = useState({ date: today(), winner: '', loser: '', score: '', type: 'challenge', event: '' })
  const [sc, setSc] = useState<ScoreEntry>(emptyScore)
  const winner = roster.find((p) => p.realName === f.winner)
  const loser = roster.find((p) => p.realName === f.loser)
  const score = readScore(sc)
  const valid = winner && loser && winner !== loser && f.date && !score.error
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    void run(async () => {
      await addClubMatch({ ...f, score: score.score })
      setF((x) => ({ ...x, winner: '', loser: '', score: '', event: '' }))
      setSc(emptyScore)
    }, '결과를 저장했습니다.')
  }

  const recent = [...data.matches].filter((m) => m.id).reverse().slice(0, 30)
  const name = (id: string) => byId.get(id)?.realName ?? byId.get(id)?.name ?? '?'

  return (
    <>
      <div className="two-col">
        <section className="panel">
          <h2>결과 입력</h2>
          <form onSubmit={submit} className="match-form">
            <label>
              일자
              <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
            </label>
            <div className="sides">
              <label>
                승자
                <select value={f.winner} onChange={(e) => setF({ ...f, winner: e.target.value })}>
                  <option value="">선택</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.realName}>{p.realName}</option>
                  ))}
                </select>
              </label>
              <label>
                패자
                <select value={f.loser} onChange={(e) => setF({ ...f, loser: e.target.value })}>
                  <option value="">선택</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.realName}>{p.realName}</option>
                  ))}
                </select>
              </label>
            </div>
            <ScoreInput value={sc} onChange={setSc} winner={f.winner || '승자'} loser={f.loser || '패자'} />
            {score.error && <p className="error small">{score.error}</p>}
            {!score.error && score.warning && <p className="muted small">{score.warning}</p>}
            <div className="sides">
              <label>
                유형
                <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                  {MATCH_TYPES.map((t) => (
                    <option key={t.v} value={t.v}>{t.l}</option>
                  ))}
                </select>
              </label>
              <label>
                이벤트 (선택)
                <input value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} />
              </label>
            </div>
            <button type="submit" disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
          </form>
        </section>

        <AddPlayer run={run} busy={busy} />
      </div>

      {msg && <p className="small">{msg}</p>}

      <ClubImport data={data} reload={reload} />

      <section className="panel">
        <h2>최근 결과</h2>
        {recent.length === 0 ? (
          <p className="muted">아직 결과가 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>일자</th>
                  <th>결과</th>
                  <th className="sm-hide">유형</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => {
                  const [a, b] = gamesOf(m)
                  const points = gamePoints(m.score)
                  return (
                    <tr key={m.id!}>
                      <td className="muted">{m.date}</td>
                      <td>
                        <strong>{name(m.winner)}</strong> {a}–{b} {name(m.loser)}
                        {!m.games && <span className="muted small"> (스코어 없음)</span>}
                        {points.length > 0 && <div className="muted small mono points">{formatPoints(points)}</div>}
                      </td>
                      <td className="muted small sm-hide">{MATCH_TYPES.find((t) => t.v === m.type)?.l ?? m.type}</td>
                      <td>
                        <button
                          type="button"
                          className="link"
                          disabled={busy}
                          title="삭제"
                          onClick={() => {
                            if (confirm(`${m.date} ${name(m.winner)}–${name(m.loser)} 결과를 삭제할까요?`)) void run(() => deleteClubMatch(m.id!), '삭제했습니다.')
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            clubToken.set('')
            void reload()
          }}
        >
          코치 로그아웃
        </button>
      </p>
    </>
  )
}

/** Add a club player. */
function AddPlayer({ run, busy }: { run: (what: () => Promise<unknown>, done: string) => Promise<void>; busy: boolean }) {
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('junior')
  return (
    <section className="panel">
      <h2>선수 추가</h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim()) void run(() => saveClubPlayer({ name: newName.trim(), kind: newKind }), `${newName.trim()} 선수를 추가했습니다 (공개 N — Players 탭에서 공개로 바꿀 수 있습니다).`).then(() => setNewName(''))
        }}
      >
        <input placeholder="실명" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="구분">
          <option value="junior">주니어</option>
          <option value="adult">성인</option>
        </select>
        <button type="submit" disabled={busy || !newName.trim()}>추가</button>
      </form>
    </section>
  )
}
