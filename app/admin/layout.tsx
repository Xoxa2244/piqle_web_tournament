'use client'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="w-full">
        {children}
      </main>
    </div>
  )
}
