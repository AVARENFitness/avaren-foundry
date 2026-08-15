import { describe, expect, it } from 'vitest'
import { buildCoachPortfolioIntelligence } from './clientIntelligence'
import {
  resolveAthleteCheckInRosterStatus,
  ROSTER_ATHLETE_CHECK_IN_STATUS,
  isWeeklyCheckInRequired,
} from './weeklyCheckInEligibility'
import { resolveRosterAttentionLabel } from './coachClientRosterUi'
import { buildCoachAttentionQueue } from '../ava/coach/avaCoachAttention'

const jakeClient = {
  id: 'bc-jake',
  business_client_id: 'bc-jake',
  athlete_id: 'athlete-jake',
  linked_user_id: 'athlete-jake',
  status: 'active',
  displayName: 'Jake',
  coaching_requirements: { weekly_check_in: 'not_required' },
  hasCoachBridge: true,
}

describe('weekly check-in requirement alignment', () => {
  it('reads not_required from coaching_requirements', () => {
    expect(
      isWeeklyCheckInRequired({ weekly_check_in: 'not_required' }),
    ).toBe(false)
    expect(isWeeklyCheckInRequired({ weekly_check_in: 'required' })).toBe(true)
  })

  it('defaults missing coaching_requirements to required', () => {
    expect(isWeeklyCheckInRequired(null)).toBe(true)
    expect(isWeeklyCheckInRequired(undefined)).toBe(true)
  })

  it('does not mark Jake as check-in missing when not required', () => {
    expect(
      resolveAthleteCheckInRosterStatus({
        client: jakeClient,
        weeklyCheckIn: null,
      }),
    ).toBe(ROSTER_ATHLETE_CHECK_IN_STATUS.NOT_REQUIRED)
  })

  it('portfolio roster does not show Check-in due for not_required clients', () => {
    const portfolio = buildCoachPortfolioIntelligence({
      clients: [jakeClient],
      assignments: [],
      athleteStatesById: { 'athlete-jake': { history: [], readiness: { entries: [] } } },
      nutritionByAthleteId: {},
      weeklyReviewsByAthleteId: {},
      weeklyCheckInsByAthleteId: {},
      now: new Date('2026-08-15T12:00:00'),
    })

    const entry = portfolio.rosterEntries[0]
    expect(entry.athleteCheckInStatus).toBe('not_required')
    expect(resolveRosterAttentionLabel(entry)).not.toBe('Check-in due')
  })

  it('does not queue Jake for missing weekly check-in attention', () => {
    const portfolio = buildCoachPortfolioIntelligence({
      clients: [jakeClient],
      assignments: [],
      athleteStatesById: { 'athlete-jake': { history: [], readiness: { entries: [] } } },
      nutritionByAthleteId: {},
      weeklyReviewsByAthleteId: {},
      weeklyCheckInsByAthleteId: {},
      now: new Date('2026-08-15T12:00:00'),
    })

    const { queue } = buildCoachAttentionQueue(
      {
        portfolio,
        rosterEntries: portfolio.rosterEntries,
        athleteStatesById: { 'athlete-jake': { history: [], readiness: { entries: [] } } },
        weeklyCheckInsByAthleteId: {},
        weeklyReviewsByAthleteId: {},
        portfolioStatus: 'ready',
      },
      new Date('2026-08-15T12:00:00'),
    )

    expect(
      queue.some((item) => /check-in/i.test(item.title ?? item.summary ?? '')),
    ).toBe(false)
  })

  it('shows Check-in due when required and no current-week submission', () => {
    const requiredClient = {
      ...jakeClient,
      coaching_requirements: { weekly_check_in: 'required' },
    }

    const portfolio = buildCoachPortfolioIntelligence({
      clients: [requiredClient],
      assignments: [],
      athleteStatesById: {
        'athlete-jake': { history: [], readiness: { entries: [] } },
      },
      nutritionByAthleteId: {},
      weeklyReviewsByAthleteId: {},
      weeklyCheckInsByAthleteId: {},
      now: new Date('2026-08-15T12:00:00'),
    })

    const entry = portfolio.rosterEntries[0]
    expect(entry.athleteCheckInStatus).toBe('missing')
    expect(resolveRosterAttentionLabel(entry)).toBe('Check-in due')
  })

  it('clears due state when requirement toggles to not_required', () => {
    const requiredEntry = resolveAthleteCheckInRosterStatus({
      client: {
        ...jakeClient,
        coaching_requirements: { weekly_check_in: 'required' },
      },
      weeklyCheckIn: null,
    })
    const relaxedEntry = resolveAthleteCheckInRosterStatus({
      client: jakeClient,
      weeklyCheckIn: null,
    })

    expect(requiredEntry).toBe(ROSTER_ATHLETE_CHECK_IN_STATUS.MISSING)
    expect(relaxedEntry).toBe(ROSTER_ATHLETE_CHECK_IN_STATUS.NOT_REQUIRED)
  })
})
