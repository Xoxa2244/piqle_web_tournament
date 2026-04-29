let withSentryConfig = (config) => config

try {
  ;({ withSentryConfig } = require('@sentry/nextjs'))
} catch {
  console.warn('[next.config] @sentry/nextjs is not installed; building without Sentry integration.')
}

// Security headers — applied to all routes
// Docs: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer policy — don't leak full URLs to external sites
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions policy — disable unused browser APIs
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
  },
  // HSTS — force HTTPS for 2 years, include subdomains
  // Only enable in production (can break local http dev)
  ...(process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
  // DNS prefetch control
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    domains: ['localhost'],
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only upload source maps in CI / production builds
  silent: !process.env.CI,
  disableLogger: true,

  // Don't widen source maps scope
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger
  hideSourceMaps: true,

  // Skip source map upload if no auth token (local dev)
  ...(process.env.SENTRY_AUTH_TOKEN ? {} : { sourcemaps: { disable: true } }),
})
