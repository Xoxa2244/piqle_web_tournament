"use client"

import { useEffect, useState } from "react"
import { MapWithTournaments } from "@/components/MapWithTournaments"
import { loadGoogleMaps } from "@/lib/googleMapsLoader"
import type { LatLng, Tournament } from "@/types/tournament"

type ApiTournament = {
  id: string
  name: string
  startDate: string
  clubName: string
  address: string
}

type ApiResponse = {
  tournaments: ApiTournament[]
  isSample: boolean
}

export default function TournamentsMapPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [focusLocation, setFocusLocation] = useState<LatLng | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    const loadTournaments = async () => {
      setIsLoading(true)
      setLoadError(null)
      setStatusMessage(null)

      try {
        const response = await fetch("/api/tournaments-map")
        if (!response.ok) {
          throw new Error("Failed to load tournaments.")
        }

        const data = (await response.json()) as ApiResponse
        if (isCancelled) return

        if (data.isSample) {
          setStatusMessage(
            "No tournaments with saved addresses yet. Showing sample events."
          )
        }

        if (!data.tournaments.length) {
          setTournaments([])
          setIsLoading(false)
          setStatusMessage("No tournaments with addresses found.")
          return
        }

        const googleApi = await loadGoogleMaps({
          apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
          libraries: ["places"],
        })

        const geocoder = new googleApi.maps.Geocoder()
        const geocodeAddress = (address: string) =>
          new Promise<LatLng | null>((resolve) => {
            geocoder.geocode(
              { address },
              (results: any, status: any) => {
                if (status !== "OK" || !results?.length) {
                  resolve(null)
                  return
                }

                const location = results[0]?.geometry?.location
                if (!location) {
                  resolve(null)
                  return
                }

                resolve({ lat: location.lat(), lng: location.lng() })
              }
            )
          })

        const mapped = await Promise.all(
          data.tournaments.map(async (tournament) => {
            const coords = await geocodeAddress(tournament.address)
            if (!coords) return null
            return {
              ...tournament,
              lat: coords.lat,
              lng: coords.lng,
            } as Tournament
          })
        )

        if (isCancelled) return

        const withCoords = mapped.filter(Boolean) as Tournament[]
        setTournaments(withCoords)
        setFocusLocation(withCoords[0] ? { lat: withCoords[0].lat, lng: withCoords[0].lng } : null)

        if (!withCoords.length) {
          setStatusMessage("No tournaments could be geocoded from addresses.")
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load tournaments."
          )
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadTournaments()
    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Tournaments Map</h1>
        <p className="text-sm text-muted-foreground">
          Discover upcoming tournaments with saved addresses.
        </p>
      </div>

      {statusMessage ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {statusMessage}
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tournaments…</div>
      ) : null}
      <MapWithTournaments
        tournaments={tournaments}
        focusLocation={focusLocation}
      />
    </div>
  )
}
