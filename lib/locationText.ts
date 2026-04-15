const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', а: 'a',
  Б: 'B', б: 'b',
  В: 'V', в: 'v',
  Г: 'G', г: 'g',
  Д: 'D', д: 'd',
  Е: 'E', е: 'e',
  Ё: 'E', ё: 'e',
  Ж: 'Zh', ж: 'zh',
  З: 'Z', з: 'z',
  И: 'I', и: 'i',
  Й: 'Y', й: 'y',
  К: 'K', к: 'k',
  Л: 'L', л: 'l',
  М: 'M', м: 'm',
  Н: 'N', н: 'n',
  О: 'O', о: 'o',
  П: 'P', п: 'p',
  Р: 'R', р: 'r',
  С: 'S', с: 's',
  Т: 'T', т: 't',
  У: 'U', у: 'u',
  Ф: 'F', ф: 'f',
  Х: 'Kh', х: 'kh',
  Ц: 'Ts', ц: 'ts',
  Ч: 'Ch', ч: 'ch',
  Ш: 'Sh', ш: 'sh',
  Щ: 'Shch', щ: 'shch',
  Ъ: '', ъ: '',
  Ы: 'Y', ы: 'y',
  Ь: '', ь: '',
  Э: 'E', э: 'e',
  Ю: 'Yu', ю: 'yu',
  Я: 'Ya', я: 'ya',
  І: 'I', і: 'i',
  Ї: 'Yi', ї: 'yi',
  Є: 'Ye', є: 'ye',
  Ґ: 'G', ґ: 'g',
}

const CYRILLIC_PATTERN = /[А-Яа-яЁёІіЇїЄєҐґ]/g

export const normalizeLocationText = (value?: string | null) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw
    .replace(CYRILLIC_PATTERN, (char) => CYRILLIC_TO_LATIN[char] ?? char)
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .trim()
}

