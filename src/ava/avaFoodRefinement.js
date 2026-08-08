import { resolveOrdinalCandidate } from './avaConfirmationReplies'
import { curateFoodCandidates, mergeSearchMatchesWithScores } from './avaFoodCandidates'
import { classifyFoodQuerySpecificity } from './avaFoodSpecificity'
import { searchFoodMatches } from './nutritionParser'
import { AVA_TX_STATUS } from './avaTransactionState'

const normalize = (value = '') =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ')

const MAX_REFINEMENTS = 4

const KNOWN_BRANDS = [
  'chobani',
  'oikos',
  'fage',
  'clif',
  'cliff',
  'quest',
  'nature valley',
  'fairlife',
  'kind',
  'rxbar',
]

const FLAVOR_TOKENS = new Set([
  'vanilla',
  'chocolate',
  'strawberry',
  'blueberry',
  'peanut',
  'butter',
  'plain',
  'chip',
])

export const buildRefinedSearchQuery = (pending = {}, message = '') => {
  const base = pending.entityQuery ?? pending.query ?? ''
  const refinements = [...(pending.refinements ?? [])]
  const next = normalize(message)

  if (next && !refinements.includes(next)) {
    refinements.push(next)
  }

  return {
    refinements: refinements.slice(-MAX_REFINEMENTS),
    searchQuery: [...refinements, base].filter(Boolean).join(' ').trim(),
  }
}

export const getCandidatesMatchingMessage = (message = '', candidates = []) => {
  const text = normalize(message)
  if (!text || !candidates.length) return []

  return candidates.filter((candidate) => {
    const name = normalize(candidate.name ?? '')
    const brand = normalize(candidate.brand ?? '')
    const keywords = normalize(candidate.keywords ?? '')
    const haystack = `${name} ${brand} ${keywords}`.trim()
    if (!haystack) return false

    if (text === name) return true

    const tokens = text.split(' ').filter(Boolean)
    if (tokens.length && tokens.every((token) => haystack.includes(token))) {
      return true
    }

    if (name.includes(text) && text.length >= 4) return true
    if (brand && (text === brand || text.includes(brand))) return true

    return false
  })
}

export const shouldRefinePendingSearch = (
  message = '',
  candidates = [],
  pending = null,
) => {
  const text = normalize(message)
  if (!text || !candidates.length) return true

  const tokens = text.split(' ').filter(Boolean)
  if (!tokens.length || tokens.length > 4) return false

  const pendingQuery = pending?.entityQuery ?? pending?.query ?? ''
  const pendingProfile = pendingQuery
    ? classifyFoodQuerySpecificity(pendingQuery)
    : null

  if (
    tokens.length === 1 &&
    KNOWN_BRANDS.includes(tokens[0]) &&
    pendingProfile?.specificity === 'broad_category'
  ) {
    return true
  }

  const matches = getCandidatesMatchingMessage(text, candidates)
  if (!matches.length) return true

  if (matches.some((candidate) => normalize(candidate.name ?? '') === text)) {
    return matches.length > 1
  }

  if (matches.length > 1) return true

  if (
    tokens.length === 1 &&
    FLAVOR_TOKENS.has(tokens[0]) &&
    (pending?.refinements?.length ?? 0) > 0
  ) {
    return true
  }

  return false
}

export const isPendingCandidateSelection = (message = '', candidates = []) => {
  const text = normalize(message)
  if (!text || !candidates.length) return false

  if (resolveOrdinalCandidate(text, candidates)) return true

  const matches = getCandidatesMatchingMessage(text, candidates)
  if (matches.length === 1 && !shouldRefinePendingSearch(text, candidates, null)) {
    return true
  }

  for (const candidate of candidates) {
    const name = normalize(candidate.name ?? '')
    if (text === name) return true
    if (name.length >= 8 && (name.includes(text) || text.includes(name))) {
      return true
    }
  }

  return false
}

export const isPendingFoodRefinement = (message = '', pending = null) => {
  const text = normalize(message)
  if (!text || !pending) return false

  if (
    ![
      AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
      AVA_TX_STATUS.AWAITING_REFINEMENT,
    ].includes(pending.status)
  ) {
    return false
  }

  const candidates = pending.candidates ?? []
  const tokens = text.split(' ').filter(Boolean)

  if (isPendingCandidateSelection(text, candidates)) {
    return false
  }

  const pendingQuery = pending.entityQuery ?? pending.query ?? ''
  if (
    tokens.length === 1 &&
    KNOWN_BRANDS.includes(tokens[0]) &&
    classifyFoodQuerySpecificity(pendingQuery).specificity === 'broad_category'
  ) {
    return true
  }

  for (const candidate of candidates) {
    const name = normalize(candidate.name ?? '')
    const brand = normalize(candidate.brand ?? '')
    if (!name) continue
    if (text === name) return false
    if (name.includes(text) && text.length >= 4) return false
    if (text.includes(name) && name.length >= 4) return false
    if (brand && text.includes(brand)) return false
  }

  if (!tokens.length || tokens.length > 4) return false

  return true
}

export const searchRefinedFoodCandidates = (nutrition, pending, message) => {
  const { refinements, searchQuery } = buildRefinedSearchQuery(pending, message)

  const matches = searchFoodMatches(nutrition, searchQuery, { limit: 8 })
    .filter((entry) => !entry.item.isRecipe)

  const filteredEntries =
    refinements.length > 0
      ? matches.filter((entry) => {
          const haystack = normalize(
            `${entry.item.name ?? ''} ${entry.item.brand ?? ''} ${entry.item.keywords ?? ''}`,
          )
          return refinements.every((term) => haystack.includes(term))
        })
      : matches

  const pool = mergeSearchMatchesWithScores(
    filteredEntries.length ? filteredEntries : matches,
  )
  const curated = curateFoodCandidates(pool, searchQuery || pending.entityQuery || pending.query)

  return {
    refinements,
    searchQuery,
    candidates: curated.items,
  }
}

export const logCandidateDiagnostics = ({
  session,
  rendered = false,
  source = 'unknown',
} = {}) => {
  if (!import.meta.env?.DEV) return

  const pending = session?.pendingAction
  const labels = (pending?.candidates ?? []).map(
    (item) => item?.name ?? item?.id ?? 'unknown',
  )

  console.debug('[ava-candidates]', {
    source,
    status: pending?.status ?? 'idle',
    count: pending?.candidates?.length ?? 0,
    labels,
    refinements: pending?.refinements ?? [],
    rendered,
  })
}
