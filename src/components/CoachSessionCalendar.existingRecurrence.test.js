import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/components/CoachSessionCalendar.jsx'), 'utf8')

describe('repeat existing appointments', () => {
  it('does not mutate existing source appointment records', () => {
    const action = source.split('const saveSelectedRepeats = async () => {')[1]?.split('const renderAgendaList =')[0]
    expect(action).toBeTruthy()
    expect(action).toContain('addDaysKey(session.sessionDate ?? session.eventDate, 7)')
    expect(action).toContain('createRecurringAppointmentSeries')
    expect(action).not.toContain('updateScheduledSession(')
    expect(action).not.toContain('recordCompletedSessionPassUsage(')
    expect(action).not.toContain('applyCoachClientPassManualDebit(')
  })
  it('repeats ordinary events as independent calendar records', () => {
    expect(source).toContain('plan.isEvent')
    expect(source).toContain('createCoachCalendarEventBatch({')
    expect(source).toContain('eventDate: event.eventDate')
    expect(source).toContain('notes: event.notes')
    expect(source).toContain('Repeat event ')
    expect(source).toContain('plannedEvents.length > 60')
    expect(source).toContain('Repeat training sessions and ordinary events separately')
  })
  it('requires an explicit date limit and provides bulk selection on week and day views', () => {
    expect(source).toContain('repeatEndDate')
    expect(source).toContain('Repeat through date')
    expect(source).toContain('toggleRepeatSelection(item.id)')
    expect(source).toContain('toggleRepeatSelection(session.id)')
  })
})
