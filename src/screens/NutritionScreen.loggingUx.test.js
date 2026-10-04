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

  it('logs a verified serving snapshot for immediate shared totals', () => {
    expect(source).toContain('servingSnapshot: serving')
    expect(source).toContain('calories: serving.calories')
    expect(source).toContain('protein: serving.protein')
  })
})
