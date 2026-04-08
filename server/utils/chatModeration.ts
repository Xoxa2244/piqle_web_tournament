import profanity from 'leo-profanity'

let dictionariesLoaded = false

const HARD_BLOCK_PATTERNS: RegExp[] = [
  /ху[йеёияю][а-яёa-z0-9_-]*/gi,
  /пизд[а-яёa-z0-9_-]*/gi,
  /еб[а-яёa-z0-9_-]*/gi,
  /бля[а-яёa-z0-9_-]*/gi,
  /puta[s]?\b/gi,
  /mierda[s]?\b/gi,
  /cabr[oó]n(?:es)?\b/gi,
  /pendej[oa]s?\b/gi,
  /coñ[oa]s?\b/gi,
  /joder(?:es|se|te|os)?\b/gi,
  /gilipollas\b/gi,
  /maric[oó]n(?:es)?\b/gi,
  /ching(?:a|as|an|ar|ado|ada|ados|adas)\b/gi,
  /culer[oa]s?\b/gi,
  /cojones\b/gi,
  /hostia[s]?\b/gi,
]

function ensureChatDictionariesLoaded() {
  if (dictionariesLoaded) return

  profanity.loadDictionary('en')
  profanity.add(profanity.getDictionary('ru'))
  profanity.add(profanity.getDictionary('es'))

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

  for (const pattern of HARD_BLOCK_PATTERNS) {
    text = text.replace(pattern, (match) => {
      changed = true
      return maskWord(match)
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
