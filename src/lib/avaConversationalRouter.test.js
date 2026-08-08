import { describe, expect, it } from 'vitest'
import { createNutritionState } from '../lib/nutrition'
import { buildAvaContextPacket } from './avaContext'
import {
  classifyAvaIntent,
  hasNutritionLoggingShape,
  isExplicitNutritionLogIntent,
  isStateStatement,
  shouldRunNutritionTool,
  shouldShowNutritionDisambiguation,
  AVA_ROUTE_INTENTS,
} from './avaConversationalRouter'
import {
  createAvaSession,
  respondToAvaMessage,
} from './avaConversation'
import { interpretNutritionMessage } from '../ava/nutritionParser'

const today = new Date().toISOString().slice(0, 10)

const readyState = {
  history: [
    {
      id: 'session-1',
      date: today,
      name: 'Chest + Back',
      sets: [{ exercise: 'Bench Press', muscle: 'Chest', weight: 185, reps: 5 }],
    },
  ],
  readiness: {
    entries: [
      {
        id: 'ready-1',
        date: today,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
      },
    ],
  },
  selectedWorkout: 'Chest + Back',
  program: {
    nextWorkout: 'Chest + Back',
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
    },
  },
  weeklySchedule: ['Rest', 'Chest + Back', 'Arms', 'Legs', 'Chest + Back', 'Arms', 'Rest'],
  mobility: {
    completed: [
      { flowId: 'daily-reset', completedAt: `${today}T07:00:00` },
      { flowId: 'recovery-flow', completedAt: `${today}T07:30:00` },
    ],
  },
  nutrition: {
    goals: { calories: 2200, protein: 170 },
    days: {},
  },
}

const buildPacket = () =>
  buildAvaContextPacket(readyState, {
    userName: 'Jacob',
    now: new Date(`${today}T18:00:00`),
  })

describe('avaConversationalRouter', () => {
  it('does not classify tiredness as nutrition logging', () => {
    expect(isStateStatement("I'm feeling tired")).toBe(true)
    expect(isExplicitNutritionLogIntent("I'm feeling tired")).toBe(false)
    expect(shouldRunNutritionTool("I'm feeling tired", { session: createAvaSession() })).toBe(
      false,
    )
  })

  it('classifies explicit food logging correctly', () => {
    expect(classifyAvaIntent('I ate a protein bar').intent).toBe(
      AVA_ROUTE_INTENTS.NUTRITION_LOG,
    )
    expect(classifyAvaIntent('Log shrimp').intent).toBe(AVA_ROUTE_INTENTS.NUTRITION_LOG)
  })

  it('classifies nutrition queries separately from logging tools', () => {
    expect(classifyAvaIntent('How much protein did I eat?').intent).toBe(
      AVA_ROUTE_INTENTS.NUTRITION_QUERY,
    )
    expect(shouldRunNutritionTool('How much protein did I eat?', {})).toBe(false)
  })

  it('does not treat soreness as nutrition routing', () => {
    expect(isStateStatement("I'm sore today")).toBe(true)
    expect(shouldRunNutritionTool("I'm sore today", {})).toBe(false)
  })

  it('does not treat hungry-but-tired as food disambiguation', () => {
    const message = "I'm hungry but tired"
    expect(isStateStatement(message)).toBe(true)
    expect(shouldRunNutritionTool(message, {})).toBe(false)
    expect(interpretNutritionMessage(message, createNutritionState()).handled).toBe(false)
  })

  it('blocks nutrition disambiguation without explicit food intent', () => {
    const fakeResult = {
      clarification: { choices: [{ id: 'food-1', name: 'Protein Bar' }] },
      confidence: 'needs-clarification',
    }

    expect(
      shouldShowNutritionDisambiguation("I'm feeling tired", fakeResult, {
        session: createAvaSession(),
      }),
    ).toBe(false)
  })

  it('does not treat subjective soreness as nutrition logging', () => {
    expect(isStateStatement('my front delt is hurting')).toBe(true)
    expect(hasNutritionLoggingShape('my front delt is hurting')).toBe(false)
    expect(shouldRunNutritionTool('my front delt is hurting', {})).toBe(false)
  })

  it('still allows my-recipe food phrases', () => {
    expect(hasNutritionLoggingShape('my chicken bowl')).toBe(true)
  })

  it('allows nutrition disambiguation for explicit food logging', () => {
    const fakeResult = {
      clarification: { choices: [{ id: 'food-1', name: 'Shrimp' }] },
      confidence: 'needs-clarification',
    }

    expect(
      shouldShowNutritionDisambiguation('Log shrimp', fakeResult, {
        session: createAvaSession(),
      }),
    ).toBe(true)
  })
})

describe('avaConversationalRouter integration', () => {
  it('CASE 1: "I\'m feeling tired" stays conversational', () => {
    const packet = buildPacket()
    const session = createAvaSession()
    const nutrition = interpretNutritionMessage("I'm feeling tired", createNutritionState())

    expect(nutrition.handled).toBe(false)
    expect(nutrition.clarification).toBeUndefined()

    const response = respondToAvaMessage({
      message: "I'm feeling tired",
      packet,
      session,
    })

    expect(response.summary.toLowerCase()).toMatch(/got you|wouldn't force|lighter/)
    expect(response.summary.toLowerCase()).not.toContain('which one')
    expect(response.data.subjective).toBe(true)
  })

  it('CASE 2: "my front delt is hurting" stays conversational without food chooser', () => {
    const packet = buildPacket()
    const session = createAvaSession()
    const nutrition = interpretNutritionMessage(
      'my front delt is hurting',
      createNutritionState(),
    )

    expect(nutrition.handled).toBe(false)
    expect(nutrition.clarification).toBeUndefined()

    const response = respondToAvaMessage({
      message: 'my front delt is hurting',
      packet,
      session,
    })

    expect(response.summary.toLowerCase()).toContain('got you')
    expect(response.summary.toLowerCase()).not.toMatch(/which .* did you mean/i)
    expect(response.summary).toContain('Chest & Back')
  })

  it('CASE 5: tiredness then "Should I still do it?" keeps workout topic', () => {
    const packet = buildPacket()
    const session = createAvaSession()

    respondToAvaMessage({
      message: "I'm feeling tired",
      packet,
      session,
    })

    const followUp = respondToAvaMessage({
      message: 'Should I still do it?',
      packet,
      session,
    })

    expect(followUp.summary).toContain('Chest & Back')
    expect(followUp.summary.toLowerCase()).not.toContain('protein bar')
  })

  it('CASE 3/4: explicit food logging still works', () => {
    const ate = interpretNutritionMessage('I ate a protein bar', createNutritionState())
    expect(ate.handled).toBe(true)

    const log = interpretNutritionMessage('Log shrimp', createNutritionState())
    expect(log.handled).toBe(true)
  })

  it('remembers temporary session constraints without mutating canonical workout', () => {
    const packet = buildPacket()
    const session = createAvaSession()

    respondToAvaMessage({
      message: 'I only have 30 minutes.',
      packet,
      session,
    })

    const followUp = respondToAvaMessage({
      message: 'What should I do?',
      packet,
      session,
    })

    expect(followUp.summary).toContain('30 minutes')
    expect(followUp.summary).toContain('Chest & Back')
    expect(packet.facts.canonicalWorkout).toBe('Chest + Back')
  })

  it('keeps tiredness relevant for "What about the workout?"', () => {
    const packet = buildPacket()
    const session = createAvaSession()

    respondToAvaMessage({
      message: "I'm feeling tired",
      packet,
      session,
    })

    const followUp = respondToAvaMessage({
      message: 'What about the workout?',
      packet,
      session,
    })

    expect(followUp.summary.toLowerCase()).toMatch(/conservative|lighter|feeling/)
    expect(followUp.summary).toContain('Chest & Back')
  })

  it('CASE 7: nutrition query routes conversationally', () => {
    const packet = buildAvaContextPacket(
      {
        ...readyState,
        nutrition: {
          goals: { calories: 2200, protein: 170 },
          days: {
            [today]: {
              date: today,
              foods: [{ name: 'Chicken', calories: 400, protein: 45 }],
            },
          },
        },
      },
      { userName: 'Jacob', now: new Date(`${today}T18:00:00`) },
    )

    const response = respondToAvaMessage({
      message: 'How much protein did I eat?',
      packet,
      session: createAvaSession(),
    })

    expect(response.summary.toLowerCase()).toContain('protein')
    expect(response.summary).not.toMatch(/which one/i)
  })
})
