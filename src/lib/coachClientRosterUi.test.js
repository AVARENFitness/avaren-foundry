import { describe, expect, it } from 'vitest'
import {
  buildRosterRowMeta,
  filterRosterEntriesByHubScope,
  formatRosterNextSessionLabel,
  formatRosterPassLabel,
  resolveRosterAttentionLabel,
  ROSTER_HUB_FILTER,
  ROSTER_PREVIEW_LIMIT,
  sortRosterEntriesForOperations,
} from './coachClientRosterUi'

describe('coachClientRosterUi', () => {
  it('prefers next appointment copy over last trained in row meta', () => {
    const meta = buildRosterRowMeta(
      {
        client: { status: 'active', linked_user_id: 'a1', athlete_id: 'a1' },
        clientName: 'Jake',
        attentionCount: 0,
        card: { lastWorkoutLabel: 'Today' },
      },
      {
        nextSession: {
          status: 'scheduled',
          sessionDate: '2026-08-14',
          startTime: '17:30:00',
          scheduleTimezone: 'America/New_York',
        },
        passSummary: { totalBalance: 2, activeCount: 1 },
      },
    )

    expect(meta.secondaryLine).toMatch(/Aug/)
    expect(meta.secondaryLine).toMatch(/2 sessions left/)
    expect(meta.secondaryLine).not.toMatch(/last trained/i)
  })

  it('does not treat offline clients as attention by default', () => {
    const entry = {
      client: {
        status: 'active',
        linked_user_id: null,
        athlete_id: null,
      },
      attentionCount: 0,
      intelligence: null,
      athleteCheckInStatus: 'n/a',
      weeklyReviewStatus: 'N/A',
    }

    expect(resolveRosterAttentionLabel(entry)).toBeNull()
  })

  it('does not show Check-in due when weekly check-in is not required', () => {
    const entry = {
      client: {
        status: 'active',
        linked_user_id: 'a1',
        athlete_id: 'a1',
        coaching_requirements: { weekly_check_in: 'not_required' },
      },
      attentionCount: 0,
      intelligence: null,
      athleteCheckInStatus: 'not_required',
      weeklyReviewStatus: 'REVIEW DUE',
    }

    expect(resolveRosterAttentionLabel(entry)).toBe('Review open')
  })

  it('shows Check-in due only when status is missing', () => {
    expect(
      resolveRosterAttentionLabel({
        athleteCheckInStatus: 'missing',
        weeklyReviewStatus: 'N/A',
      }),
    ).toBe('Check-in due')

    expect(
      resolveRosterAttentionLabel({
        athleteCheckInStatus: 'not_required',
        weeklyReviewStatus: 'N/A',
      }),
    ).toBeNull()
  })

  it('surfaces actionable attention as a single compact label', () => {
    const entry = {
      intelligence: {
        attention: [
          {
            id: 'overdue-assignment',
            title: 'Assigned workout is overdue',
          },
        ],
      },
      athleteCheckInStatus: 'missing',
    }

    expect(resolveRosterAttentionLabel(entry)).toBe('Assignment overdue')
  })

  it('emphasizes low and empty pass states in labels', () => {
    expect(formatRosterPassLabel({ totalBalance: 1, activeCount: 1 })).toBe(
      '1 session left',
    )
    expect(formatRosterPassLabel({ totalBalance: 0, activeCount: 1 })).toBe(
      'No sessions left',
    )
    expect(formatRosterPassLabel({ totalBalance: 0, activeCount: 0 })).toBe(
      'No active pass',
    )
  })

  it('sorts by attention then upcoming appointment then name', () => {
    const sorted = sortRosterEntriesForOperations(
      [
        { client: { id: 'bc-b' }, clientName: 'Bravo', attentionCount: 0 },
        { client: { id: 'bc-a' }, clientName: 'Alpha', attentionCount: 1 },
      ],
      {
        upcomingByBusinessClientId: {
          'bc-b': {
            status: 'scheduled',
            startsAt: '2026-08-13T12:00:00.000Z',
          },
        },
      },
    )

    expect(sorted[0].clientName).toBe('Alpha')
    expect(sorted[1].clientName).toBe('Bravo')
  })

  it('filters active, attention, and past scopes', () => {
    const entries = [
      {
        client: { id: '1', status: 'active', linked_user_id: null },
        attentionCount: 0,
      },
      {
        client: { id: '2', status: 'active', linked_user_id: 'a' },
        attentionCount: 1,
        intelligence: { attention: [{ id: 'inactive', title: 'Training gap detected' }] },
      },
      { client: { id: '3', status: 'archived' }, attentionCount: 0 },
    ]

    expect(filterRosterEntriesByHubScope(entries, ROSTER_HUB_FILTER.ACTIVE)).toHaveLength(2)
    expect(filterRosterEntriesByHubScope(entries, ROSTER_HUB_FILTER.ATTENTION)).toHaveLength(1)
    expect(filterRosterEntriesByHubScope(entries, ROSTER_HUB_FILTER.PAST)).toHaveLength(1)
  })

  it('uses subtle no-session copy', () => {
    expect(formatRosterNextSessionLabel(null)).toBe('No session scheduled')
  })

  it('limits command center preview to six clients', () => {
    expect(ROSTER_PREVIEW_LIMIT).toBe(6)
  })
})
