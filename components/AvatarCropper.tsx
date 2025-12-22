'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Move, ZoomIn, ZoomOut, Check } from 'lucide-react'

interface AvatarCropperProps {
  imageSrc: string
  isOpen: boolean
  onClose: () => void
  onCrop: (croppedImageUrl: string) => void
  aspectRatio?: number
}

export default function AvatarCropper({
  imageSrc,
  isOpen,
  onClose,
  onCrop,
  aspectRatio = 1,
}: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Crop area size
  const cropSize = 300

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    
    // Center the image initially
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      
      // Center crop area
      setCrop({
        x: (containerWidth - cropSize) / 2,
        y: (containerHeight - cropSize) / 2,
      })
      
      // Center image
      const imgWidth = img.clientWidth
      const imgHeight = img.clientHeight
      setImagePosition({
        x: (containerWidth - imgWidth) / 2,
        y: (containerHeight - imgHeight) / 2,
      })
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    
    if (containerRef.current) {
      const maxX = containerRef.current.clientWidth
      const maxY = containerRef.current.clientHeight
      
      setImagePosition({
        x: Math.max(-maxX, Math.min(maxX, newX)),
        y: Math.max(-maxY, Math.min(maxY, newY)),
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleCrop = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return

    const img = imageRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return

    canvas.width = cropSize
    canvas.height = cropSize

    // Calculate the relationship between displayed size and natural size
    const displayedWidth = img.clientWidth * zoom
    const displayedHeight = img.clientHeight * zoom
    const scaleX = imageSize.width / displayedWidth
    const scaleY = imageSize.height / displayedHeight

    // Calculate crop area relative to image
    const cropAreaX = crop.x - imagePosition.x
    const cropAreaY = crop.y - imagePosition.y

    // Convert to natural image coordinates
    const sourceX = cropAreaX * scaleX
    const sourceY = cropAreaY * scaleY
    const sourceSize = cropSize * scaleX

    // Ensure we don't go outside image bounds
    const clampedSourceX = Math.max(0, Math.min(imageSize.width - sourceSize, sourceX))
    const clampedSourceY = Math.max(0, Math.min(imageSize.height - sourceSize, sourceY))

    // Draw cropped image
    ctx.drawImage(
      img,
      clampedSourceX,
      clampedSourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      cropSize,
      cropSize
    )

    // Convert to blob and create URL
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        onCrop(url)
      }
    }, 'image/jpeg', 0.95)
  }, [crop, zoom, imageSize, imagePosition, onCrop])

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.max(0.5, Math.min(3, prev + delta)))
  }

  const handleMove = (direction: 'up' | 'down' | 'left' | 'right') => {
    const step = 10
    setCrop((prev) => {
      const maxX = (containerRef.current?.clientWidth || 600) - cropSize
      const maxY = (containerRef.current?.clientHeight || 400) - cropSize
      
      switch (direction) {
        case 'up':
          return { ...prev, y: Math.max(0, prev.y - step) }
        case 'down':
          return { ...prev, y: Math.min(maxY, prev.y + step) }
        case 'left':
          return { ...prev, x: Math.max(0, prev.x - step) }
        case 'right':
          return { ...prev, x: Math.min(maxX, prev.x + step) }
        default:
          return prev
      }
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <CardTitle>Crop Avatar</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col pt-6">
          {/* Crop Area */}
          <div
            ref={containerRef}
            className="relative w-full h-[400px] bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center cursor-move"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="absolute"
              style={{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${zoom})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
              onMouseDown={handleMouseDown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop"
                onLoad={handleImageLoad}
                className="max-w-none select-none"
                draggable={false}
                style={{
                  maxWidth: '600px',
                  maxHeight: '400px',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Crop Overlay */}
            <div
              className="absolute border-2 border-white shadow-lg"
              style={{
                left: `${crop.x}px`,
                top: `${crop.y}px`,
                width: `${cropSize}px`,
                height: `${cropSize}px`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className="border border-white/30"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 space-y-4">
            {/* Zoom Controls */}
            <div className="flex items-center justify-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleZoom(-0.1)}
                className="flex items-center space-x-2"
              >
                <ZoomOut className="h-4 w-4" />
                <span>Zoom Out</span>
              </Button>
              
              <div className="text-sm text-gray-600 min-w-[80px] text-center">
                {Math.round(zoom * 100)}%
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleZoom(0.1)}
                className="flex items-center space-x-2"
              >
                <ZoomIn className="h-4 w-4" />
                <span>Zoom In</span>
              </Button>
            </div>

            {/* Move Controls */}
            <div className="flex items-center justify-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMove('left')}
                className="flex items-center space-x-1"
              >
                <Move className="h-4 w-4 rotate-180" />
                <span>Left</span>
              </Button>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMove('up')}
                  className="flex items-center space-x-1"
                >
                  <Move className="h-4 w-4 -rotate-90" />
                  <span>Up</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMove('down')}
                  className="flex items-center space-x-1"
                >
                  <Move className="h-4 w-4 rotate-90" />
                  <span>Down</span>
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMove('right')}
                className="flex items-center space-x-1"
              >
                <Move className="h-4 w-4" />
                <span>Right</span>
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4 border-t">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCrop}
                className="flex-1 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700"
              >
                <Check className="h-4 w-4" />
                <span>Apply</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

