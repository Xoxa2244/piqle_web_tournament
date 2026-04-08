import profanity from 'leo-profanity'

let dictionariesLoaded = false

const SAFE_CHAT_WORDS = ['себя', 'себе', 'тебя', 'тебе', 'ребята', 'ребят', 'бляшка']

type HardBlockPattern = {
  pattern: RegExp
  wordGroup?: number
}

const HARD_BLOCK_PATTERNS: HardBlockPattern[] = [
  { pattern: /(^|[^a-zа-яё0-9_])(ху[йеёияю][а-яёa-z0-9_-]*)/gi, wordGroup: 2 },
  { pattern: /(^|[^a-zа-яё0-9_])(пизд[а-яёa-z0-9_-]*)/gi, wordGroup: 2 },
  { pattern: /(^|[^a-zа-яё0-9_])(еб[а-яёa-z0-9_-]*)/gi, wordGroup: 2 },
  { pattern: /(^|[^a-zа-яё0-9_])(бля(?!шк)[а-яёa-z0-9_-]*)/gi, wordGroup: 2 },
  { pattern: /puta[s]?\b/gi },
  { pattern: /mierda[s]?\b/gi },
  { pattern: /cabr[oó]n(?:es)?\b/gi },
  { pattern: /pendej[oa]s?\b/gi },
  { pattern: /coñ[oa]s?\b/gi },
  { pattern: /joder(?:es|se|te|os)?\b/gi },
  { pattern: /gilipollas\b/gi },
  { pattern: /maric[oó]n(?:es)?\b/gi },
  { pattern: /ching(?:a|as|an|ar|ado|ada|ados|adas)\b/gi },
  { pattern: /culer[oa]s?\b/gi },
  { pattern: /cojones\b/gi },
  { pattern: /hostia[s]?\b/gi },
]

function ensureChatDictionariesLoaded() {
  if (dictionariesLoaded) return

  profanity.loadDictionary('en')
  profanity.add(profanity.getDictionary('es'))
  profanity.addWhitelist(SAFE_CHAT_WORDS)

  const extraBlocked = (process.env.CHAT_BLOCKED_WORDS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
  if (extraBlocked.length) {
    profanity.add(extraBlocked)
  }

  dictionariesLoaded = true
}

function maskWord(word: string) {
  return '*'.repeat(Math.max(3, word.length))
}

function applyHardBlockedPatterns(input: string) {
  let text = input
  let changed = false

  for (const entry of HARD_BLOCK_PATTERNS) {
    text = text.replace(entry.pattern, (...args) => {
      changed = true
      if (!entry.wordGroup) {
        return maskWord(String(args[0] ?? ''))
      }
      const fullMatch = String(args[0] ?? '')
      const maskedWord = String(args[entry.wordGroup] ?? '')
      const prefixLength = Math.max(0, fullMatch.length - maskedWord.length)
      const prefix = fullMatch.slice(0, prefixLength)
      return `${prefix}${maskWord(maskedWord)}`
    })
  }

  return { text, changed }
}

export function normalizeTextForSpam(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function sanitizeChatText(input: string) {
  ensureChatDictionariesLoaded()

  let text = input
  let wasFiltered = false

  const hardBlocked = applyHardBlockedPatterns(text)
  if (hardBlocked.changed) {
    text = hardBlocked.text
    wasFiltered = true
  }

  if (profanity.check(text)) {
    const cleaned = profanity.clean(text)
    if (cleaned !== text) {
      text = cleaned
      wasFiltered = true
    }
  }

  return { text, wasFiltered }
}
