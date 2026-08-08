import { AVA_INTENTS } from './intents'
import {
  buildAvaSuggestedPrompts,
  respondToAvaMessage,
} from '../lib/avaConversation'
import { requestAvaChat } from '../lib/avaChatBackend'
import { shouldRunNutritionTool, isNutritionQuery } from '../lib/avaConversationalRouter'

const nowIso = () => new Date().toISOString()

const createFallbackResponse = ({
  intent,
  summary,
  suggestions = [],
  data = {},
}) => ({
  ok: true,
  source: 'fallback',
  intent,
  summary,
  suggestions,
  actions: [],
  data,
  generatedAt: nowIso(),
})

const withDeterministicConversation = (
  input,
  context = {},
  intent = AVA_INTENTS.MESSAGE,
) => {
  if (!context?.packet || !context?.session) return null

  return respondToAvaMessage({
    message: typeof input === 'string' ? input : input?.query ?? '',
    packet: context.packet,
    session: context.session,
    history: context.history ?? context.packet?.history ?? [],
    intent,
  })
}

const withModelConversation = async (message, context = {}) => {
  if (!context?.packet || !context?.session) return null

  const nutritionBlocked = shouldRunNutritionTool(message, {
    packet: context.packet,
    session: context.session,
  })
  if (nutritionBlocked || isNutritionQuery(message)) return null

  const modelResult = await requestAvaChat({
    message,
    packet: context.packet,
    session: context.session,
    invoke: context.invokeAvaChat,
  })

  if (modelResult?.ok) {
    return {
      ...modelResult,
      generatedAt: nowIso(),
    }
  }

  return null
}

export default class AvaService {
  async analyzeMessage(input = '', context = {}) {
    const message = String(input ?? '').trim()

    const modelResponse = await withModelConversation(message, context)
    if (modelResponse) return modelResponse

    const conversational = withDeterministicConversation(
      message,
      context,
      AVA_INTENTS.MESSAGE,
    )

    if (conversational) {
      if (import.meta.env?.DEV) {
        console.debug('[ava-chat]', JSON.stringify({ provider: 'deterministic', intent: conversational.intent }))
      }
      return {
        ...conversational,
        source: conversational.source ?? 'deterministic',
        generatedAt: nowIso(),
      }
    }

    return createFallbackResponse({
      intent: AVA_INTENTS.MESSAGE,
      summary: message
        ? "I'm having trouble opening the full conversation right now, but I can still help with today's plan."
        : 'Send AVA a message to get guidance.',
      suggestions: [
        'How should I adjust today’s workout?',
        'What should I eat after training?',
      ],
      data: { message, modelUnavailable: true },
    })
  }

  async analyzeFood(input = {}, context = {}) {
    const description =
      typeof input === 'string'
        ? input
        : input?.description ?? input?.query ?? ''

    const conversational = withDeterministicConversation(
      description,
      context,
      AVA_INTENTS.FOOD,
    )
    if (conversational) {
      return { ...conversational, generatedAt: nowIso() }
    }

    return createFallbackResponse({
      intent: AVA_INTENTS.FOOD,
      summary: description
        ? `Food analysis placeholder for “${description}”.`
        : 'Food analysis will estimate macros from your description.',
      suggestions: ['Log 6 oz grilled chicken', 'Estimate macros for overnight oats'],
      data: { description },
    })
  }

  async analyzeWorkout(input = {}, context = {}) {
    const query =
      typeof input === 'string'
        ? input
        : input?.focus ?? input?.question ?? input?.query ?? 'today'

    const modelResponse = await withModelConversation(query, context)
    if (modelResponse) return modelResponse

    const conversational = withDeterministicConversation(
      query,
      context,
      AVA_INTENTS.WORKOUT,
    )
    if (conversational) {
      return { ...conversational, generatedAt: nowIso() }
    }

    return createFallbackResponse({
      intent: AVA_INTENTS.WORKOUT,
      summary: `Workout guidance placeholder for ${query}.`,
      suggestions: [
        'Keep today’s session at maintenance volume',
        'Swap bench press for dumbbell press',
      ],
      data: { focus: query },
    })
  }

  async analyzeWeight(input = {}, context = {}) {
    const value =
      typeof input === 'number'
        ? input
        : Number(input?.weight ?? input?.value ?? 0) || null

    return createFallbackResponse({
      intent: AVA_INTENTS.WEIGHT,
      summary: value
        ? `Weight insight placeholder for ${value}.`
        : 'Weight insights will summarize trend and goal alignment.',
      suggestions: [
        'Compare this week to last month',
        'Set a realistic weekly target',
      ],
      data: { value, trend: 'stable' },
    })
  }

  async analyzeWater(input = {}, context = {}) {
    const ounces =
      typeof input === 'number'
        ? input
        : Number(input?.waterOz ?? input?.ounces ?? 0) || null

    return createFallbackResponse({
      intent: AVA_INTENTS.WATER,
      summary: ounces
        ? `Hydration placeholder for ${ounces} oz logged today.`
        : 'Hydration insights will compare intake against your daily goal.',
      suggestions: ['Add 16 oz before your next meal', 'Log the bottle you just finished'],
      data: { waterOz: ounces, goalOz: 100 },
    })
  }

  async getSuggestions(context = {}) {
    if (context?.packet) {
      return {
        ok: true,
        source: 'deterministic',
        intent: AVA_INTENTS.SUGGESTIONS,
        summary: 'Here are a few useful places to start.',
        suggestions: buildAvaSuggestedPrompts(context.packet),
        actions: [],
        data: { items: buildAvaSuggestedPrompts(context.packet) },
        generatedAt: nowIso(),
      }
    }

    return createFallbackResponse({
      intent: AVA_INTENTS.SUGGESTIONS,
      summary: 'Placeholder suggestions until AVA connects to your training data.',
      suggestions: [
        'Review readiness before today’s session',
        'Log protein within two hours of training',
        'Schedule a recovery flow tonight',
      ],
      data: {
        items: [
          { id: 'readiness-check', label: 'Check readiness', domain: 'recovery' },
          { id: 'post-workout-meal', label: 'Plan post-workout meal', domain: 'nutrition' },
          { id: 'weekly-review', label: 'Review weekly progress', domain: 'progress' },
        ],
      },
    })
  }
}
