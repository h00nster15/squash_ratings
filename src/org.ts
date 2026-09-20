// Organisation flavours of the app. One codebase, three builds:
//   npm run dev            KSF (default)        npm run build
//   npm run dev:wellperion Wellperion Squash    npm run build:wellperion
//   npm run dev:seoul      서울특별시스쿼시연맹     npm run build:seoul
// The mode comes from Vite (`--mode wellperion` reads .env.wellperion); for a
// quick look, `?org=seoul` on the URL overrides it.

export type OrgKey = 'ksf' | 'wellperion' | 'seoul'

export interface OrgConfig {
  key: OrgKey
  /** Header title and browser tab. */
  title: string
  subtitle: string
  /** Light and dark accent colours (buttons, active tabs, positive Δ). */
  accent: string
  accentDark: string
  /** Label of the club tab; the org's own ladder lives there. */
  clubLabel: string
  /** Where the app opens. */
  defaultView: 'national' | 'club' | 'league'
  /** Label of the club-league tab (data/seoul, built by tools/build-seoul.mts); absent = no such tab. */
  leagueLabel?: string
  /** Pre-select this 시도 on the national ladder (players registered there). */
  nationalSido?: string
  /** localStorage namespace for the org's own players, matches and tournaments. */
  storageKey: string
}

const ORGS: Record<OrgKey, OrgConfig> = {
  ksf: {
    key: 'ksf',
    title: 'Squash Ratings',
    subtitle: 'Ratings from official tournament results.',
    accent: '#1f7a4d',
    accentDark: '#4ccb8a',
    clubLabel: 'Club',
    defaultView: 'national',
    storageKey: 'squash_ratings.v1',
  },
  wellperion: {
    key: 'wellperion',
    title: 'Wellperion Squash Ratings',
    subtitle: '웰페리온 스쿼시 박스래더 · 랭킹.',
    accent: '#0f4c5c',
    accentDark: '#7fa8d9',
    clubLabel: 'Wellperion',
    defaultView: 'club',
    storageKey: 'squash_ratings.wellperion.v1',
  },
  seoul: {
    key: 'seoul',
    title: '서울특별시스쿼시연맹 Rankings',
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

function pickOrg(): OrgConfig {
  const fromQuery = new URLSearchParams(location.search).get('org')
  const fromEnv = import.meta.env.VITE_ORG as string | undefined
  const key = (fromQuery || fromEnv || 'ksf') as OrgKey
  return ORGS[key] ?? ORGS.ksf
}

export const org = pickOrg()

/** Apply the org's title and colours once at startup. */
export function applyOrgTheme() {
  document.title = org.title
  const root = document.documentElement
  root.style.setProperty('--accent', org.accent)
  root.style.setProperty('--accent-bg', hexToRgba(org.accent, 0.1))
  root.style.setProperty('--up', org.accent)
  root.dataset.org = org.key
  // Dark scheme: swap in the lighter accent.
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const c = dark.matches ? org.accentDark : org.accent
    root.style.setProperty('--accent', c)
    root.style.setProperty('--accent-bg', hexToRgba(c, 0.12))
    root.style.setProperty('--up', c)
  }
  apply()
  dark.addEventListener('change', apply)
}

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
