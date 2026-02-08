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

  if ((window as any).google?.maps) {
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
      script.onerror = () => reject(new Error("Failed to load Google Maps."))
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
  }

  await googleMapsScriptPromise

  if (!(window as any).google?.maps) {
    throw new Error("Google Maps loaded, but API is unavailable.")
  }

  return (window as any).google
}
