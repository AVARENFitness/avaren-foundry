import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CoachCoachingRequirementsPanel } from './CoachClientManagementPanel'
import { WEEKLY_CHECK_IN_REQUIREMENT } from '../../lib/coachClientRequirements'

const connectedClient = {
  status: 'active',
  linked_user_id: '11111111-1111-4111-8111-111111111111',
  coaching_requirements: { weekly_check_in: 'required' },
}

describe('CoachCoachingRequirementsPanel', () => {
  it('renders label, description, and select on separate structure', () => {
    render(
      <CoachCoachingRequirementsPanel
        client={{
          status: 'active',
          linked_user_id: '11111111-1111-4111-8111-111111111111',
          coaching_requirements: { weekly_check_in: 'not_required' },
        }}
        onUpdateWeeklyCheckInRequired={() => {}}
      />,
    )

    expect(screen.getByText('Weekly check-in')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Choose whether this client is required to complete a weekly check-in.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('coach-weekly-checkin-requirement-select')).toBeInTheDocument()
  })

  it('shows offline copy and disables control when client is not connected', () => {
    render(
      <CoachCoachingRequirementsPanel
        client={{
          status: 'active',
          coaching_requirements: { weekly_check_in: 'not_required' },
        }}
      />,
    )

    expect(
      screen.getByText('Connect an AVAREN account to enable weekly check-ins.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('coach-weekly-checkin-requirement-select')).toBeDisabled()
  })

  it('calls RPC handler once with not_required and shows Saved', async () => {
    const user = userEvent.setup()
    const onUpdateWeeklyCheckInRequired = vi.fn().mockResolvedValue(undefined)

    render(
      <CoachCoachingRequirementsPanel
        client={connectedClient}
        onUpdateWeeklyCheckInRequired={onUpdateWeeklyCheckInRequired}
      />,
    )

    await user.selectOptions(
      screen.getByTestId('coach-weekly-checkin-requirement-select'),
      WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
    )

    await waitFor(() => {
      expect(onUpdateWeeklyCheckInRequired).toHaveBeenCalledTimes(1)
      expect(onUpdateWeeklyCheckInRequired).toHaveBeenCalledWith(false)
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })
  })

  it('does not call handler when selecting the already saved value', async () => {
    const user = userEvent.setup()
    const onUpdateWeeklyCheckInRequired = vi.fn()

    render(
      <CoachCoachingRequirementsPanel
        client={connectedClient}
        onUpdateWeeklyCheckInRequired={onUpdateWeeklyCheckInRequired}
      />,
    )

    await user.selectOptions(
      screen.getByTestId('coach-weekly-checkin-requirement-select'),
      WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
    )

    expect(onUpdateWeeklyCheckInRequired).not.toHaveBeenCalled()
  })

  it('shows error and keeps saved value when RPC fails', async () => {
    const user = userEvent.setup()
    const onUpdateWeeklyCheckInRequired = vi
      .fn()
      .mockRejectedValue(new Error('rpc failed'))

    render(
      <CoachCoachingRequirementsPanel
        client={connectedClient}
        onUpdateWeeklyCheckInRequired={onUpdateWeeklyCheckInRequired}
      />,
    )

    await user.selectOptions(
      screen.getByTestId('coach-weekly-checkin-requirement-select'),
      WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
    )

    await waitFor(() => {
      expect(
        screen.getByText('Unable to update weekly check-in requirement.'),
      ).toBeInTheDocument()
    })

    expect(screen.getByTestId('coach-weekly-checkin-requirement-select')).toHaveValue(
      WEEKLY_CHECK_IN_REQUIREMENT.REQUIRED,
    )
  })
})
