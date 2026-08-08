import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { resetAvaActionIdempotency } from '../actions/avaActionExecutor'
import { createAvaSession } from '../../lib/avaConversation'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { buildBaseCoachAvaContext, resolveAvaRole } from './avaCoachRole'
import { isOpenCoachHubCommand } from './avaCoachResolver'
import { runCoachPipelineStep } from './avaCoachPipeline'

describe('avaCoachRole', () => {
  it('resolves primary owner email as coach via primary-email source', () => {
    const role = resolveAvaRole({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: false,
    })

    expect(role.role).toBe('coach')
    expect(role.coachAccess).toBe(true)
    expect(role.source).toBe('primary-email')
  })

  it('resolves rpc-backed coaches separately from primary email', () => {
    const role = resolveAvaRole({
      session: { user: { email: 'coach@example.com' } },
      coachAuthorized: true,
    })

    expect(role.role).toBe('coach')
    expect(role.source).toBe('rpc-coach')
  })

  it('resolves athletes without coach access', () => {
    const role = resolveAvaRole({
      session: { user: { email: 'athlete@example.com' } },
      coachAuthorized: false,
    })

    expect(role.role).toBe('athlete')
    expect(role.coachAccess).toBe(false)
    expect(role.source).toBe('athlete')
  })
})

describe('OPEN_COACH_HUB patch 7.9.1', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  const createCoachRuntime = (coachContext, { inHub = true } = {}) => {
    const snapshot = {
      coachHub: inHub,
      coachScreen: inHub ? 'calendar' : false,
      selectedClientId: null,
      weeklyReviewOpen: false,
      profileOpen: false,
    }

    return {
      isCoachRuntime: true,
      setCoachScreen: vi.fn((screen) => {
        snapshot.coachScreen = screen
        snapshot.coachHub = true
      }),
      openCoachClientList: vi.fn(() => {
        snapshot.coachHub = true
        snapshot.coachScreen = 'clients'
        snapshot.profileOpen = false
        snapshot.weeklyReviewOpen = false
        snapshot.selectedClientId = null
      }),
      enterCoachHub: vi.fn(() => {
        snapshot.coachHub = true
        snapshot.coachScreen = 'clients'
      }),
      getSnapshot: () => snapshot,
      getCoachContext: () => coachContext,
    }
  }

  it('matches expanded open coach hub commands', () => {
    expect(isOpenCoachHubCommand('Open Coach Hub.')).toBe(true)
    expect(isOpenCoachHubCommand('Open my Coach Hub')).toBe(true)
    expect(isOpenCoachHubCommand('Take me to Coach Hub')).toBe(true)
    expect(isOpenCoachHubCommand('Show my clients')).toBe(true)
    expect(isOpenCoachHubCommand('Show me my clients')).toBe(true)
    expect(isOpenCoachHubCommand('Open coaching')).toBe(true)
  })

  it('opens coach hub for authorized coaches before coach mode UI sync', async () => {
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: false,
    })
    const runtime = createCoachRuntime(coachContext, { inHub: false })
    const session = createAvaSession()

    const outcome = await runCoachPipelineStep({
      message: 'Open Coach Hub.',
      session,
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(runtime.enterCoachHub).toHaveBeenCalledTimes(1)
    expect(runtime.getSnapshot().coachScreen).toBe('clients')
  })

  it('navigates to clients when already inside coach hub', async () => {
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: true,
      rosterContext: { coachScreen: 'calendar' },
    })
    const runtime = createCoachRuntime(coachContext, { inHub: true })
    runtime.getSnapshot().coachScreen = 'calendar'
    const session = createAvaSession()

    const outcome = await runCoachPipelineStep({
      message: 'Open Coach Hub.',
      session,
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(runtime.openCoachClientList).toHaveBeenCalledTimes(1)
    expect(runtime.enterCoachHub).not.toHaveBeenCalled()
  })

  it('rejects athletes through the pipeline without navigation', async () => {
    const outcome = await runAvaMessagePipeline({
      message: 'Open Coach Hub.',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext: buildBaseCoachAvaContext({
        session: { user: { email: 'athlete@example.com' } },
        coachAuthorized: false,
        isCoachMode: false,
      }),
      role: 'athlete',
      actionRuntime: {
        getCoachContext: () =>
          buildBaseCoachAvaContext({
            session: { user: { email: 'athlete@example.com' } },
            coachAuthorized: false,
          }),
      },
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_FAILURE)
    expect(outcome.message).toMatch(/isn't available/i)
  })

  it('allows coach hub navigation through full pipeline for coach role', async () => {
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: true,
    })
    const snapshot = {
      coachHub: true,
      coachScreen: 'settings',
      selectedClientId: null,
      weeklyReviewOpen: false,
      profileOpen: false,
    }
    const runtime = {
      isCoachRuntime: true,
      setCoachScreen: vi.fn((screen) => {
        snapshot.coachScreen = screen
      }),
      openCoachClientList: vi.fn(() => {
        snapshot.coachScreen = 'clients'
      }),
      enterCoachHub: vi.fn(),
      getSnapshot: () => snapshot,
      getCoachContext: () => coachContext,
    }

    const outcome = await runAvaMessagePipeline({
      message: 'Open Coach Hub.',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext,
      role: 'coach',
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(runtime.openCoachClientList).toHaveBeenCalled()
    expect(snapshot.coachScreen).toBe('clients')
  })
})
