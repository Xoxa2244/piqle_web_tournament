'use client'

import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

interface ShareButtonProps {
  url: string
  title?: string
  className?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
  iconOnly?: boolean
}

export default function ShareButton({ 
  url, 
  title,
  className = '',
  size = 'default',
  variant = 'outline',
  iconOnly = false
}: ShareButtonProps) {
  const { toast } = useToast()

  const handleShare = async () => {
    // Always copy to clipboard and show toast
    try {
      await navigator.clipboard.writeText(url)
      toast({
        title: "Link copied!",
        description: "Tournament link has been copied to clipboard.",
      })
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
        toast({
          title: "Link copied!",
          description: "Tournament link has been copied to clipboard.",
        })
      } catch (err) {
        console.error('Fallback copy failed:', err)
        toast({
          title: "Failed to copy",
          description: "Could not copy link to clipboard.",
          variant: "destructive",
        })
      }
      document.body.removeChild(textArea)
    }
  }

  // If className includes custom styles (like gradient), use button instead of Button component
  const useCustomButton = className.includes('bg-gradient') || className.includes('from-') || className.includes('to-')
  
  const buttonContent = iconOnly ? (
    <Share2 className="h-4 w-4" />
  ) : (
    <>
      <Share2 className="h-4 w-4 mr-2" />
      <span>Share</span>
    </>
  )

  if (useCustomButton) {
    return (
      <button
        onClick={handleShare}
        className={`flex items-center ${className}`}
        title="Share tournament"
      >
        {buttonContent}
      </button>
    )
  }

  return (
    <Button
      onClick={handleShare}
      variant={variant}
      size={size}
      className={className}
      title="Share tournament"
    >
      {buttonContent}
    </Button>
  )
}

