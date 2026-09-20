import type { AppData } from './storage.ts'

/** Games a side can win in a best-of-five. */
export const GAME_OPTIONS = [0, 1, 2, 3]

/** Club data store handed to the views that read or edit it. */
export interface DataProps {
  data: AppData
  setData: (update: (d: AppData) => AppData) => void
}
