import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CoachScheduleSessionSheet from '../components/CoachScheduleSessionSheet'

describe('CoachScheduleSessionSheet', () => {
  it('opens immediately as a focused dialog without requiring page scroll', () => {
    render(
      <CoachScheduleSessionSheet
        open
        clients={[{ id: '1', athlete_id: 'a1', athlete_email: 'athlete@example.com' }]}
        draft={{
          athleteId: '',
          sessionDate: '2026-08-07',
          startTime: '09:00',
          durationMinutes: '60',
          coachNote: '',
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Plan an in-person session')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
    expect(screen.getByText('Schedule Session')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('does not render when closed', () => {
    render(
      <CoachScheduleSessionSheet
        open={false}
        clients={[]}
        draft={{
          athleteId: '',
          sessionDate: '2026-08-07',
          startTime: '09:00',
          durationMinutes: '60',
          coachNote: '',
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
