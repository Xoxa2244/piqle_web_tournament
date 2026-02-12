"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadGoogleMaps } from "@/lib/googleMapsLoader"
import { formatUsDateShort } from "@/lib/dateFormat"
import type { LatLng, Tournament } from "@/types/tournament"
import { Button } from "@/components/ui/button"
import { Locate, MapPin } from "lucide-react"

type MapWithTournamentsProps = {
  tournaments: Tournament[]
  focusLocation?: LatLng | null
  /** When set together with focusLocation, opens this tournament's info window */
  focusTournamentId?: string | null
  /** Called once after opening the focused tournament's info window */
  onFocusConsumed?: () => void
  /** When set, "Open tournament page" in the pin popup opens this modal instead of navigating */
  onOpenTournament?: (tournamentId: string) => void
}

const DEFAULT_CENTER: LatLng = { lat: 39.8283, lng: -98.5795 }
const DEFAULT_ZOOM = 4
const FOCUS_ZOOM = 12

function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return R * c
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getMapPinStatus(t: { startDate: string; endDate?: string }): 'past' | 'upcoming' | 'in_progress' {
  const now = new Date()
  const start = new Date(t.startDate)
  const end = t.endDate ? new Date(t.endDate) : start
  const endWithGrace = new Date(end)
  endWithGrace.setHours(endWithGrace.getHours() + 12)
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  if (endWithGrace < nextDay) return 'past'
  if (start > now) return 'upcoming'
  return 'in_progress'
}

const buildInfoWindowContent = (
  tournament: Tournament,
  onOpenTournament?: (tournamentId: string) => void
) => {
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    tournament.address
  )}`
  const status = getMapPinStatus(tournament)
  const statusLabel = status === 'past' ? 'Past' : status === 'upcoming' ? 'Upcoming' : 'In progress'
  const statusBg =
    status === 'past'
      ? '#f3f4f6'
      : status === 'upcoming'
        ? '#dbeafe'
        : '#d1fae8'
  const statusColor =
    status === 'past'
      ? '#6b7280'
      : status === 'upcoming'
        ? '#1d4ed8'
        : '#047857'
  const imgSrc =
    tournament.image && tournament.image.trim()
      ? tournament.image
      : '/tournament-placeholder.png'
  const startStr = formatUsDateShort(tournament.startDate)
  const endStr = tournament.endDate
    ? formatUsDateShort(tournament.endDate)
    : startStr
  const datesStr = startStr === endStr ? startStr : `${startStr} – ${endStr}`
  const entryFeeStr =
    tournament.entryFeeCents != null && tournament.entryFeeCents > 0
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: (tournament.currency || 'usd').toUpperCase(),
        }).format(tournament.entryFeeCents / 100)
      : 'Free'

  const openButton =
    onOpenTournament != null
      ? `<a href="#" class="open-tournament-modal-link" data-tournament-id="${tournament.id}" style="display: inline-block; margin-top: 8px; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; border: none; cursor: pointer;">Open tournament</a>`
      : (() => {
          const href = tournament.publicSlug
            ? `/t/${tournament.publicSlug}`
            : `/admin/${tournament.id}`
          return `<a href="${href}" style="display: inline-block; margin-top: 8px; padding: 8px 16px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Open tournament</a>`
        })()

  return `
    <div style="min-width: 260px; font-family: system-ui, sans-serif;">
      <div style="display: flex; gap: 10px; margin-bottom: 8px;">
        <img src="${imgSrc}" alt="" style="width: 56px; height: 56px; object-fit: cover; border-radius: 8px; flex-shrink: 0;" />
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 15px; line-height: 1.3;">${escapeHtml(tournament.name)}</div>
          <span style="display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; background: ${statusBg}; color: ${statusColor};">${statusLabel}</span>
        </div>
      </div>
      <div style="font-size: 13px; color: #374151; margin-bottom: 4px;"><strong>Entry Fee:</strong> ${entryFeeStr}</div>
      <div style="font-size: 13px; color: #374151; margin-bottom: 4px;"><strong>Dates:</strong> ${datesStr}</div>
      <div style="font-size: 13px; color: #374151; margin-bottom: 6px;">
        <a href="${mapsHref}" target="_blank" rel="noreferrer" style="color: #2563eb; text-decoration: underline;">${escapeHtml(tournament.address)}</a>
      </div>
      ${openButton}
    </div>
  `
}

export const MapWithTournaments = ({
  tournaments,
  focusLocation,
  focusTournamentId,
  onFocusConsumed,
  onOpenTournament,
}: MapWithTournamentsProps) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const googleRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
  const tournamentMarkersRef = useRef<Map<string, any>>(new Map())
  const userMarkerRef = useRef<any>(null)
  const onOpenTournamentRef = useRef(onOpenTournament)
  onOpenTournamentRef.current = onOpenTournament
  const [mapError, setMapError] = useState<string | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)

  const mapCenter = useMemo(() => DEFAULT_CENTER, [])

  const initializeMap = useCallback(async () => {
    try {
      const googleApi = await loadGoogleMaps({
        apiKey,
        libraries: ["places"],
      })
      googleRef.current = googleApi

      if (mapInstanceRef.current || !mapContainerRef.current) {
        return
      }

      mapInstanceRef.current = new googleApi.maps.Map(mapContainerRef.current, {
        center: mapCenter,
        zoom: DEFAULT_ZOOM,
        fullscreenControl: false,
        mapTypeControl: false,
        streetViewControl: false,
      })

      infoWindowRef.current = new googleApi.maps.InfoWindow()
      googleApi.maps.event.addListener(infoWindowRef.current, 'domready', () => {
        const link = document.querySelector('.open-tournament-modal-link')
        if (!link || !onOpenTournamentRef.current) return
        link.addEventListener('click', (e: Event) => {
          e.preventDefault()
          const id = link.getAttribute('data-tournament-id')
          if (id) onOpenTournamentRef.current?.(id)
        })
      })
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "Failed to load Google Maps."
      )
    }
  }, [apiKey, mapCenter])

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by this browser.")
      return
    }

    setIsLocating(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        setUserLocation(nextLocation)
        setIsLocating(false)
      },
      () => {
        setIsLocating(false)
        setGeoError(
          "We couldn't access your location. Using the default map center."
        )
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  const focusNearestTournament = useCallback(() => {
    if (!userLocation || tournaments.length === 0 || !mapInstanceRef.current || !googleRef.current || !infoWindowRef.current) {
      return
    }
    let nearest: Tournament | null = null
    let minDist = Infinity
    for (const t of tournaments) {
      const d = haversineDistanceKm(userLocation, { lat: t.lat, lng: t.lng })
      if (d < minDist) {
        minDist = d
        nearest = t
      }
    }
    if (!nearest) return
    const pos = { lat: nearest.lat, lng: nearest.lng }
    mapInstanceRef.current.panTo(pos)
    mapInstanceRef.current.setZoom(FOCUS_ZOOM)
    const marker = tournamentMarkersRef.current.get(nearest.id)
    if (marker) {
      infoWindowRef.current.setContent(buildInfoWindowContent(nearest, onOpenTournamentRef.current))
      infoWindowRef.current.open({
        anchor: marker,
        map: mapInstanceRef.current,
      })
    }
  }, [userLocation, tournaments])

  useEffect(() => {
    initializeMap()
  }, [initializeMap])

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return
    }

    if (userLocation) {
      mapInstanceRef.current.setCenter(userLocation)
      mapInstanceRef.current.setZoom(FOCUS_ZOOM)
    } else {
      mapInstanceRef.current.setCenter(DEFAULT_CENTER)
      mapInstanceRef.current.setZoom(DEFAULT_ZOOM)
    }
  }, [userLocation])

  useEffect(() => {
    if (!mapInstanceRef.current || !googleRef.current) {
      return
    }

    tournamentMarkersRef.current.forEach((marker) => marker.setMap(null))
    tournamentMarkersRef.current.clear()

    const bounds = new googleRef.current.maps.LatLngBounds()

    tournaments.forEach((tournament) => {
      const marker = new googleRef.current!.maps.Marker({
        map: mapInstanceRef.current!,
        position: { lat: tournament.lat, lng: tournament.lng },
        title: tournament.name,
      })

      marker.addListener("click", () => {
        if (!infoWindowRef.current) {
          return
        }

        infoWindowRef.current.setContent(buildInfoWindowContent(tournament, onOpenTournamentRef.current))
        infoWindowRef.current.open({
          anchor: marker,
          map: mapInstanceRef.current!,
        })
      })

      tournamentMarkersRef.current.set(tournament.id, marker)
      bounds.extend(marker.getPosition()!)
    })

    if (!userLocation && tournaments.length > 0) {
      mapInstanceRef.current.fitBounds(bounds)
    }
  }, [tournaments, userLocation])

  useEffect(() => {
    if (!mapInstanceRef.current || !googleRef.current) {
      return
    }

    if (!userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null)
        userMarkerRef.current = null
      }
      return
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new googleRef.current.maps.Marker({
        map: mapInstanceRef.current,
        position: userLocation,
        title: "You are here",
        icon: {
          path: googleRef.current.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#3b82f6",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      })
    } else {
      userMarkerRef.current.setPosition(userLocation)
    }
  }, [userLocation])

  useEffect(() => {
    if (!mapInstanceRef.current || !focusLocation) {
      return
    }

    mapInstanceRef.current.panTo(focusLocation)
    mapInstanceRef.current.setZoom(FOCUS_ZOOM)
  }, [focusLocation])

  // Open info window for focused tournament once markers exist
  useEffect(() => {
    if (!focusTournamentId || !infoWindowRef.current || !mapInstanceRef.current) return
    const marker = tournamentMarkersRef.current.get(focusTournamentId)
    const tournament = tournaments.find((t) => t.id === focusTournamentId)
    if (marker && tournament) {
      infoWindowRef.current.setContent(buildInfoWindowContent(tournament, onOpenTournamentRef.current))
      infoWindowRef.current.open({
        anchor: marker,
        map: mapInstanceRef.current,
      })
      onFocusConsumed?.()
    }
  }, [focusTournamentId, tournaments, onFocusConsumed])

  useEffect(() => {
    locateUser()
  }, [locateUser])

  const hasLocation = userLocation !== null
  const canFocusNearest = hasLocation && tournaments.length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={locateUser}>
          <Locate className="h-4 w-4 mr-2" />
          {isLocating ? "Locating..." : "Use my location"}
        </Button>
        <span
          title={!hasLocation ? "Allow location access to find the nearest tournament" : undefined}
          className="inline-flex"
        >
          <Button
            type="button"
            variant="outline"
            onClick={focusNearestTournament}
            disabled={!canFocusNearest}
            className={!canFocusNearest ? "cursor-not-allowed" : undefined}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Nearest tournament
          </Button>
        </span>
        {geoError ? (
          <span className="text-sm text-muted-foreground">{geoError}</span>
        ) : null}
      </div>
      {mapError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {mapError}
        </div>
      ) : null}
      <div
        ref={mapContainerRef}
        className="h-[520px] w-full rounded-lg border"
      />
    </div>
  )
}
