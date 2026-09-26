import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ladder } from './ksf.ts'
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
  gamesOf,
  nationalScale,
  saveClubPlayer,
  setClubMatchNational,
  signIn,
} from './wellperion.ts'

type Scale = 'wsr' | 'national'
const MATCH_TYPES = [
  { v: 'challenge', l: '챌린지' },
  { v: 'league', l: '리그' },
  { v: 'tournament', l: '대회' },
  { v: 'practice', l: '연습' },
]

/**
 * The Wellperion club ranking. Results live in the club Google Sheet; the same results
 * give two ratings — WSR (1–10, the club's own scale) and a national-scale rating on the
 * national ladder's scale — and a result marked 전국 반영 between two players linked to
 * their KSF 등록번호 is rated in the national ladder as well, from its next build.
 */
export function WellperionRatings() {
  const [data, setData] = useState<ClubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scale, setScale] = useState<Scale>('wsr')
  const [division, setDivision] = useState('')

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
  return <ClubView data={data} reload={reload} loading={loading} scale={scale} setScale={setScale} division={division} setDivision={setDivision} />
}

function ClubKeyForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('')
  return (
    <section className="panel">
      <h2>Wellperion 랭킹</h2>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          clubKey.set(key.trim())
          onDone()
        }}
      >
        <input type="password" placeholder="클럽 비밀번호" value={key} onChange={(e) => setKey(e.target.value)} />
        <button type="submit" disabled={!key.trim()}>보기</button>
      </form>
      <p className="muted small">Wellperion 랭킹 페이지와 같은 클럽 비밀번호입니다.</p>
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
}: {
  data: ClubData
  reload: () => Promise<void>
  loading: boolean
  scale: Scale
  setScale: (s: Scale) => void
  division: string
  setDivision: (d: string) => void
}) {
  const { players, matches, admin } = data
  const nat = useMemo(() => nationalScale(players, matches), [players, matches])
  const ratedById = useMemo(() => new Map(nat.players.map((p) => [p.id, p])), [nat])
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

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

  const divisions = [...new Set(players.map((p) => p.division))].sort()
  const listed = players
    .filter((p) => (admin || !p.hidden) && (!division || p.division === division))
    .map((p) => ({ p, r: ratedById.get(p.id) }))
    .sort((a, b) => (scale === 'wsr' ? b.p.wsr - a.p.wsr : (b.r?.rating ?? 0) - (a.r?.rating ?? 0)))

  const flagged = matches.filter((m) => m.national)
  const eligible = flagged.filter((m) => byId.get(m.winner)?.ksfId && byId.get(m.loser)?.ksfId)

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
            <button type="button" className={scale === 'wsr' ? 'on' : ''} onClick={() => setScale('wsr')}>WSR (1–10)</button>
            <button type="button" className={scale === 'national' ? 'on' : ''} onClick={() => setScale('national')}>국가 기준 레이팅</button>
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
                  return (
                    <tr key={p.id} className={unrated || p.hidden ? 'unrated' : ''}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <strong>{p.name ?? '비공개 선수'}</strong>
                        <span className="muted small meta">
                          {' '}
                          {p.division}
                          {p.ksfId ? ' · 국가 연결' : ''}
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
                      <td className="muted sm-hide">{r?.lastPlayed ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          같은 경기 결과로 두 가지 레이팅을 계산합니다. <b>WSR</b>은 클럽의 1–10 점수(최근 12개월, 최근 30경기)이고,{' '}
          <b>국가 기준 레이팅</b>은 국가 랭킹과 같은 방식·같은 척도로 계산한 점수입니다. 흐린 줄은 아직 경기가 적어 잠정인 선수입니다.{' '}
          {fit
            ? `환산(≈)은 두 레이팅이 모두 충분한 ${fit.players}명으로 맞춘 추정치입니다 — WSR 1점 ≈ ${Math.round(fit.slope)}점, WSR 5.00 ≈ ${Math.round(fit.toRating(5))} (일치도 ${Math.round(fit.r2 * 100)}%).`
            : '두 레이팅이 모두 충분한 선수가 5명 이상이 되면 서로 환산한 값(≈)을 함께 보여 줍니다.'}
        </p>
      </section>

      <section className="panel">
        <h2>국가 랭킹 반영</h2>
        <p className="muted small">
          <b>전국 반영</b>으로 표시한 경기 {flagged.length}건 중 두 선수 모두 KSF 등록번호가 연결된 {eligible.length}건이 국가 랭킹에
          들어갑니다 (국가 · 일반부 랭킹, "Wellperion 클럽" 경기로 표시). 국가 랭킹은 다음에 다시 만들 때 반영됩니다.
        </p>
        {flagged.length > eligible.length && (
          <p className="small">
            연결이 필요한 경기:{' '}
            {flagged
              .filter((m) => !eligible.includes(m))
              .slice(0, 8)
              .map((m) => `${m.date} ${byId.get(m.winner)?.name ?? '비공개'}–${byId.get(m.loser)?.name ?? '비공개'}`)
              .join(', ')}
          </p>
        )}
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
  const [f, setF] = useState({ date: today(), winner: '', loser: '', score: '', type: 'challenge', event: '', national: false })
  const winner = roster.find((p) => p.realName === f.winner)
  const loser = roster.find((p) => p.realName === f.loser)
  const valid = winner && loser && winner !== loser && f.date
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    void run(async () => {
      await addClubMatch(f)
      setF((x) => ({ ...x, winner: '', loser: '', score: '', event: '' }))
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
            <label>
              스코어 (승자 기준)
              <input placeholder="3-1 또는 11-7 11-5 9-11 11-8" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} />
            </label>
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
            <label className="check">
              <input type="checkbox" checked={f.national} onChange={(e) => setF({ ...f, national: e.target.checked })} />
              국가 랭킹에도 반영
            </label>
            {f.national && winner && loser && (!winner.ksfId || !loser.ksfId) && (
              <p className="muted small">
                {[winner, loser].filter((p) => !p.ksfId).map((p) => p.realName).join(', ')} 선수의 KSF 등록번호를 아래에서 연결해야 국가 랭킹에 들어갑니다.
              </p>
            )}
            <button type="submit" disabled={!valid || busy}>{busy ? '저장 중…' : '저장'}</button>
          </form>
        </section>

        <LinkPlayers roster={roster} run={run} busy={busy} />
      </div>

      {msg && <p className="small">{msg}</p>}

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
                  <th>국가 반영</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => {
                  const [a, b] = gamesOf(m)
                  const linked = byId.get(m.winner)?.ksfId && byId.get(m.loser)?.ksfId
                  return (
                    <tr key={m.id!}>
                      <td className="muted">{m.date}</td>
                      <td>
                        <strong>{name(m.winner)}</strong> {a}–{b} {name(m.loser)}
                        {!m.games && <span className="muted small"> (스코어 없음)</span>}
                      </td>
                      <td className="muted small sm-hide">{MATCH_TYPES.find((t) => t.v === m.type)?.l ?? m.type}</td>
                      <td>
                        <label className="check">
                          <input type="checkbox" disabled={busy} checked={m.national} onChange={(e) => void run(() => setClubMatchNational(m.id!, e.target.checked), '저장했습니다.')} />
                          {m.national && !linked ? <span className="muted small">연결 필요</span> : null}
                        </label>
                      </td>
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

/** Link a club player to their KSF 등록번호 (picked from the national list), or add a player. */
function LinkPlayers({ roster, run, busy }: { roster: ClubPlayer[]; run: (what: () => Promise<unknown>, done: string) => Promise<void>; busy: boolean }) {
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('junior')
  const player = roster.find((p) => p.realName === who)
  const hits = q.trim().length >= 1 ? ladder.players.filter((p) => p.name.includes(q.trim())).slice(0, 8) : []
  const nationalName = (id: string) => ladder.players.find((p) => p.id === id)
  return (
    <section className="panel">
      <h2>선수 · KSF 연결</h2>
      <form className="match-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          클럽 선수
          <select
            value={who}
            onChange={(e) => {
              setWho(e.target.value)
              setQ(e.target.value)
            }}
          >
            <option value="">선택</option>
            {roster.map((p) => (
              <option key={p.id} value={p.realName}>
                {p.realName}
                {p.ksfId ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        {player?.ksfId && (
          <p className="small">
            연결됨: {nationalName(player.ksfId)?.name ?? '국가 명단에 없는 번호'} ({player.ksfId}){' '}
            <button type="button" className="link" disabled={busy} onClick={() => void run(() => saveClubPlayer({ name: player.realName!, ksfId: '' }), '연결을 해제했습니다.')}>
              해제
            </button>
          </p>
        )}
        {player && (
          <label>
            국가 명단에서 찾기
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름" />
          </label>
        )}
        {player && hits.length > 0 && (
          <ul className="year-divisions" style={{ flexDirection: 'column' }}>
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="ghost" style={{ marginTop: 0 }} disabled={busy} onClick={() => void run(() => saveClubPlayer({ name: player.realName!, ksfId: h.id }), `${player.realName} ↔ ${h.name} 연결했습니다.`)}>
                  {h.name} · {h.birthYear ?? '?'} · {h.team ?? h.lastDivision ?? ''}
                </button>
              </li>
            ))}
          </ul>
        )}
        {player && q.trim() && hits.length === 0 && <p className="muted small">국가 명단(최근 3년 KSF 대회 출전자)에 없는 이름입니다.</p>}
      </form>
      <h3 style={{ marginTop: '1rem' }}>선수 추가</h3>
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
