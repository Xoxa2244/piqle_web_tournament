/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client'],
  images: {
    domains: ['localhost'],
  },
}

module.exports = nextConfig
