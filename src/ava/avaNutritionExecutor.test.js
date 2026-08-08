import { beforeEach, describe, expect, it } from 'vitest'
import { createNutritionState, nutritionDateKey, nutritionTotals } from '../lib/nutrition'
import { buildAvaContextPacket } from '../lib/avaContext'
import { respondToAvaMessage } from '../lib/avaConversation'
import { isNutritionQuery, shouldRunNutritionTool } from '../lib/avaConversationalRouter'
import {
  clearNutritionTransactionFingerprints,
  createNutritionTransactionFingerprint,
  executeNutritionInterpretation,
  executeNutritionTransaction,
  hasRecentNutritionFingerprint,
  shouldAutoExecuteNutrition,
  validateNutritionAction,
} from './avaNutritionExecutor'
import { interpretNutritionMessage } from './nutritionParser'

const today = nutritionDateKey()

const baseNutrition = () => createNutritionState()

describe('avaNutritionExecutor', () => {
  beforeEach(() => {
    clearNutritionTransactionFingerprints()
  })

  it('CASE 1: confident Clif Bar past-tense logs exactly one entry', () => {
    const nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage(
      'I had a chocolate chip Clif Bar',
      nutrition,
    )

    expect(interpretation.handled).toBe(true)
    expect(interpretation.action?.type).toBe('log-food')
    expect(shouldAutoExecuteNutrition(interpretation, 'I had a chocolate chip Clif Bar')).toBe(
      true,
    )

    const execution = executeNutritionInterpretation({ nutrition, interpretation })
    expect(execution.ok).toBe(true)

    const dayFoods = execution.nutrition.days[today]?.foods ?? []
    expect(dayFoods).toHaveLength(1)
    expect(dayFoods[0].name).toContain('CLIF Bar Chocolate Chip')
    expect(execution.summary.toLowerCase()).toContain('logged')
  })

  it('CASE 2: ambiguous Clif matches require selection before logging', () => {
    const nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage('I had a clif bar', nutrition)

    expect(interpretation.clarification?.choices.length).toBeGreaterThan(1)
    expect(interpretation.action).toBeNull()

    const selected = interpretNutritionMessage('I had a clif bar', nutrition, {
      selectedChoice: interpretation.clarification.choices[0],
    })

    expect(selected.autoExecute).toBe(true)
    const execution = executeNutritionInterpretation({ nutrition, interpretation: selected })
    expect(execution.ok).toBe(true)
    expect(execution.nutrition.days[today]?.foods ?? []).toHaveLength(1)
  })

  it('CASE 3: "I\'m hungry" does not run nutrition logging tool', () => {
    expect(shouldRunNutritionTool("I'm hungry", {})).toBe(false)
    const parsed = interpretNutritionMessage("I'm hungry", baseNutrition())
    expect(parsed.handled).toBe(false)
  })

  it('CASE 4: protein query does not mutate nutrition state', () => {
    const nutrition = baseNutrition()
    expect(isNutritionQuery('How much protein have I had?')).toBe(true)
    expect(shouldRunNutritionTool('How much protein have I had?', {})).toBe(false)

    const parsed = interpretNutritionMessage('How much protein have I had?', nutrition)
    expect(parsed.handled).toBe(false)

    const packet = buildAvaContextPacket(
      {
        history: [],
        readiness: { entries: [] },
        program: { nextWorkout: 'Chest + Back', workouts: {} },
        nutrition,
      },
      { userName: 'Jacob', now: new Date(`${today}T12:00:00`) },
    )

    const response = respondToAvaMessage({
      message: 'How much protein have I had?',
      packet,
    })

    expect(response.summary.toLowerCase()).toMatch(/protein|logged/)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(0)
  })

  it('CASE 5: duplicate transaction fingerprint blocks double log', () => {
    const nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage(
      'I had a chocolate chip Clif Bar',
      nutrition,
    )

    const first = executeNutritionInterpretation({ nutrition, interpretation })
    expect(first.ok).toBe(true)

    const second = executeNutritionInterpretation({
      nutrition: first.nutrition,
      interpretation,
    })
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('duplicate-transaction')
    expect(first.nutrition.days[today]?.foods ?? []).toHaveLength(1)
  })

  it('CASE 6: logging failure does not confirm success', () => {
    const validated = validateNutritionAction(
      {
        type: 'log-food',
        items: [
          {
            food: {
              id: 'fake-food-id',
              name: 'Fake Food',
              calories: 100,
              protein: 10,
              servings: 1,
            },
            source: 'catalog',
          },
        ],
      },
      baseNutrition(),
    )

    expect(validated.ok).toBe(false)
    expect(validated.reason).toBe('unknown-food-id')
  })

  it('CASE 7: post-write protein answer uses updated nutrition state', () => {
    let nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage(
      'I had a chocolate chip Clif Bar',
      nutrition,
    )
    const execution = executeNutritionInterpretation({ nutrition, interpretation })
    nutrition = execution.nutrition

    const totals = nutritionTotals(nutrition.days[today])
    expect(totals.protein).toBeGreaterThan(0)

    const packet = buildAvaContextPacket(
      {
        history: [],
        readiness: { entries: [] },
        program: { nextWorkout: 'Chest + Back', workouts: {} },
        nutrition,
      },
      { userName: 'Jacob', now: new Date(`${today}T12:00:00`) },
    )

    const response = respondToAvaMessage({
      message: 'How am I doing on protein now?',
      packet,
    })

    expect(response.summary).toMatch(/\d+g/)
    expect(response.summary.toLowerCase()).toContain('protein')
  })

  it('CASE 8: deterministic parser auto-executes through shared executor', () => {
    const nutrition = baseNutrition()
    const interpretation = interpretNutritionMessage(
      'I had a chocolate chip Clif Bar',
      nutrition,
    )

    expect(interpretation.handled).toBe(true)
    expect(shouldAutoExecuteNutrition(
      interpretation,
      'I had a chocolate chip Clif Bar',
    )).toBe(true)
  })
})

describe('avaNutritionExecutor security', () => {
  beforeEach(() => {
    clearNutritionTransactionFingerprints()
  })

  it('rejects unsupported action types', () => {
    const result = validateNutritionAction({ type: 'DELETE_FOOD' }, baseNutrition())
    expect(result.ok).toBe(false)
  })

  it('rejects fabricated catalog macros for unknown food id', () => {
    const result = validateNutritionAction(
      {
        type: 'log-food',
        items: [
          {
            food: {
              id: 'not-real',
              name: 'Fabricated Bar',
              calories: 9999,
              protein: 999,
              servings: 1,
            },
            source: 'catalog',
          },
        ],
      },
      baseNutrition(),
    )

    expect(result.ok).toBe(false)
  })

  it('replaces spoofed macros with trusted catalog values', () => {
    const result = validateNutritionAction(
      {
        type: 'log-food',
        items: [
          {
            food: {
              id: 'clif-choc-chip',
              name: 'CLIF Bar Chocolate Chip',
              calories: 9999,
              protein: 999,
              servings: 1,
            },
            source: 'catalog',
          },
        ],
      },
      baseNutrition(),
    )

    expect(result.ok).toBe(true)
    expect(result.action.items[0].food.calories).toBe(250)
    expect(result.action.items[0].food.protein).toBe(10)
  })

  it('rejects invalid quantity', () => {
    const result = validateNutritionAction(
      {
        type: 'log-food',
        items: [
          {
            food: {
              id: 'clif-choc-chip',
              name: 'CLIF Bar Chocolate Chip',
              calories: 250,
              protein: 10,
              servings: -1,
            },
            source: 'catalog',
          },
        ],
      },
      baseNutrition(),
    )

    expect(result.ok).toBe(false)
  })

  it('tracks fingerprints for idempotency', () => {
    const action = {
      type: 'log-food',
      items: [
        {
          food: { id: 'clif-choc-chip', name: 'CLIF Bar Chocolate Chip', servings: 1 },
          source: 'catalog',
        },
      ],
    }

    const fingerprint = createNutritionTransactionFingerprint(action, today)
    expect(hasRecentNutritionFingerprint(fingerprint)).toBe(false)

    executeNutritionTransaction({ nutrition: baseNutrition(), action })
    expect(hasRecentNutritionFingerprint(fingerprint)).toBe(true)
  })
})

describe('avaNutritionExecutor failure path', () => {
  it('returns retry-safe message when validation fails', () => {
    const execution = executeNutritionTransaction({
      nutrition: baseNutrition(),
      action: { type: 'log-food', items: [] },
    })

    expect(execution.ok).toBe(false)
    expect(execution.summary).toContain("couldn't save")
  })
})
