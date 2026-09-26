import { org } from './org.ts'
import type { Match, Player, Tournament } from './rating/types.ts'

export interface AppData {
  players: Player[]
  matches: Match[]
  tournaments: Tournament[]
}

const KEY = org.storageKey

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>
      return { players: parsed.players ?? [], matches: parsed.matches ?? [], tournaments: parsed.tournaments ?? [] }
    }
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return { players: [], matches: [], tournaments: [] }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Ignore quota / private-mode failures; the in-memory state still works.
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Today's date where the user is (toISOString would give UTC: yesterday in Korea before 9 a.m.). */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
