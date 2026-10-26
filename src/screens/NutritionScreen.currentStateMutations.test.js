import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('logged-food current-state mutations', () => {
  it('edits and duplicates from the latest nutrition state', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/screens/NutritionScreen.jsx'),
      'utf8',
    )

    expect(source).toMatch(
      /patch\(\(current\) =>\s*updateLoggedFoodAmount\(\s*current,/,
    )
    expect(source).toMatch(
      /patch\(\(current\) =>\s*duplicateLoggedFoodEntry\(current, date, food\.id\)\.nutrition/,
    )
    expect(source).not.toMatch(
      /updateLoggedFoodAmount\(\s*nutrition,\s*date,/,
    )
    expect(source).not.toContain(
      'duplicateLoggedFoodEntry(nutrition, date, food.id)',
    )
  })
})
