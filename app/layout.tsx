import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import LayoutWithOptionalHeader from '@/components/LayoutWithOptionalHeader'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Piqle Tournament Management',
  description: 'Comprehensive tournament management system for pickleball tournaments',
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
          <LayoutWithOptionalHeader>
            {children}
          </LayoutWithOptionalHeader>
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
