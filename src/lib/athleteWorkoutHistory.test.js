import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompletionSummary,
  durableRowFromHistorySession,
  historyCannotShrink,
  historySessionFromDurableRow,
  isEmptyTrainingShell,
  mergeWorkoutHistory,
  preferRicherSession,
} from './athleteWorkoutHistory'
import { backfillLegacyHistoryEntries } from './athleteWorkoutHistoryBackfill'
import {
  chooseActiveWorkout,
  chooseNewestState,
  mergeFoundryStates,
} from './cloudSync'
import { recentPRs } from './metrics'
import { normalizeClientTrainingHistory } from './clientIntelligence'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const richSession = (id, overrides = {}) => ({
  id,
  name: 'Push',
  date: '2026-09-01',
  startedAt: '2026-09-01T15:00:00.000Z',
  finishedAt: '2026-09-01T16:00:00.000Z',
  sets: [
    {
      exercise: 'Bench Press',
      loadType: 'external_load',
      reps: 5,
      weight: 185,
    },
    {
      exercise: 'Pull-Up',
      loadType: 'bodyweight',
      reps: 8,
      bodyweightAtSession: 180,
    },
    {
      exercise: 'Dip',
      loadType: 'assisted_load',
      reps: 6,
      assistance: 30,
      prescription: { supersetGroup: 'A' },
    },
  ],
  exercisesPerformed: [],
  ...overrides,
})

describe('athleteWorkoutHistory adapter', () => {
  it('round-trips durable rows to history sessions', () => {
    const session = richSession('session-1')
    const row = durableRowFromHistorySession(session, { athleteId: 'athlete-1' })
    const restored = historySessionFromDurableRow(row)

    expect(row.session_id).toBe('session-1')
    expect(row.athlete_id).toBe('athlete-1')
    expect(restored.id).toBe('session-1')
    expect(restored.sets).toHaveLength(3)
    expect(buildCompletionSummary(session).hasSuperset).toBe(true)
  })

  it('merges two different workouts and prefers richer duplicate', () => {
    const thin = richSession('session-1', { sets: [{ exercise: 'Bench', reps: 1 }] })
    const rich = richSession('session-1')
    const other = richSession('session-2', { name: 'Pull' })

    const merged = mergeWorkoutHistory([thin], [rich, other])
    expect(merged).toHaveLength(2)
    expect(preferRicherSession(thin, rich).sets).toHaveLength(3)
    expect(merged.find((item) => item.id === 'session-1').sets).toHaveLength(3)
  })

  it('preserves bodyweight / external / assisted load semantics in payload', () => {
    const session = richSession('loads-1')
    const row = durableRowFromHistorySession(session, { athleteId: 'a1' })
    const restored = historySessionFromDurableRow(row)

    expect(restored.sets.map((set) => set.loadType)).toEqual([
      'external_load',
      'bodyweight',
      'assisted_load',
    ])
    expect(restored.sets[2].prescription.supersetGroup).toBe('A')
  })

  it('detects empty shell and history shrink attempts', () => {
    expect(isEmptyTrainingShell({ history: [], activeWorkout: null })).toBe(true)
    expect(
      historyCannotShrink(
        [richSession('a'), richSession('b')],
        [richSession('a')],
      ),
    ).toBe(false)
    expect(
      historyCannotShrink([richSession('a')], [richSession('a'), richSession('b')]),
    ).toBe(true)
  })
})

describe('cloudSync multi-device safety', () => {
  it('empty second-device state cannot erase durable cloud history', () => {
    const cloud = {
      history: [richSession('phone-1'), richSession('phone-2')],
      lastSavedAt: '2026-09-01T10:00:00.000Z',
      activeWorkout: null,
    }
    const local = {
      history: [],
      lastSavedAt: '2026-09-06T12:00:00.000Z',
      activeWorkout: null,
    }

    const decision = chooseNewestState(local, {
      state: cloud,
      updated_at: '2026-09-01T10:00:00.000Z',
    })

    expect(decision.uploadLocal).toBe(false)
    expect(decision.state.history).toHaveLength(2)
    expect(historyCannotShrink(cloud.history, decision.state.history)).toBe(true)
  })

  it('stale device cannot reduce history via merge', () => {
    const cloud = {
      history: [richSession('a'), richSession('b'), richSession('c')],
      lastSavedAt: '2026-09-05T10:00:00.000Z',
    }
    const local = {
      history: [richSession('a')],
      lastSavedAt: '2026-09-06T10:00:00.000Z',
    }

    const merged = mergeFoundryStates(local, cloud)
    expect(merged.history).toHaveLength(3)
  })

  it('two different workouts both persist through merge', () => {
    const merged = mergeFoundryStates(
      { history: [richSession('phone')], lastSavedAt: '2026-09-06T10:00:00.000Z' },
      { history: [richSession('ipad')], lastSavedAt: '2026-09-06T09:00:00.000Z' },
    )
    expect(merged.history.map((item) => item.id).sort()).toEqual(['ipad', 'phone'])
  })

  it('prefers resume of cloud active workout over empty local', () => {
    const cloudActive = {
      id: 'active-1',
      name: 'Legs',
      startedAt: '2026-09-06T11:00:00.000Z',
    }
    const chosen = chooseActiveWorkout(null, cloudActive, {
      localTime: 0,
      cloudTime: Date.parse('2026-09-06T11:00:00.000Z'),
      localHistory: [],
    })
    expect(chosen?.id).toBe('active-1')
  })

  it('clears active workout when local history completed that session', () => {
    const cloudActive = {
      id: 'active-1',
      name: 'Legs',
      startedAt: '2026-09-06T11:00:00.000Z',
    }
    const chosen = chooseActiveWorkout(null, cloudActive, {
      localTime: Date.parse('2026-09-06T12:00:00.000Z'),
      cloudTime: Date.parse('2026-09-06T11:00:00.000Z'),
      localHistory: [richSession('active-1')],
    })
    expect(chosen).toBeNull()
  })
})

describe('PR / coach history compatibility', () => {
  it('PR logic reads canonical merged history', () => {
    const history = mergeWorkoutHistory([
      richSession('s1', {
        finishedAt: '2026-09-02T16:00:00.000Z',
        sets: [
          {
            exercise: 'Bench Press',
            loadType: 'external_load',
            reps: 3,
            weight: 200,
            estimatedOneRepMax: 220,
          },
        ],
      }),
    ])
    const prs = recentPRs(history, 5)
    expect(prs.length).toBeGreaterThan(0)
  })

  it('coach training history reads canonical history sessions', () => {
    const history = mergeWorkoutHistory([richSession('coach-visible')])
    const normalized = normalizeClientTrainingHistory({
      athleteState: { history },
      assignments: [],
    })
    expect(normalized).toHaveLength(1)
    expect(normalized[0].id).toBe('coach-visible')
  })
})

describe('legacy backfill safety', () => {
  it('backfill is idempotent and skips malformed entries', () => {
    const first = backfillLegacyHistoryEntries([
      richSession('ok-1'),
      null,
      { name: 'missing id' },
      'bad',
      richSession('ok-2'),
    ])
    expect(first.inserted).toHaveLength(2)
    expect(first.skipped).toBe(3)

    const second = backfillLegacyHistoryEntries(
      [richSession('ok-1'), richSession('ok-3')],
      first.existingSessionIds,
    )
    expect(second.inserted).toHaveLength(1)
    expect(second.inserted[0].session_id).toBe('ok-3')
  })
})

describe('durable session backend idempotency', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('queues offline completion and dedupes by session id', async () => {
    vi.doMock('./supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }))

    const {
      completeWorkoutSession,
      listQueuedDurableWorkoutSessions,
    } = await import('./athleteWorkoutSessionsBackend')

    const session = richSession('offline-1')
    await completeWorkoutSession('athlete-1', session)
    await completeWorkoutSession('athlete-1', session)

    const queue = listQueuedDurableWorkoutSessions('athlete-1')
    expect(queue).toHaveLength(1)
    expect(queue[0].session_id).toBe('offline-1')
  })

  it('duplicate completion uses ignoreDuplicates insert path', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    vi.doMock('./supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: () => ({
          upsert,
        }),
      },
    }))

    const { completeWorkoutSession } = await import(
      './athleteWorkoutSessionsBackend'
    )

    const session = richSession('dup-1')
    await completeWorkoutSession('athlete-1', session)
    await completeWorkoutSession('athlete-1', session)

    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0][1]).toMatchObject({
      onConflict: 'athlete_id,session_id',
      ignoreDuplicates: true,
    })
  })

  it('edit updates one session and preserves identity', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                athlete_id: 'athlete-1',
                session_id: 'edit-1',
                id: 'row-uuid',
                created_at: '2026-09-01T00:00:00.000Z',
              },
              error: null,
            })),
          })),
        })),
      })),
    }))

    vi.doMock('./supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: () => ({
          update,
        }),
      },
    }))

    const {
      updateWorkoutSession,
      buildEditableWorkoutPatch,
      assertEditableIdentityPreserved,
    } = await import('./athleteWorkoutSessionsBackend')

    const original = richSession('edit-1', {
      sets: [{ exercise: 'Bench Press', loadType: 'external_load', reps: 5, weight: 185 }],
    })
    const edited = richSession('edit-1', {
      notes: 'Forgot a set',
      sets: [
        { exercise: 'Bench Press', loadType: 'external_load', reps: 5, weight: 185 },
        { exercise: 'Bench Press', loadType: 'external_load', reps: 3, weight: 195 },
      ],
    })

    const result = await updateWorkoutSession('athlete-1', edited)
    const patch = buildEditableWorkoutPatch(edited, 'athlete-1')

    expect(result.persisted).toBe(true)
    expect(result.sessionId).toBe('edit-1')
    expect(result.athleteId).toBe('athlete-1')
    expect(patch).not.toHaveProperty('athlete_id')
    expect(patch).not.toHaveProperty('session_id')
    expect(patch).not.toHaveProperty('id')
    expect(patch).not.toHaveProperty('created_at')
    expect(patch.session_payload.id).toBe('edit-1')
    expect(
      assertEditableIdentityPreserved(
        { id: original.id, athlete_id: 'athlete-1', session_id: original.id },
        { id: original.id, athlete_id: result.athleteId, session_id: result.sessionId },
      ),
    ).toBe(true)

    const once = mergeWorkoutHistory([original, edited])
    expect(once).toHaveLength(1)
    expect(once[0].sets).toHaveLength(2)

    const prs = recentPRs(once, 5)
    expect(prs.length).toBeGreaterThan(0)
  })

  it('stale device merge cannot remove other completed sessions after edit', () => {
    const edited = richSession('a', {
      editedAt: '2026-09-06T12:00:00.000Z',
      sets: [{ exercise: 'Squat', loadType: 'external_load', reps: 5, weight: 275 }],
    })
    const other = richSession('b')
    const local = { history: [edited], lastSavedAt: '2026-09-06T12:00:00.000Z' }
    const cloud = {
      history: [richSession('a'), other],
      lastSavedAt: '2026-09-05T12:00:00.000Z',
    }
    const merged = mergeFoundryStates(local, cloud)
    expect(merged.history).toHaveLength(2)
    expect(merged.history.find((item) => item.id === 'a').sets[0].weight).toBe(275)
  })
})

describe('SQL migration contract', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'docs/supabase/AVAREN_DURABLE_WORKOUT_HISTORY_9_1_MIGRATION.sql',
    ),
    'utf8',
  )
  const verification = readFileSync(
    resolve(
      process.cwd(),
      'docs/supabase/AVAREN_DURABLE_WORKOUT_HISTORY_9_1_VERIFICATION.sql',
    ),
    'utf8',
  )

  it('defines unique identity, split owner policies, and no delete grant', () => {
    expect(migration).toMatch(/athlete_workout_sessions_athlete_session_unique/)
    expect(migration).toMatch(/athlete_workout_sessions_owner_select/)
    expect(migration).toMatch(/athlete_workout_sessions_owner_insert/)
    expect(migration).toMatch(/athlete_workout_sessions_owner_update/)
    expect(migration).toMatch(/athlete_workout_sessions_coach_read/)
    expect(migration).toMatch(/protect_athlete_workout_session_identity/)
    expect(migration).toMatch(/new\.source is distinct from old\.source/)
    expect(migration).toMatch(/new\.assignment_id is distinct from old\.assignment_id/)
    expect(migration).toMatch(/Incompatible athlete_workout_sessions draft/)
    expect(migration).toMatch(/jsonb_typeof\(v_entry -> 'sets'\) = 'array'/)
    expect(migration).toMatch(/grant select, insert, update on table public\.athlete_workout_sessions to authenticated/i)
    expect(migration).not.toMatch(/grant delete on table public\.athlete_workout_sessions/i)
    expect(migration).toMatch(/for select to authenticated/)
    expect(migration).not.toMatch(/create policy athlete_workout_sessions_owner on public\.athlete_workout_sessions\s+for all/i)
    expect(migration).toMatch(/foundry_state_backfill/)
    expect(migration).not.toMatch(/delete from public\.foundry_state/i)
  })

  it('verification asserts grants, no delete, coach read-only, immutable trigger', () => {
    expect(verification).toMatch(/ownerSelectGrant/)
    expect(verification).toMatch(/ownerInsertGrant/)
    expect(verification).toMatch(/ownerUpdateGrant/)
    expect(verification).toMatch(/ownerDeleteGrantDenied/)
    expect(verification).toMatch(/coachSelectPolicyOnly/)
    expect(verification).toMatch(/immutableIdentityTrigger/)
    expect(verification).toMatch(/athleteWorkoutSessionsAnonDenied/)
  })
})

describe('policy intent helpers', () => {
  it('documents athlete can edit own row but cannot delete via grants', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'docs/supabase/AVAREN_DURABLE_WORKOUT_HISTORY_9_1_MIGRATION.sql',
      ),
      'utf8',
    )
    expect(migration).toMatch(/owner_update/)
    expect(migration).not.toMatch(/for delete to authenticated/)
    expect(migration).not.toMatch(/athlete_workout_sessions_coach_.*insert/i)
    expect(migration).not.toMatch(/athlete_workout_sessions_coach_.*update/i)
  })
})
