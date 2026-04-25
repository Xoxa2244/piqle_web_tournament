'use client'

import { SuperadminAccessGate } from '@/app/superadmin/_components/SuperadminAccessGate'
import { useSuperadminAccess } from '@/app/superadmin/_hooks/use-superadmin-access'

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const superadminAccess = useSuperadminAccess()

  return (
    <SuperadminAccessGate
      loading={superadminAccess.loading}
      allowed={superadminAccess.allowed}
      needsSignIn={superadminAccess.needsSignIn}
      reason={superadminAccess.reason}
      onSignIn={superadminAccess.requestSignIn}
    >
      {children}
    </SuperadminAccessGate>
  )
}
