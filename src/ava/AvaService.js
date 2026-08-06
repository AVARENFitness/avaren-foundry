import { AVA_INTENTS } from './intents'

const nowIso = () => new Date().toISOString()

const createMockResponse = ({
  intent,
  summary,
  suggestions = [],
  data = {},
}) => ({
  ok: true,
  source: 'mock',
  intent,
  summary,
  suggestions,
  data,
  generatedAt: nowIso(),
})

export default class AvaService {
  async analyzeMessage(input = '', context = {}) {
    const message = String(input ?? '').trim()

    return createMockResponse({
      intent: AVA_INTENTS.MESSAGE,
      summary: message
        ? 'AVA received your message and will analyze it once intelligence providers are connected.'
        : 'Send AVA a message to get guidance.',
      suggestions: [
        'How should I adjust today’s workout?',
        'What should I eat after training?',
      ],
      data: {
        message,
        contextKeys: Object.keys(context ?? {}),
      },
    })
  }

  async analyzeFood(input = {}, context = {}) {
    const description =
      typeof input === 'string'
        ? input
        : input?.description ?? input?.query ?? ''

    return createMockResponse({
      intent: AVA_INTENTS.FOOD,
      summary: description
        ? `Food analysis placeholder for “${description}”.`
        : 'Food analysis will estimate macros from your description.',
      suggestions: [
        'Log 6 oz grilled chicken',
        'Estimate macros for overnight oats',
      ],
      data: {
        description,
        estimated: {
          calories: 420,
          protein: 32,
          carbs: 28,
          fat: 16,
        },
        contextKeys: Object.keys(context ?? {}),
      },
    })
  }

  async analyzeWorkout(input = {}, context = {}) {
    const focus =
      typeof input === 'string'
        ? input
        : input?.focus ?? input?.question ?? 'today'

    return createMockResponse({
      intent: AVA_INTENTS.WORKOUT,
      summary: `Workout guidance placeholder for ${focus}.`,
      suggestions: [
        'Keep today’s session at maintenance volume',
        'Swap bench press for dumbbell press',
      ],
      data: {
        focus,
        recommendation: {
          action: 'maintain',
          confidence: 0.62,
          rationale:
            'Placeholder response until AVA connects to training engines.',
        },
        contextKeys: Object.keys(context ?? {}),
      },
    })
  }

  async analyzeWeight(input = {}, context = {}) {
    const value =
      typeof input === 'number'
        ? input
        : Number(input?.weight ?? input?.value ?? 0) || null

    return createMockResponse({
      intent: AVA_INTENTS.WEIGHT,
      summary: value
        ? `Weight insight placeholder for ${value}.`
        : 'Weight insights will summarize trend and goal alignment.',
      suggestions: [
        'Compare this week to last month',
        'Set a realistic weekly target',
      ],
      data: {
        value,
        trend: 'stable',
        contextKeys: Object.keys(context ?? {}),
      },
    })
  }

  async analyzeWater(input = {}, context = {}) {
    const ounces =
      typeof input === 'number'
        ? input
        : Number(input?.waterOz ?? input?.ounces ?? 0) || null

    return createMockResponse({
      intent: AVA_INTENTS.WATER,
      summary: ounces
        ? `Hydration placeholder for ${ounces} oz logged today.`
        : 'Hydration insights will compare intake against your daily goal.',
      suggestions: [
        'Add 16 oz before your next meal',
        'Log the bottle you just finished',
      ],
      data: {
        waterOz: ounces,
        goalOz: 100,
        contextKeys: Object.keys(context ?? {}),
      },
    })
  }

  async getSuggestions(context = {}) {
    return createMockResponse({
      intent: AVA_INTENTS.SUGGESTIONS,
      summary:
        'Placeholder suggestions until AVA connects to your training data.',
      suggestions: [
        'Review readiness before today’s session',
        'Log protein within two hours of training',
        'Schedule a recovery flow tonight',
      ],
      data: {
        items: [
          {
            id: 'readiness-check',
            label: 'Check readiness',
            domain: 'recovery',
          },
          {
            id: 'post-workout-meal',
            label: 'Plan post-workout meal',
            domain: 'nutrition',
          },
          {
            id: 'weekly-review',
            label: 'Review weekly progress',
            domain: 'progress',
          },
        ],
        contextKeys: Object.keys(context ?? {}),
      },
    })
  }
}
