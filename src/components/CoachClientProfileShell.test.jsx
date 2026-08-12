import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachClientProfileShell, {
  CLIENT_PROFILE_SECTIONS,
} from './CoachClientProfileShell'

describe('CoachClientProfileShell', () => {
  const baseProps = {
    clientName: 'Alex Rivera',
    clientEmail: 'alex@example.com',
    connectedSince: 'Connected since Jan 4, 2026',
    activeSection: 'overview',
    onSectionChange: vi.fn(),
    onBack: vi.fn(),
  }

  it('renders client header and all profile sections', () => {
    render(
      <CoachClientProfileShell {...baseProps}>
        <p>Section content</p>
      </CoachClientProfileShell>,
    )

    expect(screen.getByRole('heading', { name: 'Alex Rivera' })).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
    expect(screen.getByText('Connected since Jan 4, 2026')).toBeInTheDocument()
    expect(screen.getByText('Section content')).toBeInTheDocument()

    for (const { label } of CLIENT_PROFILE_SECTIONS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('calls onSectionChange when a section tab is tapped', async () => {
    const user = userEvent.setup()
    const onSectionChange = vi.fn()

    render(
      <CoachClientProfileShell
        {...baseProps}
        onSectionChange={onSectionChange}
      >
        <p>Section content</p>
      </CoachClientProfileShell>,
    )

    await user.click(screen.getByRole('button', { name: 'Notes' }))

    expect(onSectionChange).toHaveBeenCalledWith('notes')
  })

  it('calls onBack from the back link', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()

    render(
      <CoachClientProfileShell {...baseProps} onBack={onBack}>
        <p>Section content</p>
      </CoachClientProfileShell>,
    )

    await user.click(screen.getByRole('button', { name: /Back to clients/i }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('marks the active section tab', () => {
    render(
      <CoachClientProfileShell {...baseProps} activeSection="progress">
        <p>Section content</p>
      </CoachClientProfileShell>,
    )

    expect(screen.getByRole('button', { name: 'Progress' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('renders compact coaching status when provided', () => {
    render(
      <CoachClientProfileShell
        {...baseProps}
        coachingStatusPanel={
          <article className="coach-profile-status-card coach-profile-status-card--compact">
            <div className="coach-profile-status-card-copy">
              <span className="eyebrow">COACHING</span>
              <strong className="coach-profile-status-card-title">
                Check-in · Waiting · Review · Open
              </strong>
            </div>
          </article>
        }
      >
        <p>Section content</p>
      </CoachClientProfileShell>,
    )

    expect(screen.getByText('COACHING')).toBeInTheDocument()
    expect(screen.getByText(/Check-in · Waiting/)).toBeInTheDocument()
  })
})
