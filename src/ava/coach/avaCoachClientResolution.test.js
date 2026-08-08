import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'
import { resetAvaActionIdempotency } from '../actions/avaActionExecutor'
import { createAvaSession } from '../../lib/avaConversation'
import { runAvaMessagePipeline } from '../avaMessagePipeline'
import { AVA_PIPELINE_KIND } from '../avaPipelineOutcome'
import { buildBaseCoachAvaContext } from './avaCoachRole'
import { buildClientRosterEntry } from '../../lib/clientIntelligence'
import { getCoachWeekRange } from '../../lib/weeklyReview'
import {
  extractClientNameFromMessage,
  resolveAuthorizedCoachClient,
  resolveCoachClientByName,
} from './avaCoachClientResolver'
import {
  resolveCoachExplicitCommand,
  isCoachPortfolioQueryCommand,
} from './avaCoachResolver'
import { runCoachPipelineStep } from './avaCoachPipeline'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)

const jacob = {
  athlete_id: 'jacob-1',
  athlete_email: 'jacobcorell2218@gmail.com',
  coach_label: 'Jake',
  profile: {
    first_name: 'Jacob',
    last_name: 'Corell',
    preferred_name: 'Jacob',
    display_name: '',
  },
  created_at: '2026-01-01T12:00:00.000Z',
}

const jacobTwo = {
  athlete_id: 'jacob-2',
  athlete_email: 'jacob.smith@example.com',
  coach_label: '',
  profile: {
    first_name: 'Jacob',
    last_name: 'Smith',
    preferred_name: 'Jacob',
    display_name: '',
  },
  created_at: '2026-01-01T12:00:00.000Z',
}

const unauthorizedJake = {
  athlete_id: 'other-jake',
  athlete_email: 'jake.other@example.com',
  coach_label: 'Jake',
  profile: {
    first_name: 'Jake',
    last_name: 'Other',
    preferred_name: 'Jake',
    display_name: '',
  },
  created_at: '2026-01-01T12:00:00.000Z',
}

const jacobState = {
  readiness: { entries: [] },
  history: [{ id: 'j1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
}

const buildCoachContext = ({
  clients = [jacob],
  isCoachMode = true,
  athleteStatesById = { 'jacob-1': jacobState },
} = {}) => {
  const rosterEntries = clients.map((client) =>
    buildClientRosterEntry({
      client,
      assignments: [],
      athleteState: athleteStatesById[client.athlete_id] ?? null,
      nutritionProfile: null,
      nutritionDays: [],
      now,
    }),
  )

  return buildBaseCoachAvaContext({
    session: { user: { email: 'coach@avarenfitness.com' } },
    coachAuthorized: true,
    isCoachMode,
    rosterContext: {
      clients,
      rosterEntries,
      portfolio: { rosterEntries },
      athleteStatesById,
    },
  })
}

const createCoachRuntime = (coachContext) => {
  const snapshot = {
    coachHub: false,
    coachScreen: 'clients',
    selectedClientId: null,
    weeklyReviewOpen: false,
    profileOpen: false,
  }

  return {
    isCoachRuntime: true,
    enterCoachHub: vi.fn(() => {
      snapshot.coachHub = true
    }),
    openClientProfile: vi.fn((client) => {
      snapshot.selectedClientId = client.athlete_id
      snapshot.profileOpen = true
    }),
    getSnapshot: () => snapshot,
    getCoachContext: () => coachContext,
  }
}

describe('ava coach client resolution 7.9.6', () => {
  beforeEach(() => {
    resetAvaActionIdempotency()
  })

  it('extracts client names from expanded open/show commands', () => {
    expect(extractClientNameFromMessage('Open Jake')).toBe('jake')
    expect(extractClientNameFromMessage('Show Jake')).toBe('jake')
    expect(extractClientNameFromMessage("Show Jake's profile")).toBe('jake')
    expect(extractClientNameFromMessage('Take me to Jacob Corell')).toBe('jacob corell')
    expect(extractClientNameFromMessage('Give me a quick update on Jake')).toBe('jake')
  })

  it('resolves coach_label Jake to Jacob Corell with precedence', () => {
    const resolution = resolveAuthorizedCoachClient('Jake', [jacob])
    expect(resolution.status).toBe('resolved')
    expect(resolution.matchSource).toBe('coach_label')
    expect(resolution.record.athleteId).toBe('jacob-1')
  })

  it('resolves canonical and preferred names for the same client', () => {
    expect(resolveCoachClientByName('Jacob', [jacob]).athleteId).toBe('jacob-1')
    expect(resolveCoachClientByName('Jacob Corell', [jacob]).athleteId).toBe(
      'jacob-1',
    )
    expect(resolveCoachClientByName(' jake ', [jacob]).athleteId).toBe('jacob-1')
  })

  it('opens Jake through pipeline outside coach hub without model fallthrough', async () => {
    const coachContext = buildCoachContext({ isCoachMode: false })
    const runtime = createCoachRuntime(coachContext)
    const session = createAvaSession()

    const outcome = await runCoachPipelineStep({
      message: 'Open Jake',
      session,
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
    expect(runtime.openClientProfile).toHaveBeenCalledWith(
      expect.objectContaining({ athlete_id: 'jacob-1' }),
    )
    expect(session.activeCoachContext?.athleteId).toBe('jacob-1')
  })

  it('resolves Open Jake to OPEN_CLIENT_PROFILE deterministically', () => {
    const coachContext = buildCoachContext()
    const resolution = resolveCoachExplicitCommand('Open Jake', { coachContext })

    expect(resolution.kind).toBe('navigation')
    expect(resolution.resolution.actionId).toBe(AVA_ACTION_IDS.OPEN_CLIENT_PROFILE)
    expect(resolution.resolution.meta.athleteId).toBe('jacob-1')
  })

  it('returns roster-only no-match copy for unknown clients', () => {
    const resolution = resolveCoachClientByName('Marcus', [jacob])
    expect(resolution.status).toBe('none')
    expect(resolution.message).toBe("I couldn't find Marcus in your client roster.")
  })

  it('does not match clients outside the authorized roster', () => {
    const resolution = resolveCoachClientByName('Jake', [jacob])
    expect(resolution.athleteId).toBe('jacob-1')
    expect(
      resolveCoachClientByName('Jake', [jacob]).athleteId,
    ).not.toBe(unauthorizedJake.athlete_id)
    expect(resolveCoachClientByName('Jake', []).status).toBe('none')
  })

  it('shows clarification when two authorized Jacobs match', () => {
    const coachContext = buildCoachContext({ clients: [jacob, jacobTwo] })
    const resolution = resolveCoachExplicitCommand('Open Jacob', { coachContext })

    expect(resolution.kind).toBe('disambiguation')
    expect(resolution.choices).toHaveLength(2)
  })

  it('returns trusted client summary for quick update on Jake', async () => {
    const coachContext = buildCoachContext({ isCoachMode: false })
    const runtime = createCoachRuntime(coachContext)
    const session = createAvaSession()

    const outcome = await runCoachPipelineStep({
      message: 'Give me a quick update on Jake',
      session,
      coachContext,
      actionRuntime: runtime,
    })

    expect(outcome.kind).toBe(AVA_PIPELINE_KIND.COACH_RESULT)
    expect(outcome.message.toLowerCase()).toMatch(/trained|check-in/)
    expect(session.activeCoachContext?.athleteId).toBe('jacob-1')
  })

  it('preserves portfolio queries outside coach hub when roster is loaded', () => {
    expect(isCoachPortfolioQueryCommand("Who hasn't checked in?")).toBe(true)
  })

  it('denies coach client open for athletes through full pipeline', async () => {
    const outcome = await runAvaMessagePipeline({
      message: 'Open Jake',
      nutrition: { goals: {}, days: {} },
      session: createAvaSession(),
      packet: null,
      coachContext: buildBaseCoachAvaContext({
        session: { user: { email: 'athlete@example.com' } },
        coachAuthorized: false,
        isCoachMode: false,
        rosterContext: { clients: [jacob] },
      }),
      role: 'athlete',
      actionRuntime: {},
      routeMessage: vi.fn(),
    })

    expect(outcome.kind).not.toBe(AVA_PIPELINE_KIND.ACTION_SUCCESS)
  })
})
