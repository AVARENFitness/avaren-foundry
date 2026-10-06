import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('NutritionScreen logging UX regressions', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/screens/NutritionScreen.jsx'),
    'utf8',
  )

  it('does not duplicate the primary food logging action on Today', () => {
    const start = source.indexOf('className="nutrition-quick-log-launcher"')
    const end = source.indexOf('className="nutrition-hydration-card"')
    const todayQuickArea = source.slice(start, end)

    expect(todayQuickArea).toContain('Add food in seconds')
    expect(todayQuickArea).toContain('Daily nutrition shortcuts')
    expect(todayQuickArea).not.toContain('<strong>Log Food</strong>')
  })

  it('prioritizes results while an active food search is being typed', () => {
    expect(source).toContain(
      "const activeFoodSearch = foodSearch.trim().length >= 2",
    )
    expect(source).toContain(
      '{!activeFoodSearch && <div className="nutrition-scan-food">',
    )
    expect(source).toContain(
      '{!activeFoodSearch && <div className="nutrition-search-tools">',
    )
    expect(source).toContain(
      '{!activeFoodSearch && <div className="nutrition-category-strip">',
    )
  })

  it('lets the quantity field be temporarily blank while the user types', () => {
    expect(source).toContain(
      'onChange={(event) => setFatSecretQuantity(event.target.value)}',
    )
    expect(source).not.toContain(
      'setFatSecretQuantity(Math.max(0.25',
    )
  })

  it('supports food-scale measurements in grams and ounces', () => {
    expect(source).toContain('FOOD_MEASURE_UNIT.GRAM')
    expect(source).toContain('FOOD_MEASURE_UNIT.OUNCE')
    expect(source).toContain('foodMeasureMultiplier')
    expect(source).toContain('Macros scale to the exact amount you enter.')
    expect(source).toContain('Enter what your scale actually showed.')
  })

  it('pauses food photos before macro analysis so athletes can add meal details', () => {
    expect(source).toContain("setScanState('context')")
    expect(source).toContain('Help AVA estimate this meal')
    expect(source).toContain('Tell AVA what you know')
    expect(source).toContain('Exact ingredients and scale weights take priority over the photo.')
    expect(source).toContain('6 oz grilled chicken, 150 g cooked rice, 40 g avocado')
    expect(source).toContain("runFoodScan(null, '', 'food')")
    expect(source).toContain("runFoodScan(null, scanContext, 'food')")
    expect(source).toContain('Best estimate')
    expect(source).toContain('Analyze with details')
  })

  it('keeps barcode photos on the immediate barcode path', () => {
    expect(source).toContain("if (mode === 'barcode' && file)")
    expect(source).toContain('detectNutritionBarcode(file)')
  })

  it('uses native barcode detection first and keeps a manual fallback', () => {
    expect(source).toContain('detectNutritionBarcode(file)')
    expect(source).toContain('Native scan first · AVA fallback')
    expect(source).toContain('Barcode not scanning?')
    expect(source).toContain('Enter 8, 12, or 13 digits')
  })

  it('shows measured quantities in the food log', () => {
    expect(source).toContain('foodMeasureDisplay(food.measurement)')
  })

  it('logs a verified serving snapshot for immediate shared totals', () => {
    expect(source).toContain('servingSnapshot: serving')
    expect(source).toContain('calories: serving.calories')
    expect(source).toContain('protein: serving.protein')
  })
})
