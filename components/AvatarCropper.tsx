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
  const [baseDisplayedSize, setBaseDisplayedSize] = useState({ width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const cropRef = useRef(crop)

  // Crop area size
  const cropSize = 300

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight
    setImageSize({ width: naturalWidth, height: naturalHeight })
    
    // Calculate displayed size (fit to container) - base size without zoom
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      
      // Fit image to container while maintaining aspect ratio
      const baseScale = Math.min(
        containerWidth / naturalWidth,
        containerHeight / naturalHeight,
        1 // Don't scale up
      )
      
      // Base displayed size (without zoom - zoom is applied via CSS transform)
      const baseDisplayedWidth = naturalWidth * baseScale
      const baseDisplayedHeight = naturalHeight * baseScale
      setBaseDisplayedSize({ width: baseDisplayedWidth, height: baseDisplayedHeight })
      
      // Actual displayed size with zoom (for calculations)
      const displayedWidth = baseDisplayedWidth * zoom
      const displayedHeight = baseDisplayedHeight * zoom
      setDisplayedImageSize({ width: displayedWidth, height: displayedHeight })
      
      // Center crop area initially, but ensure it's within image bounds
      const imageLeft = (containerWidth - displayedWidth) / 2
      const imageTop = (containerHeight - displayedHeight) / 2
      
      // Calculate crop position to be centered on image
      const cropX = imageLeft + (displayedWidth - cropSize) / 2
      const cropY = imageTop + (displayedHeight - cropSize) / 2
      
      // Ensure crop is within image bounds (allow full range of displayed image)
      const minX = imageLeft
      const maxX = imageLeft + displayedWidth - cropSize
      const minY = imageTop
      const maxY = imageTop + displayedHeight - cropSize
      
      setCrop({
        x: Math.max(minX, Math.min(maxX, cropX)),
        y: Math.max(minY, Math.min(maxY, cropY)),
      })
    }
  }, [zoom])

  // Update cropRef whenever crop changes
  useEffect(() => {
    cropRef.current = crop
  }, [crop])

  // Handle crop area dragging
  const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const relativeY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragStart({ 
      x: relativeX - cropRef.current.x, 
      y: relativeY - cropRef.current.y 
    })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const rect = containerRef.current.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const relativeY = e.clientY - rect.top
    
    const newX = relativeX - dragStart.x
    const newY = relativeY - dragStart.y
    
    // Calculate image bounds
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const displayedWidth = displayedImageSize.width
    const displayedHeight = displayedImageSize.height
    
    // If image not loaded yet, just constrain to container
    if (displayedWidth === 0 || displayedHeight === 0) {
      setCrop({
        x: Math.max(0, Math.min(containerWidth - cropSize, newX)),
        y: Math.max(0, Math.min(containerHeight - cropSize, newY)),
      })
      return
    }
    
    // Image center position in container
    const imageLeft = (containerWidth - displayedWidth) / 2
    const imageTop = (containerHeight - displayedHeight) / 2
    const imageRight = imageLeft + displayedWidth
    const imageBottom = imageTop + displayedHeight
    
    // Crop area must stay within image bounds
    // Allow crop to move anywhere within the displayed image, even if image extends beyond container
    const minX = imageLeft
    const maxX = imageRight - cropSize
    const minY = imageTop
    const maxY = imageBottom - cropSize
    
    // Ensure valid ranges (max must be >= min)
    const finalMinX = Math.min(minX, maxX)
    const finalMaxX = Math.max(minX, maxX)
    const finalMinY = Math.min(minY, maxY)
    const finalMaxY = Math.max(minY, maxY)
    
    // Constrain crop to image bounds (not container bounds)
    setCrop(prev => {
      const constrainedY = Math.max(finalMinY, Math.min(finalMaxY, newY))
      const constrainedX = Math.max(finalMinX, Math.min(finalMaxX, newX))
      
      // Debug: log if Y movement is blocked
      if (Math.abs(constrainedY - prev.y) < 0.1 && Math.abs(newY - prev.y) > 1) {
        console.log('Y movement blocked:', {
          newY,
          prevY: prev.y,
          constrainedY,
          finalMinY,
          finalMaxY,
          range: finalMaxY - finalMinY,
          displayedHeight,
          imageTop,
          imageBottom,
          cropSize,
        })
      }
      
      return {
        x: constrainedX,
        y: constrainedY,
      }
    })
  }, [isDragging, dragStart, displayedImageSize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse move and up handlers for better dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        handleMouseMove(e)
      }
      const handleGlobalMouseUp = () => {
        setIsDragging(false)
      }
      
      document.addEventListener('mousemove', handleGlobalMouseMove)
      document.addEventListener('mouseup', handleGlobalMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove)
        document.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [isDragging, handleMouseMove])

  // Update displayed size when zoom changes
  useEffect(() => {
    if (imageRef.current && imageSize.width > 0 && containerRef.current) {
      const naturalWidth = imageSize.width
      const naturalHeight = imageSize.height
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      
      const baseScale = Math.min(
        containerWidth / naturalWidth,
        containerHeight / naturalHeight,
        1
      )
      
      // Base displayed size (without zoom)
      const baseDisplayedWidth = naturalWidth * baseScale
      const baseDisplayedHeight = naturalHeight * baseScale
      setBaseDisplayedSize({ width: baseDisplayedWidth, height: baseDisplayedHeight })
      
      // Actual displayed size with zoom (for calculations)
      const displayedWidth = baseDisplayedWidth * zoom
      const displayedHeight = baseDisplayedHeight * zoom
      setDisplayedImageSize({ width: displayedWidth, height: displayedHeight })
      
      // Adjust crop position to stay within image bounds
      const imageLeft = (containerWidth - displayedWidth) / 2
      const imageTop = (containerHeight - displayedHeight) / 2
      const imageRight = imageLeft + displayedWidth
      const imageBottom = imageTop + displayedHeight
      
      setCrop(prev => {
        // Allow crop to move anywhere within the displayed image
        const minX = imageLeft
        const maxX = imageRight - cropSize
        const minY = imageTop
        const maxY = imageBottom - cropSize
        
        return {
          x: Math.max(minX, Math.min(maxX, prev.x)),
          y: Math.max(minY, Math.min(maxY, prev.y)),
        }
      })
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

    // Calculate image position in container (with zoom)
    const containerWidth = containerRef.current.clientWidth
    const containerHeight = containerRef.current.clientHeight
    const imageLeft = (containerWidth - displayedImageSize.width) / 2
    const imageTop = (containerHeight - displayedImageSize.height) / 2

    // Calculate crop area relative to image (in displayed coordinates with zoom)
    const cropAreaX = crop.x - imageLeft
    const cropAreaY = crop.y - imageTop

    // Calculate scale from displayed size (with zoom) to natural size
    // displayedImageSize already includes zoom, so we need to account for that
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
            style={{ userSelect: 'none' }}
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
                  width: baseDisplayedSize.width || 'auto',
                  height: baseDisplayedSize.height || 'auto',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Crop Overlay - draggable */}
            <div
              className="absolute border-2 border-white shadow-lg"
              style={{
                left: `${crop.x}px`,
                top: `${crop.y}px`,
                width: `${cropSize}px`,
                height: `${cropSize}px`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                cursor: isDragging ? 'grabbing' : 'move',
                touchAction: 'none',
              }}
              onMouseDown={handleCropMouseDown}
              onTouchStart={(e) => {
                e.preventDefault()
                if (!containerRef.current) return
                const touch = e.touches[0]
                const rect = containerRef.current.getBoundingClientRect()
                const relativeX = touch.clientX - rect.left
                const relativeY = touch.clientY - rect.top
                
                setIsDragging(true)
                setDragStart({ x: relativeX - crop.x, y: relativeY - crop.y })
              }}
              onTouchMove={(e) => {
                if (!isDragging) return
                e.preventDefault()
                const touch = e.touches[0]
                if (!containerRef.current) return
                
                const rect = containerRef.current.getBoundingClientRect()
                const relativeX = touch.clientX - rect.left
                const relativeY = touch.clientY - rect.top
                
                const newX = relativeX - dragStart.x
                const newY = relativeY - dragStart.y
                
                const containerWidth = containerRef.current.clientWidth
                const containerHeight = containerRef.current.clientHeight
                const displayedWidth = displayedImageSize.width
                const displayedHeight = displayedImageSize.height
                
                if (displayedWidth === 0 || displayedHeight === 0) {
                  setCrop({
                    x: Math.max(0, Math.min(containerWidth - cropSize, newX)),
                    y: Math.max(0, Math.min(containerHeight - cropSize, newY)),
                  })
                  return
                }
                
                const imageLeft = (containerWidth - displayedWidth) / 2
                const imageTop = (containerHeight - displayedHeight) / 2
                const imageRight = imageLeft + displayedWidth
                const imageBottom = imageTop + displayedHeight
                
                // Allow crop to move anywhere within the displayed image
                const minX = imageLeft
                const maxX = imageRight - cropSize
                const minY = imageTop
                const maxY = imageBottom - cropSize
                
                // Ensure valid ranges (max must be >= min)
                const finalMinX = Math.min(minX, maxX)
                const finalMaxX = Math.max(minX, maxX)
                const finalMinY = Math.min(minY, maxY)
                const finalMaxY = Math.max(minY, maxY)
                
                setCrop({
                  x: Math.max(finalMinX, Math.min(finalMaxX, newX)),
                  y: Math.max(finalMinY, Math.min(finalMaxY, newY)),
                })
              }}
              onTouchEnd={() => {
                setIsDragging(false)
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
