'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Upload, X } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/googleMapsLoader'
import Image from 'next/image'
import AvatarCropper from '@/components/AvatarCropper'

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

export type CreateClubModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: (club: { id: string }) => void
}

const initialForm = {
  name: '',
  kind: 'VENUE' as 'VENUE' | 'COMMUNITY',
  joinPolicy: 'OPEN' as 'OPEN' | 'APPROVAL',
  description: '',
  logoUrl: '',
  address: '',
  city: '',
  state: '',
  country: 'United States',
  courtReserveUrl: '',
  bookingRequestEmail: '',
}

export default function CreateClubModal({ isOpen, onClose, onSuccess }: CreateClubModalProps) {
  const { toast } = useToast()
  const createClub = trpc.club.create.useMutation({
    onSuccess: (club) => {
      toast({ title: 'Club created', description: 'You are now an admin of this club.' })
      onSuccess(club)
      onClose()
    },
    onError: (err) => {
      toast({ title: 'Failed to create club', description: err.message, variant: 'destructive' })
    },
  })

  const [form, setForm] = useState(initialForm)
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
      if (!autocompleteRef.current) {
        autocompleteRef.current = new googleApi.maps.places.Autocomplete(addressInputRef.current, {
          fields: ['formatted_address', 'geometry', 'place_id', 'address_components'],
          types: ['geocode'],
        })
      }
      listenerRef.current?.remove?.()
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
    if (!isOpen) return
    const id = requestAnimationFrame(() => setupAutocomplete())
    return () => {
      cancelAnimationFrame(id)
      listenerRef.current?.remove?.()
    }
  }, [isOpen, setupAutocomplete])

  useEffect(() => {
    if (!isOpen) {
      setForm(initialForm)
      setAddressError(null)
      setAddressSelected(false)
    }
  }, [isOpen])

  const handleAddressBlur = async () => {
    const rawValue = addressInputRef.current?.value ?? form.address
    const value = rawValue.trim()
    if (!value || addressSelected) return
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''
    try {
      const googleApi = googleRef.current ?? (await loadGoogleMaps({ apiKey, libraries: ['places'] }))
      googleRef.current = googleApi
      const geocoder = new googleApi.maps.Geocoder()
      geocoder.geocode({ address: value }, (results: any, status: any) => {
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
      joinPolicy: form.joinPolicy,
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
    setLogoCropSrc(URL.createObjectURL(file))
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
      const uploadResponse = await fetch('/api/upload-club-logo', { method: 'POST', body: formData })
      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json().catch(() => ({}))
        throw new Error(payload?.error || 'Failed to upload logo')
      }
      const payload = await uploadResponse.json()
      if (!payload?.url) throw new Error('Upload response missing URL')
      setForm((p) => ({ ...p, logoUrl: payload.url }))
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error?.message || 'Please try again.', variant: 'destructive' })
    } finally {
      setIsUploadingLogo(false)
      try {
        URL.revokeObjectURL(croppedImageUrl)
      } catch {}
      if (logoCropSrc) try { URL.revokeObjectURL(logoCropSrc) } catch {}
      setLogoCropSrc(null)
      if (logoFileInputRef.current) logoFileInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = () => {
    setForm((p) => ({ ...p, logoUrl: '' }))
    if (logoFileInputRef.current) logoFileInputRef.current.value = ''
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-xl font-semibold">Create club</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Create a club/organization to host tournaments and announcements.
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-club-name">Name</Label>
                <Input
                  id="create-club-name"
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
                      id="create-club-logo"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={isUploadingLogo}
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      {isUploadingLogo ? 'Uploading…' : 'Upload logo'}
                    </Button>
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
                <Label>Membership</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={form.joinPolicy === 'OPEN' ? 'default' : 'outline'}
                    onClick={() => setForm((p) => ({ ...p, joinPolicy: 'OPEN' }))}
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    variant={form.joinPolicy === 'APPROVAL' ? 'default' : 'outline'}
                    onClick={() => setForm((p) => ({ ...p, joinPolicy: 'APPROVAL' }))}
                  >
                    Closed (approval)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open clubs let anyone join instantly. Closed clubs require admin approval.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-club-desc">Description (optional)</Label>
                <Textarea
                  id="create-club-desc"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={4}
                  placeholder="What is this club about?"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-club-city">City (optional)</Label>
                  <Input
                    id="create-club-city"
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    placeholder="e.g., Chicago"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-club-state">State (optional)</Label>
                  <Input
                    id="create-club-state"
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    placeholder="e.g., IL"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-club-address">Address (optional)</Label>
                <Input
                  id="create-club-address"
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
                <Label htmlFor="create-club-courtreserve">CourtReserve URL (optional)</Label>
                <Input
                  id="create-club-courtreserve"
                  value={form.courtReserveUrl}
                  onChange={(e) => setForm((p) => ({ ...p, courtReserveUrl: e.target.value }))}
                  onBlur={() => {
                    setForm((p) => {
                      const raw = (p.courtReserveUrl ?? '').trim()
                      if (!raw) return { ...p, courtReserveUrl: '' }
                      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
                      return { ...p, courtReserveUrl: hasScheme ? raw : `https://${raw}` }
                    })
                  }}
                  placeholder="https://app.courtreserve.com/..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-club-booking-email">Booking request email (optional)</Label>
                <Input
                  id="create-club-booking-email"
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
          </div>
        </div>
      </div>
      <AvatarCropper
        imageSrc={logoCropSrc || ''}
        isOpen={showLogoCropper}
        onClose={() => {
          setShowLogoCropper(false)
          if (logoCropSrc) {
            try { URL.revokeObjectURL(logoCropSrc) } catch {}
          }
          setLogoCropSrc(null)
          if (logoFileInputRef.current) logoFileInputRef.current.value = ''
        }}
        onCrop={handleLogoCropComplete}
        title="Crop club logo"
        aspectRatio={1}
      />
    </>
  )
}
