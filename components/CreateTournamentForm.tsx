"use client"

import type { ChangeEvent, FormEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadGoogleMaps } from "@/lib/googleMapsLoader"
import type { Tournament } from "@/types/tournament"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type CreateTournamentFormProps = {
  onCreate: (tournament: Tournament) => void
}

type AddressDetails = {
  formattedAddress: string
  lat: number
  lng: number
  placeId?: string
  city?: string
  state?: string
  country?: string
}

const buildId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `t-${Date.now()}`
}

const extractAddressDetails = (place: any): AddressDetails | null => {
  if (!place?.geometry?.location || !place?.formatted_address) {
    return null
  }

  const components = place.address_components ?? []
  const findComponent = (type: string) =>
    components.find((component: any) => component.types?.includes(type))

  return {
    formattedAddress: place.formatted_address,
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
    placeId: place.place_id,
    city: findComponent("locality")?.long_name,
    state: findComponent("administrative_area_level_1")?.short_name,
    country: findComponent("country")?.long_name,
  }
}

export const CreateTournamentForm = ({ onCreate }: CreateTournamentFormProps) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
  const addressInputRef = useRef<HTMLInputElement | null>(null)
  const autocompleteRef = useRef<any>(null)
  const listenerRef = useRef<any>(null)
  const googleRef = useRef<any>(null)
  const [formState, setFormState] = useState({
    name: "",
    startDate: "",
    clubName: "",
    address: "",
    lat: 0,
    lng: 0,
    placeId: "",
    city: "",
    state: "",
    country: "",
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

  const addressLabel = useMemo(
    () => "Address (Google autocomplete)",
    []
  )

  const setupAutocomplete = useCallback(async () => {
    if (!addressInputRef.current) {
      return
    }

    try {
      const googleApi = await loadGoogleMaps({ apiKey, libraries: ["places"] })
      googleRef.current = googleApi

      if (autocompleteRef.current) {
        return
      }

      autocompleteRef.current = new googleApi.maps.places.Autocomplete(
        addressInputRef.current,
        {
          fields: [
            "formatted_address",
            "geometry",
            "place_id",
            "address_components",
          ],
          types: ["geocode"],
        }
      )

      listenerRef.current = autocompleteRef.current.addListener(
        "place_changed",
        () => {
          const place = autocompleteRef.current?.getPlace()
          const details = extractAddressDetails(place)

          if (!details) {
            setAddressError("Select a valid address from the list.")
            return
          }

          setAddressError(null)
          setFormState((prev) => ({
            ...prev,
            address: details.formattedAddress,
            lat: details.lat,
            lng: details.lng,
            placeId: details.placeId ?? "",
            city: details.city ?? "",
            state: details.state ?? "",
            country: details.country ?? "",
          }))
        }
      )
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : "Failed to load Google Places."
      )
    }
  }, [apiKey])

  useEffect(() => {
    setupAutocomplete()
    return () => {
      listenerRef.current?.remove()
    }
  }, [setupAutocomplete])

  const handleChange = (field: keyof typeof formState) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((prev) => ({
        ...prev,
        [field]: event.target.value,
      }))
    }
  }

  const handleAddressBlur = async () => {
    if (!formState.address.trim()) {
      return
    }

    if (formState.lat && formState.lng) {
      return
    }

    try {
      const googleApi =
        googleRef.current ??
        (await loadGoogleMaps({ apiKey, libraries: ["places"] }))

      googleRef.current = googleApi
      const geocoder = new googleApi.maps.Geocoder()
      geocoder.geocode({ address: formState.address }, (results, status) => {
        if (status !== "OK" || !results?.length) {
          setAddressError("Select a valid address from the list.")
          return
        }

        const details = extractAddressDetails(results[0])
        if (!details) {
          setAddressError("Select a valid address from the list.")
          return
        }

        setAddressError(null)
        setFormState((prev) => ({
          ...prev,
          address: details.formattedAddress,
          lat: details.lat,
          lng: details.lng,
          placeId: details.placeId ?? "",
          city: details.city ?? "",
          state: details.state ?? "",
          country: details.country ?? "",
        }))
      })
    } catch (error) {
      setAddressError(
        error instanceof Error ? error.message : "Failed to load Google Places."
      )
    }
  }

  const validateForm = () => {
    if (!formState.name.trim()) {
      return "Tournament name is required."
    }
    if (!formState.startDate) {
      return "Date and time are required."
    }
    if (!formState.clubName.trim()) {
      return "Club name is required."
    }
    if (!formState.address.trim() || !formState.lat || !formState.lng) {
      return "Please select an address from Google suggestions."
    }
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    const newTournament: Tournament = {
      id: buildId(),
      name: formState.name.trim(),
      startDate: new Date(formState.startDate).toISOString(),
      clubName: formState.clubName.trim(),
      address: formState.address.trim(),
      lat: Number(formState.lat),
      lng: Number(formState.lng),
      placeId: formState.placeId || undefined,
      city: formState.city || undefined,
      state: formState.state || undefined,
      country: formState.country || undefined,
    }

    // TODO: Replace this with a real API call to persist the tournament.
    onCreate(newTournament)

    setFormState({
      name: "",
      startDate: "",
      clubName: "",
      address: "",
      lat: 0,
      lng: 0,
      placeId: "",
      city: "",
      state: "",
      country: "",
    })
  }

  return (
    <form className="space-y-4 rounded-lg border p-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="tournament-name">Tournament name</Label>
        <Input
          id="tournament-name"
          value={formState.name}
          onChange={handleChange("name")}
          placeholder="Spring Pickleball Classic"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tournament-date">Date/time</Label>
        <Input
          id="tournament-date"
          type="datetime-local"
          value={formState.startDate}
          onChange={handleChange("startDate")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="club-name">Club name</Label>
        <Input
          id="club-name"
          value={formState.clubName}
          onChange={handleChange("clubName")}
          placeholder="Piqle Athletics Club"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tournament-address">{addressLabel}</Label>
        <Input
          id="tournament-address"
          ref={addressInputRef}
          value={formState.address}
          onChange={handleChange("address")}
          onBlur={handleAddressBlur}
          autoComplete="off"
          spellCheck={false}
          placeholder="Start typing the address..."
        />
        {addressError ? (
          <p className="text-sm text-destructive">{addressError}</p>
        ) : null}
      </div>

      {formError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </div>
      ) : null}

      <Button type="submit" className="w-full">
        Create tournament
      </Button>
    </form>
  )
}
