'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { BRANDS, getBrandFromHostname, type BrandConfig } from '@/lib/brand'

const BrandContext = createContext<BrandConfig>(BRANDS.piqle)

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandConfig>(BRANDS.piqle)

  useEffect(() => {
    const key = getBrandFromHostname(window.location.hostname)
    setBrand(BRANDS[key])
  }, [])

  return (
    <BrandContext.Provider value={brand}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand(): BrandConfig {
  return useContext(BrandContext)
}
