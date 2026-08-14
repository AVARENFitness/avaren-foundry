import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachScheduleSessionSheet from '../components/CoachScheduleSessionSheet'

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
    expect(document.getElementById('root').style.position).toBe('fixed')
    expect(document.documentElement.style.overflow).toBe('hidden')
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
          { id: '1', athlete_id: 'a1', athlete_email: 'athlete@example.com', coach_label: 'Jake' },
          { id: '2', athlete_id: 'a2', athlete_email: 'other@example.com', coach_label: 'Sam' },
        ]}
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

    await user.click(document.querySelector('.coach-schedule-control--client'))

    const menu = document.querySelector('.coach-schedule-menu')
    expect(menu).not.toBeNull()
    expect(scheduleCss).toContain('background-color: #0d1014')
    expect(scheduleCss).toMatch(/z-index:\s*12/)
  })
})
