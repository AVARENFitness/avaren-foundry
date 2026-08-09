import { describe, expect, it } from 'vitest'
import { getCoachWeekRange } from '../../lib/weeklyReview'
import { buildClientRosterEntry } from '../../lib/clientIntelligence'
import {
  ATHLETE_CHECK_IN_STATUS,
  COACH_REVIEW_STATUS,
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
const priorWeekStart = '2026-07-28'

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

export const submittedWeeklyCheckIn = (athleteId) => ({
  athleteId,
  weekStart: weekRange.weekStart,
  weekEnd: weekRange.weekEnd,
  status: 'submitted',
  trainingRating: 4,
  recoveryRating: 4,
  nutritionRating: 4,
  painOrIssue: 'no_issues',
  submittedAt: `${weekRange.weekStart}T12:00:00.000Z`,
})

const priorWeeklyCheckIn = (athleteId) => ({
  athleteId,
  weekStart: priorWeekStart,
  weekEnd: '2026-08-02',
  status: 'submitted',
  trainingRating: 4,
  recoveryRating: 4,
  nutritionRating: 4,
  submittedAt: `${priorWeekStart}T12:00:00.000Z`,
})

const jakeStateWithDailyReadiness = {
  readiness: {
    entries: [
      {
        id: 'daily-1',
        date: weekRange.weekStart,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
        completedAt: `${weekRange.weekStart}T08:00:00.000Z`,
      },
    ],
  },
  history: [{ id: 'j1', date: weekRange.weekStart, name: 'Upper', sets: [] }],
}

const buildCoachContext = ({
  clients = [jake, sarah],
  weeklyCheckInsByAthleteId = {},
  weeklyReviewsByAthleteId = {},
} = {}) => {
  const rosterEntries = clients.map((client) =>
    buildClientRosterEntry({
      client,
      assignments: [],
      athleteState: null,
      nutritionProfile: null,
      nutritionDays: [],
      now,
    }),
  )

  return {
    clients,
    rosterEntries,
    portfolio: { rosterEntries },
    athleteStatesById: {},
    weeklyCheckInsByAthleteId,
    weeklyReviewsByAthleteId,
    portfolioStatus: 'ready',
    portfolioLoadedAt: Date.now(),
  }
}

describe('ava coach weekly check-in truth 7.9.12', () => {
  it('uses canonical weekly submission records only', () => {
    expect(
      resolveAthleteCheckInStatus({
        weeklyCheckIn: submittedWeeklyCheckIn('jake-1'),
        weeklyCheckInLoaded: true,
        now,
      }).athleteCheckInStatus,
    ).toBe(ATHLETE_CHECK_IN_STATUS.SUBMITTED)

    expect(
      resolveAthleteCheckInStatus({
        weeklyCheckIn: null,
        weeklyCheckInLoaded: true,
        now,
      }).athleteCheckInStatus,
    ).toBe(ATHLETE_CHECK_IN_STATUS.MISSING)
  })

  it('does not treat daily readiness as weekly submission', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      weeklyCheckInsByAthleteId: {},
    })
    coachContext.athleteStatesById = {
      'jake-1': jakeStateWithDailyReadiness,
    }

    const result = queryClientsMissingCheckIn(coachContext, now)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].clientName).toBe('Jake')
    expect(hasWeeklyAthleteCheckIn(null, now)).toBe(false)
  })

  it('returns Jake as missing when coach review exists but athlete submission does not', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
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
    expect(result.canClaimAllClear).toBe(false)
  })

  it('clears Jake after canonical weekly submission exists', () => {
    const missingContext = buildCoachContext({ clients: [jake] })
    expect(queryClientsMissingCheckIn(missingContext, now).items).toHaveLength(1)

    const submittedContext = buildCoachContext({
      clients: [jake],
      weeklyCheckInsByAthleteId: {
        'jake-1': submittedWeeklyCheckIn('jake-1'),
      },
    })
    const result = queryClientsMissingCheckIn(submittedContext, now)

    expect(result.items).toHaveLength(0)
    expect(result.canClaimAllClear).toBe(true)
  })

  it('treats prior-week submission as missing for current week', () => {
    const coachContext = buildCoachContext({
      clients: [jake],
      weeklyCheckInsByAthleteId: {
        'jake-1': priorWeeklyCheckIn('jake-1'),
      },
    })

    expect(queryClientsMissingCheckIn(coachContext, now).items[0].clientName).toBe(
      'Jake',
    )
  })

  it('keeps coach review separate from athlete submission state', () => {
    const record = resolveClientWeeklyCheckInRecord({
      athleteId: 'jake-1',
      weeklyCheckIn: null,
      weeklyCheckInLoaded: true,
      weeklyReview: {
        athleteId: 'jake-1',
        weekStart: weekRange.weekStart,
        weekEnd: weekRange.weekEnd,
      },
      now,
    })

    expect(record.athleteCheckInStatus).toBe(ATHLETE_CHECK_IN_STATUS.MISSING)
    expect(record.coachReviewStatus).toBe(COACH_REVIEW_STATUS.REVIEWED)
  })

  it('routes who hasnt checked in using canonical records', () => {
    const result = queryClientsMissingCheckIn(
      buildCoachContext({ clients: [jake] }),
      now,
    )

    expect(result.actionId).toBe(AVA_ACTION_IDS.SHOW_CLIENTS_MISSING_CHECKIN)
    expect(formatCoachQueryMessage(result)).toMatch(
      /Jake hasn't submitted this week's check-in/i,
    )
  })

  it('summarizes roster counts from weekly submissions', () => {
    const summary = summarizeRosterCheckInStatus({
      rosterEntries: buildCoachContext({
        clients: [jake, sarah],
        weeklyCheckInsByAthleteId: {
          'jake-1': submittedWeeklyCheckIn('jake-1'),
        },
      }).rosterEntries,
      weeklyCheckInsByAthleteId: {
        'jake-1': submittedWeeklyCheckIn('jake-1'),
      },
      portfolioLoaded: true,
      now,
    })

    expect(summary.submittedCount).toBe(1)
    expect(summary.missingCount).toBe(1)
    expect(summary.canClaimAllClear).toBe(false)
  })
})
