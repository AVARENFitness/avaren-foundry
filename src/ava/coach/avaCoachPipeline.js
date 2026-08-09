import {
  AVA_PIPELINE_KIND,
  createPipelineOutcome,
} from '../avaPipelineOutcome'
import { AVA_ACTION_OUTCOME_KIND } from '../actions/avaActionTypes'
import { orchestrateUiAction } from '../actions/avaActionOrchestrator'
import {
  formatCoachQueryMessage,
  runCoachQuery,
} from './avaCoachQueries'
import {
  resolveCoachDisambiguationSelection,
  resolveCoachExplicitCommand,
  isCoachClientNameCommand,
  isCoachClientUpdateCommand,
  isCoachPortfolioQueryCommand,
  isCoachExplainCommand,
  isCoachReferentCommand,
} from './avaCoachResolver'
import { isCoachClientReviewCommand } from './avaCoachClientResolver'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { setSessionActiveCoachContext } from './avaCoachContext'
import {
  buildCoachClientLabel,
} from './avaCoachClientResolver'
import {
  coachContextAuthorizedClientCount,
  coachContextHasPortfolioData,
  getRequiredDomainsForQuery,
  logAvaCoachQueryDiagnostic,
  matchCoachOperationalQuery,
  portfolioQueryLoadErrorMessage,
} from './avaCoachQueryPatterns'
import {
  COACH_PORTFOLIO_STATUS,
  ensureCoachPortfolio,
  mergeCoachPortfolioBundle,
} from '../../lib/coachPortfolioService'

const collectCoachActions = (result = {}) => {
  const actions = []

  ;(result.items ?? []).forEach((item) => {
    ;(item.actions ?? []).forEach((action) => {
      actions.push(action)
    })
  })

  if (result.viewAllAction) {
    actions.push(result.viewAllAction)
  }

  return actions
}

export const mapCoachQueryToPipeline = (queryOutcome = {}) => {
  const result = queryOutcome.result
  const message = formatCoachQueryMessage(result)
  const coachResults = result?.items ?? []
  const actions = collectCoachActions(result)

  logAvaCoachQueryDiagnostic({
    role: 'coach',
    queryType: queryOutcome.queryType ?? result?.actionId ?? null,
    matched: true,
    recognized: true,
    source: 'deterministic',
    dataStatus: result?.portfolioStatus ?? COACH_PORTFOLIO_STATUS.READY,
    authorizedClientCount: result?.authorizedClientCount ?? 0,
    resultCount: coachResults.length,
    route: 'deterministic',
  })

  return createPipelineOutcome({
    kind: AVA_PIPELINE_KIND.COACH_RESULT,
    message,
    actions,
    coachResults,
    readOnly: true,
    raw: queryOutcome,
  })
}

export async function runCoachPipelineStep({
  message,
  session,
  coachContext = null,
  actionRuntime = null,
  requestId = 'coach',
  onCoachContextHydrated = null,
} = {}) {
  const coachAccess = Boolean(
    coachContext?.coachAccess ?? coachContext?.authorized,
  )
  if (!coachAccess) return null

  const operationalQuery = matchCoachOperationalQuery(message)
  let activeCoachContext = coachContext

    if (operationalQuery && !coachContextHasPortfolioData(activeCoachContext)) {
    logAvaCoachQueryDiagnostic({
      role: 'coach',
      queryType: operationalQuery.queryType,
      matched: true,
      recognized: true,
      source: 'deterministic',
      dataStatus: COACH_PORTFOLIO_STATUS.LOADING,
      route: 'deterministic',
    })

    const requiredDomains = getRequiredDomainsForQuery(operationalQuery.queryType)
    const ensurePortfolio =
      activeCoachContext?.ensureCoachPortfolio ??
      ((options = {}) => ensureCoachPortfolio(options))

    const bundle = await ensurePortfolio({
      requiredDomains,
      force: operationalQuery.queryType === 'missing_checkin',
    })

    if (bundle?.loadFailed || bundle?.status === COACH_PORTFOLIO_STATUS.ERROR) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.RESPONSE,
        message: portfolioQueryLoadErrorMessage(operationalQuery.queryType),
        readOnly: true,
      })
    }

    activeCoachContext = mergeCoachPortfolioBundle(activeCoachContext, bundle)
    ;(onCoachContextHydrated ?? activeCoachContext?.onCoachContextHydrated)?.(
      activeCoachContext,
    )
  }

  let resolution = resolveCoachExplicitCommand(message, {
    coachContext: activeCoachContext,
    session,
  })

  if (!resolution && operationalQuery) {
    const result = runCoachQuery(operationalQuery.actionId, activeCoachContext)
    resolution = {
      kind: 'query',
      actionId: operationalQuery.actionId,
      queryType: operationalQuery.queryType,
      result: {
        ...result,
        portfolioStatus: activeCoachContext.portfolioStatus ?? COACH_PORTFOLIO_STATUS.READY,
      },
    }
  }

  if (!resolution) return null

  const isHubNavigation =
    resolution.kind === 'navigation' &&
    resolution.resolution?.actionId === AVA_ACTION_IDS.OPEN_COACH_HUB
  const isClientNameCommand = isCoachClientNameCommand(message)
  const isSummaryCommand = isCoachClientUpdateCommand(message)
  const isReviewCommand = isCoachClientReviewCommand(message)
  const isPortfolioQuery = isCoachPortfolioQueryCommand(message)
  const isExplainCommand = isCoachExplainCommand(message)
  const isReferentCommandMatch = isCoachReferentCommand(message)

  const needsRoster =
    !isHubNavigation &&
    (isClientNameCommand ||
      isSummaryCommand ||
      isReviewCommand ||
      isPortfolioQuery ||
      isExplainCommand ||
      isReferentCommandMatch)

  if (
    needsRoster &&
    isPortfolioQuery &&
    !coachContextHasPortfolioData(activeCoachContext)
  ) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: portfolioQueryLoadErrorMessage(operationalQuery?.queryType),
      readOnly: true,
    })
  }

  if (needsRoster && !(activeCoachContext?.clients?.length ?? 0)) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message:
        "I don't have your client roster yet. Open Coach Hub once, then try again.",
      readOnly: true,
    })
  }

  if (resolution.kind === 'response') {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: resolution.message,
      readOnly: true,
    })
  }

  if (resolution.kind === 'disambiguation') {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.CLARIFICATION,
      message: resolution.message,
      candidates: {
        query: resolution.pendingAction?.query ?? null,
        choices: resolution.choices ?? [],
        summary: resolution.message,
        coachClientDisambiguation: true,
        pendingAction: resolution.pendingAction ?? null,
      },
      raw: resolution,
    })
  }

  if (resolution.kind === 'summary') {
    if (resolution.athleteId) {
      setSessionActiveCoachContext(session, {
        athleteId: resolution.athleteId,
        clientName: resolution.clientName,
        source: 'ava-summary',
      })
    }

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.COACH_RESULT,
      message: resolution.message,
      coachResults: resolution.facts
        ? [
            {
              athleteId: resolution.athleteId,
              clientName: resolution.clientName,
              reason: resolution.message,
              summaryFacts: resolution.facts,
              actions: [
                {
                  actionId: 'OPEN_CLIENT_PROFILE',
                  label: `Open ${resolution.clientName}`,
                  meta: { athleteId: resolution.athleteId },
                },
              ],
            },
          ]
        : [],
      actions: resolution.athleteId
        ? [
            {
              actionId: 'OPEN_CLIENT_PROFILE',
              label: `Open ${resolution.clientName}`,
              meta: { athleteId: resolution.athleteId },
            },
          ]
        : [],
      readOnly: true,
      raw: resolution,
    })
  }

  if (resolution.kind === 'query') {
    const enriched = {
      ...resolution,
      result: {
        ...(resolution.result ?? {}),
        authorizedClientCount: coachContextAuthorizedClientCount(activeCoachContext),
        portfolioStatus:
          activeCoachContext.portfolioStatus ?? COACH_PORTFOLIO_STATUS.READY,
      },
    }
    return mapCoachQueryToPipeline(enriched)
  }

  if (resolution.kind === 'navigation' && resolution.resolution?.actionId) {
    if (!actionRuntime) {
      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_READY,
        message: resolution.resolution.label ?? 'Ready when you are.',
        actions: [
          {
            id: resolution.resolution.actionId,
            actionId: resolution.resolution.actionId,
            label: resolution.resolution.label,
            meta: resolution.resolution.meta ?? {},
          },
        ],
      })
    }

    const outcome = await orchestrateUiAction({
      actionId: resolution.resolution.actionId,
      runtime: actionRuntime,
      session,
      requestId,
      meta: resolution.resolution.meta ?? {},
    })

    if (outcome.kind === AVA_ACTION_OUTCOME_KIND.ACTION_SUCCESS) {
      const athleteId = resolution.resolution.meta?.athleteId
      if (athleteId) {
        setSessionActiveCoachContext(session, {
          athleteId,
          clientName:
            resolution.resolution.meta?.clientName ??
            buildCoachClientLabel(
              activeCoachContext.clients?.find(
                (client) => String(client.athlete_id) === String(athleteId),
              ) ?? {},
            ),
          source: 'ava-navigation',
        })
      }

      return createPipelineOutcome({
        kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
        message: outcome.message,
        raw: {
          ...outcome,
          actionId: resolution.resolution.actionId,
          navigated: true,
          payload: outcome.payload ?? { destination: 'coach-clients' },
        },
      })
    }

    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
      message: outcome.message,
      raw: outcome,
    })
  }

  return null
}

export async function runCoachDisambiguationStep({
  choice,
  session,
  coachContext = null,
  actionRuntime = null,
  pendingAction = null,
  requestId = 'coach-disambiguation',
} = {}) {
  const resolution = resolveCoachDisambiguationSelection(choice, {
    coachContext,
    pendingAction,
  })

  if (resolution.kind === 'response') {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.RESPONSE,
      message: resolution.message,
    })
  }

  if (!actionRuntime || !resolution.resolution?.actionId) {
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
      message: "I couldn't open that client safely.",
    })
  }

  const outcome = await orchestrateUiAction({
    actionId: resolution.resolution.actionId,
    runtime: actionRuntime,
    session,
    requestId,
    meta: resolution.resolution.meta ?? {},
  })

  if (outcome.kind === AVA_ACTION_OUTCOME_KIND.ACTION_SUCCESS) {
    setSessionActiveCoachContext(session, {
      athleteId: resolution.resolution.meta?.athleteId,
      clientName: resolution.resolution.meta?.clientName,
      source: 'ava-disambiguation',
    })
    return createPipelineOutcome({
      kind: AVA_PIPELINE_KIND.ACTION_SUCCESS,
      message: outcome.message,
      raw: outcome,
    })
  }

  return createPipelineOutcome({
    kind: AVA_PIPELINE_KIND.ACTION_FAILURE,
    message: outcome.message,
    raw: outcome,
  })
}

export const runCoachQueryAction = (actionId, coachContext = {}) => {
  const result = runCoachQuery(actionId, coachContext)
  if (!result) return null
  return mapCoachQueryToPipeline({ kind: 'query', actionId, result })
}
