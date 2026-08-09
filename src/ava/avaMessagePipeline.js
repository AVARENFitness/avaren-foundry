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
import { AVA_ACTION_OUTCOME_KIND } from './actions/avaActionTypes'
import {
  actionResolutionToChip,
  isExplicitNavigationCommand,
  isReferentCommand,
  resolveExplicitAction,
  resolveReferentAction,
} from './actions/avaActionResolver'
import {
  orchestrateMessageAction,
  orchestrateModelAction,
} from './actions/avaActionOrchestrator'
import { resolveModelProposedAction } from './actions/avaActionResolver'
import { runCoachPipelineStep } from './coach/avaCoachPipeline'
import { runCoachFollowUpPipelineStep } from './coach/avaCoachFollowUpPipeline'
import { runPlanningPipelineStep } from './planning/avaPlanningPipeline'
import {
  matchCoachOperationalQuery,
  portfolioQueryLoadErrorMessage,
  logAvaCoachQueryDiagnostic,
} from './coach/avaCoachQueryPatterns'
import {
  isCoachPortfolioQueryCommand,
  isOpenCoachHubCommand,
} from './coach/avaCoachResolver'
import { logAvaRoleDiagnostic } from './coach/avaCoachRole'
import {
  buildAvaRuntimeContext,
  buildCoachAvaFallbackMessage,
} from './avaRuntimeContext'

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

const shouldRouteNutritionPending = (message, { session } = {}) =>
  hasActivePendingTransaction(session) ||
  isAwaitingConfirmation(session) ||
  isCorrectionMessage(message) ||
  isPendingTransactionReply(message, session)

export const shouldRouteNutritionMessage = (message, { session, packet } = {}) =>
  shouldRouteNutritionPending(message, { session }) ||
  isNutritionQuery(message) ||
  shouldRunNutritionTool(message, { packet, session })

const mapActionOutcomeToPipeline = (actionOutcome) => {
  if (!actionOutcome) return null

  if (actionOutcome.kind === AVA_ACTION_OUTCOME_KIND.ACTION_SUCCESS) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
      message: actionOutcome.message,
      actions: [],
      raw: actionOutcome,
    })
  }

  if (actionOutcome.kind === AVA_ACTION_OUTCOME_KIND.ACTION_FAILURE) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
      message: actionOutcome.message,
      raw: actionOutcome,
    })
  }

  if (actionOutcome.kind === AVA_ACTION_OUTCOME_KIND.ACTION_READY) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_READY,
      message: actionOutcome.message,
      actions: actionOutcome.actions ?? [],
      raw: actionOutcome,
    })
  }

  return null
}

const sanitizeConversationalActions = (result, packet, role = 'athlete') => {
  const actions = Array.isArray(result?.actions) ? result.actions : []
  if (!actions.length) return result

  const validated = actions
    .map((action) =>
      resolveModelProposedAction(
        {
          id: action.actionId ?? action.id,
          type: action.actionId ?? action.id,
          label: action.label,
        },
        { packet, role },
      ),
    )
    .filter((resolution) => resolution && !resolution.rejected)
    .map((resolution) => actionResolutionToChip(resolution))
    .filter(Boolean)

  return {
    ...result,
    actions: validated,
  }
}

export async function runAvaMessagePipeline({
  message,
  nutrition,
  session,
  packet,
  appHistory = [],
  routeMessage,
  onNutritionChange,
  actionRuntime = null,
  coachContext = null,
  role = 'athlete',
  options = {},
} = {}) {
  const text = String(message ?? '').trim()
  if (!text) {
    return createPipelineFailure('Send AVA a message to continue.')
  }

  debugLog('submitted', { message: text })

  const effectiveCoachAccess = Boolean(
    coachContext?.coachAccess ?? coachContext?.authorized ?? role === 'coach',
  )

  logAvaRoleDiagnostic({
    role: effectiveCoachAccess ? 'coach' : 'athlete',
    resolvedRole: effectiveCoachAccess ? 'coach' : 'athlete',
    coachAccess: effectiveCoachAccess,
    source: coachContext?.roleSource ?? (effectiveCoachAccess ? 'coach-access' : 'athlete'),
  })

  if (import.meta.env?.DEV) {
    console.debug(
      '[ava-runtime-context]',
      JSON.stringify(
        buildAvaRuntimeContext({
          session,
          coachAuthorized: effectiveCoachAccess,
          coachContext,
        }),
      ),
    )
  }

  try {
    if (isOpenCoachHubCommand(text) && !effectiveCoachAccess) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
        message: "Coach Hub isn't available on this account.",
        readOnly: true,
      })
    }

    if (!effectiveCoachAccess && isCoachPortfolioQueryCommand(text)) {
      logAvaCoachQueryDiagnostic({
        role: 'athlete',
        queryType: null,
        matched: true,
        source: 'deterministic',
        authorizedClientCount: 0,
        resultCount: 0,
      })
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.RESPONSE,
        message: "That coaching view isn't available on this account.",
        readOnly: true,
      })
    }

    if (effectiveCoachAccess) {
      const operationalQuery = matchCoachOperationalQuery(text)
      const coachOutcome = await runCoachPipelineStep({
        message: text,
        session,
        coachContext: {
          ...(coachContext ?? {}),
          coachAccess: effectiveCoachAccess,
          authorized: effectiveCoachAccess,
        },
        actionRuntime,
        requestId: `coach-${session?.messages?.length ?? 0}-${text.slice(0, 24)}`,
        onCoachContextHydrated: coachContext?.onCoachContextHydrated,
      })

      if (coachOutcome) {
        debugLog('coach-route', { kind: coachOutcome.kind })
        return coachOutcome
      }

      if (operationalQuery) {
        logAvaCoachQueryDiagnostic({
          role: 'coach',
          queryType: operationalQuery.queryType,
          recognized: true,
          portfolioStatus: coachContext?.portfolioStatus ?? 'unknown',
          resultCount: 0,
          route: 'deterministic',
        })
        return createPipelineOutcome({
          kind: AVA_PIPELINE_KIND.RESPONSE,
          message: portfolioQueryLoadErrorMessage(operationalQuery.queryType),
          readOnly: true,
        })
      }
    }

    if (shouldRouteNutritionPending(text, { session })) {
      debugLog('intent-resolved', { route: 'nutrition-pending', pending: session?.pendingAction?.status })

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

        if (flow.result?.data?.executed) {
          debugLog('action-executed', { ok: execution?.ok ?? false })
        }

        return normalizePipelineOutcome(flow.result, session, {
          clarificationPayload: clarification,
        })
      }
    }

    const explicitResolution = resolveExplicitAction(text, { session, packet })
    if (explicitResolution?.actionId && explicitResolution.executeImmediately) {
      debugLog('action-resolved', {
        actionId: explicitResolution.actionId,
        source: explicitResolution.source,
        route: 'explicit-command',
      })

      const actionOutcome = await orchestrateMessageAction({
        message: text,
        session,
        packet,
        runtime: actionRuntime,
        requestId: `msg-${session?.messages?.length ?? 0}-${text.slice(0, 24)}`,
      })

      const mapped = mapActionOutcomeToPipeline(actionOutcome)
      if (mapped) {
        return mapped
      }
    }

    if (!effectiveCoachAccess && !shouldRouteNutritionPending(text, { session })) {
      const followUpOutcome = await runCoachFollowUpPipelineStep({
        message: text,
        session,
        packet,
        actionRuntime,
        role,
      })

      if (followUpOutcome) {
        debugLog('followup-route', { kind: followUpOutcome.kind })
        return followUpOutcome
      }

      const planningOutcome = await runPlanningPipelineStep({
        message: text,
        session,
        packet,
        actionRuntime,
        role,
      })

      if (planningOutcome) {
        debugLog('plan-route', { kind: planningOutcome.kind })
        return planningOutcome
      }
    }

    if (isReferentCommand(text)) {
      const referentResolution = resolveReferentAction(text, { session, packet })

      if (referentResolution?.ambiguous) {
        return createPipelineOutcome({
          kind: AVA_PIPELINE_KIND.RESPONSE,
          message: referentResolution.message,
          raw: referentResolution,
        })
      }

      if (referentResolution?.actionId && referentResolution.executeImmediately) {
        debugLog('action-resolved', {
          actionId: referentResolution.actionId,
          source: referentResolution.source,
          route: 'referent-command',
        })

        const actionOutcome = await orchestrateMessageAction({
          message: text,
          session,
          packet,
          runtime: actionRuntime,
          requestId: `ref-${session?.messages?.length ?? 0}-${text.slice(0, 24)}`,
        })

        const mapped = mapActionOutcomeToPipeline(actionOutcome)
        if (mapped) {
          return mapped
        }
      }
    }

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

    if (shouldRouteNutritionMessage(text, { session, packet }) && !isExplicitNavigationCommand(text)) {
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

    if (effectiveCoachAccess) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.RESPONSE,
        message: buildCoachAvaFallbackMessage(coachContext ?? {}),
        readOnly: true,
      })
    }

    const conversational = await withTimeout(
      routeMessage(text, {
        packet,
        session,
        history: appHistory,
      }),
    )

    debugLog('response-appended', { source: conversational?.source ?? 'unknown' })

    const sanitized = sanitizeConversationalActions(conversational, packet, role)

    if (sanitized?.actions?.length) {
      const modelAction = orchestrateModelAction({
        suggestedAction: {
          id: sanitized.actions[0].actionId ?? sanitized.actions[0].id,
          label: sanitized.actions[0].label,
        },
        packet,
        message: sanitized.summary,
        session,
      })

      if (modelAction?.kind === AVA_ACTION_OUTCOME_KIND.ACTION_READY) {
        return createPipelineOutcome({
          kind: AVA_PIPELINE_KIND.ACTION_READY,
          message: sanitized.summary ?? modelAction.message,
          actions: modelAction.actions ?? sanitized.actions,
          suggestions: sanitized.suggestions ?? [],
          raw: sanitized,
        })
      }
    }

    return normalizePipelineOutcome(sanitized, session)
  } catch (error) {
    debugLog('action-failure', { reason: error?.message ?? 'unknown' })
    return createPipelineFailure(
      error?.message === 'ava-pipeline-timeout' ? FALLBACK_BUSY : FALLBACK_BUSY,
      { error: error?.message ?? 'pipeline-error' },
    )
  }
}

export { AVA_PIPELINE_KIND, normalizePipelineOutcome }
