'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'

interface AvatarCropperProps {
  imageSrc: string
  isOpen: boolean
  onClose: () => void
  onCrop: (croppedImageUrl: string) => void
  aspectRatio?: number
  title?: string
}

export default function AvatarCropper({
  imageSrc,
  isOpen,
  onClose,
  onCrop,
  aspectRatio = 1,
  title = 'Crop Avatar',
}: AvatarCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [displayedImageSize, setDisplayedImageSize] = useState({ width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Crop area size
  const cropSize = 300

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight
    setImageSize({ width: naturalWidth, height: naturalHeight })
    
    // Calculate displayed size (fit to container)
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      
      // Fit image to container while maintaining aspect ratio
      const scale = Math.min(
        containerWidth / naturalWidth,
        containerHeight / naturalHeight,
        1 // Don't scale up
      )
      
      const displayedWidth = naturalWidth * scale
      const displayedHeight = naturalHeight * scale
      setDisplayedImageSize({ width: displayedWidth, height: displayedHeight })
      
      // Center crop area initially, but ensure it's within image bounds
      const imageLeft = (containerWidth - displayedWidth) / 2
      const imageTop = (containerHeight - displayedHeight) / 2
      
      // Calculate crop position to be centered on image
      const cropX = imageLeft + (displayedWidth - cropSize) / 2
      const cropY = imageTop + (displayedHeight - cropSize) / 2
      
      setCrop({
        x: Math.max(imageLeft, Math.min(containerWidth - cropSize, cropX)),
        y: Math.max(imageTop, Math.min(containerHeight - cropSize, cropY)),
      })
    }
  }, [])

  // Handle crop area dragging
  const handleCropMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({ x: e.clientX - crop.x, y: e.clientY - crop.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current || !imageRef.current) return
    
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    
    // Calculate image bounds
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const displayedWidth = displayedImageSize.width
    const displayedHeight = displayedImageSize.height
    
    const imageLeft = (containerWidth - displayedWidth) / 2
    const imageTop = (containerHeight - displayedHeight) / 2
    const imageRight = imageLeft + displayedWidth
    const imageBottom = imageTop + displayedHeight
    
    // Crop area must stay within image bounds
    const minX = imageLeft
    const maxX = imageRight - cropSize
    const minY = imageTop
    const maxY = imageBottom - cropSize
    
    setCrop({
      x: Math.max(minX, Math.min(maxX, newX)),
      y: Math.max(minY, Math.min(maxY, newY)),
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Update displayed size when zoom changes
  useEffect(() => {
    if (imageRef.current && imageSize.width > 0) {
      const naturalWidth = imageSize.width
      const naturalHeight = imageSize.height
      
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        const containerHeight = containerRef.current.clientHeight
        
        const scale = Math.min(
          containerWidth / naturalWidth,
          containerHeight / naturalHeight,
          1
        ) * zoom
        
        const displayedWidth = naturalWidth * scale
        const displayedHeight = naturalHeight * scale
        setDisplayedImageSize({ width: displayedWidth, height: displayedHeight })
        
        // Adjust crop position to stay within image bounds
        const imageLeft = (containerWidth - displayedWidth) / 2
        const imageTop = (containerHeight - displayedHeight) / 2
        const imageRight = imageLeft + displayedWidth
        const imageBottom = imageTop + displayedHeight
        
        setCrop(prev => ({
          x: Math.max(imageLeft, Math.min(imageRight - cropSize, prev.x)),
          y: Math.max(imageTop, Math.min(imageBottom - cropSize, prev.y)),
        }))
      }
    }
  }, [zoom, imageSize])

  const handleCrop = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return

    const img = imageRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return

    canvas.width = cropSize
    canvas.height = cropSize

    // Calculate image position in container
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const imageLeft = (containerWidth - displayedImageSize.width) / 2
    const imageTop = (containerHeight - displayedImageSize.height) / 2

    // Calculate crop area relative to image
    const cropAreaX = crop.x - imageLeft
    const cropAreaY = crop.y - imageTop

    // Calculate scale from displayed size to natural size
    const scaleX = imageSize.width / displayedImageSize.width
    const scaleY = imageSize.height / displayedImageSize.height

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
  }, [crop, imageSize, displayedImageSize, onCrop])

  const handleZoom = (delta: number) => {
    setZoom((prev) => {
      const newZoom = Math.max(0.5, Math.min(3, prev + delta))
      return newZoom
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <CardTitle>{title}</CardTitle>
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
            className="relative w-full h-[400px] bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Image - fixed position, scaled by zoom */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) scale(${zoom})`,
                transition: 'transform 0.1s ease-out',
              }}
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
                  width: displayedImageSize.width || 'auto',
                  height: displayedImageSize.height || 'auto',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Crop Overlay - draggable */}
            <div
              className="absolute border-2 border-white shadow-lg cursor-move"
              style={{
                left: `${crop.x}px`,
                top: `${crop.y}px`,
                width: `${cropSize}px`,
                height: `${cropSize}px`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
              onMouseDown={handleCropMouseDown}
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
