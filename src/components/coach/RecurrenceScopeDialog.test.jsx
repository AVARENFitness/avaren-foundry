import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RecurrenceScopeDialog from './RecurrenceScopeDialog'
import { RECURRENCE_SCOPE } from '../../lib/recurringAppointments'

describe('RecurrenceScopeDialog', () => {
  it('offers this-only and this-and-future choices', () => {
    const onSelect = vi.fn()

    render(
      <RecurrenceScopeDialog
        open
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByTestId('recurrence-scope-this-only'))
    expect(onSelect).toHaveBeenCalledWith(RECURRENCE_SCOPE.THIS_ONLY)

    fireEvent.click(screen.getByTestId('recurrence-scope-this-and-future'))
    expect(onSelect).toHaveBeenCalledWith(RECURRENCE_SCOPE.THIS_AND_FUTURE)
  })
})
