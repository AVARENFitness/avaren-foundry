import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
describe('nutrition quick-action hierarchy', () => {
  it('keeps food search and camera prominent while retaining water and weight tools', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/screens/NutritionScreen.jsx'), 'utf8')
    expect(src).toContain('nutrition-quick-log-launcher')
    expect(src).toContain('Search food')
    expect(src).toContain('Scan food')
    expect(src).toContain('<summary>Water & weight shortcuts</summary>')
    expect(src).toContain("addWater(Number(goals.bottleOz || 33.8))")
    expect(src).toContain("setTab('Goals')")
  })
})
