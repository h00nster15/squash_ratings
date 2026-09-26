// The organisations the app is built for. Pure data, so both the app (src/org.ts) and the
// build (vite.config.ts: home-screen app name, colours and icon) read the same table.

// The Wellperion club Apps Script (v1 · mirror): the same /exec the club manager app uses.
const WELLPERION_EXEC = 'https://script.google.com/macros/s/AKfycbwpLozjXaVuue6WA-eCsHpVjbZqI3Aen1jV2I3ZU7zCZPi3RqMDR9U2BZ8Z6lEXm2O2/exec'

export type OrgKey = 'ksf' | 'wellperion' | 'seoul'

export interface OrgConfig {
  key: OrgKey
  /** Header title and browser tab. */
  title: string
  /** Name under the home-screen icon (about 12 characters show). */
  shortName: string
  subtitle: string
  /** Light and dark accent colours (buttons, active tabs, positive Δ). */
  accent: string
  accentDark: string
  /** Label of the club tab; the org's own ladder lives there. */
  clubLabel: string
  /** Where the app opens. */
  defaultView: 'national' | 'club' | 'league' | 'wellperion'
  /** Label of the club-league tab (data/seoul, built by tools/build-seoul.mts); absent = no such tab. */
  leagueLabel?: string
  /**
   * The Wellperion club ranking (src/wellperion.ts): results kept in the club Google Sheet,
   * served by its Apps Script. Absent = no such tab.
   */
  clubSource?: { label: string; execUrl: string }
  /** Pre-select this 시도 on the national ladder (players registered there). */
  nationalSido?: string
  /** localStorage namespace for the org's own players, matches and tournaments. */
  storageKey: string
}

export const ORGS: Record<OrgKey, OrgConfig> = {
  ksf: {
    key: 'ksf',
    title: 'Squash Ratings',
    shortName: 'Squash Ratings',
    subtitle: 'Ratings from official tournament results.',
    accent: '#1f7a4d',
    accentDark: '#4ccb8a',
    clubLabel: 'Club',
    defaultView: 'national',
    clubSource: { label: 'Wellperion', execUrl: WELLPERION_EXEC },
    storageKey: 'squash_ratings.v1',
  },
  wellperion: {
    key: 'wellperion',
    title: 'Wellperion Squash Ratings',
    shortName: 'Wellperion',
    subtitle: '웰페리온 스쿼시 박스래더 · 랭킹.',
    accent: '#0f4c5c',
    accentDark: '#7fa8d9',
    clubLabel: '로컬 기록',
    defaultView: 'wellperion',
    clubSource: { label: 'Wellperion', execUrl: WELLPERION_EXEC },
    storageKey: 'squash_ratings.wellperion.v1',
  },
  seoul: {
    key: 'seoul',
    title: '서울특별시스쿼시연맹 Rankings',
    shortName: '서울스쿼시',
    subtitle: '서울 등록 선수 랭킹 (대한체육회 대회 결과 기준).',
    accent: '#1f2a6b',
    accentDark: '#8ea6e8',
    clubLabel: '서울연맹 대회',
    leagueLabel: 'Club League',
    defaultView: 'league',
    nationalSido: '서울',
    storageKey: 'squash_ratings.seoul.v1',
  },
}
