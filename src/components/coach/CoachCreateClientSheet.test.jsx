import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachCreateClientSheet from './CoachCreateClientSheet'

describe('CoachCreateClientSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('opens with canonical AppUiBackdrop', () => {
    render(
      <CoachCreateClientSheet
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('coach-create-client-sheet')).toBeInTheDocument()
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByText(/add client keeps them on your roster/i)).toBeInTheDocument()
    expect(screen.getByTestId('coach-add-client-only')).toBeInTheDocument()
    expect(screen.getByTestId('coach-add-client-invite')).toBeInTheDocument()
  })

  it('allows blank email and requires first name for Add client', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CoachCreateClientSheet
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByTestId('coach-add-client-only'))
    expect(screen.getByText(/first name is required/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.type(screen.getByLabelText(/last name/i), 'Test')
    await user.click(screen.getByTestId('coach-add-client-only'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sarah',
          lastName: 'Test',
          email: null,
          phone: null,
          invite: false,
        }),
      )
    })
  })

  it('requires email for Add & invite to AVAREN', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CoachCreateClientSheet
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.click(screen.getByTestId('coach-add-client-invite'))

    expect(screen.getByText(/enter a valid athlete email/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/^email$/i), 'sarah@example.com')
    await user.click(screen.getByTestId('coach-add-client-invite'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sarah',
          email: 'sarah@example.com',
          invite: true,
        }),
      )
    })
  })

  it('clears when closed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { rerender } = render(
      <CoachCreateClientSheet
        open
        onClose={onClose}
        onSubmit={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onClose).toHaveBeenCalled()

    rerender(
      <CoachCreateClientSheet
        open={false}
        onClose={onClose}
        onSubmit={vi.fn()}
      />,
    )
    rerender(
      <CoachCreateClientSheet
        open
        onClose={onClose}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/first name/i)).toHaveValue('')
  })
})
