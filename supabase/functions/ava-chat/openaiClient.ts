export const OPENAI_CHAT_COMPLETIONS_ENDPOINT =
  'https://api.openai.com/v1/chat/completions'

export const DEFAULT_AVA_CHAT_MODEL = 'gpt-4o-mini'

export type OpenAiProviderDiagnostics = {
  provider: 'openai'
  status: number
  errorType: string | null
  errorCode: string | null
  errorMessage: string | null
  model: string
  endpoint: string
}

const truncateDiagnostic = (value: unknown, max = 240) =>
  String(value ?? '').trim().slice(0, max) || null

export const resolveOpenAiModel = (envModel?: string | null) => {
  const trimmed = String(envModel ?? DEFAULT_AVA_CHAT_MODEL).trim()
  return trimmed || DEFAULT_AVA_CHAT_MODEL
}

export const parseOpenAiErrorBody = (bodyText = '') => {
  if (!bodyText.trim()) {
    return {
      errorType: null,
      errorCode: null,
      errorMessage: null,
    }
  }

  try {
    const payload = JSON.parse(bodyText)
    const error = payload?.error ?? payload
    return {
      errorType: truncateDiagnostic(error?.type),
      errorCode: truncateDiagnostic(error?.code),
      errorMessage: truncateDiagnostic(error?.message),
    }
  } catch {
    return {
      errorType: null,
      errorCode: null,
      errorMessage: null,
    }
  }
}

export const buildOpenAiProviderDiagnostics = ({
  status,
  bodyText = '',
  model,
  endpoint = OPENAI_CHAT_COMPLETIONS_ENDPOINT,
}: {
  status: number
  bodyText?: string
  model: string
  endpoint?: string
}): OpenAiProviderDiagnostics => {
  const parsed = parseOpenAiErrorBody(bodyText)
  return {
    provider: 'openai',
    status,
    errorType: parsed.errorType,
    errorCode: parsed.errorCode,
    errorMessage: parsed.errorMessage,
    model,
    endpoint,
  }
}

export const logOpenAiProviderError = (diagnostics: OpenAiProviderDiagnostics) => {
  console.error(JSON.stringify(diagnostics))
}

export const buildChatCompletionRequestBody = ({
  model,
  systemPrompt,
  userPayload,
  maxTokens,
}: {
  model: string
  systemPrompt: string
  userPayload: string
  maxTokens: number
}) => ({
  model,
  temperature: 0.55,
  max_tokens: maxTokens,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPayload },
  ],
})

const sanitizeModelResponse = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return null

  const message = truncateDiagnostic((raw as { message?: string }).message, 1200)
  if (!message) return null

  const intent =
    truncateDiagnostic((raw as { intent?: string }).intent, 40) || 'conversation'
  const safetyLevel =
    truncateDiagnostic((raw as { safetyLevel?: string }).safetyLevel, 20) || 'normal'

  const suggestions = Array.isArray(
    (raw as { followUpSuggestions?: unknown }).followUpSuggestions,
  )
    ? ((raw as { followUpSuggestions: unknown[] }).followUpSuggestions ?? [])
        .map((item) => truncateDiagnostic(item, 120))
        .filter(Boolean)
        .slice(0, 3)
    : []

  const suggestedActionRaw = (raw as { suggestedAction?: unknown }).suggestedAction
  const suggestedAction =
    suggestedActionRaw && typeof suggestedActionRaw === 'object'
      ? suggestedActionRaw
      : { type: 'NONE', label: null }

  return {
    ok: true,
    message,
    intent,
    suggestedAction,
    followUpSuggestions: suggestions,
    safetyLevel,
  }
}

export async function callOpenAi({
  userPayload,
  systemPrompt,
  apiKey,
  model,
  maxTokens = 350,
  timeoutMs = 25000,
  endpoint = OPENAI_CHAT_COMPLETIONS_ENDPOINT,
  fetchFn = fetch,
  sanitizeResponse = sanitizeModelResponse,
}: {
  userPayload: string
  systemPrompt: string
  apiKey?: string | null
  model?: string
  maxTokens?: number
  timeoutMs?: number
  endpoint?: string
  fetchFn?: typeof fetch
  sanitizeResponse?: (raw: unknown) => Record<string, unknown> | null
}) {
  const resolvedApiKey = apiKey ?? Deno.env.get('OPENAI_API_KEY')
  const resolvedModel = model ?? resolveOpenAiModel(Deno.env.get('AVA_CHAT_MODEL'))

  if (!resolvedApiKey) {
    return { ok: false as const, reason: 'model-not-configured' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify(
        buildChatCompletionRequestBody({
          model: resolvedModel,
          systemPrompt,
          userPayload,
          maxTokens,
        }),
      ),
    })

    if (!response.ok) {
      const bodyText = await response.text()
      logOpenAiProviderError(
        buildOpenAiProviderDiagnostics({
          status: response.status,
          bodyText,
          model: resolvedModel,
          endpoint,
        }),
      )
      return { ok: false as const, reason: 'model-error' }
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content
    if (!content) {
      return { ok: false as const, reason: 'empty-model-response' }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return { ok: false as const, reason: 'invalid-model-json' }
    }

    const sanitized = sanitizeResponse(parsed)
    if (!sanitized) {
      return { ok: false as const, reason: 'invalid-model-response' }
    }

    return { ok: true as const, data: sanitized }
  } catch (error) {
    console.error('AVA chat model call failed', error instanceof Error ? error.name : 'error')
    return { ok: false as const, reason: 'model-timeout' }
  } finally {
    clearTimeout(timeout)
  }
}

export const __testables = {
  sanitizeModelResponse,
}
