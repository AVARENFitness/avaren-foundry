import { describe, expect, it } from 'vitest'
import {
  nextUpcomingAppointmentFromRpc,
  normalizeAthleteAppointmentsFromRpc,
  parseAthleteScheduledSessionsRpc,
  upcomingAppointmentsFromRpc,
} from './athleteAppointments'

describe('athleteAppointments RPC parsing', () => {
  it('parses array RPC payloads', () => {
    const rows = [{ id: 'a1', status: 'scheduled', starts_at: '2026-08-11T19:00:00.000Z' }]
    expect(parseAthleteScheduledSessionsRpc(rows)).toEqual(rows)
  })

  it('parses json string RPC payloads', () => {
    const rows = [{ id: 'a1', status: 'scheduled', starts_at: '2026-08-11T19:00:00.000Z' }]
    expect(parseAthleteScheduledSessionsRpc(JSON.stringify(rows))).toEqual(rows)
  })

  it('normalizes snake_case appointment rows from RPC', () => {
    const [appointment] = normalizeAthleteAppointmentsFromRpc([
      {
        id: 'appt-1',
        coach_display_name: 'Coach',
        session_date: '2026-08-11',
        start_time: '15:00:00',
        starts_at: '2026-08-11T19:00:00.000Z',
        schedule_timezone: 'America/New_York',
        duration_minutes: 60,
        status: 'scheduled',
        linked_workout_title: null,
      },
    ])

    expect(appointment.id).toBe('appt-1')
    expect(appointment.startsAt).toBe('2026-08-11T19:00:00.000Z')
    expect(appointment.linkedWorkoutTitle).toBeNull()
  })

  it('keeps appointments without linked workouts', () => {
    const upcoming = upcomingAppointmentsFromRpc([
      {
        id: 'solo-appt',
        status: 'scheduled',
        startsAt: '2026-08-11T19:00:00.000Z',
        sessionDate: '2026-08-11',
        startTime: '15:00',
      },
    ])

    expect(upcoming).toHaveLength(1)
    expect(nextUpcomingAppointmentFromRpc(upcoming)?.id).toBe('solo-appt')
  })

  it('does not apply extra future filtering for RPC-sourced rows', () => {
    const upcoming = upcomingAppointmentsFromRpc([
      {
        id: 'rpc-future',
        status: 'scheduled',
        startsAt: '2099-01-01T19:00:00.000Z',
        sessionDate: '2099-01-01',
        startTime: '15:00',
      },
    ])

    expect(nextUpcomingAppointmentFromRpc(upcoming)?.id).toBe('rpc-future')
  })

  it('parses a single appointment object RPC payload', () => {
    const row = {
      id: 'solo-object',
      status: 'scheduled',
      starts_at: '2026-08-11T19:00:00.000Z',
      session_date: '2026-08-11',
      start_time: '15:00:00',
    }

    expect(parseAthleteScheduledSessionsRpc(row)).toEqual([row])
    expect(normalizeAthleteAppointmentsFromRpc(row)).toHaveLength(1)
  })

  it('parses json string elements inside RPC arrays', () => {
    const row = {
      id: 'string-element',
      status: 'scheduled',
      starts_at: '2026-08-11T19:00:00.000Z',
    }

    expect(parseAthleteScheduledSessionsRpc([JSON.stringify(row)])).toEqual([row])
  })
})

describe('athlete appointment account scoping', () => {
  it('returns empty parse result for null RPC payloads', () => {
    expect(parseAthleteScheduledSessionsRpc(null)).toEqual([])
    expect(normalizeAthleteAppointmentsFromRpc(undefined)).toEqual([])
  })
})
