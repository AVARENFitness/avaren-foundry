import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { resetAvaActionIdempotency } from '../actions/avaActionExecutor'
import { createAvaSession } from '../../lib/avaConversation'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { buildBaseCoachAvaContext } from './avaCoachRole'
import {
  isCoachClientListCommand,
  isOpenCoachHubCommand,
  resolveCoachExplicitCommand,
} from './avaCoachResolver'
import { runCoachPipelineStep } from './avaCoachPipeline'
import {
  describeCoachView,
  isCoachClientsListVerified,
} from './avaCoachNav'

describe('ava coach client-list navigation 7.9.2', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('resolves "Show me my clients" to OPEN_COACH_HUB with clients destination', () => {
    const resolution = resolveCoachExplicitCommand('Show me my clients', {
      coachContext: buildBaseCoachAvaContext({
        session: { user: { email: 'hello@avarenfitness.com' } },
        coachAuthorized: true,
        isCoachMode: true,
      }),
    })

    expect(resolution.kind).toBe('navigation')
    expect(resolution.resolution.actionId).toBe(AVA_ACTION_IDS.OPEN_COACH_HUB)
    expect(resolution.resolution.meta.focus).toBe('clients')
    expect(isCoachClientListCommand('Show me my clients')).toBe(true)
    expect(isOpenCoachHubCommand('Show me my clients')).toBe(true)
  })

  it('did not previously match show-me-my-clients variant before expanded patterns', () => {
    expect(/^show my clients\.?$/.test('show me my clients')).toBe(false)
  })

  it('opens coach client list from athlete home without staying on home', async () => {
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: false,
    })

    const appScreen = { current: 'home' }
    const snapshot = {
      coachHub: false,
      coachScreen: 'clients',
      selectedClientId: null,
      weeklyReviewOpen: false,
      profileOpen: false,
    }

    const enterCoachHub = vi.fn(() => {
      appScreen.current = 'coach-hub'
      snapshot.coachHub = true
      snapshot.coachScreen = 'clients'
      snapshot.profileOpen = false
      snapshot.weeklyReviewOpen = false
      snapshot.selectedClientId = null
    })

    const runtime = {
      isCoachRuntime: true,
      enterCoachHub,
      openCoachClientList: enterCoachHub,
      setCoachScreen: vi.fn(),
      getSnapshot: () => snapshot,
      getCoachContext: () => coachContext,
    }

    const outcome = await runCoachPipelineStep({
      message: 'Show me my clients',
      session: createAvaSession(),
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(enterCoachHub).toHaveBeenCalledTimes(1)
    expect(appScreen.current).toBe('coach-hub')
    expect(isCoachClientsListVerified(snapshot)).toBe(true)
    expect(describeCoachView(snapshot)).toBe('coach-clients')
  })

  it('clears overlays when showing client list inside coach hub', async () => {
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: true,
    })

    const snapshot = {
      coachHub: true,
      coachScreen: 'calendar',
      selectedClientId: 'client-1',
      weeklyReviewOpen: false,
      profileOpen: true,
    }

    const openCoachClientList = vi.fn(() => {
      snapshot.coachScreen = 'clients'
      snapshot.selectedClientId = null
      snapshot.profileOpen = false
      snapshot.weeklyReviewOpen = false
    })

    const runtime = {
      isCoachRuntime: true,
      openCoachClientList,
      enterCoachHub: vi.fn(),
      setCoachScreen: vi.fn(),
      getSnapshot: () => snapshot,
      getCoachContext: () => coachContext,
    }

    const outcome = await runCoachPipelineStep({
      message: 'Show my clients',
      session: createAvaSession(),
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(openCoachClientList).toHaveBeenCalledTimes(1)
    expect(isCoachClientsListVerified(snapshot)).toBe(true)
  })

  it('keeps destination after navigation-first sheet dismissal concept', async () => {
    const coachContext = buildBaseCoachAvaContext({
      session: { user: { email: 'hello@avarenfitness.com' } },
      coachAuthorized: true,
      isCoachMode: false,
    })
    const snapshot = {
      coachHub: false,
      coachScreen: 'clients',
      selectedClientId: null,
      weeklyReviewOpen: false,
      profileOpen: false,
    }
    const dismissCalls = []
    const enterCoachHub = vi.fn(() => {
      snapshot.coachHub = true
      snapshot.coachScreen = 'clients'
    })
    const runtime = {
      enterCoachHub,
      openCoachClientList: enterCoachHub,
      getSnapshot: () => snapshot,
      getCoachContext: () => coachContext,
    }

    const outcome = await runCoachPipelineStep({
      message: 'Open Coach Hub.',
      session: createAvaSession(),
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)

    await new Promise((resolve) => queueMicrotask(resolve))
    dismissCalls.push(isCoachClientsListVerified(snapshot))
    expect(dismissCalls[0]).toBe(true)
    expect(describeCoachView(snapshot)).not.toBe('home')
  })

  it('preserves Open Coach Hub regression through full pipeline', async () => {
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
      openCoachClientList: vi.fn(() => {
        snapshot.coachScreen = 'clients'
      }),
      enterCoachHub: vi.fn(),
      setCoachScreen: vi.fn(),
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
    expect(isCoachClientsListVerified(snapshot)).toBe(true)
  })
})
