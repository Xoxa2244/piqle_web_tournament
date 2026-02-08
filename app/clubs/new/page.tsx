'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { trpc } from '@/lib/trpc'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function NewClubPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { toast } = useToast()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/auth/signin?callbackUrl=${encodeURIComponent('/clubs/new')}`)
    }
  }, [status, router])

  const createClub = trpc.club.create.useMutation({
    onSuccess: (club) => {
      toast({ title: 'Club created', description: 'You are now an admin of this club.' })
      router.push(`/clubs/${club.id}`)
    },
    onError: (err) => {
      toast({ title: 'Failed to create club', description: err.message, variant: 'destructive' })
    },
  })

  const [form, setForm] = useState({
    name: '',
    kind: 'VENUE' as 'VENUE' | 'COMMUNITY',
    description: '',
    address: '',
    city: '',
    state: '',
    country: 'United States',
    courtReserveUrl: '',
    bookingRequestEmail: '',
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    createClub.mutate({
      name: form.name,
      kind: form.kind,
      description: form.description || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      courtReserveUrl: form.courtReserveUrl || undefined,
      bookingRequestEmail: form.bookingRequestEmail || undefined,
    })
  }

  return (
    <div className="space-y-6 px-6 py-8 max-w-2xl">
      <Link href="/clubs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Back to clubs
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create club</h1>
        <p className="text-sm text-muted-foreground">
          Create a club/organization to host tournaments and announcements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Club details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Chicago Pickleball Center"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.kind === 'VENUE' ? 'default' : 'outline'}
                  onClick={() => setForm((p) => ({ ...p, kind: 'VENUE' }))}
                >
                  Venue club
                </Button>
                <Button
                  type="button"
                  variant={form.kind === 'COMMUNITY' ? 'default' : 'outline'}
                  onClick={() => setForm((p) => ({ ...p, kind: 'COMMUNITY' }))}
                >
                  Community/coach
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={4}
                placeholder="What is this club about?"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City (optional)</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="e.g., Chicago"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State (optional)</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                  placeholder="e.g., IL"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address (optional)</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="e.g., 300 N State St, Chicago, IL"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="courtReserveUrl">CourtReserve URL (optional)</Label>
              <Input
                id="courtReserveUrl"
                value={form.courtReserveUrl}
                onChange={(e) => setForm((p) => ({ ...p, courtReserveUrl: e.target.value }))}
                placeholder="https://app.courtreserve.com/..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bookingRequestEmail">Booking request email (optional)</Label>
              <Input
                id="bookingRequestEmail"
                value={form.bookingRequestEmail}
                onChange={(e) => setForm((p) => ({ ...p, bookingRequestEmail: e.target.value }))}
                placeholder="frontdesk@club.com"
              />
              <p className="text-xs text-muted-foreground">
                Not used yet (request is stored in Piqle); will be used for email forwarding later.
              </p>
            </div>

            <Button type="submit" disabled={createClub.isPending} className="w-full">
              {createClub.isPending ? 'Creating…' : 'Create club'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

