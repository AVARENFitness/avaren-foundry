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
    expect(screen.getByText(/no avaren account required/i)).toBeInTheDocument()
  })

  it('allows blank email and requires first name', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CoachCreateClientSheet
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^create client$/i }))
    expect(screen.getByText(/first name is required/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/first name/i), 'Sarah')
    await user.type(screen.getByLabelText(/last name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^create client$/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sarah',
          lastName: 'Test',
          email: null,
          phone: null,
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
