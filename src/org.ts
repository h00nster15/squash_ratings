// Organisation flavours of the app. One codebase, three builds:
//   npm run dev            KSF (default)        npm run build
//   npm run dev:wellperion Wellperion Squash    npm run build:wellperion
//   npm run dev:seoul      서울특별시스쿼시연맹     npm run build:seoul
// The mode comes from Vite (`--mode wellperion` reads .env.wellperion); for a
// quick look, `?org=seoul` on the URL overrides it.

import { ORGS, type OrgConfig, type OrgKey } from './orgs.ts'

export type { OrgConfig, OrgKey } from './orgs.ts'

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
