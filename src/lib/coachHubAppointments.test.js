import { describe, expect, it } from 'vitest'
import { filterPendingCoachHubAppointments, isPendingCoachHubAppointment, partitionCoachTodayAppointments } from './coachHubAppointments'

const now = new Date('2026-11-03T15:30:00Z')
const scheduled = {
  id: 'open',
  status: 'scheduled',
  sessionDate: '2026-11-03',
  startTime: '10:00',
  durationMinutes: 60,
  scheduleTimezone: 'America/New_York',
  startsAt: '2026-11-03T15:00:00Z',
  endsAt: '2026-11-03T16:00:00Z',
}

describe('Coach Hub upcoming appointment visibility', () => {
  it('keeps a scheduled, still-running session visible until its end', () => {
    expect(isPendingCoachHubAppointment(scheduled, now)).toBe(true)
  })

  it('removes completed, missed and cancelled appointments immediately', () => {
    for (const status of ['completed', 'missed', 'cancelled']) {
      expect(isPendingCoachHubAppointment({ ...scheduled, status }, now)).toBe(false)
    }
  })

  it('removes scheduled appointments once their end time passes', () => {
    expect(isPendingCoachHubAppointment({ ...scheduled, endsAt: '2026-11-03T15:30:00Z' }, now)).toBe(false)
  })

  it('calculates the ending time from start, duration and coach timezone if needed', () => {
    const { startsAt, endsAt, ...wallClock } = scheduled
    expect(isPendingCoachHubAppointment(wallClock, now)).toBe(true)
    expect(isPendingCoachHubAppointment({ ...wallClock, startTime: '09:00' }, now)).toBe(false)
  })

  it('retains finished and completed sessions in the earlier-today agenda', () => {
    const sessions = [
      scheduled,
      { ...scheduled, id: 'finished', startsAt: '2026-11-03T13:00:00Z', endsAt: '2026-11-03T14:00:00Z' },
      { ...scheduled, id: 'completed', status: 'completed' },
      { ...scheduled, id: 'cancelled', status: 'cancelled' },
    ]
    const groups = partitionCoachTodayAppointments(sessions, now)
    expect(groups.upcoming.map((item) => item.id)).toEqual(['open'])
    expect(groups.earlier.map((item) => item.id)).toEqual(['finished', 'completed'])
    expect(sessions).toHaveLength(4)
  })

  it('filters pending sessions without mutating history', () => {
    const sessions = [scheduled, { ...scheduled, id: 'done', status: 'completed' }]
    const current = filterPendingCoachHubAppointments(sessions, now)
    expect(current.map((item) => item.id)).toEqual(['open'])
    expect(sessions).toHaveLength(2)
  })
})
