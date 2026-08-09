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
    activeSection: 'today',
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
    expect(screen.getByRole('button', { name: 'Today' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('separates weekly check-in eyebrow from title in status cards', () => {
    render(
      <CoachClientProfileShell
        {...baseProps}
        weeklyCheckInPanel={
          <article className="coach-profile-status-card coach-profile-status-card--checkin">
            <div className="coach-profile-status-card-copy">
              <span className="eyebrow">WEEKLY CHECK-IN</span>
              <strong className="coach-profile-status-card-title">
                Athlete submission received
              </strong>
              <p className="coach-profile-status-card-meta">
                Training 3/5 · Recovery 2/5 · Nutrition 4/5
              </p>
            </div>
          </article>
        }
        weeklyReviewAction={
          <article className="coach-profile-status-card coach-profile-status-card--review">
            <div className="coach-profile-status-card-copy">
              <span className="eyebrow">WEEKLY REVIEW</span>
              <strong className="coach-profile-status-card-title">Aug 3 – 9</strong>
              <p className="coach-profile-status-badge coach-profile-status-badge--complete">
                ✓ Reviewed
              </p>
            </div>
            <button type="button" className="coach-secondary-button coach-profile-status-action">
              View Review
            </button>
          </article>
        }
      >
        <p>Section content</p>
      </CoachClientProfileShell>,
    )

    expect(screen.getByText('WEEKLY CHECK-IN')).toBeInTheDocument()
    expect(screen.getByText('Athlete submission received')).toBeInTheDocument()
    expect(screen.getByText(/Training 3\/5/)).toBeInTheDocument()
    expect(screen.getByText('✓ Reviewed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Review' })).toHaveClass(
      'coach-secondary-button',
    )
    expect(screen.queryByRole('button', { name: 'Reviewed' })).not.toBeInTheDocument()
  })
})
