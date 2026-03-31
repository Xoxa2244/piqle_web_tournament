const { withSentryConfig } = require('@sentry/nextjs')

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
