import { describe, expect, it } from 'vitest'
import { createNutritionState } from '../lib/nutrition'
import { interpretNutritionMessage, searchFoodMatches } from './nutritionParser'
import {
  canAutoResolveFood,
  classifyFoodQuerySpecificity,
  curateFoodCandidates,
  getUnsupportedProductAttributes,
} from './avaFoodSpecificity'
import {
  isGenericEstimateFood,
  mergeSearchMatchesWithScores,
} from './avaFoodCandidates'
import { processAvaNutritionMessage } from './avaNutritionTransaction'

const nutrition = () => createNutritionState()

describe('avaFoodSpecificity', () => {
  it('classifies yogurt as broad category', () => {
    expect(classifyFoodQuerySpecificity('yogurt').specificity).toBe('broad_category')
  })

  it('classifies protein bar as broad category', () => {
    expect(classifyFoodQuerySpecificity('protein bar').specificity).toBe(
      'broad_category',
    )
  })

  it('classifies Chobani yogurt as partial', () => {
    expect(classifyFoodQuerySpecificity('chobani yogurt').specificity).toBe('partial')
  })

  it('CASE 19: blocks auto-resolve when top result adds unsupported brand/flavor', () => {
    const top = {
      name: 'Nature Valley Protein Bar Peanut Butter Dark Chocolate',
      brand: 'Nature Valley',
      keywords: 'nature valley protein bar peanut butter dark chocolate',
    }

    expect(
      canAutoResolveFood({
        query: 'protein bar',
        topCandidate: top,
        topScore: 36,
        secondScore: 36,
        scoreGap: 0,
        candidates: [{ ...top, score: 36 }],
      }),
    ).toBe(false)

    expect(getUnsupportedProductAttributes('protein bar', top).length).toBeGreaterThan(0)
  })

  it('curates broad protein bar candidates by brand quality', () => {
    const matches = searchFoodMatches(nutrition(), 'protein bar', { limit: 8 })
    const curated = curateFoodCandidates(
      mergeSearchMatchesWithScores(matches),
      'protein bar',
    )
    const brands = new Set(
      curated.items
        .filter((item) => !isGenericEstimateFood(item))
        .map((item) => item.brand ?? item.displayTitle),
    )

    expect(curated.items.length).toBeGreaterThanOrEqual(2)
    expect(brands.size).toBeGreaterThanOrEqual(2)
  })
})

describe('AVA food specificity integration', () => {
  it('CASE 1: yogurt does not auto-log and returns candidates', () => {
    const result = interpretNutritionMessage('I had yogurt', nutrition())

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
    expect(result.action).toBeNull()
  })

  it('CASE 2: protein bar does not auto-log Nature Valley', () => {
    const result = interpretNutritionMessage('I had a protein bar', nutrition())

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
    expect(result.action).toBeNull()
    expect(
      result.clarification?.choices.some((item) => /nature valley/i.test(item.name)),
    ).toBe(true)
    expect(
      result.clarification?.choices.some((item) => /clif/i.test(item.name)),
    ).toBe(true)
  })

  it('CASE 3: milk asks for clarification', () => {
    const result = interpretNutritionMessage('I had milk', nutrition())

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
  })

  it('CASE 4: Chobani yogurt stays ambiguous across flavors', () => {
    const result = interpretNutritionMessage('I had Chobani yogurt', nutrition())

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
    expect(
      result.clarification?.choices.every((item) => /chobani/i.test(item.name)),
    ).toBe(true)
  })

  it('CASE 5: Clif Bar asks for candidate choices', () => {
    const result = interpretNutritionMessage('I had a Clif Bar', nutrition())

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
  })

  it('CASE 6: exact CLIF Bar Chocolate Chip can auto-log', () => {
    const result = interpretNutritionMessage(
      'I had a CLIF Bar Chocolate Chip',
      nutrition(),
    )

    expect(result.autoExecute).toBe(true)
    expect(result.action?.items?.[0]?.food?.name).toMatch(/CLIF Bar Chocolate Chip/i)
  })

  it('CASE 7: exact Nature Valley protein bar resolves correctly', () => {
    const result = interpretNutritionMessage(
      'I had Nature Valley Protein Bar Peanut Butter Dark Chocolate',
      nutrition(),
    )

    expect(result.autoExecute).toBe(true)
    expect(result.action?.items?.[0]?.food?.name).toMatch(
      /Nature Valley Protein Bar Peanut Butter Dark Chocolate/i,
    )
  })

  it('favorites do not auto-log broad yogurt', () => {
    const favNutrition = {
      ...nutrition(),
      favoriteFoodIds: ['chobani-plain'],
      recentFoodIds: ['chobani-plain'],
    }

    const result = interpretNutritionMessage('I had yogurt', favNutrition)

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.length).toBeGreaterThanOrEqual(2)
  })

  it('favorites do not mis-resolve protein bar to unrelated food', () => {
    const favNutrition = {
      ...nutrition(),
      favoriteFoodIds: ['chobani-plain'],
      recentFoodIds: ['chobani-plain'],
    }

    const result = interpretNutritionMessage('I had a protein bar', favNutrition)

    expect(result.autoExecute).not.toBe(true)
    expect(result.clarification?.choices.some((item) => /protein bar|clif/i.test(item.name))).toBe(
      true,
    )
  })

  it('protein bar pipeline keeps transaction pending until selection', () => {
    const n = nutrition()
    const session = { pendingAction: null, lastReversibleAction: null }

    const first = processAvaNutritionMessage({
      message: 'I had a protein bar',
      nutrition: n,
      session,
    })

    expect(first.result?.data?.executed).not.toBe(true)
    expect(session.pendingAction?.candidates?.length).toBeGreaterThanOrEqual(2)
  })
})
