import { describe, expect, it, vi } from 'vitest'
import AvaService from '../ava/AvaService'
import { buildAvaContextPacket } from './avaContext'
import { createAvaSession } from './avaConversation'

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
      'Chest + Back': [
        { name: 'Bench Press', sets: 3, muscle: 'Chest' },
        { name: 'Barbell Row', sets: 3, muscle: 'Back' },
      ],
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

const buildPacket = (state = readyState, options = {}) =>
  buildAvaContextPacket(state, {
    userName: 'Jacob',
    now: new Date(`${today}T18:00:00`),
    ...options,
  })

globalThis.Deno = {
  env: {
    get: vi.fn(() => undefined),
  },
}

const openaiModule = await import('../../supabase/functions/ava-chat/openaiClient.ts')

const {
  OPENAI_CHAT_COMPLETIONS_ENDPOINT,
  DEFAULT_AVA_CHAT_MODEL,
  resolveOpenAiModel,
  parseOpenAiErrorBody,
  buildOpenAiProviderDiagnostics,
  buildChatCompletionRequestBody,
  callOpenAi,
} = openaiModule

describe('avaChatOpenAi diagnostics', () => {
  it('uses Chat Completions endpoint and default model', () => {
    expect(OPENAI_CHAT_COMPLETIONS_ENDPOINT).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
    expect(resolveOpenAiModel(undefined)).toBe(DEFAULT_AVA_CHAT_MODEL)
    expect(resolveOpenAiModel(' gpt-4o-mini ')).toBe('gpt-4o-mini')
  })

  it('builds Chat Completions payload for gpt-4o-mini', () => {
    const body = buildChatCompletionRequestBody({
      model: 'gpt-4o-mini',
      systemPrompt: 'Return JSON only.',
      userPayload: '{"message":"hello"}',
      maxTokens: 350,
    })

    expect(body.model).toBe('gpt-4o-mini')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages).toHaveLength(2)
    expect(body.max_tokens).toBe(350)
  })

  it('parses OpenAI 404 model_not_found safely', () => {
    const parsed = parseOpenAiErrorBody(
      JSON.stringify({
        error: {
          message:
            'The model `gpt-4o-mini` does not exist or you do not have access to it.',
          type: 'invalid_request_error',
          code: 'model_not_found',
        },
      }),
    )

    expect(parsed.errorCode).toBe('model_not_found')
    expect(parsed.errorType).toBe('invalid_request_error')
    expect(parsed.errorMessage).toContain('does not exist')
  })

  it('builds provider diagnostics without secrets or user content', () => {
    const diagnostics = buildOpenAiProviderDiagnostics({
      status: 404,
      bodyText: JSON.stringify({
        error: {
          message: 'The model does not exist',
          type: 'invalid_request_error',
          code: 'model_not_found',
        },
      }),
      model: 'gpt-4o-mini',
    })

    expect(diagnostics).toEqual({
      provider: 'openai',
      status: 404,
      errorType: 'invalid_request_error',
      errorCode: 'model_not_found',
      errorMessage: 'The model does not exist',
      model: 'gpt-4o-mini',
      endpoint: OPENAI_CHAT_COMPLETIONS_ENDPOINT,
    })

    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toMatch(/sk-/)
    expect(serialized).not.toMatch(/Bearer/)
    expect(serialized).not.toMatch(/serverFacts/)
  })

  it('logs structured diagnostics on 404 and returns model-error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'The model `gpt-4o-mini` does not exist',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await callOpenAi({
      userPayload: '{"message":"hello"}',
      systemPrompt: 'Return JSON only.',
      apiKey: 'sk-test-key-not-logged',
      model: 'gpt-4o-mini',
      fetchFn,
    })

    expect(result).toEqual({ ok: false, reason: 'model-error' })
    expect(fetchFn).toHaveBeenCalledWith(
      OPENAI_CHAT_COMPLETIONS_ENDPOINT,
      expect.objectContaining({ method: 'POST' }),
    )

    const logged = errorSpy.mock.calls
      .map((call) => call.join(' '))
      .find((entry) => entry.includes('"provider":"openai"'))

    expect(logged).toBeTruthy()
    expect(logged).toContain('"status":404')
    expect(logged).toContain('"errorCode":"model_not_found"')
    expect(logged).not.toContain('sk-test-key-not-logged')
    expect(logged).not.toContain('hello')

    errorSpy.mockRestore()
  })

  it('returns parsed model payload on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: 'Stay with Chest + Back today.',
                  intent: 'workout',
                  suggestedAction: null,
                  followUpSuggestions: [],
                  safetyLevel: 'normal',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await callOpenAi({
      userPayload: '{"message":"I only have 30 minutes"}',
      systemPrompt: 'Return JSON only.',
      apiKey: 'sk-test-key',
      model: 'gpt-4o-mini',
      fetchFn,
    })

    expect(result.ok).toBe(true)
    expect(result.data?.message).toContain('Chest + Back')
  })
})

describe('avaChatOpenAi fallback regression', () => {
  it('deterministic fallback still works when model-error is returned', async () => {
    const service = new AvaService()
    const response = await service.analyzeMessage('I only have 30 minutes', {
      packet: buildPacket(),
      session: createAvaSession(),
      invokeAvaChat: vi.fn().mockResolvedValue({
        data: { ok: false, reason: 'model-error' },
        error: null,
      }),
    })

    expect(response.source).toBe('deterministic')
    expect(response.summary.toLowerCase()).toMatch(/30 minutes|chest & back/)
  })
})
