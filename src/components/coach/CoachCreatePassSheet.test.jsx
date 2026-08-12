import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachCreatePassSheet from './CoachCreatePassSheet'

describe('CoachCreatePassSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    render(
      <CoachCreatePassSheet open={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens as an accessible dialog with default fields', () => {
    render(
      <CoachCreatePassSheet open onClose={vi.fn()} onSubmit={vi.fn()} />,
    )

    expect(screen.getByRole('dialog', { name: /add pass/i })).toBeInTheDocument()
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByLabelText(/pass name/i)).toHaveValue('Training pass')
    expect(screen.getByLabelText(/^sessions$/i)).toHaveValue(12)
    expect(screen.getByLabelText(/^start date$/i)).toBeInTheDocument()
  })

  it('submits normalized payload when Create pass is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CoachCreatePassSheet open onClose={vi.fn()} onSubmit={onSubmit} />,
    )

    await user.clear(screen.getByLabelText(/^sessions$/i))
    await user.type(screen.getByLabelText(/^sessions$/i), '3')
    await user.click(screen.getByRole('button', { name: /^create pass$/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Training pass',
        sessionsPurchased: 3,
        startsAt: expect.any(String),
        expiresAt: null,
        notes: '',
      }),
    )
  })

  it('blocks submit when session count is invalid', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <CoachCreatePassSheet open onClose={vi.fn()} onSubmit={onSubmit} />,
    )

    await user.clear(screen.getByLabelText(/^sessions$/i))
    await user.type(screen.getByLabelText(/^sessions$/i), '0')

    expect(
      screen.getByRole('button', { name: /^create pass$/i }),
    ).toBeDisabled()
  })

  it('shows Creating… and disables repeat submit while submitting', () => {
    render(
      <CoachCreatePassSheet
        open
        submitting
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: /^creating…$/i }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled()
  })
})
