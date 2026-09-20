import type { Match, Player } from './rating/types'

export interface AppData {
  players: Player[]
  matches: Match[]
}

const KEY = 'squash_ratings.v1'

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>
      return { players: parsed.players ?? [], matches: parsed.matches ?? [] }
    }
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return { players: [], matches: [] }
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

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
