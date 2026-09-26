import { useState, type FormEvent } from 'react'
import type { DataProps } from './shared.ts'
import type { Tournament, TournamentFormat } from './rating/types.ts'
import { newId, today } from './storage.ts'

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  roundrobin: 'Round robin (box)',
  knockout: 'Knockout',
}

export function Tournaments({ data: { tournaments, matches }, setData }: DataProps) {
  const [form, setForm] = useState({ name: '', date: today(), format: 'roundrobin' as TournamentFormat, division: '' })

  function create(e: FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return
    const t: Tournament = { id: newId(), name, date: form.date, format: form.format, division: form.division.trim() || undefined, entrantIds: [] }
    setData((d) => ({ ...d, tournaments: [...d.tournaments, t] }))
    setForm((f) => ({ ...f, name: '', division: '' }))
    location.hash = `#tournament/${t.id}`
  }

  const played = new Map<string, number>()
  for (const m of matches) if (m.tournamentId) played.set(m.tournamentId, (played.get(m.tournamentId) ?? 0) + 1)
  const list = [...tournaments].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="two-col wide-left">
      <section className="panel">
        <h2>Tournaments</h2>
        {list.length === 0 ? (
          <p className="muted">No tournaments yet. Results entered under a tournament count toward the club ladder straight away.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tournament</th>
                <th className="sm-hide">Format</th>
                <th className="num">Players</th>
                <th className="num sm-hide">Matches</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{t.date}</td>
                  <td>
                    <a className="player-link" href={`#tournament/${t.id}`}>
                      {t.name}
                    </a>
                    {t.division && <span className="muted small"> · {t.division}</span>}
                  </td>
                  <td className="muted small sm-hide">{FORMAT_LABEL[t.format]}</td>
                  <td className="num">{t.entrantIds.length}</td>
                  <td className="num sm-hide">{played.get(t.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>New tournament</h2>
        <form onSubmit={create} className="match-form">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 9월 박스래더 A" required />
          </label>
          <div className="sides">
            <label>
              Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </label>
            <label>
              Format
              <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as TournamentFormat })}>
                {(Object.keys(FORMAT_LABEL) as TournamentFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Division <span className="muted">(optional)</span>
            <input value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} placeholder="e.g. 주니어 U15" />
          </label>
          <button type="submit" disabled={!form.name.trim()}>
            Create
          </button>
        </form>
      </section>
    </div>
  )
}
