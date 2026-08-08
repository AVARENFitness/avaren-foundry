import { supabase, isSupabaseConfigured } from './supabase'
import { buildAvaChatRequestBody } from './avaModelContext'
import {
  mapModelActionToClientAction,
  sanitizeModelFollowUpSuggestions,
} from './avaModelActions'
import { recordAvaTurn, recordUserTurn } from './avaSessionContext'

export const AVA_CHAT_FUNCTION_NAME = 'ava-chat'

const normalizeModelPayload = (payload = {}, packet = {}) => {
  const message = String(payload.message ?? payload.summary ?? '').trim()
  if (!message) return null

  const suggestedAction = mapModelActionToClientAction(
    payload.suggestedAction,
    packet,
  )

  const actions = suggestedAction ? [suggestedAction] : []

  return {
    ok: true,
    source: 'model',
    intent: String(payload.intent ?? 'conversation'),
    summary: message,
    suggestions: sanitizeModelFollowUpSuggestions(payload.followUpSuggestions),
    actions,
    data: {
      safetyLevel: payload.safetyLevel ?? 'normal',
      modelIntent: payload.intent ?? null,
      suggestedActionType: payload.suggestedAction?.type ?? 'NONE',
    },
  }
}

export const isAvaChatBackendAvailable = () => isSupabaseConfigured && Boolean(supabase)

export async function requestAvaChat({
  message = '',
  packet = {},
  session = null,
  invoke = null,
} = {}) {
  if (!invoke && !isAvaChatBackendAvailable()) {
    if (import.meta.env?.DEV) {
      console.debug('[ava-chat]', JSON.stringify({ provider: 'fallback', reason: 'unconfigured' }))
    }
    return { ok: false, reason: 'unconfigured' }
  }

  recordUserTurn(session, message, { packet })
  const body = buildAvaChatRequestBody({ message, packet, session })
  if (!body.message) {
    return { ok: false, reason: 'invalid-request' }
  }

  const invokeFn =
    invoke ??
    ((functionName, options) => supabase.functions.invoke(functionName, options))

  try {
    const { data, error } = await invokeFn(AVA_CHAT_FUNCTION_NAME, { body })

    if (error) {
      if (import.meta.env?.DEV) {
        console.debug('[ava-chat]', JSON.stringify({ provider: 'fallback', reason: 'invoke-error' }))
      }
      return { ok: false, reason: 'invoke-error', error }
    }

    if (!data || data.ok === false) {
      if (import.meta.env?.DEV) {
        console.debug(
          '[ava-chat]',
          JSON.stringify({ provider: 'fallback', reason: data?.reason ?? 'model-unavailable' }),
        )
      }
      return { ok: false, reason: data?.reason ?? 'model-unavailable', data }
    }

    const normalized = normalizeModelPayload(data, packet)
    if (!normalized) {
      if (import.meta.env?.DEV) {
        console.debug('[ava-chat]', JSON.stringify({ provider: 'fallback', reason: 'invalid-response' }))
      }
      return { ok: false, reason: 'invalid-response' }
    }

    recordAvaTurn(session, normalized.summary)
    if (import.meta.env?.DEV) {
      console.debug('[ava-chat]', JSON.stringify({ provider: 'model', intent: normalized.intent }))
    }

    return normalized
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.debug('[ava-chat]', JSON.stringify({ provider: 'fallback', reason: 'network-error' }))
    }
    return { ok: false, reason: 'network-error', error }
  }
}
