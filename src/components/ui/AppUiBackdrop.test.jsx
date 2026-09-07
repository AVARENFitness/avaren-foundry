import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppUiBackdrop from './AppUiBackdrop'

describe('AppUiBackdrop', () => {
  it('does not mount an intercepting backdrop when closed', () => {
    render(
      <AppUiBackdrop open={false} onClose={vi.fn()}>
        <p>Hidden sheet</p>
      </AppUiBackdrop>,
    )

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
  })

  it('removes the backdrop from the document after close', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AppUiBackdrop open onClose={onClose}>
        <button type="button">Inside modal</button>
      </AppUiBackdrop>,
    )

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()

    rerender(
      <AppUiBackdrop open={false} onClose={onClose}>
        <button type="button">Inside modal</button>
      </AppUiBackdrop>,
    )

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()

    render(
      <AppUiBackdrop open onClose={onClose}>
        <button type="button">Inside modal</button>
      </AppUiBackdrop>,
    )

    fireEvent.click(document.querySelector('[data-app-ui-backdrop="open"]'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders dialog children and keeps actions reachable', () => {
    render(
      <AppUiBackdrop open onClose={vi.fn()}>
        <section role="dialog" aria-modal="true" aria-label="Test sheet">
          <button type="button">Cancel</button>
          <button type="button">Confirm</button>
        </section>
      </AppUiBackdrop>,
    )

    expect(screen.getByRole('dialog', { name: /test sheet/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument()
  })

  it('closes on Escape when onClose is provided', () => {
    const onClose = vi.fn()
    render(
      <AppUiBackdrop open onClose={onClose}>
        <button type="button">Inside</button>
      </AppUiBackdrop>,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
