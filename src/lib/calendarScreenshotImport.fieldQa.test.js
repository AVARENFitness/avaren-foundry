import { describe, expect, it } from 'vitest'
import { matchCalendarImportClient, prepareCalendarImportReview } from './calendarScreenshotImport'

describe('calendar screenshot field QA', () => {
 it('suggests clipped joint-name client without assigning silently', () => {
  const clients = [{ business_client_id: 'combo', coach_label: 'Don/Michelle' }]
  const result = matchCalendarImportClient('Don/Mi', clients)
  expect(result.status).toBe('ambiguous')
  expect(result.candidates).toHaveLength(1)
  expect(result.client).toBeNull()
 })
 it('flags wrong date from neighboring Sunday column', () => {
  const [event] = prepareCalendarImportReview([{ title: 'Connie', date: '2026-10-18', weekday: 1, startTime: '08:00', durationMinutes: 60 }], [])
  expect(event.dateConflict).toBe(true)
  expect(event.needsReview).toBe(true)
  expect(event.selected).toBe(false)
 })
 it('accepts Monday heading with accurate 7:30 block', () => {
  const [event] = prepareCalendarImportReview([{ title: 'Don/Mi', date: '2026-10-19', weekday: 1, startTime: '07:30', durationMinutes: 30 }], [])
  expect(event.dateConflict).toBe(false)
  expect(event.startTime).toBe('07:30')
 })
})
