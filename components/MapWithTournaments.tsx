"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadGoogleMaps } from "@/lib/googleMapsLoader"
import type { LatLng, Tournament } from "@/types/tournament"
import { Button } from "@/components/ui/button"

type MapWithTournamentsProps = {
  tournaments: Tournament[]
  focusLocation?: LatLng | null
}

const DEFAULT_CENTER: LatLng = { lat: 39.8283, lng: -98.5795 }
const DEFAULT_ZOOM = 4
const FOCUS_ZOOM = 12

const buildInfoWindowContent = (tournament: Tournament) => {
  const href = tournament.publicSlug
    ? `/t/${tournament.publicSlug}`
    : `/admin/${tournament.id}`
  return `
    <div style="min-width: 220px">
      <div style="font-weight: 600; margin-bottom: 4px;">${tournament.name}</div>
      <div style="margin-bottom: 4px;">${new Date(
        tournament.startDate
      ).toLocaleString()}</div>
      <div style="margin-bottom: 4px;">${tournament.clubName}</div>
      <div style="margin-bottom: 8px;">${tournament.address}</div>
      <a href="${href}" style="color: #2563eb; text-decoration: underline;">
        Open tournament page
      </a>
    </div>
  `
}

export const MapWithTournaments = ({
  tournaments,
  focusLocation,
}: MapWithTournamentsProps) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const googleRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
  const tournamentMarkersRef = useRef<Map<string, any>>(new Map())
  const userMarkerRef = useRef<any>(null)
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

        infoWindowRef.current.setContent(buildInfoWindowContent(tournament))
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

  useEffect(() => {
    locateUser()
  }, [locateUser])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={locateUser}>
          {isLocating ? "Locating..." : "Use my location"}
        </Button>
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
