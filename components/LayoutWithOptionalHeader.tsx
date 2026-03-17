'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import { useBrand } from '@/components/BrandProvider'

const EMBED_PATH_REGEX = /^\/scoreboard\/[^/]+\/embed$/

export default function LayoutWithOptionalHeader({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const brand = useBrand()
  const isEmbed = pathname ? EMBED_PATH_REGEX.test(pathname) : false
  const isChatsPage = pathname === '/chats'
  const isIQIntelligence = brand.key === 'iqsport' && pathname?.includes('/intelligence')

  if (isEmbed || isIQIntelligence) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <>
      <AppHeader />
      <main
        className={isChatsPage ? 'h-screen overflow-hidden pt-16' : 'pt-16 min-h-screen'}
      >
        {children}
      </main>
    </>
  )
}
