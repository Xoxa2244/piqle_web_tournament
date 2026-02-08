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

  if (isEmbed) {
    return <main className="min-h-screen">{children}</main>
  }

  return (
    <>
      <AppHeader />
      <main className="pt-16 min-h-screen">{children}</main>
    </>
  )
}
