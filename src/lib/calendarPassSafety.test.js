import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('coach calendar pass accounting isolation', () => {
  it('completing attendance never records a pass debit', () => {
    const source = read('src/lib/coachBackend.js')
    const section = source.split('async completeInPersonAppointment(sessionId) {')[1]?.split('async markInPersonAppointmentMissed')[0]
    expect(section).toBeTruthy()
    expect(section).toContain('SCHEDULED_SESSION_STATUS.COMPLETED')
    expect(section).not.toContain('recordCompletedSessionPassUsage')
    expect(section).not.toContain('recordMissedSessionPassCharge')
  })

  it('completion UI does not call pass selection or pass debit', () => {
    const source = read('src/hooks/useCoachSessionDetail.js')
    const section = source.split('const handleComplete = useCallback(')[1]?.split('const handleMarkMissed = useCallback(')[0]
    expect(section).toBeTruthy()
    expect(section).not.toContain('applyPassUsageResult')
    expect(section).not.toContain('reportPassUsage')
    expect(section).not.toContain('recordCompletedSessionPassUsage')
  })

  it('marking missed does not bring up a charge decision', () => {
    const source = read('src/hooks/useCoachSessionDetail.js')
    const section = source.split('const handleMarkMissed = useCallback(')[1]?.split('const handleMissedNoCharge = useCallback(')[0]
    expect(section).toBeTruthy()
    expect(section).toContain('setMissedChargeSession(null)')
    expect(section).not.toContain('setMissedChargeSession(saved)')
  })

  it('event import uses concise label and detail has no calendar debit action', () => {
    const importer = read('src/components/CoachCalendarImportSheet.jsx')
    const detail = read('src/components/coach/CoachSessionDetailSheet.jsx')
    expect(importer).not.toContain('Everyday event')
    expect(detail).not.toContain('Apply pass debit')
    expect(detail).not.toContain('Choose pass')
  })
})
