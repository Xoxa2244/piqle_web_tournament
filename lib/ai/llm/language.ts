// ── Language detection for AI Advisor ──

export type SupportedLanguage = 'en' | 'ru' | 'es';

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  ru: 'Russian',
  es: 'Spanish',
};

/**
 * Detect language from user text using script analysis + keyword heuristics.
 * Covers the 3 primary Piqle markets: English, Russian, Spanish.
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text || text.length < 2) return 'en';

  // Check for Cyrillic characters (Russian)
  const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
  if (cyrillicCount / text.length > 0.15) return 'ru';

  // Check for Spanish-specific markers (accented chars + common words)
  const spanishMarkers = /\b(qu[eé]|c[oó]mo|cu[aá]l|d[oó]nde|cu[aá]ndo|est[aá]|tiene|puede|hola|buenos|gracias|sesiones?|jugadores?|por\s+favor)\b/i;
  const accentedChars = (text.match(/[áéíóúñ¿¡ü]/gi) || []).length;
  if (spanishMarkers.test(text) || accentedChars >= 2) return 'es';

  return 'en';
}

/**
 * Get the language label for display.
 */
export function getLanguageLabel(lang: SupportedLanguage): string {
  return LANGUAGE_LABELS[lang] || 'English';
}

/**
 * Generate an explicit language instruction to append to the system prompt.
 * Returns empty string for English (default behavior).
 */
export function getLanguageInstruction(lang: SupportedLanguage): string {
  if (lang === 'en') return '';
  const label = LANGUAGE_LABELS[lang];
  return `\n\nIMPORTANT LANGUAGE RULE: The user communicates in ${label}. You MUST respond entirely in ${label}, including all follow-up suggestions inside <suggested> tags. Never switch to English unless the user explicitly asks.`;
}
