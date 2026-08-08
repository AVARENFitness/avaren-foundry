import { getAvaActionDefinition } from './avaActionRegistry'
import { logAvaActionDiagnostic } from './avaActionDiagnostics'
import { clearSessionActiveReferent } from './avaActionReferent'
import { verifyAvaActionAsync } from './avaActionVerification'
import {
  AVA_ACTION_IDS,
  AVA_ACTION_SOURCE,
  AVA_ACTION_STAGE,
  normalizeAvaActionId,
} from './avaActionTypes'

const IDEMPOTENCY_MS = 2000
const recentExecutions = new Map()

const idempotencyKey = (actionId, requestId = 'default') =>
  `${actionId}:${requestId}`

export const resetAvaActionIdempotency = () => {
  recentExecutions.clear()
}

export const isDuplicateAvaAction = (actionId, requestId = 'default') => {
  const key = idempotencyKey(actionId, requestId)
  const last = recentExecutions.get(key)
  return Boolean(last && Date.now() - last.at < IDEMPOTENCY_MS)
}

const markAvaActionExecuted = (actionId, requestId = 'default') => {
  recentExecutions.set(idempotencyKey(actionId, requestId), {
    at: Date.now(),
  })
}

const runActionHandler = async (actionId, runtime = {}) => {
  switch (actionId) {
    case AVA_ACTION_IDS.START_TODAYS_WORKOUT:
    case AVA_ACTION_IDS.OPEN_WORKOUT:
      runtime.onNavigateIntent?.('gym')
      runtime.startWorkout?.()
      return
    case AVA_ACTION_IDS.OPEN_READINESS:
      runtime.openReadiness?.()
      return
    case AVA_ACTION_IDS.OPEN_NUTRITION:
      runtime.onNavigateIntent?.('nutrition')
      runtime.openNutrition?.()
      return
    case AVA_ACTION_IDS.OPEN_RECOVERY:
      runtime.onNavigateIntent?.('mobility')
      runtime.openRecovery?.()
      return
    case AVA_ACTION_IDS.START_RECOVERY_FLOW:
      runtime.onNavigateIntent?.('mobility')
      runtime.startRecoveryFlow?.()
      return
    default:
      return
  }
}

export async function executeAvaAction({
  actionId,
  runtime = null,
  context = {},
  source = AVA_ACTION_SOURCE.UI,
  requestId = 'default',
  session = null,
} = {}) {
  const normalizedId = normalizeAvaActionId(actionId)
  const definition = getAvaActionDefinition(normalizedId)
  const startedAt = Date.now()

  if (!normalizedId || !definition) {
    logAvaActionDiagnostic({
      actionId: String(actionId ?? 'unknown'),
      source,
      stage: AVA_ACTION_STAGE.FAILED,
      ok: false,
    })
    return {
      ok: false,
      actionId: String(actionId ?? 'unknown'),
      message: "I can't run that action safely right now.",
      rejected: true,
    }
  }

  if (!runtime) {
    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.FAILED,
      ok: false,
    })
    return {
      ok: false,
      actionId: normalizedId,
      message: definition.buildFailureMessage(context),
    }
  }

  if (isDuplicateAvaAction(normalizedId, requestId)) {
    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.VERIFIED,
      durationMs: Date.now() - startedAt,
      ok: true,
      verified: true,
    })
    return {
      ok: true,
      actionId: normalizedId,
      duplicate: true,
      navigated: true,
      message: definition.buildSuccessMessage({
        ...context,
        alreadyActive: true,
      }),
    }
  }

  logAvaActionDiagnostic({
    actionId: normalizedId,
    source,
    stage: AVA_ACTION_STAGE.EXECUTING,
    referentType: context.referentType ?? null,
  })

  try {
    await runActionHandler(normalizedId, runtime, context)
    const verification = await verifyAvaActionAsync({
      actionId: normalizedId,
      runtime,
      context,
    })

    if (!verification.ok) {
      logAvaActionDiagnostic({
        actionId: normalizedId,
        source,
        stage: AVA_ACTION_STAGE.FAILED,
        durationMs: Date.now() - startedAt,
        ok: false,
        verified: false,
        destination: verification.destination ?? null,
      })
      return {
        ok: false,
        actionId: normalizedId,
        message: definition.buildFailureMessage({
          ...context,
          reason: verification.reason,
        }),
      }
    }

    markAvaActionExecuted(normalizedId, requestId)
    clearSessionActiveReferent(session)

    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.VERIFIED,
      durationMs: Date.now() - startedAt,
      ok: true,
      verified: true,
      destination: verification.destination ?? null,
      referentType: context.referentType ?? null,
    })

    return {
      ok: true,
      actionId: normalizedId,
      navigated: true,
      message: definition.buildSuccessMessage({
        ...context,
        alreadyActive: verification.alreadyActive,
      }),
      payload: {
        alreadyActive: verification.alreadyActive,
        destination: verification.destination ?? null,
      },
    }
  } catch {
    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.FAILED,
      durationMs: Date.now() - startedAt,
      ok: false,
      verified: false,
    })
    return {
      ok: false,
      actionId: normalizedId,
      message: definition.buildFailureMessage(context),
    }
  }
}
