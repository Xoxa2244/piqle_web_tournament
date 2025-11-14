const LINK_CLASS = 'text-blue-600 hover:text-blue-800 underline'

const createAnchor = (href: string, label?: string) => {
  const safeHref = /^https?:\/\//i.test(href) ? href : `https://${href}`
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}">${label ?? href}</a>`
}

export const formatDescription = (text: string) => {
  if (!text) return ''

  const codePlaceholders: string[] = []
  let formatted = text.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `__CODE_${codePlaceholders.length}__`
    codePlaceholders.push(`<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">${code}</code>`)
    return placeholder
  })

  const markdownPlaceholders: string[] = []
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const placeholder = `__MDLINK_${markdownPlaceholders.length}__`
    markdownPlaceholders.push(createAnchor(url, label))
    return placeholder
  })

  formatted = formatted
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic

  const urlRegex =
    /(?<!@)\b((?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+(?:\/[^\s<]*)?)(?=[\s.,!?)]|$)/g

  formatted = formatted.replace(urlRegex, (match) => createAnchor(match))

  markdownPlaceholders.forEach((html, index) => {
    formatted = formatted.replace(`__MDLINK_${index}__`, html)
  })

  codePlaceholders.forEach((html, index) => {
    formatted = formatted.replace(`__CODE_${index}__`, html)
  })

  return formatted.replace(/\n/g, '<br>')
}

