import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AvaConfirmationPreview from './AvaConfirmationPreview'

describe('AvaConfirmationPreview', () => {
  it('renders interpreted items, estimates, and actions', () => {
    render(
      <AvaConfirmationPreview
        title="Log this meal?"
        confidenceLabel="Preview · not saved"
        items={[{ label: 'Description', value: 'Two eggs and toast' }]}
        estimates={[
          { label: 'Calories', value: '420' },
          { label: 'Protein', value: '32g' },
        ]}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Log this meal?' })).toBeInTheDocument()
    expect(screen.getByText('Two eggs and toast')).toBeInTheDocument()
    expect(screen.getByText('420')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls action handlers', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onEdit = vi.fn()
    const onCancel = vi.fn()

    render(
      <AvaConfirmationPreview
        title="Log hydration?"
        items={[{ label: 'Amount', value: '16 oz' }]}
        estimates={[]}
        onConfirm={onConfirm}
        onEdit={onEdit}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
