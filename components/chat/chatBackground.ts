import type { CSSProperties } from 'react'

/** Базовый цвет под паттерном */
export const CHAT_BG_COLOR = '#dbe8f2'

/**
 * Бесшовный SVG-паттерн для фона чата (data URL, повторяется).
 */
export const chatScrollAreaStyle = (): CSSProperties => ({
  backgroundColor: CHAT_BG_COLOR,
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
  <defs>
    <pattern id="p" width="52" height="52" patternUnits="userSpaceOnUse">
      <circle cx="6" cy="8" r="1.2" fill="rgba(15,80,120,0.08)"/>
      <circle cx="28" cy="22" r="0.9" fill="rgba(15,80,120,0.055)"/>
      <circle cx="44" cy="10" r="0.7" fill="rgba(15,80,120,0.065)"/>
      <path d="M0 40 Q13 36 26 40 T52 38" fill="none" stroke="rgba(15,80,120,0.045)" stroke-width="1"/>
      <path d="M4 48 Q20 44 36 48" fill="none" stroke="rgba(15,80,120,0.04)" stroke-width="0.8"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#p)"/>
</svg>`
  )}")`,
  backgroundSize: '52px 52px',
})
