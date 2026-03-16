import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from '@/components/providers'
import { BrandProvider } from '@/components/BrandProvider'
import { Toaster } from '@/components/ui/toaster'
import LayoutWithOptionalHeader from '@/components/LayoutWithOptionalHeader'
import { BRANDS, type BrandKey } from '@/lib/brand'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const brandKey = (headersList.get('x-brand') || 'piqle') as BrandKey
  const brand = BRANDS[brandKey] || BRANDS.piqle
  return {
    title: brand.metaTitle,
    description: brand.metaDescription,
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <BrandProvider>
            <LayoutWithOptionalHeader>
              {children}
            </LayoutWithOptionalHeader>
          </BrandProvider>
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
