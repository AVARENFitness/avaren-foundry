const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

const POSITIVE_PATTERNS = [
  /^yes\b/,
  /^yeah\b/,
  /^yep\b/,
  /^yup\b/,
  /^sure\b/,
  /^ok(?:ay)?\b/,
  /^do it\b/,
  /^log it\b/,
  /^that's right\b/,
  /^thats right\b/,
  /^that is right\b/,
  /^correct\b/,
  /^go ahead\b/,
  /^please do\b/,
  /^sounds good\b/,
]

const NEGATIVE_PATTERNS = [
  /^no\b/,
  /^nope\b/,
  /^nah\b/,
  /^don't\b/,
  /^dont\b/,
  /^do not\b/,
  /^cancel\b/,
  /^never mind\b/,
  /^nevermind\b/,
  /^that's not\b/,
  /^thats not\b/,
  /^not that\b/,
  /^wrong\b/,
]

const ORDINAL_MAP = {
  first: 0,
  '1st': 0,
  one: 0,
  '1': 0,
  second: 1,
  '2nd': 1,
  two: 1,
  '2': 1,
  third: 2,
  '3rd': 2,
  three: 2,
  '3': 2,
  fourth: 3,
  '4th': 3,
  four: 3,
  '4': 3,
}

export const isConfirmationPositive = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return POSITIVE_PATTERNS.some((pattern) => pattern.test(text))
}

export const isConfirmationNegative = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(text))
}

export const isConfirmationReply = (message = '') => {
  const text = normalize(message)
  if (!text) return false
  return isConfirmationPositive(text) || isConfirmationNegative(text)
}

export const extractConfirmationRefinement = (message = '') => {
  const text = normalize(message)
  const match = text.match(/^no[,.\s]+(.+)$/)
  return match?.[1]?.trim() || null
}

export const resolveOrdinalCandidate = (message = '', candidates = []) => {
  const text = normalize(message)
  if (!text || !candidates.length) return null

  if (/^(the )?(first|1st|one|1)( one)?$/.test(text)) {
    return candidates[0] ?? null
  }

  const optionMatch = text.match(/\boption\s*(?<num>\d+|one|two|three|four|first|second|third|fourth)\b/)
  const theOneMatch = text.match(/\bthe\s+(?<num>\d+|one|two|three|four|first|second|third|fourth)\s+one\b/)

  const raw = optionMatch?.groups?.num ?? theOneMatch?.groups?.num
  if (raw) {
    const index = ORDINAL_MAP[raw]
    if (index != null && candidates[index]) return candidates[index]
  }

  const trailingOne = text.match(/\bthe\s+(.+?)\s+one$/)
  if (trailingOne?.[1]) {
    const fragment = trailingOne[1]
    let best = null
    let bestScore = 0
    for (const candidate of candidates) {
      const haystack = normalize(
        `${candidate.name ?? ''} ${candidate.brand ?? ''} ${candidate.keywords ?? ''}`,
      )
      if (haystack.includes(fragment)) return candidate
      const score = fragment
        .split(' ')
        .filter((token) => token.length >= 3 && haystack.includes(token)).length
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    if (bestScore >= 1) return best
  }

  return null
}
