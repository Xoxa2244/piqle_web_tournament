let googleMapsScriptPromise: Promise<void> | null = null

type LoadGoogleMapsParams = {
  apiKey: string
  libraries?: string[]
}

export const loadGoogleMaps = async ({
  apiKey,
  libraries = ["places"],
}: LoadGoogleMapsParams) => {
  if (typeof window === "undefined") {
    throw new Error("Google Maps can only be loaded in the browser.")
  }

  if (!apiKey) {
    throw new Error("Missing Google Maps API key.")
  }

  const ensureLibraries = async () => {
    const mapsApi = (window as any).google?.maps
    if (!mapsApi) return

    const missingPlaces = libraries.includes("places") && !(mapsApi as any).places
    if (!missingPlaces) return

    const importLibrary = (mapsApi as any).importLibrary
    if (typeof importLibrary === "function") {
      await Promise.all(
        libraries.map((lib) =>
          importLibrary.call(mapsApi, lib).catch(() => null)
        )
      )
    }
  }

  if ((window as any).google?.maps) {
    await ensureLibraries()
    return (window as any).google
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      const params = new URLSearchParams({
        key: apiKey,
        v: "weekly",
        libraries: libraries.join(","),
      })

      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
      script.async = true
      script.defer = true
      script.onerror = () => {
        googleMapsScriptPromise = null
        reject(new Error("Failed to load Google Maps."))
      }
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
  }

  try {
    await googleMapsScriptPromise
  } catch (error) {
    googleMapsScriptPromise = null
    throw error
  }

  if (!(window as any).google?.maps) {
    throw new Error("Google Maps loaded, but API is unavailable.")
  }

  await ensureLibraries()

  return (window as any).google
}
