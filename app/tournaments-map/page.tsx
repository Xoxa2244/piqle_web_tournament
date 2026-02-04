"use client"

import { useEffect, useState } from "react"
import { MapWithTournaments } from "@/components/MapWithTournaments"
import { CreateTournamentForm } from "@/components/CreateTournamentForm"
import type { LatLng, Tournament } from "@/types/tournament"

const MOCK_TOURNAMENTS: Tournament[] = [
  {
    id: "t-1001",
    name: "West Coast Pickleball Open",
    startDate: "2026-05-12T16:00:00.000Z",
    clubName: "Bay Piqle Club",
    address: "701 Mission St, San Francisco, CA 94103, USA",
    lat: 37.786996,
    lng: -122.401395,
  },
  {
    id: "t-1002",
    name: "Midwest Spring Invitational",
    startDate: "2026-04-22T14:30:00.000Z",
    clubName: "Chicago Pickleball Center",
    address: "300 N State St, Chicago, IL 60654, USA",
    lat: 41.888141,
    lng: -87.628636,
  },
  {
    id: "t-1003",
    name: "East Coast Classic",
    startDate: "2026-06-03T13:00:00.000Z",
    clubName: "Brooklyn Piqle Hub",
    address: "30 Rockefeller Plaza, New York, NY 10112, USA",
    lat: 40.75874,
    lng: -73.978674,
  },
]

export default function TournamentsMapPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [focusLocation, setFocusLocation] = useState<LatLng | null>(null)

  useEffect(() => {
    // TODO: Replace with a real API call to load tournaments from your backend.
    setTournaments(MOCK_TOURNAMENTS)
  }, [])

  const handleCreateTournament = (tournament: Tournament) => {
    setTournaments((prev) => [tournament, ...prev])
    setFocusLocation({ lat: tournament.lat, lng: tournament.lng })
  }

  return (
    <div className="space-y-6 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Tournaments Map</h1>
        <p className="text-sm text-muted-foreground">
          Discover upcoming tournaments and add new events with clean address
          data.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <CreateTournamentForm onCreate={handleCreateTournament} />
        <MapWithTournaments
          tournaments={tournaments}
          focusLocation={focusLocation}
        />
      </div>
    </div>
  )
}
