import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachScheduleSessionSheet from '../components/CoachScheduleSessionSheet'
import { formatScheduleDateLong } from '../lib/appointmentScheduling'

const baseClients = [
  {
    id: '1',
    athlete_id: 'a1',
    athlete_email: 'athlete@example.com',
    coach_label: 'Jake',
  },
]

const baseDraft = {
  athleteId: 'a1',
  sessionDate: '2026-08-07',
  startTime: '09:00',
  durationMinutes: '60',
  coachNote: '',
}

describe('CoachScheduleSessionSheet', () => {
  it('opens immediately as a focused dialog without requiring page scroll', () => {
    if (!document.getElementById('root')) {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
    }

    render(
      <CoachScheduleSessionSheet
        open
        clients={baseClients}
        draft={baseDraft}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getAllByText('Jake')).toHaveLength(1)
    expect(screen.getByText('Schedule appointment')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^today$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^tomorrow$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save appointment$/i })).toBeInTheDocument()
    expect(document.getElementById('root').style.position).toBe('fixed')
    expect(document.documentElement.style.overflow).toBe('hidden')
  })

  it('exposes a tappable native date field with the selected date visible', () => {
    render(
      <CoachScheduleSessionSheet
        open
        clients={baseClients}
        draft={baseDraft}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const dateInput = screen.getByLabelText('Appointment date')
    expect(dateInput).toHaveAttribute('type', 'date')
    expect(dateInput).toHaveValue('2026-08-07')
    expect(dateInput).toHaveClass('coach-schedule-date-input')
    expect(
      screen.getByText(formatScheduleDateLong('2026-08-07')),
    ).toBeInTheDocument()
    expect(document.querySelector('.coach-schedule-hidden-date')).toBeNull()
  })

  it('persists a newly selected date into form state and submission', () => {
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn()
    const draft = { ...baseDraft }

    const { rerender } = render(
      <CoachScheduleSessionSheet
        open
        clients={baseClients}
        draft={draft}
        onDraftChange={onDraftChange}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Appointment date'), {
      target: { value: '2026-09-20' },
    })

    expect(onDraftChange).toHaveBeenCalledWith({
      ...baseDraft,
      sessionDate: '2026-09-20',
    })

    const nextDraft = { ...baseDraft, sessionDate: '2026-09-20' }
    rerender(
      <CoachScheduleSessionSheet
        open
        clients={baseClients}
        draft={nextDraft}
        onDraftChange={onDraftChange}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText('Appointment date')).toHaveValue('2026-09-20')
    expect(
      screen.getByText(formatScheduleDateLong('2026-09-20')),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^save appointment$/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps edit/reschedule date selection wired through draft changes', () => {
    const onDraftChange = vi.fn()

    render(
      <CoachScheduleSessionSheet
        open
        clients={baseClients}
        draft={{ ...baseDraft, sessionDate: '2026-09-01' }}
        onDraftChange={onDraftChange}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Appointment date')).toHaveValue('2026-09-01')
    fireEvent.change(screen.getByLabelText('Appointment date'), {
      target: { value: '2026-09-12' },
    })
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ sessionDate: '2026-09-12' }),
    )
  })

  it('does not render when closed', () => {
    render(
      <CoachScheduleSessionSheet
        open={false}
        clients={[]}
        draft={baseDraft}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('uses an opaque dropdown surface for client selection', async () => {
    const user = userEvent.setup()
    const scheduleCss = readFileSync(
      resolve(process.cwd(), 'src/styles/screens/coach-schedule.css'),
      'utf8',
    )

    render(
      <CoachScheduleSessionSheet
        open
        clients={[
          ...baseClients,
          {
            id: '2',
            athlete_id: 'a2',
            athlete_email: 'other@example.com',
            coach_label: 'Sam',
          },
        ]}
        draft={baseDraft}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    await user.click(document.querySelector('.coach-schedule-control--client'))

    const menu = document.querySelector('.coach-schedule-menu')
    expect(menu).not.toBeNull()
    expect(scheduleCss).toContain('background-color: #0d1014')
    expect(scheduleCss).toMatch(/z-index:\s*12/)
    expect(scheduleCss).toContain('.coach-schedule-date-input')
    expect(scheduleCss).not.toContain('.coach-schedule-hidden-date')
  })
})
