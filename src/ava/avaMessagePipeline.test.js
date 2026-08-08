import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createNutritionState, nutritionDateKey } from '../lib/nutrition'
import { createAvaSession } from '../lib/avaConversation'
import { runAvaMessagePipeline } from './avaMessagePipeline'
import { AVA_PIPELINE_KIND } from './avaPipelineOutcome'

describe('avaMessagePipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns clarification outcome for milk without calling conversation router', async () => {
    const session = createAvaSession()
    const routeMessage = vi.fn()

    const outcome = await runAvaMessagePipeline({
      message: 'I had a cup of milk',
      nutrition: createNutritionState(),
      session,
      packet: null,
      routeMessage,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.CLARIFICATION)
    expect(outcome.message.toLowerCase()).toMatch(/which|milk/)
    expect(outcome.candidates?.choices?.length).toBeGreaterThan(1)
  })

  it('never returns an empty outcome for Nature Valley bar', async () => {
    const outcome = await runAvaMessagePipeline({
      message: 'I had a Nature Valley bar',
      nutrition: createNutritionState(),
      session: createAvaSession(),
      packet: null,
      routeMessage: vi.fn(),
    })

    expect(outcome.message).toBeTruthy()
    expect(outcome.candidates?.choices?.length ?? 0).toBeGreaterThan(1)
  })

  it('answers protein query without calling conversation router', async () => {
    const today = nutritionDateKey()
    const nutrition = createNutritionState()
    nutrition.days[today] = {
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
    }

    const routeMessage = vi.fn()
    const outcome = await runAvaMessagePipeline({
      message: 'how much protein have i had today',
      nutrition,
      session: createAvaSession(),
      packet: null,
      routeMessage,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.message).toContain('48')
  })

  it('yes confirms awaiting confirmation through pipeline', async () => {
    const session = createAvaSession()
    const nutrition = createNutritionState()
    const routeMessage = vi.fn()

    await runAvaMessagePipeline({
      message: 'One Fairlife shake',
      nutrition,
      session,
      packet: null,
      routeMessage,
    })

    expect(session.pendingAction?.status).toBe('awaiting-confirmation')

    const outcome = await runAvaMessagePipeline({
      message: 'yes',
      nutrition,
      session,
      packet: null,
      routeMessage,
    })

    expect(routeMessage).not.toHaveBeenCalled()
    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(session.pendingAction).toBeNull()
  })

  it('falls back safely when conversation routing times out', async () => {
    const promise = runAvaMessagePipeline({
      message: 'How should I adjust today?',
      nutrition: createNutritionState(),
      session: createAvaSession(),
      packet: { briefing: { headline: 'Stay steady' }, nutrition: { hasLoggedFood: false } },
      routeMessage: () => new Promise(() => {}),
    })

    await vi.advanceTimersByTimeAsync(12001)

    const outcome = await promise

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_FAILURE)
    expect(outcome.message).toMatch(/trouble finishing/i)
  })
})
