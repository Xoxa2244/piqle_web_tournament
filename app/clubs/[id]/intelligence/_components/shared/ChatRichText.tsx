'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

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

type MarkdownLinkToken = {
  label: string
  href: string
  end: number
}

type BareUrlToken = {
  href: string
  end: number
}

function readMarkdownLink(text: string, start: number): MarkdownLinkToken | null {
  if (text[start] !== '[') return null

  const labelEnd = text.indexOf('](', start)
  if (labelEnd === -1) return null

  let cursor = labelEnd + 2
  let depth = 1

  while (cursor < text.length) {
    const char = text[cursor]
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return {
          label: text.slice(start + 1, labelEnd),
          href: text.slice(labelEnd + 2, cursor),
          end: cursor + 1,
        }
      }
    }
    cursor += 1
  }

  return null
}

function readBareUrl(text: string, start: number): BareUrlToken | null {
  const urlPrefixes = ['https://', 'http://']
  const hasPrefix = urlPrefixes.some((prefix) => text.startsWith(prefix, start))
  if (!hasPrefix) return null

  let cursor = start
  while (cursor < text.length && !/\s/.test(text[cursor]!)) {
    cursor += 1
  }

  let end = cursor
  while (end > start && /[.,!?;:]/.test(text[end - 1]!)) {
    end -= 1
  }

  return {
    href: text.slice(start, end),
    end,
  }
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

function renderLink(
  href: string,
  children: ReactNode,
  key: string,
  linkClassName?: string,
  linkStyle?: CSSProperties,
  onLinkClick?: () => void
) {
  const internalHref = getInternalHref(href)
  if (internalHref) {
    return (
      <Link
        key={key}
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
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
      style={linkStyle}
      onClick={onLinkClick}
    >
      {children}
    </a>
  )
}

function renderInlineNodes(
  text: string,
  keyPrefix: string,
  linkClassName?: string,
  strongClassName?: string,
  linkStyle?: CSSProperties,
  strongStyle?: CSSProperties,
  onLinkClick?: () => void
): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0

  while (cursor < text.length) {
    const boldStart = text.indexOf('**', cursor)
    const linkStart = text.indexOf('[', cursor)
    const urlMatch = text.slice(cursor).match(/https?:\/\//)
    const urlStart = urlMatch ? cursor + urlMatch.index! : -1
    const tokenStart = [boldStart, linkStart, urlStart]
      .filter((value) => value >= 0)
      .sort((a, b) => a - b)[0]

    if (tokenStart == null) {
      nodes.push(<span key={`${keyPrefix}-tail-${cursor}`}>{text.slice(cursor)}</span>)
      break
    }

    if (tokenStart > cursor) {
      nodes.push(
        <span key={`${keyPrefix}-text-${cursor}`}>
          {text.slice(cursor, tokenStart)}
        </span>
      )
      cursor = tokenStart
    }

    if (text.startsWith('**', cursor)) {
      const boldEnd = text.indexOf('**', cursor + 2)
      if (boldEnd === -1) {
        nodes.push(<span key={`${keyPrefix}-rawbold-${cursor}`}>{text.slice(cursor)}</span>)
        break
      }

      nodes.push(
        <strong
          key={`${keyPrefix}-strong-${cursor}`}
          className={strongClassName}
          style={strongStyle}
        >
          {text.slice(cursor + 2, boldEnd)}
        </strong>
      )
      cursor = boldEnd + 2
      continue
    }

    const markdownLink = readMarkdownLink(text, cursor)
    if (markdownLink) {
      const label = markdownLink.label.replace(/\*\*/g, '')
      nodes.push(
        renderLink(
          markdownLink.href,
          label,
          `${keyPrefix}-mdlink-${cursor}`,
          linkClassName,
          linkStyle,
          onLinkClick
        )
      )
      cursor = markdownLink.end
      continue
    }

    const bareUrl = readBareUrl(text, cursor)
    if (bareUrl) {
      nodes.push(
        renderLink(
          bareUrl.href,
          bareUrl.href,
          `${keyPrefix}-url-${cursor}`,
          linkClassName,
          linkStyle,
          onLinkClick
        )
      )
      cursor = bareUrl.end
      continue
    }

    nodes.push(<span key={`${keyPrefix}-char-${cursor}`}>{text[cursor]}</span>)
    cursor += 1
  }

  return nodes
}

export function ChatRichText({
  text,
  className,
  lineClassName,
  blankLineClassName = 'h-2',
  linkClassName,
  strongClassName,
  linkStyle,
  strongStyle,
  onLinkClick,
}: ChatRichTextProps) {
  const lines = text.split('\n')

  return (
    <div className={className}>
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <div key={`blank-${index}`} className={blankLineClassName} />
        }

        return (
          <div key={`line-${index}`} className={lineClassName ?? 'whitespace-pre-wrap'}>
            {renderInlineNodes(
              line,
              `line-${index}`,
              linkClassName,
              strongClassName,
              linkStyle,
              strongStyle,
              onLinkClick
            )}
          </div>
        )
      })}
    </div>
  )
}
