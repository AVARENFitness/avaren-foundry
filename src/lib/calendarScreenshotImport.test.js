import { describe, expect, it } from 'vitest'
import { matchCalendarImportClient, prepareCalendarImportReview } from './calendarScreenshotImport'

const clients = [
  { id: '1', business_client_id: 'don-1', first_name: 'Don', last_name: 'Parker' },
  { id: '2', business_client_id: 'michelle-1', first_name: 'Michelle', last_name: 'James' },
  { id: '3', business_client_id: 'michelle-2', first_name: 'Michelle', last_name: 'Jones' },
]

describe('review-first screenshot calendar imports', () => {
  it('never silently matches ambiguous first names', () => {
    expect(matchCalendarImportClient('Michelle', clients).status).toBe('ambiguous')
    expect(matchCalendarImportClient('NextLevel', clients).status).toBe('unmatched')
  })
  it('matches exact names and unique first names without auto-saving', () => {
    expect(matchCalendarImportClient('Don Parker', clients).status).toBe('matched')
    expect(matchCalendarImportClient('Don', clients).status).toBe('ambiguous')
  })
  it('suggests but never auto-links clipped labels and slash names', () => {
    const partial = matchCalendarImportClient('Michelle Ja', clients)
    expect(partial.status).toBe('ambiguous')
    expect(partial.candidates).toHaveLength(1)
    expect(partial.client).toBeNull()
    const combined = matchCalendarImportClient('Don/Mi', clients)
    expect(combined.status).toBe('ambiguous')
    expect(combined.candidates.length).toBeGreaterThanOrEqual(2)
    expect(combined.client).toBeNull()
    const [review] = prepareCalendarImportReview([
      { title: 'Don/Mi', date: '2026-10-19', startTime: '07:30', durationMinutes: 30 },
    ], clients)
    expect(review.title).toBe('Don/Mi')
    expect(review.startTime).toBe('07:30')
    expect(review.durationMinutes).toBe(30)
    expect(review.selected).toBe(false)
    expect(review.businessClientId).toBeNull()
  })

  it('keeps extracted entries unselected until coach confirmation', () => {
    const [event] = prepareCalendarImportReview([{ title: 'NextLevel', date: '2026-10-19', startTime: '10:00', durationMinutes: 60 }], clients)
    expect(event.selected).toBe(false)
    expect(event.suggestedType).toBe('private')
    expect(event.needsReview).toBe(false)
  })
  it('requires clarification when times or dates are missing', () => {
    const [event] = prepareCalendarImportReview([{ title: 'Don Parker', date: '', startTime: '', durationMinutes: 0 }], clients)
    expect(event.needsReview).toBe(true)
    expect(event.selected).toBe(false)
  })
})
