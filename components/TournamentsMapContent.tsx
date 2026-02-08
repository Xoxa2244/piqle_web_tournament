"use client"

import { useEffect, useState, useMemo } from "react"
import { MapWithTournaments } from "@/components/MapWithTournaments"
import { loadGoogleMaps } from "@/lib/googleMapsLoader"
import type { LatLng, Tournament } from "@/types/tournament"

type ApiTournament = {
  id: string
  name: string
  startDate: string
  endDate?: string
  clubName: string
  address: string
  publicSlug?: string
}

type ApiResponse = {
  tournaments: ApiTournament[]
  isSample: boolean
}

function getTournamentStatus(tournament: { startDate: string; endDate?: string }): 'past' | 'upcoming' | 'in_progress' {
  const now = new Date()
  const start = new Date(tournament.startDate)
  const end = tournament.endDate ? new Date(tournament.endDate) : start
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)

  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}

type TournamentsMapContentProps = {
  searchQuery?: string
  filterUpcoming?: boolean
  filterInProgress?: boolean
  filterPast?: boolean
}

export function TournamentsMapContent({
  searchQuery = '',
  filterUpcoming = true,
  filterInProgress = true,
  filterPast = false,
}: TournamentsMapContentProps = {}) {
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
              endDate: tournament.endDate,
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

  const filteredTournaments = useMemo(() => {
    let result = tournaments
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (!(filterUpcoming || filterInProgress || filterPast)) return result
    return result.filter((t) => {
      const status = getTournamentStatus(t)
      if (filterUpcoming && status === 'upcoming') return true
      if (filterInProgress && status === 'in_progress') return true
      if (filterPast && status === 'past') return true
      return false
    })
  }, [tournaments, searchQuery, filterUpcoming, filterInProgress, filterPast])

  const mapFocusLocation = useMemo(() => {
    if (filteredTournaments.length > 0) {
      return { lat: filteredTournaments[0].lat, lng: filteredTournaments[0].lng }
    }
    return focusLocation
  }, [filteredTournaments, focusLocation])

  return (
    <div className="space-y-6">
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
        tournaments={filteredTournaments}
        focusLocation={mapFocusLocation}
      />
    </div>
  )
}
