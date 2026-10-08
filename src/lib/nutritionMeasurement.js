export const FOOD_MEASURE_UNIT = {
  SERVING: 'serving',
  ITEM: 'item',
  GRAM: 'g',
  OUNCE: 'oz',
}

export const GRAMS_PER_OUNCE = 28.349523125

const numeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const pluralizeCountLabel = (label, amount) => {
  const normalized = String(label || 'item').trim().toLowerCase() || 'item'
  if (Number(amount) === 1) {
    if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`
    if (normalized.endsWith('ses')) return normalized.slice(0, -2)
    if (normalized.endsWith('s') && !normalized.endsWith('ss')) {
      return normalized.slice(0, -1)
    }
    return normalized
  }

  if (
    normalized.endsWith('s') ||
    normalized.endsWith('chips') ||
    normalized.endsWith('balls') ||
    normalized.endsWith('pieces')
  ) {
    return normalized
  }
  if (normalized.endsWith('y')) return `${normalized.slice(0, -1)}ies`
  return `${normalized}s`
}

export const normalizeFoodMeasureUnit = (value = '') => {
  const unit = String(value ?? '').trim().toLowerCase()
  if (!unit) return null
  if (['g', 'gram', 'grams'].includes(unit)) return FOOD_MEASURE_UNIT.GRAM
  if (['oz', 'ounce', 'ounces'].includes(unit)) return FOOD_MEASURE_UNIT.OUNCE
  if (
    [
      'item',
      'items',
      'piece',
      'pieces',
      'count',
      'counts',
      'unit',
      'units',
    ].includes(unit)
  ) {
    return FOOD_MEASURE_UNIT.ITEM
  }
  if (['serving', 'servings', 'portion', 'portions'].includes(unit)) {
    return FOOD_MEASURE_UNIT.SERVING
  }
  return null
}

export const convertFoodMeasureAmount = (
  amount,
  fromUnit,
  toUnit,
) => {
  const value = numeric(amount)
  const from = normalizeFoodMeasureUnit(fromUnit)
  const to = normalizeFoodMeasureUnit(toUnit)
  if (value == null || !from || !to) return null
  if (from === to) return value
  if (from === FOOD_MEASURE_UNIT.GRAM && to === FOOD_MEASURE_UNIT.OUNCE) {
    return value / GRAMS_PER_OUNCE
  }
  if (from === FOOD_MEASURE_UNIT.OUNCE && to === FOOD_MEASURE_UNIT.GRAM) {
    return value * GRAMS_PER_OUNCE
  }
  return null
}

export const parseFoodServingMeasurement = (value = '') => {
  const text = String(value ?? '')
  const match = text.match(
    /(?:^|[\s(,])([0-9]+(?:\.[0-9]+)?)\s*(g|grams?|oz|ounces?)\b/i,
  )
  if (!match) return null

  const amount = numeric(match[1])
  const unit = normalizeFoodMeasureUnit(match[2])
  if (amount == null || amount <= 0 || !unit) return null
  return { amount, unit }
}

const COUNT_STOP_WORDS = new Set([
  'g',
  'gram',
  'grams',
  'oz',
  'ounce',
  'ounces',
  'ml',
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'serving',
  'servings',
])

export const parseFoodServingCount = (value = '') => {
  const text = String(value ?? '').trim()
  if (!text) return null

  const match = text.match(
    /(?:^|[\s(,])([0-9]+(?:\.[0-9]+)?)\s+([a-z][a-z-]{1,24})\b/i,
  )
  if (!match) return null

  const amount = numeric(match[1])
  const rawLabel = String(match[2] || '').toLowerCase()
  if (
    amount == null ||
    amount <= 0 ||
    !rawLabel ||
    COUNT_STOP_WORDS.has(rawLabel)
  ) {
    return null
  }

  return {
    amount,
    unit: FOOD_MEASURE_UNIT.ITEM,
    label: rawLabel,
    singularLabel: pluralizeCountLabel(rawLabel, 1),
    source: 'description',
  }
}

export const resolveFoodServingCountBasis = (source = {}) =>
  parseFoodServingCount(
    source.servingDescription ??
      source.serving_description ??
      source.description ??
      source.serving ??
      '',
  )

export const parseFoodCountFromContext = (
  context = '',
  countBasis = null,
) => {
  if (!countBasis?.amount) return null
  const text = String(context ?? '').trim().toLowerCase()
  if (!text) return null

  const label = String(countBasis.label || '').toLowerCase()
  const singular = String(countBasis.singularLabel || '').toLowerCase()
  const escapedLabels = [label, singular, 'piece', 'pieces', 'item', 'items']
    .filter(Boolean)
    .map((value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\export const resolveFoodServingCountBasis = (source = {}) =>
  parseFoodServingCount(
    source.servingDescription ??
      source.serving_description ??
      source.description ??
      source.serving ??
      '',
  )

'))
    .join('|')

  const labeled = text.match(
    new RegExp(`(?:had|ate|eaten|used|have)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:${escapedLabels})\\b`, 'i'),
  )
  const simple = text.match(
    /\b(?:had|ate|eaten|used|have)\s+([0-9]+(?:\.[0-9]+)?)\b/i,
  )
  const amount = numeric(labeled?.[1] ?? simple?.[1])
  if (amount == null || amount <= 0) return null

  return {
    amount,
    unit: FOOD_MEASURE_UNIT.ITEM,
    itemLabel: countBasis.label,
    multiplier: amount / Number(countBasis.amount),
    source: 'user_context',
  }
}

export const resolveFoodServingBasis = (source = {}) => {
  const metricAmount = numeric(
    source.metricAmount ??
      source.metric_amount ??
      source.servingAmount ??
      source.serving_amount,
  )
  const metricUnit = normalizeFoodMeasureUnit(
    source.metricUnit ??
      source.metric_unit ??
      source.servingUnit ??
      source.serving_unit,
  )

  if (
    metricAmount != null &&
    metricAmount > 0 &&
    [FOOD_MEASURE_UNIT.GRAM, FOOD_MEASURE_UNIT.OUNCE].includes(metricUnit)
  ) {
    return {
      amount: metricAmount,
      unit: metricUnit,
      source: 'structured',
    }
  }

  const parsed = parseFoodServingMeasurement(
    source.servingDescription ??
      source.serving_description ??
      source.description ??
      source.serving ??
      '',
  )
  if (!parsed) return null
  return { ...parsed, source: 'description' }
}

export const resolveFoodMeasureBasisForUnit = ({
  unit,
  weightBasis = null,
  countBasis = null,
} = {}) => {
  const normalized = normalizeFoodMeasureUnit(unit)
  if (normalized === FOOD_MEASURE_UNIT.ITEM) return countBasis
  if (
    normalized === FOOD_MEASURE_UNIT.GRAM ||
    normalized === FOOD_MEASURE_UNIT.OUNCE
  ) {
    return weightBasis
  }
  return null
}

export const foodMeasureMultiplier = ({
  amount,
  unit,
  servingBasis = null,
} = {}) => {
  const value = numeric(amount)
  const normalizedUnit = normalizeFoodMeasureUnit(unit)

  if (value == null || value <= 0 || !normalizedUnit) return null

  if (normalizedUnit === FOOD_MEASURE_UNIT.SERVING) {
    return value
  }

  if (!servingBasis?.amount || !servingBasis?.unit) return null

  if (
    normalizedUnit === FOOD_MEASURE_UNIT.ITEM &&
    normalizeFoodMeasureUnit(servingBasis.unit) === FOOD_MEASURE_UNIT.ITEM
  ) {
    return value / Number(servingBasis.amount)
  }

  const amountInBasisUnit = convertFoodMeasureAmount(
    value,
    normalizedUnit,
    servingBasis.unit,
  )
  if (amountInBasisUnit == null) return null

  return amountInBasisUnit / Number(servingBasis.amount)
}

export const foodMeasureDisplay = ({
  amount,
  unit,
  itemLabel = '',
} = {}) => {
  const value = numeric(amount)
  const normalizedUnit = normalizeFoodMeasureUnit(unit)
  if (value == null || !normalizedUnit) return ''

  const rounded =
    normalizedUnit === FOOD_MEASURE_UNIT.SERVING ||
    normalizedUnit === FOOD_MEASURE_UNIT.ITEM
      ? Math.round(value * 100) / 100
      : Math.round(value * 10) / 10

  if (normalizedUnit === FOOD_MEASURE_UNIT.SERVING) {
    return `${rounded} ${rounded === 1 ? 'serving' : 'servings'}`
  }

  if (normalizedUnit === FOOD_MEASURE_UNIT.ITEM) {
    const label = pluralizeCountLabel(itemLabel || 'item', rounded)
    return `${rounded} ${label}`
  }

  return `${rounded} ${normalizedUnit}`
}

export const servingFractionDisplay = (multiplier) => {
  const value = Number(multiplier)
  if (!Number.isFinite(value) || value <= 0) return ''

  const fractions = [
    [0.125, '⅛'],
    [1 / 6, '⅙'],
    [0.2, '⅕'],
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [0.375, '⅜'],
    [0.5, '½'],
    [0.625, '⅝'],
    [2 / 3, '⅔'],
    [0.75, '¾'],
    [0.8, '⅘'],
    [5 / 6, '⅚'],
  ]

  const close = fractions.find(([fraction]) => Math.abs(value - fraction) < 0.015)
  if (close) return `${close[1]} serving`
  if (Math.abs(value - 1) < 0.01) return '1 serving'
  if (value < 1) return `${Math.round(value * 100) / 100} serving`
  return `${Math.round(value * 100) / 100} servings`
}

export const resolveNutritionLabelConsumptionMeasurement = ({
  servingBasis = null,
  context = '',
} = {}) => {
  if (
    !servingBasis?.amount ||
    ![FOOD_MEASURE_UNIT.GRAM, FOOD_MEASURE_UNIT.OUNCE].includes(
      normalizeFoodMeasureUnit(servingBasis.unit),
    )
  ) {
    return null
  }

  const userMeasurement = parseFoodServingMeasurement(context)
  const measurement =
    userMeasurement &&
    [FOOD_MEASURE_UNIT.GRAM, FOOD_MEASURE_UNIT.OUNCE].includes(
      userMeasurement.unit,
    )
      ? userMeasurement
      : {
          amount: Number(servingBasis.amount),
          unit: normalizeFoodMeasureUnit(servingBasis.unit),
        }

  const multiplier = foodMeasureMultiplier({
    amount: measurement.amount,
    unit: measurement.unit,
    servingBasis,
  })

  return {
    ...measurement,
    multiplier: multiplier ?? 1,
    source: userMeasurement ? 'user_context' : 'label_serving',
  }
}
