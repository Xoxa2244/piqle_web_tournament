'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { BRANDS, getBrandFromHostname, type BrandConfig, type BrandKey } from '@/lib/brand'

const BrandContext = createContext<BrandConfig>(BRANDS.piqle)

export function BrandProvider({
  children,
  initialBrandKey = 'piqle',
}: {
  children: ReactNode
  initialBrandKey?: BrandKey
}) {
  const [brand, setBrand] = useState<BrandConfig>(BRANDS[initialBrandKey] || BRANDS.piqle)

  useEffect(() => {
    const key = getBrandFromHostname(window.location.hostname)
    if (key !== brand.key) {
      setBrand(BRANDS[key])
    }
  }, [brand.key])

  return (
    <BrandContext.Provider value={brand}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand(): BrandConfig {
  return useContext(BrandContext)
}
