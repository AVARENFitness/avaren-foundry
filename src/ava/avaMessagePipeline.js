import { isNutritionQuery, shouldRunNutritionTool } from '../lib/avaConversationalRouter'
import { hasActivePendingTransaction, isAwaitingConfirmation } from './avaTransactionState'
import { isPendingTransactionReply } from './avaNutritionTransaction'
import {
  buildClarificationPayload,
  isCorrectionMessage,
  processAvaNutritionMessage,
  syncClarificationFromPending,
} from './avaNutritionTransaction'
import { logCandidateDiagnostics } from './avaFoodRefinement'
import { answerNutritionQuery } from './avaNutritionQuery'
import {
  isConfirmationNegative,
  isConfirmationPositive,
} from './avaConfirmationReplies'
import {
  AVA_PIPELINE_KIND,
  createPipelineFailure,
  createPipelineOutcome,
  normalizePipelineOutcome,
} from './avaPipelineOutcome'

const PIPELINE_TIMEOUT_MS = 12000
const FALLBACK_BUSY =
  "I'm having trouble finishing that one. Try it again."

const debugLog = (step, detail = {}) => {
  if (import.meta.env?.DEV) {
    console.debug('[ava-pipeline]', step, detail)
  }
}

const withTimeout = (promise, timeoutMs = PIPELINE_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('ava-pipeline-timeout'))
      }, timeoutMs)
    }),
  ])

export const shouldRouteNutritionMessage = (message, { session, packet } = {}) =>
  hasActivePendingTransaction(session) ||
  isAwaitingConfirmation(session) ||
  isCorrectionMessage(message) ||
  isNutritionQuery(message) ||
  isPendingTransactionReply(message, session) ||
  shouldRunNutritionTool(message, { packet, session })

export async function runAvaMessagePipeline({
  message,
  nutrition,
  session,
  packet,
  appHistory = [],
  routeMessage,
  onNutritionChange,
  options = {},
} = {}) {
  const text = String(message ?? '').trim()
  if (!text) {
    return createPipelineFailure('Send AVA a message to continue.')
  }

  debugLog('submitted', { message: text })

  try {
    if (isNutritionQuery(text) && !isCorrectionMessage(text)) {
      debugLog('nutrition-query', { message: text, stage: 'pipeline-priority' })
      const answer = answerNutritionQuery(text, nutrition)
      if (answer?.summary) {
        debugLog('nutrition-total-read', { readOnly: true })
        return createPipelineOutcome({
          kind: AVA_PIPELINE_KIND.RESPONSE,
          message: answer.summary,
          readOnly: true,
          raw: { summary: answer.summary, data: { query: true, readOnly: true } },
        })
      }
    }

    if (shouldRouteNutritionMessage(text, { session, packet })) {
      debugLog('intent-resolved', { route: 'nutrition', pending: session?.pendingAction?.status })

      if (isAwaitingConfirmation(session)) {
        debugLog('pending-confirmation-detected', {
          pendingId: session?.pendingAction?.id,
        })
      }

      if (isNutritionQuery(text)) {
        debugLog('nutrition-query', { message: text })
      }

      const flow = processAvaNutritionMessage({
        message: text,
        nutrition,
        session,
        packet,
        options,
      })

      debugLog('transaction-state', {
        routed: flow.routed,
        pending: session?.pendingAction?.status ?? 'idle',
        cancelledPending: flow.cancelledPending ?? false,
      })

      if (flow.routed) {
        const execution = flow.result?.data?.execution
        if (execution?.ok && execution.nutrition && onNutritionChange) {
          onNutritionChange(execution.nutrition)
          debugLog('state-refreshed', { source: 'nutrition-write' })
        }

        if (flow.result?.data?.query) {
          debugLog('nutrition-total-read', { readOnly: true })
        }

        if (isConfirmationPositive(text) && flow.result?.data?.executed) {
          debugLog('confirmation-positive', { executed: true })
        }

        if (isConfirmationNegative(text) && flow.result?.data?.cancelled) {
          debugLog('confirmation-negative', { cancelled: true })
        }

        const clarification = buildClarificationPayload(
          flow.result?.data?.interpretation,
          session,
        )

        debugLog('candidates-resolved', {
          count: clarification?.choices?.length ?? 0,
          awaitingRefinement: flow.result?.data?.awaitingRefinement ?? false,
        })

        if (clarification?.choices?.length) {
          debugLog('candidate-rendered', { count: clarification.choices.length })
          logCandidateDiagnostics({
            session,
            rendered: true,
            source: 'ava-pipeline',
          })
        }

        if (flow.result?.data?.executed) {
          debugLog('action-executed', { ok: execution?.ok ?? false })
        }

        if (clarification?.choices?.length && !flow.result?.data?.interpretation?.clarification) {
          flow.result = {
            ...flow.result,
            data: {
              ...flow.result.data,
              interpretation: {
                ...(flow.result.data?.interpretation ?? {}),
                clarification,
              },
            },
          }
        }

        debugLog('action-result', {
          executed: flow.result?.data?.executed ?? false,
          kind: flow.result?.data?.cancelled
            ? 'cancelled'
            : clarification?.choices?.length
              ? 'clarification'
              : flow.result?.data?.executed
                ? 'action_success'
                : 'response',
        })

        return normalizePipelineOutcome(flow.result, session, {
          clarificationPayload: clarification,
        })
      }

      if (flow.cancelledPending) {
        debugLog('transaction-state', { cancelledPending: true })
      }
    }

    debugLog('intent-resolved', { route: 'conversation' })

    const conversational = await withTimeout(
      routeMessage(text, {
        packet,
        session,
        history: appHistory,
      }),
    )

    debugLog('response-appended', { source: conversational?.source ?? 'unknown' })

    return normalizePipelineOutcome(conversational, session)
  } catch (error) {
    debugLog('action-failure', { reason: error?.message ?? 'unknown' })
    return createPipelineFailure(
      error?.message === 'ava-pipeline-timeout' ? FALLBACK_BUSY : FALLBACK_BUSY,
      { error: error?.message ?? 'pipeline-error' },
    )
  }
}

export { AVA_PIPELINE_KIND, normalizePipelineOutcome }
