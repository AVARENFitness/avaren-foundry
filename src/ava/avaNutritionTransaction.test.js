import { beforeEach, describe, expect, it } from 'vitest'
import { createNutritionState, nutritionDateKey } from '../lib/nutrition'
import { createAvaSession } from '../lib/avaConversation'
import { clearNutritionTransactionFingerprints } from './avaNutritionExecutor'
import {
  canUndoLastReversibleAction,
  hasActivePendingTransaction,
  AVA_TX_STATUS,
  isAwaitingConfirmation,
} from './avaTransactionState'
import {
  AVA_CLARIFICATION_OTHER_ID,
  buildClarificationPayload,
  buildDisambiguationChoices,
  processAvaNutritionMessage,
  resolveCandidateFromFollowUp,
  undoLastReversibleAction,
} from './avaNutritionTransaction'
import { answerNutritionQuery } from './avaNutritionQuery'
import { executeNutritionInterpretation } from './avaNutritionExecutor'
import { interpretNutritionMessage } from './nutritionParser'

const today = nutritionDateKey()

const baseNutrition = () => createNutritionState()

const totalServings = (nutrition) =>
  (nutrition.days[today]?.foods ?? []).reduce(
    (sum, entry) => sum + Number(entry.servings ?? 1),
    0,
  )

describe('avaNutritionTransaction', () => {
  beforeEach(() => {
    clearNutritionTransactionFingerprints()
  })

  it('CASE 1: milk clarification resolves on typed follow-up "whole milk"', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const first = processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    expect(first.routed).toBe(true)
    expect(hasActivePendingTransaction(session)).toBe(true)
    expect(first.result?.data?.interpretation?.clarification?.choices.length).toBeGreaterThan(
      1,
    )

    const second = processAvaNutritionMessage({
      message: 'whole milk',
      nutrition,
      session,
    })

    expect(second.routed).toBe(true)
    expect(second.result?.data?.executed).toBe(true)
    expect(hasActivePendingTransaction(session)).toBe(false)

    const foods = second.result?.data?.execution?.nutrition?.days?.[today]?.foods ?? []
    expect(foods).toHaveLength(1)
    expect(foods[0].name.toLowerCase()).toContain('whole milk')
    expect(
      canUndoLastReversibleAction(
        session,
        second.result?.data?.execution?.nutrition ?? nutrition,
      ),
    ).toBe(true)
  })

  it('CASE 2: milk clarification resolves when candidate is tapped', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const first = processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    const choice =
      first.result?.data?.interpretation?.clarification?.choices.find((item) =>
        /whole/i.test(item.name),
      ) ?? first.result?.data?.interpretation?.clarification?.choices[0]

    const second = processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
      options: { selectedChoice: choice },
    })

    expect(second.result?.data?.executed).toBe(true)
    expect(hasActivePendingTransaction(session)).toBe(false)

    const foods = second.result?.data?.execution?.nutrition?.days?.[today]?.foods ?? []
    expect(foods).toHaveLength(1)
    expect(foods[0].name).toBe(choice.name)
  })

  it('CASE 3: pending milk clarification cancels on "never mind"', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    expect(hasActivePendingTransaction(session)).toBe(true)

    const cancel = processAvaNutritionMessage({
      message: 'never mind',
      nutrition,
      session,
    })

    expect(cancel.routed).toBe(true)
    expect(cancel.result?.data?.cancelled).toBe(true)
    expect(hasActivePendingTransaction(session)).toBe(false)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(0)
  })

  it('CASE 4: workout query during pending clarification cancels pending transaction', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    const interrupt = processAvaNutritionMessage({
      message: 'what workout do I have today?',
      nutrition,
      session,
    })

    expect(interrupt.routed).toBe(false)
    expect(interrupt.cancelledPending).toBe(true)
    expect(hasActivePendingTransaction(session)).toBe(false)
  })

  it('CASE 5: correction updates Clif Bar total to 2 instead of adding duplicate', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition
    expect(totalServings(nutrition)).toBe(1)

    const corrected = processAvaNutritionMessage({
      message: 'I actually had 2 Clif Bars',
      nutrition,
      session,
    })

    nutrition = corrected.result?.data?.execution?.nutrition ?? nutrition
    expect(corrected.result?.data?.executed).toBe(true)
    expect(corrected.result?.summary.toLowerCase()).toContain('updated')
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(1)
    expect(totalServings(nutrition)).toBe(2)
  })

  it('CASE 6: additive correction adds more servings without replacing prior total', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition
    expect(totalServings(nutrition)).toBe(1)

    const additive = processAvaNutritionMessage({
      message: 'I had 2 more',
      nutrition,
      session,
    })

    nutrition = additive.result?.data?.execution?.nutrition ?? nutrition
    expect(additive.result?.data?.executed).toBe(true)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(2)
    expect(totalServings(nutrition)).toBe(3)
  })

  it('CASE 7: milk type correction replaces prior entry', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    const resolved = processAvaNutritionMessage({
      message: '2% milk',
      nutrition,
      session,
    })

    nutrition = resolved.result?.data?.execution?.nutrition ?? nutrition
    expect(resolved.result?.data?.executed).toBe(true)
    expect(nutrition.days[today]?.foods?.[0]?.name.toLowerCase()).toMatch(/2%|two percent/)

    const corrected = processAvaNutritionMessage({
      message: 'Actually it was whole milk',
      nutrition,
      session,
    })

    nutrition = corrected.result?.data?.execution?.nutrition ?? nutrition
    expect(corrected.result?.data?.executed).toBe(true)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(1)
    expect(nutrition.days[today]?.foods?.[0]?.name.toLowerCase()).toContain('whole milk')
  })

  it('CASE 8: undo removes the exact AVA-created food entry', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(true)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(1)

    const undone = undoLastReversibleAction({ nutrition, session })
    expect(undone.ok).toBe(true)
    expect(undone.nutrition.days[today]?.foods ?? []).toHaveLength(0)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
    expect(undone.summary.toLowerCase()).toContain('removed')
  })

  it('CASE 9: undo cannot run twice on the same transaction', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition

    const firstUndo = undoLastReversibleAction({ nutrition, session })
    nutrition = firstUndo.nutrition

    const secondUndo = undoLastReversibleAction({ nutrition, session })
    expect(secondUndo.ok).toBe(false)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
  })

  it('CASE 10: failed logging does not expose undo', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const failed = processAvaNutritionMessage({
      message: 'I had a totally unknown mystery food xyz123',
      nutrition,
      session,
    })

    expect(failed.result?.data?.executed).toBeFalsy()
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
  })

  it('CASE 11: undo remains available after unrelated chat until used or session reset', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(true)

    const unrelated = processAvaNutritionMessage({
      message: "I'm hungry",
      nutrition,
      session,
    })

    expect(unrelated.routed).toBe(false)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(true)
  })

  it('CASE 1 candidates: Clif Bar ambiguity exposes 2-4 choices without logging', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const result = processAvaNutritionMessage({
      message: 'I had a Clif Bar',
      nutrition,
      session,
    })

    expect(result.routed).toBe(true)
    expect(result.result?.data?.executed).toBeFalsy()
    expect(hasActivePendingTransaction(session)).toBe(true)

    const clarification = buildClarificationPayload(
      result.result?.data?.interpretation,
      session,
    )
    expect(clarification?.choices?.length).toBeGreaterThanOrEqual(2)
    expect(clarification?.choices?.length).toBeLessThanOrEqual(5)
    expect(
      clarification.choices.some((item) => item.id === AVA_CLARIFICATION_OTHER_ID),
    ).toBe(true)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(0)
  })

  it('CASE 2 candidates: tapping a choice logs once and enables undo', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const first = processAvaNutritionMessage({
      message: 'I had a Clif Bar',
      nutrition,
      session,
    })

    const choice = buildDisambiguationChoices(
      first.result?.data?.interpretation?.clarification?.choices ?? [],
    ).find((item) => !item.isOther)

    const second = processAvaNutritionMessage({
      message: 'I had a Clif Bar',
      nutrition,
      session,
      options: { selectedChoice: choice },
    })

    nutrition = second.result?.data?.execution?.nutrition ?? nutrition
    expect(second.result?.data?.executed).toBe(true)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(1)
    expect(hasActivePendingTransaction(session)).toBe(false)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(true)
  })

  it('CASE 4 quantity: 2 Clif Bars preserved through candidate selection', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const first = processAvaNutritionMessage({
      message: 'I had 2 Clif Bars',
      nutrition,
      session,
    })

    expect(session.pendingAction?.quantity).toBe(2)

    const choice = buildDisambiguationChoices(
      first.result?.data?.interpretation?.clarification?.choices ?? [],
    ).find((item) => !item.isOther)

    const second = processAvaNutritionMessage({
      message: 'I had 2 Clif Bars',
      nutrition,
      session,
      options: { selectedChoice: choice },
    })

    nutrition = second.result?.data?.execution?.nutrition ?? nutrition
    expect(totalServings(nutrition)).toBe(2)
  })

  it('CASE 6 other: selecting Other does not log food', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    const other = buildDisambiguationChoices(session.pendingAction.candidates).find(
      (item) => item.isOther,
    )

    const result = processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
      options: { selectedChoice: other },
    })

    expect(result.result?.data?.awaitingRefinement).toBe(true)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(0)
  })

  it('CASE 7 no match: unknown food asks for detail without logging', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const result = processAvaNutritionMessage({
      message: 'I had zzxxyyqqwertnothing',
      nutrition,
      session,
    })

    expect(result.routed).toBe(true)
    expect(result.result?.data?.noMatch).toBe(true)
    expect(result.result?.data?.executed).toBeFalsy()
    expect(hasActivePendingTransaction(session)).toBe(false)
    expect(nutrition.days[today]?.foods ?? []).toHaveLength(0)
    expect(result.result?.summary.toLowerCase()).toContain('confident match')
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
  })

  it('CASE 8 query: protein total uses live nutrition state', () => {
    const nutrition = {
      ...baseNutrition(),
      days: {
        [today]: {
          date: today,
          foods: [
            {
              id: 'food-1',
              name: 'Chicken',
              servings: 1,
              calories: 400,
              protein: 45,
              carbs: 0,
              fat: 10,
              fiber: 0,
              source: 'manual',
            },
          ],
          waterOz: 0,
        },
      },
    }

    const answer = answerNutritionQuery('How much protein have I had today?', nutrition)
    expect(answer.summary).toContain('45')
  })

  it('CASE 9 query: empty day returns honest no-data response', () => {
    const answer = answerNutritionQuery(
      'How much protein have I had today?',
      baseNutrition(),
    )
    expect(answer.summary.toLowerCase()).toContain('enough logged')
  })

  it('CASE 10 query: post-write protein includes newly logged item', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition
    const answer = answerNutritionQuery('How much protein have I had today?', nutrition)
    expect(answer.summary).toMatch(/\d+g/)
    expect(Number(answer.summary.match(/(\d+)g/)?.[1] ?? 0)).toBeGreaterThan(0)
  })

  it('CASE 16 pending clarification does not expose undo', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    expect(hasActivePendingTransaction(session)).toBe(true)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
  })

  it('CASE 18 cancel: never mind clears pending without undo', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    processAvaNutritionMessage({
      message: 'never mind',
      nutrition,
      session,
    })

    expect(hasActivePendingTransaction(session)).toBe(false)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
  })

  it('resolveCandidateFromFollowUp matches partial milk replies', () => {
    const candidates = [
      { id: 'whole-milk', name: 'Whole Milk', brand: 'Generic', keywords: 'whole milk' },
      { id: 'skim-milk', name: 'Skim Milk', brand: 'Generic', keywords: 'skim milk' },
    ]

    expect(resolveCandidateFromFollowUp('whole milk', candidates)?.id).toBe('whole-milk')
    expect(resolveCandidateFromFollowUp('Greek', [
      { id: 'greek-yogurt', name: 'Greek Yogurt', brand: 'Generic', keywords: 'greek yogurt' },
      { id: 'regular-yogurt', name: 'Regular Yogurt', brand: 'Generic', keywords: 'yogurt' },
    ])?.id).toBe('greek-yogurt')
  })

  it('CASE 7.7.9: yes confirms awaiting Whole Milk transaction', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const first = processAvaNutritionMessage({
      message: 'One Fairlife shake',
      nutrition,
      session,
    })

    expect(first.routed).toBe(true)
    expect(isAwaitingConfirmation(session)).toBe(true)
    expect(first.result?.summary).toMatch(/Log .* for today/i)

    const second = processAvaNutritionMessage({
      message: 'yes',
      nutrition,
      session,
    })

    expect(second.result?.data?.executed).toBe(true)
    expect(hasActivePendingTransaction(session)).toBe(false)
    expect(
      canUndoLastReversibleAction(
        session,
        second.result?.data?.execution?.nutrition ?? nutrition,
      ),
    ).toBe(true)
  })

  it('CASE 7.7.9: no cancels awaiting confirmation without undo', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'One Fairlife shake',
      nutrition,
      session,
    })

    expect(isAwaitingConfirmation(session)).toBe(true)

    const declined = processAvaNutritionMessage({
      message: 'no',
      nutrition,
      session,
    })

    expect(declined.result?.data?.executed).toBeFalsy()
    expect(hasActivePendingTransaction(session)).toBe(false)
    expect(canUndoLastReversibleAction(session, nutrition)).toBe(false)
    expect((nutrition.days[today]?.foods ?? []).length).toBe(0)
  })

  it('CASE 7.7.9: protein query works while disambiguation is pending', () => {
    const nutrition = {
      ...baseNutrition(),
      days: {
        [today]: {
          foods: [
            {
              id: 'food-1',
              name: 'Chicken',
              servings: 1,
              calories: 400,
              protein: 48,
              carbs: 0,
              fat: 10,
              fiber: 0,
              source: 'manual',
            },
          ],
          waterOz: 0,
        },
      },
    }
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a cup of milk',
      nutrition,
      session,
    })

    expect(session.pendingAction?.status).toBe(AVA_TX_STATUS.AWAITING_DISAMBIGUATION)

    const query = processAvaNutritionMessage({
      message: 'how much protein have i had today',
      nutrition,
      session,
    })

    expect(query.routed).toBe(true)
    expect(query.result?.data?.query).toBe(true)
    expect(query.result?.summary).toContain('48')
  })

  it('CASE 7.7.9: Nature Valley bar returns real ranked candidates', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    const result = processAvaNutritionMessage({
      message: 'I had a Nature Valley bar',
      nutrition,
      session,
    })

    expect(result.routed).toBe(true)
    const choices =
      result.result?.data?.interpretation?.clarification?.choices ?? []
    expect(choices.length).toBeGreaterThan(1)
    expect(
      choices.some((choice) => /nature valley/i.test(choice.name)),
    ).toBe(true)
    expect(choices.some((choice) => choice.name === 'Other')).toBe(true)
  })

  it('CASE 7.7.10: explicit new action replaces pending Nature Valley clarification', () => {
    const nutrition = baseNutrition()
    const session = createAvaSession()

    processAvaNutritionMessage({
      message: 'I had a Nature Valley bar',
      nutrition,
      session,
    })

    expect(hasActivePendingTransaction(session)).toBe(true)

    const replaced = processAvaNutritionMessage({
      message: 'I had a cup of milk today',
      nutrition,
      session,
    })

    expect(replaced.routed).toBe(true)
    expect(replaced.result?.summary.toLowerCase()).not.toContain('still need to know which nature valley')
    expect(
      replaced.result?.data?.interpretation?.clarification?.choices.some((choice) =>
        /milk/i.test(choice.name),
      ),
    ).toBe(true)
  })

  it('CASE 7.7.9: post-write protein query includes new log and undo refreshes total', () => {
    let nutrition = baseNutrition()
    const session = createAvaSession()

    const logged = processAvaNutritionMessage({
      message: 'I had a chocolate chip Clif Bar',
      nutrition,
      session,
    })

    nutrition = logged.result?.data?.execution?.nutrition ?? nutrition

    const afterLog = answerNutritionQuery(
      'how much protein have i had today',
      nutrition,
    )
    expect(afterLog.summary).toMatch(/\d+g/)

    const undone = undoLastReversibleAction({ nutrition, session })
    nutrition = undone.nutrition ?? nutrition

    const afterUndo = answerNutritionQuery(
      'how much protein have i had today',
      nutrition,
    )
    expect(afterUndo.summary.toLowerCase()).toContain('enough logged')
  })
})
