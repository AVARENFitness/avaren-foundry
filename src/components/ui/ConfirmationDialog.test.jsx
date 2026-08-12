import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConfirmationDialog from './ConfirmationDialog'

describe('ConfirmationDialog', () => {
  it('does not leave a pointer-active backdrop when closed', () => {
    render(
      <ConfirmationDialog
        open={false}
        message="Delete this workout?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
  })

  it('mounts canonical backdrop when open', () => {
    render(
      <ConfirmationDialog
        open
        title="Confirm"
        message="Delete this workout?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()

    render(
      <ConfirmationDialog
        open
        message="Delete this workout?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(document.querySelector('[data-app-ui-backdrop="open"]'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
