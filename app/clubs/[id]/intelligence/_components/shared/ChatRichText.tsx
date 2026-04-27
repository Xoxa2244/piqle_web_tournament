'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'

type ChatRichTextProps = {
  text: string
  className?: string
  lineClassName?: string
  blankLineClassName?: string
  linkClassName?: string
  strongClassName?: string
  linkStyle?: CSSProperties
  strongStyle?: CSSProperties
  onLinkClick?: () => void
}

function getInternalHref(href: string): string | null {
  if (!href) return null
  if (href.startsWith('/')) return href
  if (href.startsWith('#')) return href

  if (typeof window === 'undefined') return null

  try {
    const url = new URL(href, window.location.origin)
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    return null
  }

  return null
}

function normalizeBareUrls(text: string): string {
  return text.replace(
    /(?<!\]\()(?<!\()(?<!["'])https?:\/\/[^\s<]+[^\s<.,!?;:)]/g,
    (url) => `[${url}](${url})`
  )
}

export function ChatRichText({
  text,
  className,
  lineClassName = 'whitespace-pre-wrap',
  blankLineClassName = 'h-2',
  linkClassName,
  strongClassName,
  linkStyle,
  strongStyle,
  onLinkClick,
}: ChatRichTextProps) {
  const normalizedText = normalizeBareUrls(text)

  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            const safeHref = typeof href === 'string' ? href : ''
            const internalHref = getInternalHref(safeHref)

            if (internalHref) {
              return (
                <Link
                  href={internalHref}
                  className={linkClassName}
                  style={linkStyle}
                  onClick={onLinkClick}
                >
                  {children}
                </Link>
              )
            }

            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
                style={linkStyle}
                onClick={onLinkClick}
              >
                {children}
              </a>
            )
          },
          strong: ({ children }) => (
            <strong className={strongClassName} style={strongStyle}>
              {children}
            </strong>
          ),
          p: ({ children }) => <div className={lineClassName}>{children}</div>,
          li: ({ children }) => <li className={lineClassName}>{children}</li>,
          ul: ({ children }) => <ul className="space-y-1 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-1 list-decimal pl-5">{children}</ol>,
          h1: ({ children }) => <div className="text-lg font-semibold">{children}</div>,
          h2: ({ children }) => <div className="text-base font-semibold">{children}</div>,
          h3: ({ children }) => <div className="text-sm font-semibold">{children}</div>,
          hr: () => <div className={blankLineClassName} />,
          br: () => <br />,
          code: ({ children }) => <code>{children}</code>,
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  )
}
