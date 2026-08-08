import { describe, expect, it } from 'vitest'
import { createNutritionState, nutritionDateKey } from '../lib/nutrition'
import {
  applyAvaNutritionAction,
  undoAvaNutritionAction,
} from './applyAvaNutritionAction'
import {
  AVA_CONFIDENCE,
  interpretNutritionMessage,
  parseQuantity,
} from './nutritionParser'

const baseNutrition = () => createNutritionState()

describe('AVA nutrition parser', () => {
  it('parses common quantity words and fractions', () => {
    expect(parseQuantity('two eggs')).toBe(2)
    expect(parseQuantity('half serving')).toBe(0.5)
    expect(parseQuantity('one-quarter cup')).toBe(0.25)
    expect(parseQuantity('1.5 servings')).toBe(1.5)
  })

  it('interprets a simple food phrase with eggs and toast', () => {
    const result = interpretNutritionMessage(
      'I had two eggs and toast',
      baseNutrition(),
    )

    expect(result.handled).toBe(true)
    expect(result.action.type).toBe('log-food')
    expect(result.action.items.length).toBe(2)
    expect(result.autoExecute).toBe(true)
    expect(result.requiresConfirmation).toBe(false)
    expect(result.preview.estimates.some((item) => item.label === 'Calories')).toBe(
      true,
    )
  })

  it('interprets a catalog shake match', () => {
    const result = interpretNutritionMessage(
      'One Fairlife shake',
      baseNutrition(),
    )

    expect(result.handled).toBe(true)
    expect(result.action.items[0].food.name).toMatch(/Fairlife/i)
    expect(result.confidence).not.toBe(AVA_CONFIDENCE.NEEDS_CLARIFICATION)
  })

  it('interprets recipe fractions from saved recipes', () => {
    const nutrition = {
      ...baseNutrition(),
      recipes: [
        {
          id: 'recipe-chicken-bowl',
          name: 'Chicken Bowl',
          servings: 4,
          remainingServings: 4,
          totals: { calories: 800, protein: 60, carbs: 80, fat: 20, fiber: 8 },
          ingredients: [],
        },
      ],
    }

    const result = interpretNutritionMessage(
      'Half of my chicken bowl',
      nutrition,
    )

    expect(result.handled).toBe(true)
    expect(result.action.type).toBe('log-recipe')
    expect(result.action.servings).toBe(0.5)
    expect(result.action.recipe.name).toBe('Chicken Bowl')
  })

  it('interprets water bottle logging', () => {
    const result = interpretNutritionMessage(
      'I drank one water bottle',
      baseNutrition(),
    )

    expect(result.handled).toBe(true)
    expect(result.action.type).toBe('log-water')
    expect(result.action.ounces).toBe(33.8)
  })

  it('interprets body weight logging', () => {
    const result = interpretNutritionMessage('I weigh 179.6', baseNutrition())

    expect(result.handled).toBe(true)
    expect(result.action.type).toBe('log-weight')
    expect(result.action.value).toBe('179.6')
  })

  it('does not treat conversational state statements as food logging', () => {
    const result = interpretNutritionMessage("I'm feeling tired", baseNutrition())

    expect(result.handled).toBe(false)
    expect(result.clarification).toBeUndefined()
  })

  it('asks for clarification when multiple foods match closely', () => {
    const nutrition = {
      ...baseNutrition(),
      savedFoods: [
        {
          id: 'saved-chicken-1',
          name: 'Chicken Bowl',
          calories: 500,
          protein: 40,
          carbs: 45,
          fat: 12,
          fiber: 6,
        },
        {
          id: 'saved-chicken-2',
          name: 'Chicken Bowl Prep',
          calories: 520,
          protein: 42,
          carbs: 44,
          fat: 13,
          fiber: 6,
        },
      ],
    }

    const result = interpretNutritionMessage('my chicken bowl', nutrition)

    expect(result.clarification?.choices.length).toBeGreaterThan(1)
    expect(result.clarification.choices.length).toBeLessThanOrEqual(4)
    expect(result.requiresConfirmation).toBe(false)
  })
})

describe('AVA confirmed nutrition actions', () => {
  it('does not mutate nutrition until confirm is applied explicitly', () => {
    const nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage(
      'I drank one water bottle',
      nutrition,
    )

    expect(nutrition.days).toEqual({})

    const applied = applyAvaNutritionAction(nutrition, interpretation.action)
    expect(applied.nutrition.days[nutritionDateKey()].waterOz).toBe(33.8)
  })

  it('supports undo for the most recent AVA nutrition action', () => {
    const nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage('I weigh 179.6', nutrition)
    const applied = applyAvaNutritionAction(nutrition, interpretation.action)

    expect(
      applied.nutrition.days[nutritionDateKey()].weight,
    ).toBe('179.6')

    const restored = undoAvaNutritionAction(
      applied.nutrition,
      applied.undo,
    )

    expect(restored.nutrition.days[nutritionDateKey()]?.weight ?? '').toBe('')
  })

  it('keeps undo snapshots isolated per nutrition state', () => {
    const userOne = baseNutrition()
    const userTwo = {
      ...baseNutrition(),
      days: {
        [nutritionDateKey()]: {
          date: nutritionDateKey(),
          foods: [],
          waterOz: 12,
          weight: '',
          workoutCalories: 0,
          notes: '',
        },
      },
    }

    const applied = applyAvaNutritionAction(userOne, {
      type: 'log-water',
      ounces: 20,
    })

    expect(applied.nutrition.days[nutritionDateKey()].waterOz).toBe(20)
    expect(userTwo.days[nutritionDateKey()].waterOz).toBe(12)
    expect(applied.undo.nutrition.days?.[nutritionDateKey()]?.waterOz ?? 0).toBe(0)
  })
})
