import { describe, expect, it } from 'vitest'
import { createNutritionState } from '../lib/nutrition'
import { interpretNutritionMessage, searchFoodMatches } from './nutritionParser'
import { processAvaNutritionMessage } from './avaNutritionTransaction'
import { createAvaSession } from '../lib/avaConversation'
import { executeNutritionInterpretation } from './avaNutritionExecutor'
import {
  curateFoodCandidates,
  formatCandidateLabel,
  isGenericEstimateFood,
  mergeSearchMatchesWithScores,
} from './avaFoodCandidates'

const nutrition = () => createNutritionState()

describe('avaFoodCandidates', () => {
  it('CASE 1: broad protein bar favors distinct branded products over generic duplicates', () => {
    const matches = searchFoodMatches(nutrition(), 'protein bar', { limit: 8 })
    const curated = curateFoodCandidates(
      mergeSearchMatchesWithScores(matches),
      'protein bar',
    )

    const titles = curated.items.map((item) => item.displayTitle ?? item.name)
    const genericCount = curated.items.filter(isGenericEstimateFood).length

    expect(curated.items.length).toBeGreaterThanOrEqual(2)
    expect(curated.items.length).toBeLessThanOrEqual(3)
    expect(genericCount).toBeLessThanOrEqual(1)
    expect(new Set(titles).size).toBe(titles.length)
    expect(
      curated.items.some((item) => /clif|nature valley/i.test(item.displayTitle ?? item.name)),
    ).toBe(true)
  })

  it('CASE 2: suppresses near-identical generic protein bar entries', () => {
    const matches = searchFoodMatches(nutrition(), 'protein bar', { limit: 8 })
    const curated = curateFoodCandidates(
      mergeSearchMatchesWithScores(matches),
      'protein bar',
    )

    const genericNames = curated.items
      .filter(isGenericEstimateFood)
      .map((item) => item.name)

    expect(genericNames.length).toBeLessThanOrEqual(1)
    expect(
      curated.items.filter((item) => /protein bar/i.test(item.name)).length,
    ).toBeLessThanOrEqual(1)
  })

  it('CASE 3: broad protein bar candidate set is diverse across brands', () => {
    const matches = searchFoodMatches(nutrition(), 'protein bar', { limit: 8 })
    const curated = curateFoodCandidates(
      mergeSearchMatchesWithScores(matches),
      'protein bar',
    )

    const brands = curated.items
      .filter((item) => !isGenericEstimateFood(item))
      .map((item) => item.brand ?? item.displayTitle)
      .filter(Boolean)

    expect(brands.length).toBeGreaterThanOrEqual(2)
    expect(new Set(brands.map((b) => String(b).toLowerCase())).size).toBeGreaterThanOrEqual(2)
  })

  it('CASE 4: Clif refinement narrows to CLIF products', () => {
    const session = createAvaSession()
    const n = nutrition()

    processAvaNutritionMessage({ message: 'I had a protein bar', nutrition: n, session })
    const refined = processAvaNutritionMessage({
      message: 'Clif',
      nutrition: n,
      session,
    })

    expect(refined.routed).toBe(true)
    expect(
      session.pendingAction?.candidates?.every((item) => /clif/i.test(item.name)),
    ).toBe(true)
  })

  it('CASE 5: exact CLIF Bar Chocolate Chip remains fast', () => {
    const result = interpretNutritionMessage(
      'I had a CLIF Bar Chocolate Chip',
      nutrition(),
    )

    expect(result.autoExecute).toBe(true)
    expect(result.action?.items?.[0]?.food?.name).toMatch(/CLIF Bar Chocolate Chip/i)
  })

  it('CASE 6: generic estimate can still log when intentionally selected', () => {
    const n = nutrition()
    const matches = searchFoodMatches(n, 'protein bar', { limit: 8 })
    const curated = curateFoodCandidates(
      mergeSearchMatchesWithScores(matches),
      'protein bar',
    )
    const generic =
      curated.items.find(isGenericEstimateFood) ?? curated.genericFallback

    expect(generic).toBeTruthy()

    const selected = interpretNutritionMessage('protein bar', n, {
      selectedChoice: generic,
    })
    const execution = executeNutritionInterpretation({
      nutrition: n,
      interpretation: selected,
    })

    expect(execution.ok).toBe(true)
    expect(execution.applied?.entries?.[0]?.name).toMatch(/protein bar/i)
  })

  it('formats human-readable generic and branded labels', () => {
    expect(
      formatCandidateLabel({
        name: 'Protein Bar, Typical',
        brand: 'Estimate',
        serving: '1 bar',
      }).title,
    ).toBe('Generic protein bar')

    expect(
      formatCandidateLabel({
        name: 'CLIF Bar Chocolate Chip',
        brand: 'CLIF',
        serving: '1 bar (68 g)',
      }),
    ).toEqual({
      title: 'CLIF',
      subtitle: 'Bar Chocolate Chip · 1 bar (68 g)',
    })
  })
})

describe('7.7.13 regressions', () => {
  it('broad yogurt returns useful curated candidates', () => {
    const result = interpretNutritionMessage('I had yogurt', nutrition())

    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
    expect(result.clarification?.choices.length).toBeLessThanOrEqual(3)
    expect(
      result.clarification?.choices.some((item) => item.displayTitle || item.brand),
    ).toBe(true)
  })

  it('broad protein bar does not auto-log and avoids generic crowding', () => {
    const result = interpretNutritionMessage('I had a protein bar', nutrition())

    expect(result.autoExecute).not.toBe(true)
    const genericCount = (result.clarification?.choices ?? []).filter(isGenericEstimateFood)
      .length
    expect(genericCount).toBeLessThanOrEqual(1)
  })
})
