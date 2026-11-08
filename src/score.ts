// The score part of the coach's result form: the points of each game (best of five), or
// just the match score when the game scores weren't kept. It writes the same text the club
// sheet's 스코어 column has always held, from the winner's side: "11-7 9-11 11-5 11-8" or "3-1".

export interface ScoreEntry {
  mode: 'points' | 'match'
  /** Up to five games: [winner's points, loser's points] as typed. */
  games: [string, string][]
  /** Match-score mode: '3-0', '3-1', '3-2' or '' (no score). */
  match: string
}

export const emptyScore: ScoreEntry = { mode: 'points', games: Array.from({ length: 5 }, () => ['', ''] as [string, string]), match: '' }

/**
 * The 스코어 text to save, or why it can't be saved yet. A warning is something that looks
 * unusual for a game to 11 (point-a-rally, win by two) but may be right (a game to 15, a
 * retirement), so it doesn't stop the save.
 */
export function readScore(s: ScoreEntry): { score: string; error?: string; warning?: string } {
  if (s.mode === 'match') return { score: s.match }
  const filled = s.games.map(([a, b], i) => ({ i, a: a.trim(), b: b.trim() })).filter((g) => g.a || g.b)
  if (!filled.length) return { score: '' }
  const half = filled.find((g) => !g.a || !g.b)
  if (half) return { score: '', error: `${half.i + 1}게임 점수를 양쪽 다 입력해 주세요.` }
  const games = filled.map((g) => [Number(g.a), Number(g.b)] as [number, number])
  if (games.some(([a, b]) => !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)) return { score: '', error: '점수는 0 이상의 숫자로 입력해 주세요.' }
  const tie = games.findIndex(([a, b]) => a === b)
  if (tie >= 0) return { score: '', error: `${filled[tie].i + 1}게임이 동점입니다.` }
  const won = games.filter(([a, b]) => a > b).length
  const lost = games.length - won
  if (won <= lost) return { score: '', error: `승자가 이긴 게임(${won})이 진 게임(${lost})보다 많아야 합니다. 승자/패자가 바뀌지 않았는지 확인해 주세요.` }
  const odd = filled.filter((_, k) => {
    const [a, b] = games[k]
    const hi = Math.max(a, b)
    const lo = Math.min(a, b)
    return hi < 11 || (lo >= 10 ? hi - lo !== 2 : hi !== 11)
  })
  const warning = odd.length ? `${odd.map((g) => `${g.i + 1}게임`).join(', ')} 점수가 11점제와 다릅니다 — 맞다면 그대로 저장하세요.` : undefined
  return { score: games.map(([a, b]) => `${a}-${b}`).join(' '), warning }
}
