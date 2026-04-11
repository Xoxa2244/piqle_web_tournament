import type { Metadata } from 'next'
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/900.css'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import LayoutWithOptionalHeader from '@/components/LayoutWithOptionalHeader'

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
      <body>
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
