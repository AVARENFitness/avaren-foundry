import { getAvaActionDefinition } from './avaActionRegistry'
import { logAvaActionDiagnostic } from './avaActionDiagnostics'
import { clearSessionActiveReferent } from './avaActionReferent'
import { verifyAvaActionAsync } from './avaActionVerification'
import {
  AVA_ACTION_IDS,
  AVA_ACTION_SOURCE,
  AVA_ACTION_STAGE,
  isCoachAvaAction,
  isCoachQueryAction,
  normalizeAvaActionId,
} from './avaActionTypes'
import {
  assertAuthorizedClient,
  setSessionActiveCoachContext,
} from '../coach/avaCoachContext'
import { buildCoachClientLabel } from '../coach/avaCoachClientResolver'
import {
  COACH_HUB_DESTINATIONS,
  describeCoachView,
  isCoachClientsListVerified,
  logAvaNavDiagnostic,
} from '../coach/avaCoachNav'

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

const runActionHandler = async (actionId, runtime = {}, context = {}) => {
  const coachContext = runtime.getCoachContext?.() ?? {}

  if (isCoachQueryAction(actionId)) {
    return { queryOnly: true }
  }

  if (isCoachAvaAction(actionId)) {
    if (!coachContext?.authorized) {
      throw new Error('coach-unauthorized')
    }

    const athleteId = context.athleteId ?? context.meta?.athleteId ?? null

    if (actionId === AVA_ACTION_IDS.OPEN_COACH_HUB) {
      const snapshot = runtime.getSnapshot?.() ?? {}
      const beforeView = describeCoachView(snapshot)
      const wantsClientList =
        context.focus === 'clients' ||
        context.destination === COACH_HUB_DESTINATIONS.CLIENTS ||
        context.destination === 'coach-clients' ||
        context.meta?.focus === 'clients' ||
        context.meta?.destination === COACH_HUB_DESTINATIONS.CLIENTS ||
        context.meta?.destination === 'coach-clients'

      if (!snapshot.coachHub) {
        runtime.enterCoachHub?.({ focus: 'clients' })
      } else if (wantsClientList) {
        runtime.openCoachClientList?.()
      } else {
        runtime.setCoachScreen?.('clients')
      }

      const afterView = describeCoachView(runtime.getSnapshot?.() ?? {})
      logAvaNavDiagnostic({
        actionId,
        target: wantsClientList
          ? COACH_HUB_DESTINATIONS.CLIENTS
          : COACH_HUB_DESTINATIONS.HUB,
        beforeView,
        afterView,
        sheetClosed: false,
        verified: null,
      })
      return
    }

    if (
      [
        AVA_ACTION_IDS.OPEN_CLIENT_PROFILE,
        AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE,
        AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS,
      ].includes(actionId) &&
      athleteId
    ) {
      const auth = assertAuthorizedClient(coachContext, athleteId)
      if (!auth.ok) {
        throw new Error('unauthorized-client')
      }

      const client = auth.client
      const clientName =
        context.clientName ??
        buildCoachClientLabel(client)
      const beforeView = describeCoachView(runtime.getSnapshot?.() ?? {})

      if (!runtime.getSnapshot?.()?.coachHub) {
        runtime.enterCoachHub?.({ focus: 'clients' })
      }

      if (actionId === AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS) {
        runtime.openWeeklyReview?.(client)
      } else if (actionId === AVA_ACTION_IDS.OPEN_CLIENT_INTELLIGENCE) {
        runtime.openClientProfile?.(client, { focus: 'intelligence' })
      } else {
        runtime.openClientProfile?.(client)
      }

      setSessionActiveCoachContext(context.session, {
        athleteId: client.athlete_id,
        clientName,
        source: 'ava-action',
      })

      logAvaNavDiagnostic({
        actionId,
        target: actionId,
        beforeView,
        afterView: describeCoachView(runtime.getSnapshot?.() ?? {}),
        sheetClosed: false,
        verified: null,
      })

      return { client, clientName }
    }

    if (actionId === AVA_ACTION_IDS.OPEN_WEEKLY_REVIEWS) {
      runtime.openCoachClientList?.()
      return
    }
  }

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

  if (isCoachAvaAction(normalizedId)) {
    const coachContext = runtime.getCoachContext?.() ?? {}
    const allowed = Boolean(coachContext?.coachAccess ?? coachContext?.authorized)
    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.EXECUTING,
      allowed,
    })
    if (!allowed) {
      return {
        ok: false,
        actionId: normalizedId,
        message: "That action isn't available here.",
        rejected: true,
      }
    }
  } else {
    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.EXECUTING,
      referentType: context.referentType ?? null,
    })
  }

  if (isCoachQueryAction(normalizedId)) {
    return {
      ok: true,
      actionId: normalizedId,
      queryOnly: true,
      message: definition.buildSuccessMessage(context),
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

  try {
    await runActionHandler(normalizedId, runtime, { ...context, session })
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
    if (isCoachAvaAction(normalizedId)) {
      // Coach client referent persists across follow-up commands.
    } else {
      clearSessionActiveReferent(session)
    }

    if (isCoachAvaAction(normalizedId)) {
      logAvaNavDiagnostic({
        actionId: normalizedId,
        target: verification.destination ?? null,
        beforeView: null,
        afterView: describeCoachView(runtime.getSnapshot?.() ?? {}),
        sheetClosed: false,
        verified: true,
      })
    }

    logAvaActionDiagnostic({
      actionId: normalizedId,
      source,
      stage: AVA_ACTION_STAGE.VERIFIED,
      durationMs: Date.now() - startedAt,
      ok: true,
      verified: true,
      allowed: isCoachAvaAction(normalizedId)
        ? Boolean(runtime.getCoachContext?.()?.coachAccess ?? runtime.getCoachContext?.()?.authorized)
        : undefined,
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
  } catch (error) {
    if (error?.message === 'unauthorized-client') {
      return {
        ok: false,
        actionId: normalizedId,
        message: definition.buildFailureMessage({
          ...context,
          reason: 'unauthorized-client',
        }),
        rejected: true,
      }
    }

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
