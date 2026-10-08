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

  it('keeps the default Log tab quiet and reveals heavier tools on demand', () => {
    expect(source).toContain(
      "const activeFoodSearch = foodSearch.trim().length >= 2",
    )
    expect(source).toContain('className="nutrition-log-quick-actions"')
    expect(source).toContain("logCaptureMode === 'photo'")
    expect(source).toContain("logCaptureMode === 'barcode'")
    expect(source).toContain('Take photo')
    expect(source).toContain('Choose photo')
    expect(source).toContain('Or enter 8, 12, or 13 digits')
    expect(source).not.toContain('className="nutrition-category-strip"')
    expect(source).not.toContain('Meal details (optional)')
  })

  it('limits idle quick logging to recent or favorite foods', () => {
    expect(source).toContain("const [logBrowseMode, setLogBrowseMode] = useState('Recent')")
    expect(source).toContain('const quickLogFoods = useMemo')
    expect(source).toContain('.slice(0, 6)')
    expect(source).toContain("logBrowseMode === 'Favorites'")
    expect(source).toContain('Log again')
    expect(source).toContain('Foods you come back to')
  })

  it('limits active search results so the Log tab does not become a catalog', () => {
    expect(source).toContain('...fatSecretFoods,')
    expect(source).toContain('].slice(0, 12)')
    expect(source).toContain('Verified food database')
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

  it('releases the scan modal layer after logging so iOS scrolling cannot stay frozen', () => {
    expect(source).toContain('scheduleNutritionModalCleanup')
    expect(source).toContain('resetDocumentModalLayer()')
    expect(source).toContain("setTab('Today')")
  })

  it('keeps camera and barcode capture inputs mounted for Today quick log', () => {
    const nav = source.indexOf('className="nutrition-tabs"')
    const today = source.indexOf("tab === 'Today'")
    const cameraInput = source.indexOf('ref={cameraInputRef}')
    const barcodeInput = source.indexOf('ref={barcodeInputRef}')

    expect(cameraInput).toBeGreaterThan(nav)
    expect(barcodeInput).toBeGreaterThan(nav)
    expect(cameraInput).toBeLessThan(today)
    expect(barcodeInput).toBeLessThan(today)
  })

  it('uses exact user-entered weight when a nutrition label has a measurable serving', () => {
    expect(source).toContain('resolveNutritionLabelConsumptionMeasurement')
    expect(source).toContain('setScanMeasureUnit(labelConsumption.unit)')
    expect(source).toContain('setScanMeasureAmount(String(labelConsumption.amount))')
    expect(source).toContain('setScanQuantity(labelConsumption.multiplier)')
    expect(source).toContain('What did your scale show?')
  })

  it('keeps barcode photos on the immediate barcode path', () => {
    expect(source).toContain("if (mode === 'barcode' && file)")
    expect(source).toContain('detectNutritionBarcode(file)')
  })

  it('uses native barcode detection first and keeps a manual fallback', () => {
    expect(source).toContain('detectNutritionBarcode(file)')
    expect(source).toContain('Scan barcode')
    expect(source).toContain('Or enter 8, 12, or 13 digits')
  })

  it('shows measured quantities in the food log', () => {
    expect(source).toContain('foodMeasureDisplay(food.measurement)')
  })

  it('can save an AVA-scanned meal for one-tap repeat or adjusted logging', () => {
    expect(source).toContain('Save reusable meal')
    expect(source).toContain('Saved to Library')
    expect(source).toContain('Log Again')
    expect(source).toContain('Adjust & Log')
    expect(source).toContain('buildReusableMealRecipe')
    expect(source).toContain('calculateReusableMealTotals')
    expect(source).toContain('Change what was different today.')
  })

  it('lets reusable meals add and remove ingredients before logging', () => {
    expect(source).toContain('removeReusableMealIngredient')
    expect(source).toContain('addReusableMealIngredient')
    expect(source).toContain('Search AVAREN foods')
    expect(source).toContain('Try cheese, Greek yogurt, avocado...')
    expect(source).toContain('Update saved meal')
    expect(source).toContain('Add adjusted meal')
    expect(source).toContain('applyReusableMealPreviewToRecipe')
  })

  it('keeps one-time meal edits separate from saved-default updates', () => {
    expect(source).toContain('updateSavedReusableMeal')
    expect(source).toContain('added with today’s adjustments')
    expect(source).toContain('updated as your new default meal')
  })

  it('keeps reusable meals separate from batch inventory semantics', () => {
    expect(source).toContain('recipe.reusableMeal')
    expect(source).toContain("recipe.trackInventory === false ? null : recipe.servings")
    expect(source).toContain('AVA reusable meal')
  })

  it('logs a verified serving snapshot for immediate shared totals', () => {
    expect(source).toContain('servingSnapshot: serving')
    expect(source).toContain('calories: serving.calories')
    expect(source).toContain('protein: serving.protein')
  })
})
