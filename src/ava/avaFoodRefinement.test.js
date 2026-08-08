import { describe, expect, it } from 'vitest'
import { createNutritionState } from '../lib/nutrition'
import { createAvaSession } from '../lib/avaConversation'
import {
  buildRefinedSearchQuery,
  isPendingFoodRefinement,
  searchRefinedFoodCandidates,
} from './avaFoodRefinement'
import { AVA_TX_STATUS } from './avaTransactionState'
import { processAvaNutritionMessage } from './avaNutritionTransaction'

describe('avaFoodRefinement', () => {
  it('builds chobani yogurt search from pending yogurt context', () => {
    const pending = {
      query: 'yogurt',
      entityQuery: 'yogurt',
      refinements: [],
    }

    const built = buildRefinedSearchQuery(pending, 'chobani')
    expect(built.searchQuery).toContain('chobani')
    expect(built.searchQuery).toContain('yogurt')
  })

  it('refines yogurt pending action with chobani candidates', () => {
    const nutrition = createNutritionState()
    const pending = {
      query: 'yogurt',
      entityQuery: 'yogurt',
      refinements: [],
      candidates: [],
      status: AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
    }

    const refined = searchRefinedFoodCandidates(nutrition, pending, 'chobani')
    expect(refined.candidates.length).toBeGreaterThan(0)
    expect(
      refined.candidates.some((item) => /chobani/i.test(item.name)),
    ).toBe(true)
  })

  it('treats chobani as refinement not new action', () => {
    const pending = {
      query: 'yogurt',
      status: AVA_TX_STATUS.AWAITING_DISAMBIGUATION,
      candidates: [{ id: 'a', name: 'Greek Yogurt, Plain' }],
    }

    expect(isPendingFoodRefinement('chobani', pending)).toBe(true)
  })

  it('processes chobani refinement without dead-end copy', () => {
    const nutrition = createNutritionState()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had yogurt',
      nutrition,
      session,
    })

    const refined = processAvaNutritionMessage({
      message: 'chobani',
      nutrition,
      session,
    })

    expect(refined.routed).toBe(true)
    expect(refined.result?.summary).not.toMatch(/still need to know/i)
    expect(
      session.pendingAction?.candidates?.some((item) => /chobani/i.test(item.name)) ||
        refined.result?.data?.executed,
    ).toBe(true)
  })

  it('supports second refinement with vanilla', () => {
    const nutrition = createNutritionState()
    const session = createAvaSession()

    processAvaNutritionMessage({ message: 'I had yogurt', nutrition, session })
    processAvaNutritionMessage({ message: 'chobani', nutrition, session })

    expect(session.pendingAction?.candidates?.some((item) => /chobani/i.test(item.name))).toBe(true)

    const second = processAvaNutritionMessage({
      message: 'vanilla',
      nutrition,
      session,
    })

    expect(second.routed).toBe(true)
    expect(
      session.pendingAction?.refinements?.includes('vanilla') ||
        second.result?.data?.executed ||
        /Chobani.*Vanilla/i.test(second.result?.summary ?? ''),
    ).toBe(true)
  })
})
