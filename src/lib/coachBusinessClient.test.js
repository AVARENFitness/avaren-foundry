import { describe, expect, it } from 'vitest'
import {
  attachCoachingRequirementsToBusinessClients,
  buildScheduledSessionClientPayload,
  CLIENT_IDENTITY_BADGE,
  filterActiveRoster,
  filterArchivedRoster,
  isOfflineBusinessClient,
  mergeCoachRosterRecords,
  normalizeBusinessClientRecord,
  resolveBusinessClientId,
  resolveRecordBusinessClientId,
  resolveClientIdentityBadge,
} from './coachBusinessClient'

describe('coachBusinessClient', () => {
  it('returns null for absent client records', () => {
    expect(resolveBusinessClientId(null)).toBeNull()
    expect(resolveBusinessClientId(undefined)).toBeNull()
    expect(resolveBusinessClientId({})).toBeNull()
    expect(resolveRecordBusinessClientId(null)).toBeNull()
    expect(resolveRecordBusinessClientId(undefined)).toBeNull()
    expect(resolveRecordBusinessClientId({})).toBeNull()
  })

  it('resolves explicit business client ids', () => {
    expect(
      resolveBusinessClientId({
        business_client_id: 'bc-jake',
        id: 'legacy-bridge-id',
      }),
    ).toBe('bc-jake')
    expect(
      resolveRecordBusinessClientId({
        id: 'bc-sarah',
      }),
    ).toBe('bc-sarah')
  })

  const offlineClient = {
    id: 'bc-sarah',
    coach_id: 'coach-1',
    first_name: 'Sarah',
    last_name: 'Lee',
    linked_user_id: null,
    status: 'active',
  }

  const connectedClient = {
    id: 'bc-jake',
    coach_id: 'coach-1',
    first_name: 'Jake',
    linked_user_id: 'athlete-jake',
    status: 'active',
  }

  it('normalizes offline business client identity', () => {
    const normalized = normalizeBusinessClientRecord(offlineClient)

    expect(normalized.businessClientId).toBe('bc-sarah')
    expect(normalized.athlete_id).toBeNull()
    expect(isOfflineBusinessClient(normalized)).toBe(true)
    expect(resolveClientIdentityBadge(normalized)).toBe(
      CLIENT_IDENTITY_BADGE.NO_APP,
    )
  })

  it('ignores stale athlete_id when linked_user_id is null', () => {
    const normalized = normalizeBusinessClientRecord({
      ...offlineClient,
      athlete_id: 'stale-athlete-id',
    })

    expect(normalized.athlete_id).toBeNull()
    expect(normalized.linked_user_id).toBeNull()
  })

  it('preserves not_required coaching requirements during normalization', () => {
    const normalized = normalizeBusinessClientRecord({
      ...connectedClient,
      coaching_requirements: { weekly_check_in: 'not_required' },
    })

    expect(normalized.coaching_requirements).toEqual({
      weekly_check_in: 'not_required',
    })
  })

  it('attaches coaching requirements by business client id', () => {
    const enriched = attachCoachingRequirementsToBusinessClients(
      [{ id: 'bc-jake', first_name: 'Jake' }],
      { 'bc-jake': { weekly_check_in: 'not_required' } },
    )

    expect(enriched[0].coaching_requirements).toEqual({
      weekly_check_in: 'not_required',
    })
  })

  it('builds offline appointment payload with null athlete id', () => {
    const payload = buildScheduledSessionClientPayload({
      businessClientId: 'bc-sarah',
      businessClient: offlineClient,
    })

    expect(payload.ok).toBe(true)
    expect(payload.athleteId).toBeNull()
    expect(payload.businessClientId).toBe('bc-sarah')
  })

  it('derives athlete id for connected clients', () => {
    const payload = buildScheduledSessionClientPayload({
      businessClientId: 'bc-jake',
      businessClient: connectedClient,
    })

    expect(payload.ok).toBe(true)
    expect(payload.athleteId).toBe('athlete-jake')
  })

  it('rejects athlete id on offline clients', () => {
    const payload = buildScheduledSessionClientPayload({
      businessClientId: 'bc-sarah',
      athleteId: 'athlete-sarah',
      businessClient: offlineClient,
    })

    expect(payload.ok).toBe(false)
    expect(payload.error).toBe('appointment_offline_client_no_athlete')
  })

  it('merges business roster with bridge enrichments', () => {
    const roster = mergeCoachRosterRecords({
      businessClients: [offlineClient, connectedClient],
      bridgeClients: [
        {
          business_client_id: 'bc-jake',
          athlete_id: 'athlete-jake',
          athlete_email: 'jake@example.com',
        },
      ],
      profilesById: {
        'athlete-jake': { preferred_name: 'Jake' },
      },
      labelsById: {
        'athlete-jake': { coach_label: 'Jake' },
      },
    })

    expect(roster).toHaveLength(2)
    expect(roster.find((client) => client.businessClientId === 'bc-sarah')?.athlete_id).toBeNull()
    expect(
      roster.find((client) => client.businessClientId === 'bc-jake')?.profile,
    ).toEqual({ preferred_name: 'Jake' })
  })

  it('filters active and archived roster views', () => {
    const clients = [
      offlineClient,
      { ...connectedClient, status: 'archived', ended_at: '2026-01-01' },
    ]

    expect(filterActiveRoster(clients)).toHaveLength(1)
    expect(filterArchivedRoster(clients)).toHaveLength(1)
    expect(resolveClientIdentityBadge(clients[1])).toBe(
      CLIENT_IDENTITY_BADGE.PAST,
    )
  })
})
