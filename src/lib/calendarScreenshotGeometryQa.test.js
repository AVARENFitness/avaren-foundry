import { describe, expect, it } from 'vitest'
import { prepareCalendarImportReview, matchCalendarImportClient } from './calendarScreenshotImport'

describe('calendar screenshot geometric verification', () => {
  const date = '2026-10-19'
  it('requires coach verification if extracted hour disagrees with the event rectangle', () => {
    const [row] = prepareCalendarImportReview([{ title:'Connie', date, weekday:1, startTime:'08:30', durationMinutes:30, geometryValid:false }], [])
    expect(row.geometryConflict).toBe(true)
    expect(row.needsReview).toBe(true)
    expect(row.selected).toBe(false)
  })
  it('allows independently verified grid extraction into the review step', () => {
    const [row] = prepareCalendarImportReview([{ title:'Connie', date, weekday:1, startTime:'08:00', durationMinutes:60, geometryValid:true }], [])
    expect(row.geometryConflict).toBe(false)
    expect(row.dateConflict).toBe(false)
  })
  it('never automatically assigns a clipped single client name', () => {
    const client = [{ business_client_id:'connie-id', coach_label:'Connie Turner' }]
    expect(matchCalendarImportClient('Connie', client).status).toBe('ambiguous')
    expect(matchCalendarImportClient('Connie', client).client).toBeNull()
  })
})
