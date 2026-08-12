import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachScheduleSessionSheet from '../components/CoachScheduleSessionSheet'

describe('CoachScheduleSessionSheet', () => {
  it('opens immediately as a focused dialog without requiring page scroll', () => {
    render(
      <CoachScheduleSessionSheet
        open
        clients={[{ id: '1', athlete_id: 'a1', athlete_email: 'athlete@example.com', coach_label: 'Jake' }]}
        draft={{
          athleteId: 'a1',
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
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getAllByText('Jake')).toHaveLength(1)
    expect(screen.getByText('In-person training')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Schedule Session')).toBeInTheDocument()
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
