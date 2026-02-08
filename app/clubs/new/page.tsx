'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { ArrowLeft, Upload, X } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/googleMapsLoader'
import Image from 'next/image'
import AvatarCropper from '@/components/AvatarCropper'

export const dynamic = 'force-dynamic'

type AddressDetails = {
  formattedAddress: string
  city?: string
  state?: string
  country?: string
}

const extractAddressDetails = (place: any): AddressDetails | null => {
  if (!place?.formatted_address) return null

  const components = place.address_components ?? []
  const findComponent = (type: string) =>
    components.find((component: any) => component.types?.includes(type))

  return {
    formattedAddress: place.formatted_address,
    city:
      findComponent('locality')?.long_name ??
      findComponent('postal_town')?.long_name ??
      findComponent('sublocality')?.long_name ??
      findComponent('administrative_area_level_2')?.long_name,
    state: findComponent('administrative_area_level_1')?.short_name,
    country: findComponent('country')?.long_name,
  }
}

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
    logoUrl: '',
    address: '',
    city: '',
    state: '',
    country: 'United States',
    courtReserveUrl: '',
    bookingRequestEmail: '',
  })
  const [addressError, setAddressError] = useState<string | null>(null)
  const [addressSelected, setAddressSelected] = useState(false)
  const addressInputRef = useRef<HTMLInputElement | null>(null)
  const autocompleteRef = useRef<any>(null)
  const listenerRef = useRef<any>(null)
  const googleRef = useRef<any>(null)
  const logoFileInputRef = useRef<HTMLInputElement | null>(null)
  const [showLogoCropper, setShowLogoCropper] = useState(false)
  const [logoCropSrc, setLogoCropSrc] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  const setupAutocomplete = useCallback(async () => {
    if (!addressInputRef.current) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

    try {
      const googleApi = await loadGoogleMaps({ apiKey, libraries: ['places'] })
      googleRef.current = googleApi

      if (autocompleteRef.current) return

      autocompleteRef.current = new googleApi.maps.places.Autocomplete(addressInputRef.current, {
        fields: ['formatted_address', 'geometry', 'place_id', 'address_components'],
        types: ['geocode'],
      })

      listenerRef.current = autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace()
        const details = extractAddressDetails(place)

        if (!details) {
          setAddressError('Select a valid address from the list.')
          return
        }

        setAddressError(null)
        setAddressSelected(true)
        setForm((prev) => ({
          ...prev,
          address: details.formattedAddress,
          city: details.city ?? prev.city,
          state: details.state ?? prev.state,
          country: details.country ?? prev.country,
        }))
      })
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Failed to load Google Places.')
    }
  }, [])

  useEffect(() => {
    setupAutocomplete()
    return () => {
      listenerRef.current?.remove?.()
    }
  }, [setupAutocomplete])

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    if (addressSelected) return

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''
    try {
      const googleApi =
        googleRef.current ?? (await loadGoogleMaps({ apiKey, libraries: ['places'] }))
      googleRef.current = googleApi

      const geocoder = new googleApi.maps.Geocoder()
      geocoder.geocode({ address: form.address }, (results: any, status: any) => {
        if (status !== 'OK' || !results?.length) {
          setAddressError('Select a valid address from the list.')
          return
        }

        const details = extractAddressDetails(results[0])
        if (!details) {
          setAddressError('Select a valid address from the list.')
          return
        }

        setAddressError(null)
        setAddressSelected(true)
        setForm((prev) => ({
          ...prev,
          address: details.formattedAddress,
          city: details.city ?? prev.city,
          state: details.state ?? prev.state,
          country: details.country ?? prev.country,
        }))
      })
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Failed to load Google Places.')
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    createClub.mutate({
      name: form.name,
      kind: form.kind,
      description: form.description || undefined,
      logoUrl: form.logoUrl || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      courtReserveUrl: form.courtReserveUrl || undefined,
      bookingRequestEmail: form.bookingRequestEmail || undefined,
    })
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max file size is 5MB.', variant: 'destructive' })
      return
    }

    const url = URL.createObjectURL(file)
    setLogoCropSrc(url)
    setShowLogoCropper(true)
  }

  const handleLogoCropComplete = async (croppedImageUrl: string) => {
    setShowLogoCropper(false)
    setIsUploadingLogo(true)

    try {
      const response = await fetch(croppedImageUrl)
      const blob = await response.blob()
      const file = new File([blob], 'club-logo.jpg', { type: 'image/jpeg' })

      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('/api/upload-club-logo', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to upload logo')
      }

      const payload = await uploadResponse.json()
      if (!payload?.url) {
        throw new Error('Upload response missing URL')
      }

      setForm((p) => ({ ...p, logoUrl: payload.url }))
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsUploadingLogo(false)
      try {
        URL.revokeObjectURL(croppedImageUrl)
      } catch {}
      if (logoCropSrc) {
        try {
          URL.revokeObjectURL(logoCropSrc)
        } catch {}
      }
      setLogoCropSrc(null)
      if (logoFileInputRef.current) {
        logoFileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveLogo = () => {
    setForm((p) => ({ ...p, logoUrl: '' }))
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = ''
    }
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
              <Label>Club logo (optional)</Label>
              {form.logoUrl ? (
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                    <Image src={form.logoUrl} alt="" fill className="object-cover" />
                  </div>
                  <Button type="button" variant="outline" onClick={handleRemoveLogo} className="gap-2">
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    id="club-logo"
                  />
                  <label htmlFor="club-logo" className="inline-flex">
                    <Button type="button" variant="outline" className="gap-2" disabled={isUploadingLogo}>
                      <Upload className="h-4 w-4" />
                      {isUploadingLogo ? 'Uploading…' : 'Upload logo'}
                    </Button>
                  </label>
                  <span className="text-xs text-muted-foreground">Square images work best.</span>
                </div>
              )}
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
                ref={addressInputRef}
                value={form.address}
                onChange={(e) => {
                  setAddressSelected(false)
                  setForm((p) => ({ ...p, address: e.target.value }))
                }}
                onBlur={handleAddressBlur}
                autoComplete="off"
                spellCheck={false}
                placeholder="Start typing the address..."
              />
              {addressError ? <p className="text-sm text-destructive">{addressError}</p> : null}
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

      <AvatarCropper
        imageSrc={logoCropSrc || ''}
        isOpen={showLogoCropper}
        onClose={() => {
          setShowLogoCropper(false)
          if (logoCropSrc) {
            try {
              URL.revokeObjectURL(logoCropSrc)
            } catch {}
          }
          setLogoCropSrc(null)
          if (logoFileInputRef.current) {
            logoFileInputRef.current.value = ''
          }
        }}
        onCrop={handleLogoCropComplete}
        title="Crop club logo"
        aspectRatio={1}
      />
    </div>
  )
}
