'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ShareButtonProps {
  url: string
  title?: string
  className?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
}

export default function ShareButton({ 
  url, 
  title,
  className = '',
  size = 'default',
  variant = 'outline'
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const shareData = {
      title: title || 'Tournament',
      text: title || 'Check out this tournament!',
      url: url,
    }

    // Try Web Share API first (mobile/desktop with support)
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData)
        return
      } catch (error: any) {
        // User cancelled or error occurred, fall back to copy
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error)
        }
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = url
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Fallback copy failed:', err)
      }
      document.body.removeChild(textArea)
    }
  }

  return (
    <Button
      onClick={handleShare}
      variant={variant}
      size={size}
      className={className}
      title={copied ? 'Copied!' : 'Share tournament'}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-2" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 mr-2" />
          <span>Share</span>
        </>
      )}
    </Button>
  )
}

