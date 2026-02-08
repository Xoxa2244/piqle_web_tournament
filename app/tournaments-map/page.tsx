"use client"

import { TournamentsMapContent } from "@/components/TournamentsMapContent"

export default function TournamentsMapPage() {
  return (
    <div className="space-y-6 px-6 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Tournaments Map</h1>
        <p className="text-sm text-muted-foreground">
          Discover upcoming tournaments with saved addresses.
        </p>
      </div>
      <TournamentsMapContent />
    </div>
  )
}
