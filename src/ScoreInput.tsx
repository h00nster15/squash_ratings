import { readScore, type ScoreEntry } from './score.ts'

// The score part of the coach's result form; score.ts holds what it saves.

export function ScoreInput({ value, onChange, winner, loser }: { value: ScoreEntry; onChange: (v: ScoreEntry) => void; winner: string; loser: string }) {
  const read = readScore(value)
  const setGame = (i: number, side: 0 | 1, v: string) =>
    onChange({ ...value, games: value.games.map((g, j) => (j === i ? (side === 0 ? [v, g[1]] : [g[0], v]) : g)) })
  const won = value.games.filter(([a, b]) => a && b && Number(a) > Number(b)).length
  const lost = value.games.filter(([a, b]) => a && b && Number(b) > Number(a)).length

  return (
    <fieldset className="score-input">
      <legend>스코어</legend>
      <div className="segmented" role="group" aria-label="스코어 입력 방식">
        <button type="button" className={value.mode === 'points' ? 'on' : ''} onClick={() => onChange({ ...value, mode: 'points' })}>게임별 점수</button>
        <button type="button" className={value.mode === 'match' ? 'on' : ''} onClick={() => onChange({ ...value, mode: 'match' })}>게임 수만</button>
      </div>
      {value.mode === 'points' ? (
        <>
          <div className="games-grid">
            <div className="game-row">
              <span />
              <span className="muted small who">{winner}</span>
              <span />
              <span className="muted small who">{loser}</span>
            </div>
            {value.games.map(([a, b], i) => (
              <div key={i} className="game-row">
                <span className="muted small">{i + 1}게임</span>
                <input inputMode="numeric" aria-label={`${i + 1}게임 ${winner} 점수`} value={a} onChange={(e) => setGame(i, 0, e.target.value.replace(/\D/g, ''))} />
                <span className="muted">–</span>
                <input inputMode="numeric" aria-label={`${i + 1}게임 ${loser} 점수`} value={b} onChange={(e) => setGame(i, 1, e.target.value.replace(/\D/g, ''))} />
              </div>
            ))}
          </div>
          <p className="muted small">
            {read.score ? (
              <>
                게임 스코어 <strong className="mono">{won}–{lost}</strong> · 안 한 게임은 비워 두세요
              </>
            ) : (
              '안 한 게임은 비워 두세요. 점수를 모르면 "게임 수만"을 고르세요.'
            )}
          </p>
        </>
      ) : (
        <label>
          게임 스코어 (승자 기준)
          <select value={value.match} onChange={(e) => onChange({ ...value, match: e.target.value })}>
            <option value="">스코어 없음</option>
            <option value="3-0">3–0</option>
            <option value="3-1">3–1</option>
            <option value="3-2">3–2</option>
          </select>
        </label>
      )}
    </fieldset>
  )
}
