import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  APPOINTMENT_FETCH_ERROR,
  classifyAthleteAppointmentFetchError,
} from './athleteAppointments'
import { extractSupabaseError } from './athleteAppointmentDiagnostics'
import { logAthleteRpcCheckpoint } from './athleteAppointmentTrace'

describe('athleteAppointmentTrace', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('classifies auth user mismatch as authorization', () => {
    const classified = classifyAthleteAppointmentFetchError(
      new Error('auth_user_mismatch'),
    )

    expect(classified.category).toBe('authorization')
  })

  it('classifies missing athlete json helper overload as rpc_unavailable', () => {
    const classified = classifyAthleteAppointmentFetchError({
      code: '42883',
      message:
        'function public.athlete_scheduled_session_public_json(public.coach_scheduled_sessions, text, text) does not exist',
      details: null,
      hint: 'No function matches the given name and argument types. You might need to add explicit type casts.',
    })

    expect(classified.category).toBe(APPOINTMENT_FETCH_ERROR.RPC_UNAVAILABLE)
  })

  it('classifies postgrest schema-cache misses as rpc_unavailable', () => {
    const classified = classifyAthleteAppointmentFetchError({
      code: 'PGRST202',
      message:
        'Could not find the function public.list_athlete_scheduled_sessions without parameters in the schema cache',
    })

    expect(classified.category).toBe(APPOINTMENT_FETCH_ERROR.RPC_UNAVAILABLE)
  })

  it('unwraps preserved supabase fields from install wrapper errors', () => {
    const wrapped = new Error(
      'Athlete session scheduling is not installed. Run AVAREN_COACH_APPOINTMENTS_8_3.sql.',
    )
    wrapped.cause = {
      code: '42P01',
      message: 'relation "public.coach_assignments" does not exist',
      details: null,
      hint: null,
    }

    expect(extractSupabaseError(wrapped)).toEqual({
      code: '42P01',
      message: 'relation "public.coach_assignments" does not exist',
      details: null,
      hint: null,
      friendlyMessage:
        'Athlete session scheduling is not installed. Run AVAREN_COACH_APPOINTMENTS_8_3.sql.',
    })
  })

  it('logs RPC checkpoint without throwing', () => {
    expect(() =>
      logAthleteRpcCheckpoint({
        authUserId: 'athlete-1',
        expectedUserId: 'athlete-1',
        rpcOk: true,
        rawData: [{ id: 'appt-1', status: 'scheduled', starts_at: '2099-01-01T14:00:00.000Z' }],
        controlAppointmentId: 'appt-1',
      }),
    ).not.toThrow()
  })
})
