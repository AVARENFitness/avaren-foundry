import { describe, expect, it } from 'vitest'
import { getCoachWeekRange } from '../../lib/weeklyReview'
import { buildClientRosterEntry } from '../../lib/clientIntelligence'
import {
  ATHLETE_CHECK_IN_STATUS,
  COACH_REVIEW_STATUS,
  athleteHasPriorWeekCheckInOnly,
  findCurrentWeekAthleteCheckInEntry,
  hasWeeklyAthleteCheckIn,
  resolveAthleteCheckInStatus,
  resolveClientWeeklyCheckInRecord,
  summarizeRosterCheckInStatus,
} from './avaCoachCheckIn'
import {
  queryClientsMissingCheckIn,
  formatCoachQueryMessage,
} from './avaCoachQueries'
import { AVA_ACTION_IDS } from '../actions/avaActionTypes'

const now = new Date('2026-08-07T12:00:00.000Z')
const weekRange = getCoachWeekRange(now)
const priorWeekDate = '2026-07-28'

const jake = {
  athlete_id: 'jake-1',
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

const sarah = {
  athlete_id: 'sarah-1',
  athlete_email: 'sarah.jones@example.com',
  created_at: '2026-01-01T12:00:00.000Z',
}

const validCheckInEntry = (date = weekRange.weekStart) => ({
  id: 'check-in-1',
  date,
  sleep: 4,
  energy: 4,
  soreness: 2,
  stress: 2,
  completedAt: `${date}T12:00:00.000Z`,
})

const buildCoachContext = ({
  clients = [jake, sarah],
  athleteStatesById = {},
  weeklyReviewsByAthleteId = {},
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

  return {
    clients,
    rosterEntries,
    portfolio: { rosterEntries },
    athleteStatesById,
    weeklyReviewsByAthleteId,
    portfolioStatus: 'ready',
    portfolioLoadedAt: Date.now(),
  }
}

describe('ava coach check-in truth 7.9.11', () => {
  it('requires a valid current-week athlete readiness entry as submitted evidence', () => {
    const submittedState = {
      readiness: { entries: [validCheckInEntry()] },
    }
    const missingState = { readiness: { entries: [] } }
    const priorOnlyState = {
      readiness: { entries: [validCheckInEntry(priorWeekDate)] },
    }
    const invalidState = {
      readiness: {
        entries: [{ id: 'x', date: weekRange.weekStart }],
      },
    }

    expect(hasWeeklyAthleteCheckIn(submittedState, now)).toBe(true)
    expect(hasWeeklyAthleteCheckIn(missingState, now)).toBe(false)
    expect(hasWeeklyAthleteCheckIn(priorOnlyState, now)).toBe(false)
    expect(hasWeeklyAthleteCheckIn(invalidState, now)).toBe(false)
    expect(athleteHasPriorWeekCheckInOnly(priorOnlyState, now)).toBe(true)
  })

  it('uses Sprint 7.5 coach week boundaries for current-week classification', () => {
    expect(weekRange.weekStart).toBe('2026-08-03')
    expect(weekRange.weekEnd).toBe('2026-08-09')
    expect(
      findCurrentWeekAthleteCheckInEntry(
        { readiness: { entries: [validCheckInEntry('2026-08-02')] } },
        now,
      ),
    ).toBeNull()
    expect(
      findCurrentWeekAthleteCheckInEntry(
        { readiness: { entries: [validCheckInEntry('2026-08-03')] } },
        now,
      ),
    ).not.toBeNull()
  })

  it('keeps coach review separate from athlete submission', () => {
    const record = resolveClientWeeklyCheckInRecord({
      athleteId: 'jake-1',
      athleteState: { readiness: { entries: [] } },
      athleteStateLoaded: true,
      weeklyReview: {
        athleteId: 'jake-1',
        weekStart: weekRange.weekStart,
        weekEnd: weekRange.weekEnd,
        decision: 'keep_course',
      },
      now,
    })

    expect(record.athleteCheckInStatus).toBe(ATHLETE_CHECK_IN_STATUS.MISSING)
    expect(record.coachReviewStatus).toBe(COACH_REVIEW_STATUS.REVIEWED)
    expect(record.athleteSubmitted).toBe(false)
    expect(record.coachReviewed).toBe(true)
  })

  it('returns Jake as missing when athlete check-in is absent even if coach review exists', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: {
        'jake-1': { readiness: { entries: [] }, history: [] },
      },
      weeklyReviewsByAthleteId: {
        'jake-1': {
          athleteId: 'jake-1',
          weekStart: weekRange.weekStart,
          weekEnd: weekRange.weekEnd,
          decision: 'keep_course',
        },
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].clientName).toBe('Jake')
    expect(result.canClaimAllClear).toBe(false)
  })

  it('does not return Jake as missing when current-week athlete check-in is submitted', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: {
        'jake-1': { readiness: { entries: [validCheckInEntry()] }, history: [] },
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)

    expect(result.items).toHaveLength(0)
    expect(result.canClaimAllClear).toBe(true)
    expect(result.emptyMessage).toMatch(/everyone is checked in/i)
  })

  it('treats prior-week-only submission as missing for this week', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: {
        'jake-1': {
          readiness: { entries: [validCheckInEntry(priorWeekDate)] },
          history: [],
        },
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].clientName).toBe('Jake')
  })

  it('returns unknown/partial state instead of everyone checked in', () => {
    const coachContext = buildCoachContext({
      clients: [jake, sarah],
      athleteStatesById: {
        'jake-1': { readiness: { entries: [validCheckInEntry()] }, history: [] },
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)
    const message = formatCoachQueryMessage(result)

    expect(result.items).toHaveLength(0)
    expect(result.unknownItems).toHaveLength(1)
    expect(result.canClaimAllClear).toBe(false)
    expect(message).toMatch(/I can confirm Jake checked in/i)
    expect(message).toMatch(/can't verify the current-week check-in for Sarah Jones yet/i)
    expect(message).not.toMatch(/everyone is checked in/i)
  })

  it('classifies unloaded athlete state as unknown, not submitted', () => {
    const status = resolveAthleteCheckInStatus({
      athleteState: null,
      athleteStateLoaded: false,
      now,
    })

    expect(status.athleteCheckInStatus).toBe(ATHLETE_CHECK_IN_STATUS.UNKNOWN)
    expect(status.athleteSubmitted).toBe(false)
  })

  it('summarizes roster check-in counts for dev diagnostics', () => {
    const summary = summarizeRosterCheckInStatus({
      rosterEntries: buildCoachContext({
        athleteStatesById: {
          'jake-1': { readiness: { entries: [validCheckInEntry()] } },
          'sarah-1': { readiness: { entries: [] } },
        },
      }).rosterEntries,
      athleteStatesById: {
        'jake-1': { readiness: { entries: [validCheckInEntry()] } },
        'sarah-1': { readiness: { entries: [] } },
      },
      portfolioLoaded: true,
      now,
    })

    expect(summary.weekKey).toBe(weekRange.weekStart)
    expect(summary.requiredCount).toBe(2)
    expect(summary.submittedCount).toBe(1)
    expect(summary.missingCount).toBe(1)
    expect(summary.unknownCount).toBe(0)
    expect(summary.canClaimAllClear).toBe(false)
  })

  it('routes who hasnt checked in to missing clients through query result shape', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      athleteStatesById: {
        'jake-1': { readiness: { entries: [] }, history: [] },
      },
    })

    const result = queryClientsMissingCheckIn(coachContext, now)

    expect(result.actionId).toBe(AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN)
    expect(formatCoachQueryMessage(result)).toMatch(/Jake hasn't submitted this week's check-in/i)
  })
})
