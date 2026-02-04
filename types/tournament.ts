export type LatLng = {
  lat: number
  lng: number
}

export type Tournament = {
  id: string
  name: string
  startDate: string
  clubName: string
  address: string
  lat: number
  lng: number
  placeId?: string
  city?: string
  state?: string
  country?: string
}

export type PlaceDetails = {
  name?: string
  formattedAddress?: string
  placeId?: string
  lat?: number
  lng?: number
  city?: string
  state?: string
  country?: string
}
