import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { AthleteAppointmentsProvider } from '../context/AthleteAppointmentsProvider'
import { useAthleteAppointments } from './useAthleteAppointments'
import { coachBackend } from '../lib/coachBackend'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteScheduledSessions: vi.fn(),
  },
}))

vi.mock('../lib/athleteAppointmentTrace', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveAuthenticatedUserId: vi.fn(async () => 'athlete-1'),
    installAthleteAppointmentDevTrace: vi.fn(),
    logAthleteClientCheckpoint: vi.fn(),
  }
})

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))

const wrapper =
  (userId = 'athlete-1') =>
  ({ children }) => (
    <AthleteAppointmentsProvider userId={userId}>{children}</AthleteAppointmentsProvider>
  )

describe('useAthleteAppointments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads appointments for the authenticated athlete user id', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([
      {
        id: 'appt-1',
        status: 'scheduled',
        starts_at: '2026-08-11T19:00:00.000Z',
        session_date: '2026-08-11',
        start_time: '15:00:00',
        schedule_timezone: 'America/New_York',
      },
    ])

    const { result } = renderHook(() => useAthleteAppointments(), {
      wrapper: wrapper('athlete-1'),
    })

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })

    expect(coachBackend.listAthleteScheduledSessions).toHaveBeenCalledTimes(1)
    expect(result.current.upcomingAppointments).toHaveLength(1)
    expect(result.current.nextAppointment?.id).toBe('appt-1')
    expect(result.current.diagnostics?.rpcRequested).toBe(true)
    expect(result.current.diagnostics?.rpcStatus).toBe('success')
  })

  it('refetches on reload after coach-side create', async () => {
    coachBackend.listAthleteScheduledSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'appt-new',
          status: 'scheduled',
          starts_at: '2026-08-12T19:00:00.000Z',
          session_date: '2026-08-12',
          start_time: '15:00:00',
        },
      ])

    const { result } = renderHook(() => useAthleteAppointments(), {
      wrapper: wrapper('athlete-1'),
    })

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })

    expect(result.current.upcomingAppointments).toEqual([])

    await result.current.refreshAppointments()

    await waitFor(() => {
      expect(result.current.nextAppointment?.id).toBe('appt-new')
    })
  })

  it('drops cancelled appointments after refetch', async () => {
    coachBackend.listAthleteScheduledSessions
      .mockResolvedValueOnce([
        {
          id: 'appt-live',
          status: 'scheduled',
          starts_at: '2026-08-12T19:00:00.000Z',
          session_date: '2026-08-12',
          start_time: '15:00:00',
        },
      ])
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useAthleteAppointments(), {
      wrapper: wrapper('athlete-1'),
    })

    await waitFor(() => {
      expect(result.current.upcomingAppointments).toHaveLength(1)
    })

    await result.current.refreshAppointments()

    await waitFor(() => {
      expect(result.current.upcomingAppointments).toEqual([])
    })
  })

  it('does not mark ready before hydration completes', async () => {
    let resolveFetch = null
    const pendingFetch = new Promise((resolve) => {
      resolveFetch = resolve
    })
    coachBackend.listAthleteScheduledSessions.mockReturnValue(pendingFetch)

    const { result } = renderHook(() => useAthleteAppointments(), {
      wrapper: wrapper('athlete-1'),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })

    expect(result.current.ready).toBe(false)
    expect(result.current.appointments).toEqual([])
    expect(result.current.nextAppointment).toBeNull()

    await act(async () => {
      resolveFetch([
        {
          id: 'appt-1',
          status: 'scheduled',
          starts_at: '2026-08-12T19:00:00.000Z',
          session_date: '2026-08-12',
          start_time: '15:00:00',
        },
      ])
    })

    await waitFor(() => {
      expect(result.current.ready).toBe(true)
      expect(result.current.nextAppointment?.id).toBe('appt-1')
    })
  })

  it('clears authoritative state when athlete user id changes', async () => {
    coachBackend.listAthleteScheduledSessions
      .mockResolvedValueOnce([
        {
          id: 'appt-coach-view',
          status: 'scheduled',
          starts_at: '2026-08-12T19:00:00.000Z',
          session_date: '2026-08-12',
          start_time: '15:00:00',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'appt-athlete',
          status: 'scheduled',
          starts_at: '2026-08-13T19:00:00.000Z',
          session_date: '2026-08-13',
          start_time: '15:00:00',
        },
      ])

    let userId = 'coach-user'
    const { result, rerender } = renderHook(() => useAthleteAppointments(), {
      wrapper: ({ children }) => (
        <AthleteAppointmentsProvider userId={userId}>{children}</AthleteAppointmentsProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.ready).toBe(true)
      expect(result.current.nextAppointment?.id).toBe('appt-coach-view')
    })

    userId = 'athlete-1'
    rerender()

    expect(result.current.ready).toBe(false)
    expect(result.current.appointments).toEqual([])
    expect(result.current.nextAppointment).toBeNull()

    await waitFor(() => {
      expect(result.current.ready).toBe(true)
      expect(result.current.nextAppointment?.id).toBe('appt-athlete')
    })
  })

  it('treats ready with empty rpc result as authoritative empty state', async () => {
    coachBackend.listAthleteScheduledSessions.mockResolvedValue([])

    const { result } = renderHook(() => useAthleteAppointments(), {
      wrapper: wrapper('athlete-1'),
    })

    await waitFor(() => {
      expect(result.current.ready).toBe(true)
    })

    expect(result.current.appointments).toEqual([])
    expect(result.current.upcomingAppointments).toEqual([])
    expect(result.current.nextAppointment).toBeNull()
  })
})
