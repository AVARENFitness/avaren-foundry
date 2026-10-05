export const FOOD_MEASURE_UNIT = {
  SERVING: 'serving',
  GRAM: 'g',
  OUNCE: 'oz',
}

export const GRAMS_PER_OUNCE = 28.349523125

const numeric = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const normalizeFoodMeasureUnit = (value = '') => {
  const unit = String(value ?? '').trim().toLowerCase()
  if (!unit) return null
  if (['g', 'gram', 'grams'].includes(unit)) return FOOD_MEASURE_UNIT.GRAM
  if (['oz', 'ounce', 'ounces'].includes(unit)) return FOOD_MEASURE_UNIT.OUNCE
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

  if (metricAmount != null && metricAmount > 0 && metricUnit) {
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

  const amountInBasisUnit = convertFoodMeasureAmount(
    value,
    normalizedUnit,
    servingBasis.unit,
  )
  if (amountInBasisUnit == null) return null

  return amountInBasisUnit / Number(servingBasis.amount)
}

export const foodMeasureDisplay = ({ amount, unit } = {}) => {
  const value = numeric(amount)
  const normalizedUnit = normalizeFoodMeasureUnit(unit)
  if (value == null || !normalizedUnit) return ''

  const rounded =
    normalizedUnit === FOOD_MEASURE_UNIT.SERVING
      ? Math.round(value * 100) / 100
      : Math.round(value * 10) / 10

  if (normalizedUnit === FOOD_MEASURE_UNIT.SERVING) {
    return `${rounded} ${rounded === 1 ? 'serving' : 'servings'}`
  }
  return `${rounded} ${normalizedUnit}`
}
