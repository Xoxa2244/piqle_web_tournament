'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DUPRLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (data: {
    duprId: string
    userToken: string
    refreshToken: string
    stats?: {
      rating?: number
      singlesRating?: number
      doublesRating?: number
      name?: string
    }
  }) => void
}

export default function DUPRLoginModal({
  isOpen,
  onClose,
  onSuccess,
}: DUPRLoginModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const clientKey = process.env.NEXT_PUBLIC_DUPR_CLIENT_KEY
    if (!clientKey) {
      console.error('NEXT_PUBLIC_DUPR_CLIENT_KEY is not set')
      alert('DUPR integration is not configured. Please set NEXT_PUBLIC_DUPR_CLIENT_KEY in environment variables.')
      onClose()
      return
    }

    // Listen for postMessage from DUPR iframe
    const handleMessage = (event: MessageEvent) => {
      // Log all messages for debugging
      console.log('PostMessage received:', {
        origin: event.origin,
        data: event.data,
      })

      // Verify origin for security (adjust to DUPR's actual domain)
      // Production: https://dupr.gg
      const allowedOrigins = [
        'https://dupr.gg',
        'https://uat.dupr.gg', // Keep for backward compatibility
        'http://localhost:3000', // For local testing if needed
      ]

      if (!allowedOrigins.includes(event.origin)) {
        console.warn('Ignoring message from unauthorized origin:', event.origin)
        return
      }

      // DUPR sends data in event.data
      if (event.data && typeof event.data === 'object') {
        const data = event.data

        // Check if this is a DUPR login response
        // DUPR may send data in different formats, so we check multiple possibilities
        const duprId = data.duprId || data.dupr_id || data.userId
        const userToken = data.userToken || data.accessToken || data.access_token
        const refreshToken = data.refreshToken || data.refresh_token

        if (duprId && userToken && refreshToken) {
          console.log('DUPR login successful:', { duprId, hasToken: !!userToken })
          
          onSuccess({
            duprId: String(duprId),
            userToken: String(userToken),
            refreshToken: String(refreshToken),
            stats: data.stats || {
              rating: data.rating,
              singlesRating: data.singlesRating || data.singles_rating,
              doublesRating: data.doublesRating || data.doubles_rating,
              name: data.name,
            },
          })
          onClose()
        } else {
          console.log('Received DUPR message but missing required fields:', data)
        }
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [isOpen, onSuccess, onClose])

  if (!isOpen) return null

  const clientKey = process.env.NEXT_PUBLIC_DUPR_CLIENT_KEY
  
  // Log for debugging
  console.log('DUPR Login Modal - clientKey:', clientKey ? `${clientKey.substring(0, 10)}...` : 'UNDEFINED')
  
  if (!clientKey) {
    console.error('NEXT_PUBLIC_DUPR_CLIENT_KEY is not available in browser. Make sure the project was rebuilt after adding the variable.')
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 className="text-xl font-semibold mb-4">DUPR Integration Error</h2>
          <p className="text-red-600 mb-4">
            DUPR client key is not configured. Please check environment variables and rebuild the project.
          </p>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    )
  }
  
  const duprLoginUrl = `https://dupr.gg/login-external-app/${clientKey}`
  console.log('DUPR Login URL:', duprLoginUrl.replace(clientKey, '***'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Connect DUPR Account</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Iframe */}
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            src={duprLoginUrl}
            className="w-full h-full border-0"
            title="DUPR Login"
            allow="camera; microphone"
          />
        </div>
      </div>
    </div>
  )
}

