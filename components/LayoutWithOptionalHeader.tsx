'use client'

import { usePathname } from 'next/navigation'
import AppHeader from '@/components/AppHeader'

const EMBED_PATH_REGEX = /^\/scoreboard\/[^/]+\/embed$/

export default function LayoutWithOptionalHeader({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isEmbed = pathname ? EMBED_PATH_REGEX.test(pathname) : false
  const isChatsPage = pathname === '/chats'
  const isClubPage = pathname?.match(/^\/clubs\/[^/]+$/)
  const isFullHeightPage = isChatsPage || isClubPage

  if (isEmbed) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <>
      <AppHeader />
      <main
        className={isFullHeightPage ? 'h-screen overflow-hidden pt-16' : 'pt-16 min-h-screen'}
      >
        {children}
      </main>
    </>
  )
}
