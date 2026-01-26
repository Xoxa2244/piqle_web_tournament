'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'

interface ImageCropperProps {
  imageSrc: string
  isOpen: boolean
  onClose: () => void
  onCrop: (croppedImageUrl: string) => void
  maxSize?: number
}

export default function ImageCropper({
  imageSrc,
  isOpen,
  onClose,
  onCrop,
  maxSize = 800,
}: ImageCropperProps) {
  const [zoom, setZoom] = useState(1)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Crop area size (square) - fixed in center
  const cropSize = Math.min(400, maxSize)

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    
    // Center the image initially
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      
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
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ 
      x: e.clientX - imagePosition.x, 
      y: e.clientY - imagePosition.y 
    })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    
    // Calculate image dimensions with zoom
    const img = imageRef.current
    if (!img) return
    
    const imgWidth = img.clientWidth * zoom
    const imgHeight = img.clientHeight * zoom
    
    // Constrain image position so crop area always covers part of image
    const cropX = (containerWidth - cropSize) / 2
    const cropY = (containerHeight - cropSize) / 2
    
    const minX = cropX + cropSize - imgWidth
    const maxX = cropX
    const minY = cropY + cropSize - imgHeight
    const maxY = cropY
    
    setImagePosition({
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY)),
    })
  }, [isDragging, dragStart, zoom, cropSize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const handleCrop = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return

    const img = imageRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return

    canvas.width = maxSize
    canvas.height = maxSize

    // Get container and crop area positions
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const cropX = (containerWidth - cropSize) / 2
    const cropY = (containerHeight - cropSize) / 2

    // Calculate the relationship between displayed size and natural size
    const displayedWidth = img.clientWidth * zoom
    const displayedHeight = img.clientHeight * zoom
    const scaleX = imageSize.width / displayedWidth
    const scaleY = imageSize.height / displayedHeight

    // Calculate crop area relative to image
    const cropAreaX = cropX - imagePosition.x
    const cropAreaY = cropY - imagePosition.y

    // Convert to natural image coordinates
    const sourceX = cropAreaX * scaleX
    const sourceY = cropAreaY * scaleY
    const sourceSize = cropSize * scaleX

    // Ensure we don't go outside image bounds
    const clampedSourceX = Math.max(0, Math.min(imageSize.width - sourceSize, sourceX))
    const clampedSourceY = Math.max(0, Math.min(imageSize.height - sourceSize, sourceY))
    const clampedSourceSize = Math.min(
      sourceSize,
      imageSize.width - clampedSourceX,
      imageSize.height - clampedSourceY
    )

    // Draw cropped image
    ctx.drawImage(
      img,
      clampedSourceX,
      clampedSourceY,
      clampedSourceSize,
      clampedSourceSize,
      0,
      0,
      maxSize,
      maxSize
    )

    // Convert to blob and create URL
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        onCrop(url)
      }
    }, 'image/jpeg', 0.9)
  }, [zoom, imageSize, imagePosition, onCrop, maxSize, cropSize])

  const handleZoom = (delta: number) => {
    setZoom((prev) => {
      const newZoom = Math.max(1, Math.min(3, prev + delta))
      
      // Adjust image position when zooming to keep crop area centered on image
      if (containerRef.current && imageRef.current) {
        const containerWidth = containerRef.current.clientWidth
        const containerHeight = containerRef.current.clientHeight
        const cropX = (containerWidth - cropSize) / 2
        const cropY = (containerHeight - cropSize) / 2
        
        const img = imageRef.current
        const imgWidth = img.clientWidth * newZoom
        const imgHeight = img.clientHeight * newZoom
        
        // Center image on crop area
        setImagePosition({
          x: cropX + (cropSize - imgWidth) / 2,
          y: cropY + (cropSize - imgHeight) / 2,
        })
      }
      
      return newZoom
    })
  }

  if (!isOpen) return null

  const containerWidth = containerRef.current?.clientWidth || 600
  const containerHeight = containerRef.current?.clientHeight || 500
  const cropX = (containerWidth - cropSize) / 2
  const cropY = (containerHeight - cropSize) / 2

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <CardTitle>Crop Tournament Image</CardTitle>
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
            className="relative w-full h-[500px] bg-gray-900 rounded-lg overflow-hidden"
          >
            {/* Image Container */}
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
                className="max-w-none select-none pointer-events-none"
                draggable={false}
                style={{
                  maxWidth: '800px',
                  maxHeight: '500px',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Crop Overlay - Simple square border */}
            <div
              className="absolute border-2 border-white"
              style={{
                left: `${cropX}px`,
                top: `${cropY}px`,
                width: `${cropSize}px`,
                height: `${cropSize}px`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                pointerEvents: 'none',
              }}
            />
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

            <p className="text-xs text-center text-gray-500">
              Drag the image to position it, use zoom to adjust size
            </p>

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
