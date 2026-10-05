import { beforeEach, describe, expect, it, vi } from 'vitest'
import { coachBackend } from '../../lib/coachBackend'
import {
  AVA_COACH_CALENDAR_COMMAND_KIND,
  executeCoachCalendarCommand,
  inferCoachTimeRange,
  parseCoachCalendarCommand,
} from './avaCoachCalendarActions'

vi.mock('../../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn(),
    listCoachCalendarEvents: vi.fn(),
    createCoachCalendarEvent: vi.fn(),
    createScheduledSession: vi.fn(),
  },
}))

const now = new Date('2026-10-04T22:00:00-04:00')

describe('AVA coach calendar actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listScheduledSessions.mockResolvedValue([])
    coachBackend.listCoachCalendarEvents.mockResolvedValue([])
    coachBackend.createCoachCalendarEvent.mockResolvedValue({ id: 'event-1' })
    coachBackend.createScheduledSession.mockResolvedValue({ id: 'session-1' })
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
