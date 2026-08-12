import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachSessionCalendar from './CoachSessionCalendar'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
    confirm: vi.fn(),
  },
}))

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listScheduledSessions: vi.fn(),
    listClientPassBalances: vi.fn(),
    getSessionPackage: vi.fn(),
    createScheduledSession: vi.fn(),
  },
}))

const jake = {
  id: 'coach-client-1',
  athlete_id: 'athlete-jake',
  business_client_id: 'bc-jake',
  athlete_email: 'jake@example.com',
  coach_label: 'Jake',
}

describe('CoachSessionCalendar schedule flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listScheduledSessions.mockResolvedValue([])
    coachBackend.listClientPassBalances.mockResolvedValue([])
    coachBackend.getSessionPackage.mockResolvedValue(null)
    coachBackend.createScheduledSession.mockResolvedValue({
      id: 'session-1',
      athlete_id: 'athlete-jake',
      business_client_id: 'bc-jake',
      session_date: '2026-08-13',
      start_time: '09:00',
      duration_minutes: 60,
      status: 'scheduled',
    })
  })

  it('Schedule click sets open state and mounts canonical backdrop', async () => {
    const user = userEvent.setup()

    render(
      <CoachSessionCalendar
        clients={[jake]}
        assignments={[]}
        initialClientId="athlete-jake"
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-schedule-session-button')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('coach-schedule-session-button'))

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('successful schedule submit closes sheet and refreshes calendar', async () => {
    const user = userEvent.setup()

    render(
      <CoachSessionCalendar
        clients={[jake]}
        assignments={[]}
        initialClientId="athlete-jake"
        initialOpenComposer
      />,
    )

    const sheet = await screen.findByTestId('coach-schedule-session-sheet')
    await user.click(
      within(sheet).getByRole('button', { name: /^schedule session$/i }),
    )

    await waitFor(() => {
      expect(coachBackend.createScheduledSession).toHaveBeenCalledTimes(1)
    })

    expect(coachBackend.createScheduledSession).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 'athlete-jake',
        businessClientId: 'bc-jake',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByTestId('coach-schedule-session-sheet')).not.toBeInTheDocument()
    })

    expect(coachBackend.listScheduledSessions).toHaveBeenCalledTimes(2)
    expect(appUi.toast).toHaveBeenCalledWith(expect.stringContaining('Session scheduled'), 'success')
  })
})
