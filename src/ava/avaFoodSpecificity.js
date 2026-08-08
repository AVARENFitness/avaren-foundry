import {
  curateFoodCandidates,
  mergeSearchMatchesWithScores,
} from './avaFoodCandidates'

export { curateFoodCandidates } from './avaFoodCandidates'

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')

const tokenize = (value = '') =>
  normalize(value)
    .split(' ')
    .filter(Boolean)

export const BROAD_FOOD_CATEGORIES = new Set([
  'yogurt',
  'protein bar',
  'protein bars',
  'granola bar',
  'granola bars',
  'milk',
  'cereal',
  'bread',
  'chicken',
  'rice',
  'protein shake',
  'shake',
  'bar',
  'cheese',
  'egg',
  'eggs',
  'toast',
  'soup',
  'salad',
  'sandwich',
  'pasta',
  'oatmeal',
  'coffee',
])

const FLAVOR_TOKENS = new Set([
  'vanilla',
  'chocolate',
  'strawberry',
  'blueberry',
  'peanut',
  'butter',
  'dark',
  'chip',
  'brownie',
  'honey',
  'plain',
  'zero',
  'sugar',
  'crunchy',
  'oats',
])

const GENERIC_QUERY_TOKENS = new Set([
  'a',
  'an',
  'the',
  'one',
  'some',
  'my',
  'greek',
  'nonfat',
  'non',
  'fat',
  'low',
  'whole',
  'skim',
  'typical',
  'generic',
  'estimate',
  'bar',
  'bars',
  'serving',
  'servings',
  ...BROAD_FOOD_CATEGORIES,
])

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
  'built',
  'think',
]

export const extractSuppliedAttributes = (query = '') => {
  const text = normalize(query)
  const tokens = tokenize(text)

  const brandSpecified = KNOWN_BRANDS.find(
    (brand) => text === brand || text.includes(brand),
  )

  const flavorTokens = tokens.filter((token) => FLAVOR_TOKENS.has(token))
  const flavorSpecified = flavorTokens.length > 0

  const categoryTokens = tokens.filter((token) => BROAD_FOOD_CATEGORIES.has(token))
  const productTokens = tokens.filter(
    (token) =>
      !GENERIC_QUERY_TOKENS.has(token) &&
      token.length >= 3 &&
      !FLAVOR_TOKENS.has(token) &&
      !KNOWN_BRANDS.includes(token),
  )

  const servingSpecified = /\b(cup|cups|oz|ounce|ounces|bottle|container|slice|slices)\b/.test(
    text,
  )

  return {
    text,
    tokens,
    brandSpecified: brandSpecified ?? null,
    flavorSpecified,
    flavorTokens,
    categoryTokens,
    productTokens,
    productSpecified: productTokens.length > 0,
    servingSpecified,
  }
}

export const classifyFoodQuerySpecificity = (query = '') => {
  const supplied = extractSuppliedAttributes(query)
  const { text, tokens, brandSpecified, flavorSpecified, productSpecified } =
    supplied

  const meaningfulTokens = tokens.filter(
    (token) => !['a', 'an', 'the', 'one', 'some', 'my'].includes(token),
  )

  const isBroadPhrase = BROAD_FOOD_CATEGORIES.has(text)
  const onlyBroadTokens =
    meaningfulTokens.length > 0 &&
    meaningfulTokens.every((token) => BROAD_FOOD_CATEGORIES.has(token))

  if (!meaningfulTokens.length || isBroadPhrase || onlyBroadTokens) {
    return {
      specificity: 'broad_category',
      brandSpecified: false,
      productSpecified: false,
      flavorSpecified: false,
      servingSpecified: supplied.servingSpecified,
      confidence: 0.2,
      supplied,
    }
  }

  const exactProductPattern =
    brandSpecified &&
    (flavorSpecified || productSpecified || meaningfulTokens.length >= 4)

  if (exactProductPattern && meaningfulTokens.length >= 3) {
    return {
      specificity: 'exact_match',
      brandSpecified: Boolean(brandSpecified),
      productSpecified,
      flavorSpecified,
      servingSpecified: supplied.servingSpecified,
      confidence: 0.9,
      supplied,
    }
  }

  if (brandSpecified || flavorSpecified || productSpecified) {
    return {
      specificity: 'partial',
      brandSpecified: Boolean(brandSpecified),
      productSpecified,
      flavorSpecified,
      servingSpecified: supplied.servingSpecified,
      confidence: 0.55,
      supplied,
    }
  }

  if (meaningfulTokens.length >= 3) {
    return {
      specificity: 'specific_product',
      brandSpecified: false,
      productSpecified: true,
      flavorSpecified,
      servingSpecified: supplied.servingSpecified,
      confidence: 0.75,
      supplied,
    }
  }

  return {
    specificity: 'broad_category',
    brandSpecified: false,
    productSpecified: false,
    flavorSpecified: false,
    servingSpecified: supplied.servingSpecified,
    confidence: 0.25,
    supplied,
  }
}

const candidateHaystack = (candidate = {}) =>
  normalize(
    `${candidate.name ?? ''} ${candidate.brand ?? ''} ${candidate.keywords ?? ''}`,
  )

export const getUnsupportedProductAttributes = (query = '', candidate = {}) => {
  const supplied = extractSuppliedAttributes(query)
  const haystack = candidateHaystack(candidate)
  const unsupported = []

  if (supplied.brandSpecified) {
    if (!haystack.includes(supplied.brandSpecified)) {
      unsupported.push(`brand:${supplied.brandSpecified}`)
    }
  } else if (candidate.brand) {
    const brand = normalizeBrand(candidate.brand)
    if (brand && brand !== 'estimate' && !supplied.text.includes(brand)) {
      unsupported.push(`brand:${brand}`)
    }
  }

  for (const token of supplied.flavorTokens) {
    if (!haystack.includes(token)) {
      unsupported.push(`flavor:${token}`)
    }
  }

  if (!supplied.flavorSpecified) {
    for (const token of FLAVOR_TOKENS) {
      if (haystack.includes(token) && !supplied.text.includes(token)) {
        unsupported.push(`flavor:${token}`)
      }
    }
  }

  const productDescriptorTokens = tokenize(candidate.name ?? '').filter(
    (token) =>
      token.length >= 4 &&
      !GENERIC_QUERY_TOKENS.has(token) &&
      !FLAVOR_TOKENS.has(token) &&
      !KNOWN_BRANDS.includes(token),
  )

  for (const token of productDescriptorTokens) {
    if (!supplied.text.includes(token) && !supplied.categoryTokens.includes(token)) {
      unsupported.push(`product:${token}`)
    }
  }

  return [...new Set(unsupported)]
}

export const countPlausibleCandidates = (query = '', matches = []) => {
  const supplied = extractSuppliedAttributes(query)
  const threshold = Math.max(
    12,
    (matches[0]?.score ?? 0) - 18,
  )

  return matches.filter((entry) => {
    if ((entry.score ?? 0) < threshold) return false
    if (supplied.brandSpecified) {
      return candidateHaystack(entry.item ?? entry).includes(supplied.brandSpecified)
    }
    return true
  }).length
}

const normalizeBrand = (brand = '') => normalize(brand)

export const canAutoResolveFood = ({
  query = '',
  specificity = null,
  candidates = [],
  topCandidate = null,
  topScore = 0,
  secondScore = 0,
  scoreGap = 0,
  suppliedAttributes = null,
} = {}) => {
  const profile = specificity ?? classifyFoodQuerySpecificity(query)
  const supplied = suppliedAttributes ?? profile.supplied ?? extractSuppliedAttributes(query)

  if (!topCandidate) return false

  if (profile.specificity === 'broad_category') return false

  if (profile.specificity === 'partial' && supplied.brandSpecified) {
    const brandMatches = candidates.filter((item) =>
      candidateHaystack(item).includes(supplied.brandSpecified),
    )
    if (brandMatches.length > 1) return false
    if (brandMatches.length === 1 && topScore >= 24) return true
  }

  const unsupported = getUnsupportedProductAttributes(query, topCandidate)
  const materialUnsupported = unsupported.filter(
    (entry) => !entry.startsWith('product:') || profile.specificity !== 'exact_match',
  )

  if (profile.specificity !== 'exact_match' && materialUnsupported.length > 0) {
    return false
  }

  const plausibleCount = candidates.length
    ? countPlausibleCandidates(
        query,
        candidates.map((item) => ({
          item,
          score: item.score ?? topScore,
        })),
      )
    : 1

  if (profile.specificity === 'partial') {
    if (plausibleCount > 1) return false
  }

  if (scoreGap < 12 && plausibleCount > 1) {
    return false
  }

  if (profile.specificity === 'exact_match') {
    const name = normalize(topCandidate.name ?? '')
    const queryText = supplied.text
    if (name.includes(queryText) || queryText.includes(name)) {
      return true
    }
    if (topScore >= 36 && materialUnsupported.length === 0) {
      return true
    }
    return false
  }

  if (profile.specificity === 'specific_product') {
    return topScore >= 42 && scoreGap >= 12 && materialUnsupported.length === 0
  }

  return false
}

export const analyzeFoodResolution = (query = '', matches = []) => {
  let scored = (matches ?? []).filter((entry) => entry?.item && !entry.item.isRecipe)
  const specificity = classifyFoodQuerySpecificity(query)
  const supplied = specificity.supplied ?? extractSuppliedAttributes(query)

  if (supplied.brandSpecified) {
    const brandMatches = scored.filter((entry) =>
      candidateHaystack(entry.item).includes(supplied.brandSpecified),
    )
    if (brandMatches.length) scored = brandMatches
  }

  if (!scored.length) {
    return {
      requiresClarification: true,
      candidates: [],
      specificity,
      confidence: 'needs-clarification',
    }
  }

  const top = scored[0]
  const second = scored[1]
  const scoreGap = second ? top.score - second.score : top.score
  const curated = curateFoodCandidates(
    mergeSearchMatchesWithScores(scored),
    query,
  )
  const diversified = curated.items

  const autoEligible = canAutoResolveFood({
    query,
    specificity,
    candidates: scored.map((entry) => ({ ...entry.item, score: entry.score })),
    topCandidate: top.item,
    topScore: top.score,
    secondScore: second?.score ?? 0,
    scoreGap,
    suppliedAttributes: supplied,
  })

  if (!autoEligible) {
    return {
      requiresClarification: diversified.length > 0,
      candidates: diversified,
      specificity,
      confidence: 'needs-clarification',
    }
  }

  return {
    requiresClarification: false,
    candidate: top.item,
    source: top.item.source,
    specificity,
    confidence: top.score >= 42 ? 'high' : 'medium',
  }
}
