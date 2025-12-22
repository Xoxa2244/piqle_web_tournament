'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import usCitiesData from '@/data/us-cities.json'

const usCities = usCitiesData as Array<{
  city: string
  state: string
  stateName: string
  display: string
}>

interface City {
  city: string
  state: string
  stateName: string
  display: string
}

interface CityAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  id?: string
}

export default function CityAutocomplete({
  value,
  onChange,
  onBlur,
  placeholder = "Enter your city",
  className = "",
  id,
}: CityAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter cities based on input
  const filteredCities = useMemo(() => {
    if (!inputValue.trim()) return []
    
    const query = inputValue.toLowerCase()
    return usCities.filter((city: City) => {
      const cityLower = city.city.toLowerCase()
      const stateLower = city.state.toLowerCase()
      const stateNameLower = city.stateName.toLowerCase()
      const displayLower = city.display.toLowerCase()
      
      return (
        cityLower.startsWith(query) ||
        displayLower.includes(query) ||
        stateLower.startsWith(query) ||
        stateNameLower.startsWith(query)
      )
    }).slice(0, 10) // Limit to 10 results
  }, [inputValue])

  // Update input value when value prop changes
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    setHighlightedIndex(-1)
    
    // Update parent component
    onChange(newValue)
  }

  const handleInputFocus = () => {
    if (filteredCities.length > 0) {
      setIsOpen(true)
    }
  }

  const handleSelectCity = (city: City) => {
    setInputValue(city.display)
    onChange(city.display)
    setIsOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filteredCities.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => 
          prev < filteredCities.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredCities.length) {
          handleSelectCity(filteredCities[highlightedIndex] as City)
        } else if (filteredCities.length > 0) {
          handleSelectCity(filteredCities[0] as City)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        inputRef.current?.blur()
        break
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [highlightedIndex])

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={(e) => {
          // Delay to allow click event on dropdown items
          setTimeout(() => {
            setIsOpen(false)
            setHighlightedIndex(-1)
            onBlur?.()
          }, 200)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      
      {isOpen && filteredCities.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredCities.map((city: City, index: number) => (
            <li
              key={`${city.city}-${city.state}`}
              onClick={() => handleSelectCity(city)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-4 py-2 cursor-pointer hover:bg-blue-50 transition-colors ${
                highlightedIndex === index ? 'bg-blue-50' : ''
              }`}
            >
              <div className="font-medium text-gray-900">{city.city}</div>
              <div className="text-sm text-gray-500">{city.stateName}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

