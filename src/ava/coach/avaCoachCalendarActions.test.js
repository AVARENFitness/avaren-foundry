import { beforeEach, describe, expect, it, vi } from 'vitest'
import { coachBackend } from '../../lib/coachBackend'
import { athleteCalendarBackend } from '../../lib/athleteCalendarEvents'
import {
  AVA_COACH_CALENDAR_COMMAND_KIND,
  executeCoachCalendarCommand,
  inferCoachTimeRange,
  parseCoachCalendarCommand,
} from './avaCoachCalendarActions'

vi.mock('../../lib/athleteCalendarEvents', async () => {
  const actual = await vi.importActual('../../lib/athleteCalendarEvents')
  return {
    ...actual,
    athleteCalendarBackend: {
      list: vi.fn(),
      update: vi.fn(),
    },
  }
})

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn(),
    listCoachCalendarEvents: vi.fn(),
    createCoachCalendarEvent: vi.fn(),
    updateCoachCalendarEvent: vi.fn(),
    createScheduledSession: vi.fn(),
    updateScheduledSession: vi.fn(),
  },
}))

const now = new Date('2026-10-04T22:00:00-04:00')

describe('AVA coach calendar actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    athleteCalendarBackend.list.mockResolvedValue([])
    athleteCalendarBackend.update.mockResolvedValue({ id: 'athlete-event-1' })
    coachBackend.listScheduledSessions.mockResolvedValue([])
    coachBackend.listCoachCalendarEvents.mockResolvedValue([])
    coachBackend.createCoachCalendarEvent.mockResolvedValue({ id: 'event-1' })
    coachBackend.createScheduledSession.mockResolvedValue({ id: 'session-1' })
    coachBackend.updateScheduledSession.mockResolvedValue({ id: 'session-1' })
    coachBackend.updateCoachCalendarEvent.mockResolvedValue({ id: 'event-1' })
  })

  it('infers 10-2 as 10 AM to 2 PM', () => {
    expect(
      inferCoachTimeRange('10:00', '2:00', {
        kind: AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT,
      }),
    ).toMatchObject({
      status: 'resolved',
      startTime: '10:00',
      endTime: '14:00',
      durationMinutes: 240,
    })
  })

  it('infers 4-430 personal training as 4 PM to 4:30 PM', () => {
    expect(
      inferCoachTimeRange('4', '430', {
        kind: AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING,
      }),
    ).toMatchObject({
      status: 'resolved',
      startTime: '16:00',
      endTime: '16:30',
      durationMinutes: 30,
    })
  })

  it('parses a natural private calendar statement', () => {
    expect(
      parseCoachCalendarCommand(
        'I have NextLevel at 10:00-2:00 on Wednesday',
        { now },
      ),
    ).toMatchObject({
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.PRIVATE_EVENT,
      title: 'NextLevel',
      date: '2026-10-07',
      time: {
        status: 'resolved',
        startTime: '10:00',
        endTime: '14:00',
      },
    })
  })

  it('parses a natural client scheduling command', () => {
    expect(
      parseCoachCalendarCommand('Schedule Jake for Wednesday at 4-430', {
        now,
      }),
    ).toMatchObject({
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.PERSONAL_TRAINING,
      clientQuery: 'Jake',
      date: '2026-10-07',
      time: {
        status: 'resolved',
        startTime: '16:00',
        endTime: '16:30',
      },
    })
  })

  it('parses a natural client move command and infers 5 PM', () => {
    expect(
      parseCoachCalendarCommand('Move Jake to Thursday at 5', { now }),
    ).toMatchObject({
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PERSONAL_TRAINING,
      clientQuery: 'Jake',
      date: '2026-10-08',
      time: {
        status: 'resolved',
        startTime: '17:00',
      },
    })
  })

  it('treats “my dentist appointment” as a private event move', () => {
    expect(
      parseCoachCalendarCommand('Move my dentist appointment to Friday at 2', {
        now,
      }),
    ).toMatchObject({
      kind: AVA_COACH_CALENDAR_COMMAND_KIND.MOVE_PRIVATE_EVENT,
      titleQuery: 'dentist',
      date: '2026-10-09',
      time: {
        status: 'resolved',
        startTime: '14:00',
      },
    })
  })

  it('moves one clear upcoming client appointment and preserves duration', async () => {
    const clients = [
      {
        id: 'business-jake',
        business_client_id: 'business-jake',
        athlete_id: 'athlete-jake',
        coach_label: 'Jake',
      },
    ]
    coachBackend.listScheduledSessions
      .mockResolvedValueOnce([
        {
          id: 'session-jake',
          athlete_id: 'athlete-jake',
          business_client_id: 'business-jake',
          session_date: '2026-10-07',
          start_time: '16:00',
          duration_minutes: 30,
          status: 'scheduled',
        },
      ])
      .mockResolvedValueOnce([])

    const command = parseCoachCalendarCommand('Move Jake to Thursday at 5', {
      now,
    })
    const result = await executeCoachCalendarCommand(command, { clients })

    expect(coachBackend.updateScheduledSession).toHaveBeenCalledWith(
      'session-jake',
      expect.objectContaining({
        sessionDate: '2026-10-08',
        startTime: '17:00',
        durationMinutes: 30,
      }),
      expect.any(Object),
    )
    expect(result.kind).toBe('success')
  })

  it('moves one clear private event without changing its duration', async () => {
    coachBackend.listCoachCalendarEvents
      .mockResolvedValueOnce([
        {
          id: 'dentist-1',
          coach_id: 'coach-1',
          title: 'Dentist appointment',
          event_date: '2026-10-06',
          start_time: '10:00',
          duration_minutes: 60,
          category: 'personal',
          status: 'scheduled',
        },
      ])
      .mockResolvedValueOnce([])
    athleteCalendarBackend.list.mockResolvedValue([])

    const command = parseCoachCalendarCommand(
      'Move my dentist appointment to Friday at 2',
      { now },
    )
    const result = await executeCoachCalendarCommand(command, { clients: [] })

    expect(coachBackend.updateCoachCalendarEvent).toHaveBeenCalledWith(
      'dentist-1',
      expect.objectContaining({
        eventDate: '2026-10-09',
        startTime: '14:00',
        durationMinutes: 60,
      }),
    )
    expect(result.kind).toBe('success')
  })

  it('writes a private event and checks the unified calendar first', async () => {
    const command = parseCoachCalendarCommand(
      'I have NextLevel at 10:00-2:00 on Wednesday',
      { now },
    )

    const result = await executeCoachCalendarCommand(command, { clients: [] })

    expect(coachBackend.listScheduledSessions).toHaveBeenCalledWith({
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    })
    expect(coachBackend.listCoachCalendarEvents).toHaveBeenCalledWith({
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    })
    expect(athleteCalendarBackend.list).toHaveBeenCalledWith({
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    })
    expect(coachBackend.createCoachCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'NextLevel',
        eventDate: '2026-10-07',
        startTime: '10:00',
        durationMinutes: 240,
        category: 'personal',
      }),
    )
    expect(result.kind).toBe('success')
    expect(result.message).toMatch(/10:00 AM–2:00 PM/)
  })

  it('resolves a roster client and schedules personal training', async () => {
    const clients = [
      {
        id: 'business-jake',
        business_client_id: 'business-jake',
        athlete_id: 'athlete-jake',
        coach_label: 'Jake',
      },
    ]
    const command = parseCoachCalendarCommand(
      'Schedule Jake for Wednesday at 4-430',
      { now },
    )

    const result = await executeCoachCalendarCommand(command, { clients })

    expect(coachBackend.createScheduledSession).toHaveBeenCalledWith(
      expect.objectContaining({
        businessClientId: 'business-jake',
        athleteId: 'athlete-jake',
        sessionDate: '2026-10-07',
        startTime: '16:00',
        durationMinutes: 30,
      }),
    )
    expect(result.kind).toBe('success')
    expect(result.message).toMatch(/4:00 PM–4:30 PM/)
  })

  it('does not guess when a client cannot be resolved', async () => {
    const command = parseCoachCalendarCommand(
      'Schedule Jordan for Wednesday at 4-430',
      { now },
    )

    const result = await executeCoachCalendarCommand(command, {
      clients: [{ coach_label: 'Jake', business_client_id: 'business-jake' }],
    })

    expect(result.kind).toBe('clarification')
    expect(coachBackend.createScheduledSession).not.toHaveBeenCalled()
  })
})
