/**
 * Multi-brand configuration for serving the same app on different domains.
 *
 * - piqle.io / stest.piqle.io → full app (tournaments + intelligence)
 * - app.iqsport.ai → intelligence-only (no tournaments)
 *
 * Brand is detected from the hostname in middleware (server-side)
 * and via window.location.hostname in BrandProvider (client-side).
 */

export type BrandKey = 'piqle' | 'iqsport'

export interface NavItem {
  label: string
  href: string
  /** Lucide icon name, e.g. 'Zap' */
  icon?: string
  /** Accent color class for the link text */
  colorClass?: string
}

export interface BrandConfig {
  key: BrandKey
  name: string
  tagline: string
  /** Path in /public */
  logo: string
  /** Fallback text if logo fails to load */
  fallbackText: string
  /** Tailwind color class for fallback text */
  fallbackColorClass: string
  metaTitle: string
  metaDescription: string
  /** Where to redirect after club creation */
  postClubCreateRoute: (clubId: string) => string
  /** CTA button in header */
  ctaLabel: string
  ctaHref: string
  /** Navigation items in header */
  navItems: NavItem[]
  /** Show tournament search in header */
  showTournamentSearch: boolean
  /** Route patterns to block (redirect to /clubs) */
  hiddenRoutePatterns: RegExp[]
}

export const BRANDS: Record<BrandKey, BrandConfig> = {
  piqle: {
    key: 'piqle',
    name: 'Piqle',
    tagline: 'Tournament Management',
    logo: '/Logo.svg',
    fallbackText: 'PIQLE',
    fallbackColorClass: 'text-lime-600',
    metaTitle: 'Piqle Tournament Management',
    metaDescription: 'Comprehensive tournament management system for pickleball tournaments',
    postClubCreateRoute: (clubId) => `/clubs/${clubId}`,
    ctaLabel: 'Create New Tournament',
    ctaHref: '/admin/new',
    showTournamentSearch: true,
    navItems: [
      { label: 'Clubs', href: '/clubs' },
      { label: 'Players', href: '/players' },
      { label: 'Tournament Management', href: '/admin' },
      { label: 'Play', href: '/play', icon: 'Zap', colorClass: 'text-lime-600 hover:text-lime-700' },
    ],
    hiddenRoutePatterns: [],
  },
  iqsport: {
    key: 'iqsport',
    name: 'IQSport.ai',
    tagline: 'AI Intelligence for Clubs',
    logo: '/iqsport-logo.svg',
    fallbackText: 'IQSport.ai',
    fallbackColorClass: 'text-blue-600',
    metaTitle: 'IQSport.ai — AI Intelligence for Clubs',
    metaDescription: 'AI-powered revenue optimization and member engagement platform for racquet sports clubs',
    postClubCreateRoute: (clubId) => `/clubs/${clubId}/intelligence`,
    ctaLabel: 'Create Club',
    ctaHref: '/clubs?create=1',
    showTournamentSearch: false,
    navItems: [
      { label: 'Clubs', href: '/clubs' },
    ],
    hiddenRoutePatterns: [
      /^\/admin(\/|$)/,
      /^\/tournaments(\/|$)/,
      /^\/play(\/|$)/,
      /^\/players(\/|$)/,
      /^\/chats(\/|$)/,
      /^\/superadmin(\/|$)/,
      /^\/scoreboard(\/|$)/,
    ],
  },
}

/**
 * Detect brand from hostname.
 * Any hostname containing 'iqsport' → iqsport brand, otherwise piqle.
 */
export function getBrandFromHostname(hostname: string): BrandKey {
  return hostname.includes('iqsport') ? 'iqsport' : 'piqle'
}

/**
 * Get the full brand config from a hostname.
 */
export function getBrandConfig(hostname: string): BrandConfig {
  return BRANDS[getBrandFromHostname(hostname)]
}
