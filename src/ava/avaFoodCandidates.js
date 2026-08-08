import {
  classifyFoodQuerySpecificity,
  extractSuppliedAttributes,
  getUnsupportedProductAttributes,
} from './avaFoodSpecificity'

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')

const GENERIC_BRANDS = new Set([
  'estimate',
  'estimated meal',
  'generic',
  'common food',
])

export const isGenericEstimateFood = (item = {}) => {
  if (!item?.name) return false
  const brand = normalize(item.brand ?? '')
  const name = normalize(item.name ?? '')
  const keywords = normalize(item.keywords ?? '')

  if (GENERIC_BRANDS.has(brand)) return true
  if (/\btypical\b/.test(name)) return true
  if (/\bestimate\b/.test(keywords)) return true
  if (/^protein bar$/.test(name)) return true

  return false
}

const stripBrandPrefix = (name = '', brand = '') => {
  let product = String(name ?? '').trim()
  const normalizedBrand = normalize(brand)
  if (normalizedBrand && normalizedBrand !== 'estimate') {
    const pattern = new RegExp(`^${normalizedBrand}\\s+`, 'i')
    product = product.replace(pattern, '').trim()
  }
  return product || name
}

export const inferGenericCategoryLabel = (item = {}) => {
  const name = normalize(item.name ?? '').replace(/,?\s*typical$/, '').trim()
  if (name.includes('protein bar')) return 'protein bar'
  if (name.includes('granola bar')) return 'granola bar'
  if (name.includes('yogurt')) return 'yogurt'
  if (name.includes('milk')) return 'milk'
  if (name.includes('bar')) return 'bar'
  return name || 'food'
}

export const formatCandidateLabel = (item = {}) => {
  if (item.isOther) {
    return {
      title: 'Other',
      subtitle: 'Search another brand or name',
    }
  }

  if (isGenericEstimateFood(item)) {
    const category = inferGenericCategoryLabel(item)
    const serving = item.serving ? String(item.serving).trim() : '1 serving'
    return {
      title: `Generic ${category}`,
      subtitle: `Estimate · ${serving}`,
    }
  }

  const brand =
    item.brand && !GENERIC_BRANDS.has(normalize(item.brand))
      ? String(item.brand).trim()
      : null
  const product = stripBrandPrefix(item.name, brand)

  if (brand) {
    return {
      title: brand,
      subtitle: [product, item.serving].filter(Boolean).join(' · ') || 'Catalog match',
    }
  }

  return {
    title: product || item.name,
    subtitle: item.serving ? String(item.serving).trim() : 'Catalog match',
  }
}

export const applyCandidateDisplayMeta = (item = {}) => {
  const label = formatCandidateLabel(item)
  return {
    ...item,
    displayTitle: label.title,
    displaySubtitle: label.subtitle,
  }
}

const genericFamilyKey = (item = {}) => {
  if (!isGenericEstimateFood(item)) return null
  return normalize(item.name ?? '')
    .replace(/,?\s*typical$/, '')
    .replace(/\bestimate\b/g, '')
    .trim()
}

const similarityKey = (item = {}) => {
  const generic = genericFamilyKey(item)
  if (generic) return `generic:${generic}`

  const brand = normalize(item.brand ?? '')
  const name = normalize(item.name ?? '')
  if (brand && brand !== 'estimate') return `brand:${brand}:${name}`
  return `name:${name}`
}

export const scoreCandidatePresentation = (item = {}, query = '', searchScore = 0) => {
  const profile = classifyFoodQuerySpecificity(query)
  let score = Number(searchScore) || 0
  const generic = isGenericEstimateFood(item)

  if (profile.specificity === 'broad_category') {
    const unsupported = getUnsupportedProductAttributes(query, item)
    score -= unsupported.length * 10

    if (generic) score -= 28
    else if (item.brand && !GENERIC_BRANDS.has(normalize(item.brand))) score += 14

    const nameTokens = normalize(item.name ?? '').split(' ').filter(Boolean).length
    if (nameTokens >= 6 && unsupported.length >= 2) score -= 12
  } else if (profile.specificity === 'partial') {
    if (generic) score -= 18
    else score += 6
  } else if (generic) {
    score -= 8
  }

  return score
}

const pickDiverseCandidates = (ranked = [], max = 3) => {
  const picked = []
  const seenBrands = new Set()
  const seenKeys = new Set()

  const usefulBrand = (item = {}) => {
    const brand = normalize(item.brand ?? '')
    return brand && !GENERIC_BRANDS.has(brand) ? brand : null
  }

  for (const entry of ranked) {
    const key = similarityKey(entry.item)
    if (seenKeys.has(key)) continue

    const brand = usefulBrand(entry.item)
    const isGeneric = isGenericEstimateFood(entry.item)

    if (!isGeneric && brand && seenBrands.has(brand)) continue

    seenKeys.add(key)
    if (!isGeneric && brand) seenBrands.add(brand)
    picked.push(entry.item)
    if (picked.length >= max) break
  }

  if (picked.length < max) {
    for (const entry of ranked) {
      const key = similarityKey(entry.item)
      if (seenKeys.has(key)) continue
      seenKeys.add(key)
      picked.push(entry.item)
      if (picked.length >= max) break
    }
  }

  return picked
}

export const curateFoodCandidates = (
  items = [],
  query = '',
  { maxPrimary = 3, minUsefulScore = 8 } = {},
) => {
  if (!items.length) {
    return { items: [], genericFallback: null }
  }

  const profile = classifyFoodQuerySpecificity(query)
  const ranked = items
    .map((item, index) => ({
      item,
      searchScore: item.searchScore ?? item.score ?? Math.max(1, items.length - index),
      presentationScore: scoreCandidatePresentation(
        item,
        query,
        item.searchScore ?? item.score ?? Math.max(1, items.length - index),
      ),
    }))
    .sort((left, right) => right.presentationScore - left.presentationScore)

  const genericRanked = ranked.filter((entry) => isGenericEstimateFood(entry.item))
  const brandedRanked = ranked.filter((entry) => !isGenericEstimateFood(entry.item))

  let primary = []

  if (profile.specificity === 'broad_category') {
    const usefulBranded = brandedRanked.filter(
      (entry) => entry.presentationScore >= minUsefulScore,
    )
    primary = pickDiverseCandidates(usefulBranded, maxPrimary)

    if (primary.length < 2 && brandedRanked.length) {
      primary = pickDiverseCandidates(brandedRanked, Math.min(maxPrimary, 2))
    }

    if (primary.length < maxPrimary && genericRanked.length) {
      const genericRep = genericRanked[0]?.item ?? null
      const genericKey = genericRep ? genericFamilyKey(genericRep) : null
      const alreadyGeneric = primary.some(
        (item) => genericFamilyKey(item) === genericKey,
      )
      if (
        genericRep &&
        !alreadyGeneric &&
        primary.length >= 2 &&
        primary.length < maxPrimary
      ) {
        primary.push(genericRep)
      }
    }
  } else {
    const pool = ranked.filter((entry) => entry.presentationScore >= minUsefulScore)
    const deduped = []
    const seen = new Set()

    for (const entry of (pool.length ? pool : ranked)) {
      const key = similarityKey(entry.item)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(entry.item)
      if (deduped.length >= maxPrimary) break
    }

    primary = deduped
  }

  if (!primary.length && ranked.length) {
    const seen = new Set()
    for (const entry of ranked) {
      const key = similarityKey(entry.item)
      if (seen.has(key)) continue
      seen.add(key)
      primary.push(entry.item)
      if (primary.length >= maxPrimary) break
    }
  }

  primary = primary
    .slice(0, maxPrimary)
    .map((item) => applyCandidateDisplayMeta(item))

  const genericFallback =
    genericRanked.find((entry) => entry.item)?.item ??
    null

  return {
    items: primary,
    genericFallback: genericFallback
      ? applyCandidateDisplayMeta(genericFallback)
      : null,
  }
}

export const mergeSearchMatchesWithScores = (matches = []) =>
  matches.map((entry) => ({
    ...entry.item,
    searchScore: entry.score ?? 0,
    score: entry.score ?? 0,
    source: entry.item.source ?? 'catalog',
  }))
